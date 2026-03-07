import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { extractVideoId, getVideoInfo } from '@/lib/youtube'
import { z } from 'zod'
import { adminReadLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

const createStreamSchema = z.object({
  channelId: z.string(),
  youtubeUrl: z.string().url().or(z.string().length(11)), // URL or video ID
})

// GET /api/streams - List streams for user's channels
export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    const status = searchParams.get('status')

    // Get user's channels
    const channels = await prisma.channel.findMany({
      where: { ownerId: session.user.id },
      select: { id: true },
    })

    const channelIds = channels.map((c: { id: string }) => c.id)

    // Build query
    const where: Record<string, unknown> = {
      channelId: channelId ? channelId : { in: channelIds },
    }

    if (status) {
      where.status = status.toUpperCase()
    }

    const streams = await prisma.stream.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        channel: {
          select: { title: true, thumbnailUrl: true },
        },
        _count: {
          select: {
            loyaltyCodes: true,
            streamAttendances: true,
          },
        },
      },
    })

    return NextResponse.json({ streams })
  } catch (error) {
    logger.error('Error fetching streams', error)
    return NextResponse.json(
      { error: 'Failed to fetch streams' },
      { status: 500 }
    )
  }
}

// POST /api/streams - Create a new stream
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { channelId, youtubeUrl } = createStreamSchema.parse(body)

    // Verify channel ownership
    const channel = await prisma.channel.findFirst({
      where: { id: channelId, ownerId: session.user.id },
    })

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found or not owned by you' },
        { status: 404 }
      )
    }

    // Extract video ID
    const videoId = extractVideoId(youtubeUrl)
    if (!videoId) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL or video ID' },
        { status: 400 }
      )
    }

    // Check if stream already exists
    const existingStream = await prisma.stream.findUnique({
      where: { youtubeVideoId: videoId },
    })

    if (existingStream) {
      return NextResponse.json(
        { error: 'Stream already exists', stream: existingStream },
        { status: 409 }
      )
    }

    // Get channel's OAuth credentials
    const channelWithCred = await prisma.channel.findFirst({
      where: { id: channelId, ownerId: session.user.id },
      include: { channelCredential: true },
    })

    if (!channelWithCred?.channelCredential?.accessToken || !channelWithCred?.channelCredential?.refreshToken) {
      return NextResponse.json(
        { error: 'Channel OAuth credentials not configured. Please reconnect your account.' },
        { status: 401 }
      )
    }

    const credentials = {
      accessToken: channelWithCred.channelCredential.accessToken,
      refreshToken: channelWithCred.channelCredential.refreshToken,
      expiresAt: channelWithCred.channelCredential.tokenExpiresAt ?? undefined,
    }

    // Get video info from YouTube
    const videoInfo = await getVideoInfo(videoId, credentials)
    if (!videoInfo) {
      return NextResponse.json(
        { error: 'Video not found on YouTube' },
        { status: 404 }
      )
    }

    // Create stream
    const stream = await prisma.stream.create({
      data: {
        channelId,
        youtubeVideoId: videoId,
        youtubeLiveChatId: videoInfo.liveChatId,
        title: videoInfo.title,
        thumbnailUrl: videoInfo.thumbnailUrl,
        status: videoInfo.isLive ? 'LIVE' : 'SCHEDULED',
        actualStartAt: videoInfo.isLive ? new Date() : null,
      },
    })

    return NextResponse.json({ stream }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Error creating stream', error)
    return NextResponse.json(
      { error: 'Failed to create stream' },
      { status: 500 }
    )
  }
}
