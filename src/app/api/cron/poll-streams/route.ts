import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { pollLiveChatMessages } from '@/lib/youtube'
import { processMessage } from '@/services/messageProcessor'
import { setStreamState } from '@/lib/redis'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { getValidCredentials } from '@/services/tokenManager'

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = env.CRON_SECRET

interface StreamPollResult {
  streamId: string
  channelTitle: string
  messagesProcessed: number
  codesRedeemed: number
  pointsAwarded: number
  error?: string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret (for Vercel Cron or external cron services)
  // SECURITY: Fail closed - if CRON_SECRET is not configured, deny access
  if (!CRON_SECRET) {
    logger.error('CRON_SECRET environment variable is not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all live streams with polling enabled
    const liveStreams = await prisma.stream.findMany({
      where: {
        status: 'LIVE',
        isPollingActive: true,
        youtubeLiveChatId: { not: null },
      },
      include: {
        channel: {
          select: { id: true, title: true, quotaLimit: true, dailyQuotaUsed: true },
        },
      },
    })

    if (liveStreams.length === 0) {
      return NextResponse.json({
        message: 'No active streams to poll',
        results: [],
      })
    }

    const results: StreamPollResult[] = []

    // Poll each stream
    for (const stream of liveStreams) {
      const result: StreamPollResult = {
        streamId: stream.id,
        channelTitle: stream.channel.title,
        messagesProcessed: 0,
        codesRedeemed: 0,
        pointsAwarded: 0,
      }

      try {
        const credentials = await getValidCredentials(stream.channel.id)
        if (!credentials) {
          logger.warn('No valid credentials for channel, skipping stream', { channelId: stream.channel.id, streamId: stream.id })
          result.error = 'No valid credentials'
          results.push(result)
          continue
        }

        // Check quota before polling
        const channel = stream.channel
        const quotaRemaining = channel.quotaLimit - channel.dailyQuotaUsed
        if (quotaRemaining < 10) {
          result.error = 'Quota exhausted'
          results.push(result)
          continue
        }

        // Poll YouTube chat
        const pollResult = await pollLiveChatMessages(
          stream.youtubeLiveChatId!,
          stream.channelId,
          credentials,
          stream.nextPageToken || undefined
        )

        // Process messages
        for (const message of pollResult.messages) {
          try {
            const messageResult = await processMessage(
              stream.id,
              stream.channelId,
              message
            )
            result.messagesProcessed++
            if (messageResult.codeRedeemed) result.codesRedeemed++
            result.pointsAwarded += messageResult.pointsAwarded
          } catch (error) {
            logger.error('Error processing message', error, { messageId: message.id, streamId: stream.id })
          }
        }

        // Update stream state
        await setStreamState(stream.id, {
          nextPageToken: pollResult.nextPageToken || '',
          lastPollAt: new Date().toISOString(),
          pollingIntervalMs: pollResult.pollingIntervalMillis,
        })

        // Update database
        await prisma.stream.update({
          where: { id: stream.id },
          data: {
            nextPageToken: pollResult.nextPageToken,
            lastPollAt: new Date(),
            pollIntervalMs: pollResult.pollingIntervalMillis,
            totalMessagesProcessed: { increment: result.messagesProcessed },
            quotaUsedThisStream: { increment: 1 },
          },
        })

        await prisma.channel.update({
          where: { id: stream.channelId },
          data: {
            dailyQuotaUsed: { increment: 1 },
          },
        })
      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Unknown error'
        logger.error('Error polling stream', error, { streamId: stream.id })
      }

      results.push(result)
    }

    return NextResponse.json({
      message: `Polled ${liveStreams.length} streams`,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Cron poll error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron poll failed' },
      { status: 500 }
    )
  }
}

// POST can also trigger polling (for manual triggers)
export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request)
}
