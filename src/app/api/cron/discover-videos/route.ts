import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { acquireLock, releaseLock } from '@/lib/redis'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { getValidCredentials } from '@/services/tokenManager'
import { startJob, completeJob, failJob } from '@/services/jobTracker'
import { searchChannelVideos } from '@/lib/youtube'

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
  const lockId = await acquireLock('cron:discover-videos', 120)
  if (!lockId) {
    return NextResponse.json({ error: 'Already running' }, { status: 409 })
  }

  const ctx = await startJob('DISCOVER_VIDEOS')

  try {
    // Get all active channels
    const channels = await prisma.channel.findMany({
      where: { isActive: true },
      select: { id: true, title: true, youtubeChannelId: true },
    })

    const results: { channelId: string; channelTitle: string; videosDiscovered: number; errors: number }[] = []

    for (const channel of channels) {
      const channelResult = { channelId: channel.id, channelTitle: channel.title, videosDiscovered: 0, errors: 0 }

      try {
        const credentials = await getValidCredentials(channel.id)
        if (!credentials) {
          logger.warn('No valid credentials for channel, skipping', { channelId: channel.id })
          channelResult.errors++
          ctx.errorsCount++
          results.push(channelResult)
          continue
        }

        // Search for videos published in the last 24 hours
        const twentyFourHoursAgo = new Date()
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

        const videos = await searchChannelVideos(
          channel.youtubeChannelId,
          credentials,
          twentyFourHoursAgo
        )

        for (const video of videos) {
          try {
            // Check if the stream already exists
            const existing = await prisma.stream.findUnique({
              where: { youtubeVideoId: video.videoId },
              select: { id: true },
            })

            if (existing) {
              // Already tracked, skip
              continue
            }

            // Create a new Stream record for the discovered video
            await prisma.stream.create({
              data: {
                channelId: channel.id,
                youtubeVideoId: video.videoId,
                title: video.title,
                status: 'ENDED', // Past video, not live
                actualStartAt: new Date(video.publishedAt),
                endedAt: new Date(video.publishedAt),
              },
            })

            channelResult.videosDiscovered++
            ctx.eventsProcessed++
          } catch (error) {
            logger.error('Error creating stream for discovered video', error, {
              videoId: video.videoId,
              channelId: channel.id,
            })
            channelResult.errors++
            ctx.errorsCount++
          }
        }
      } catch (error) {
        logger.error('Error discovering videos for channel', error, { channelId: channel.id })
        channelResult.errors++
        ctx.errorsCount++
      }

      results.push(channelResult)
    }

    await completeJob(ctx)

    return NextResponse.json({
      message: `Discovered videos for ${channels.length} channels`,
      results,
      jobRunId: ctx.jobRunId,
      totalVideosDiscovered: ctx.eventsProcessed,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    await failJob(ctx, error instanceof Error ? error.message : 'Unknown error')
    logger.error('Video discovery cron error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Video discovery failed' },
      { status: 500 }
    )
  } finally {
    await releaseLock('cron:discover-videos', lockId)
  }
}
