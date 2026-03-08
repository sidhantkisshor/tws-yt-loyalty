import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { acquireLock, releaseLock } from '@/lib/redis'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { getValidCredentials } from '@/services/tokenManager'
import { startJob, completeJob, failJob } from '@/services/jobTracker'
import { getVideoComments } from '@/lib/youtube'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // SECURITY: Fail closed - if CRON_SECRET is not configured, deny access
  if (!env.CRON_SECRET) {
    logger.error('CRON_SECRET environment variable is not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Acquire distributed lock to prevent concurrent execution
  const lockId = await acquireLock('cron:ingest-comments', 300)
  if (!lockId) {
    return NextResponse.json({ error: 'Already running' }, { status: 409 })
  }

  const ctx = await startJob('INGEST_COMMENTS')

  try {
    // Get all active channels
    const channels = await prisma.channel.findMany({
      where: { isActive: true },
      select: { id: true, title: true },
    })

    const results: { channelId: string; channelTitle: string; commentsProcessed: number; errors: number }[] = []

    for (const channel of channels) {
      const channelResult = { channelId: channel.id, channelTitle: channel.title, commentsProcessed: 0, errors: 0 }

      try {
        const credentials = await getValidCredentials(channel.id)
        if (!credentials) {
          logger.warn('No valid credentials for channel, skipping', { channelId: channel.id })
          channelResult.errors++
          ctx.errorsCount++
          results.push(channelResult)
          continue
        }

        // Get recent streams from the last 7 days
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const recentStreams = await prisma.stream.findMany({
          where: {
            channelId: channel.id,
            createdAt: { gte: sevenDaysAgo },
            youtubeVideoId: { not: '' },
          },
          select: { id: true, youtubeVideoId: true, channelId: true },
        })

        for (const stream of recentStreams) {
          try {
            let pageToken: string | undefined = undefined
            let pageCount = 0
            const maxPages = 5 // Limit pages per video to manage quota

            do {
              const { comments, nextPageToken } = await getVideoComments(
                stream.youtubeVideoId,
                credentials,
                pageToken
              )

              for (const comment of comments) {
                try {
                  // Upsert FanProfile by googleId (authorChannelId)
                  let fanProfile = await prisma.fanProfile.findUnique({
                    where: { googleId: comment.authorChannelId },
                    select: { id: true },
                  })

                  if (!fanProfile && comment.authorChannelId) {
                    fanProfile = await prisma.fanProfile.create({
                      data: {
                        googleId: comment.authorChannelId,
                        email: '', // Not available from comments
                        displayName: comment.authorDisplayName,
                        profileImageUrl: comment.authorProfileImageUrl,
                      },
                      select: { id: true },
                    })
                  }

                  // Create EngagementEvent (upsert by externalId to avoid duplicates)
                  await prisma.engagementEvent.upsert({
                    where: { externalId: comment.id },
                    create: {
                      externalId: comment.id,
                      channelId: stream.channelId,
                      streamId: stream.id,
                      fanProfileId: fanProfile?.id ?? null,
                      eventType: 'VIDEO_COMMENT',
                      payload: {
                        authorChannelId: comment.authorChannelId,
                        authorDisplayName: comment.authorDisplayName,
                        textDisplay: comment.textDisplay,
                        likeCount: comment.likeCount,
                        isReply: comment.isReply,
                      },
                      occurredAt: new Date(comment.publishedAt),
                    },
                    update: {}, // No-op on duplicate
                  })

                  channelResult.commentsProcessed++
                  ctx.eventsProcessed++
                } catch (error) {
                  logger.error('Error processing comment', error, {
                    commentId: comment.id,
                    streamId: stream.id,
                  })
                  channelResult.errors++
                  ctx.errorsCount++
                }
              }

              pageToken = nextPageToken
              pageCount++
            } while (pageToken && pageCount < maxPages)
          } catch (error) {
            logger.error('Error fetching comments for stream', error, {
              streamId: stream.id,
              videoId: stream.youtubeVideoId,
            })
            channelResult.errors++
            ctx.errorsCount++
          }
        }
      } catch (error) {
        logger.error('Error processing channel for comments', error, { channelId: channel.id })
        channelResult.errors++
        ctx.errorsCount++
      }

      results.push(channelResult)
    }

    await completeJob(ctx)

    return NextResponse.json({
      message: `Ingested comments for ${channels.length} channels`,
      results,
      jobRunId: ctx.jobRunId,
      totalCommentsProcessed: ctx.eventsProcessed,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    await failJob(ctx, error instanceof Error ? error.message : 'Unknown error')
    logger.error('Comment ingestion cron error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Comment ingestion failed' },
      { status: 500 }
    )
  } finally {
    await releaseLock('cron:ingest-comments', lockId)
  }
}
