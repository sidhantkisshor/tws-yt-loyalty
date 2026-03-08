import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getLiveChatId } from '@/lib/youtube'
import { setStreamState, getStreamState } from '@/lib/redis'
import { adminWriteLimiter, adminReadLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { pollingActionSchema } from '@/lib/validators'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { getValidCredentials } from '@/services/tokenManager'

// Start or stop polling for a stream
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(session.user.id, ip)
    const rateLimit = await checkRateLimit(adminWriteLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const { id: streamId } = await params
    const body = await request.json()

    // Validate input with Zod
    const { action } = pollingActionSchema.parse(body)

    // Get stream with channel info
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        channel: {
          select: { id: true, ownerId: true },
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

    if (action === 'start') {
      // Validate stream can be polled
      if (stream.status !== 'LIVE' && stream.status !== 'SCHEDULED') {
        return NextResponse.json(
          { error: 'Stream must be live or scheduled' },
          { status: 400 }
        )
      }

      // Get live chat ID if not already set
      let liveChatId = stream.youtubeLiveChatId
      if (!liveChatId) {
        const credentials = await getValidCredentials(stream.channel.id)
        if (!credentials) {
          return NextResponse.json(
            { error: 'Channel OAuth credentials not configured or expired' },
            { status: 401 }
          )
        }

        liveChatId = await getLiveChatId(stream.youtubeVideoId, stream.channelId, credentials)
        if (!liveChatId) {
          return NextResponse.json(
            { error: 'Could not get live chat ID. Stream may not be live yet.' },
            { status: 400 }
          )
        }
      }

      // Update stream to start polling
      const updatedStream = await prisma.stream.update({
        where: { id: streamId },
        data: {
          status: 'LIVE',
          isPollingActive: true,
          youtubeLiveChatId: liveChatId,
          actualStartAt: stream.actualStartAt || new Date(),
        },
      })

      // Initialize Redis state
      await setStreamState(streamId, {
        nextPageToken: '',
        lastPollAt: new Date().toISOString(),
        pollingIntervalMs: 4000,
      })

      return NextResponse.json({
        message: 'Polling started',
        stream: {
          id: updatedStream.id,
          status: updatedStream.status,
          isPollingActive: updatedStream.isPollingActive,
          youtubeLiveChatId: updatedStream.youtubeLiveChatId,
        },
      })
    } else if (action === 'stop') {
      // Stop polling
      const updatedStream = await prisma.stream.update({
        where: { id: streamId },
        data: {
          isPollingActive: false,
        },
      })

      return NextResponse.json({
        message: 'Polling stopped',
        stream: {
          id: updatedStream.id,
          status: updatedStream.status,
          isPollingActive: updatedStream.isPollingActive,
        },
      })
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "start" or "stop"' },
        { status: 400 }
      )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Polling control error', error)
    return NextResponse.json(
      { error: 'Failed to control polling' },
      { status: 500 }
    )
  }
}

// Get polling status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // Require authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(session.user.id, ip)
    const rateLimit = await checkRateLimit(adminReadLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const { id: streamId } = await params

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        status: true,
        isPollingActive: true,
        youtubeLiveChatId: true,
        lastPollAt: true,
        pollIntervalMs: true,
        totalMessagesProcessed: true,
        quotaUsedThisStream: true,
        channel: {
          select: { ownerId: true },
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

    // Get Redis state
    const redisState = await getStreamState(streamId)

    return NextResponse.json({
      ...stream,
      redisState,
    })
  } catch (error) {
    logger.error('Get polling status error', error)
    return NextResponse.json(
      { error: 'Failed to get polling status' },
      { status: 500 }
    )
  }
}
