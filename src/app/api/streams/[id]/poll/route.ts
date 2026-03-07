import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { pollLiveChatMessages, YouTubeCredentials } from '@/lib/youtube'
import { processMessage } from '@/services/messageProcessor'
import { setStreamState, getStreamState } from '@/lib/redis'
import { streamPollLimiter, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

interface PollResult {
  messagesProcessed: number
  codesRedeemed: number
  pointsAwarded: number
  newViewers: number
  fraudDetected: number
  nextPageToken?: string
  pollIntervalMs: number
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<PollResult | { error: string }>> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: streamId } = await params

    // Rate limit per stream to prevent quota exhaustion
    const rateLimit = await checkRateLimit(streamPollLimiter, streamId)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Polling too frequently. Please wait before polling again.' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    // Get stream with channel info
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        channel: {
          include: { channelCredential: true },
        },
      },
    })

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }

    // Verify ownership
    if (stream.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if stream is live
    if (stream.status !== 'LIVE') {
      return NextResponse.json({ error: 'Stream is not live' }, { status: 400 })
    }

    if (!stream.youtubeLiveChatId) {
      return NextResponse.json({ error: 'No live chat ID' }, { status: 400 })
    }

    // Get OAuth tokens from channel credential
    const credential = stream.channel.channelCredential
    if (!credential?.accessToken || !credential?.refreshToken) {
      return NextResponse.json({ error: 'Channel OAuth credentials not configured' }, { status: 401 })
    }

    const credentials: YouTubeCredentials = {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      expiresAt: credential.tokenExpiresAt ?? undefined,
    }

    // Get current stream state from Redis
    const streamState = await getStreamState(streamId)
    const pageToken = streamState?.nextPageToken || stream.nextPageToken || undefined

    // Poll YouTube chat
    const pollResult = await pollLiveChatMessages(
      stream.youtubeLiveChatId,
      stream.channelId,
      credentials,
      pageToken
    )

    // Process messages in parallel batches for better performance
    let messagesProcessed = 0
    let codesRedeemed = 0
    let pointsAwarded = 0
    let newViewers = 0
    let fraudDetected = 0

    const BATCH_SIZE = 10 // Process 10 messages concurrently
    const messages = pollResult.messages

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)

      const results = await Promise.allSettled(
        batch.map((message) => processMessage(streamId, stream.channelId, message))
      )

      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled') {
          messagesProcessed++
          if (result.value.isNewViewer) newViewers++
          if (result.value.codeRedeemed) codesRedeemed++
          pointsAwarded += result.value.pointsAwarded
          if (result.value.fraudDetected) fraudDetected++
        } else {
          logger.error(`Error processing message ${batch[j].id}`, result.reason, {
            messageId: batch[j].id,
            streamId,
            channelId: stream.channelId,
          })
        }
      }
    }

    // Update stream state in Redis and DB
    await setStreamState(streamId, {
      nextPageToken: pollResult.nextPageToken || '',
      lastPollAt: new Date().toISOString(),
      pollingIntervalMs: pollResult.pollingIntervalMillis,
    })

    // Update stream in database
    await prisma.stream.update({
      where: { id: streamId },
      data: {
        nextPageToken: pollResult.nextPageToken,
        lastPollAt: new Date(),
        pollIntervalMs: pollResult.pollingIntervalMillis,
        totalMessagesProcessed: { increment: messagesProcessed },
        quotaUsedThisStream: { increment: 1 },
      },
    })

    // Update channel quota
    await prisma.channel.update({
      where: { id: stream.channelId },
      data: {
        dailyQuotaUsed: { increment: 1 },
      },
    })

    return NextResponse.json({
      messagesProcessed,
      codesRedeemed,
      pointsAwarded,
      newViewers,
      fraudDetected,
      nextPageToken: pollResult.nextPageToken,
      pollIntervalMs: pollResult.pollingIntervalMillis,
    })
  } catch (error) {
    logger.error('Poll error', error, {
      streamId: (await params).id,
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Poll failed' },
      { status: 500 }
    )
  }
}

// GET endpoint to check poll status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: streamId } = await params

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        status: true,
        isPollingActive: true,
        lastPollAt: true,
        pollIntervalMs: true,
        nextPageToken: true,
        totalMessagesProcessed: true,
        quotaUsedThisStream: true,
      },
    })

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }

    // Get Redis state for real-time info
    const redisState = await getStreamState(streamId)

    return NextResponse.json({
      ...stream,
      redisState,
    })
  } catch (error) {
    logger.error('Poll status error', error, {
      streamId: (await params).id,
    })
    return NextResponse.json(
      { error: 'Failed to get poll status' },
      { status: 500 }
    )
  }
}
