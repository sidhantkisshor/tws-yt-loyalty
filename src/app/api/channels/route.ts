import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getChannelInfo } from '@/lib/youtube'
import { adminReadLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// GET /api/channels - List user's channels
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

    const channels = await prisma.channel.findMany({
      where: { ownerId: session.user.id },
      include: {
        _count: {
          select: {
            streams: true,
            viewers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ channels })
  } catch (error) {
    logger.error('Error fetching channels', error)
    return NextResponse.json(
      { error: 'Failed to fetch channels' },
      { status: 500 }
    )
  }
}

// POST /api/channels - Add a channel (fetches from YouTube)
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

    // Get user's YouTube credentials from Account table (NextAuth OAuth storage)
    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'google' },
      select: {
        access_token: true,
        refresh_token: true,
        expires_at: true,
      },
    })

    if (!account?.access_token || !account?.refresh_token) {
      return NextResponse.json(
        { error: 'YouTube credentials not found. Please reconnect your account.' },
        { status: 401 }
      )
    }

    const credentials = {
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
    }

    // Get channel info from YouTube
    const channelInfo = await getChannelInfo(credentials)
    if (!channelInfo) {
      return NextResponse.json(
        { error: 'Could not fetch your YouTube channel information' },
        { status: 400 }
      )
    }

    // Check if channel already exists
    const existingChannel = await prisma.channel.findUnique({
      where: { youtubeChannelId: channelInfo.id },
    })

    if (existingChannel) {
      if (existingChannel.ownerId === session.user.id) {
        return NextResponse.json(
          { error: 'This channel is already connected', channel: existingChannel },
          { status: 409 }
        )
      } else {
        return NextResponse.json(
          { error: 'This channel is already connected to another account' },
          { status: 409 }
        )
      }
    }

    // Create channel
    const channel = await prisma.channel.create({
      data: {
        youtubeChannelId: channelInfo.id,
        title: channelInfo.title,
        thumbnailUrl: channelInfo.thumbnailUrl,
        ownerId: session.user.id,
      },
    })

    return NextResponse.json({ channel }, { status: 201 })
  } catch (error) {
    logger.error('Error creating channel', error)
    return NextResponse.json(
      { error: 'Failed to create channel' },
      { status: 500 }
    )
  }
}
