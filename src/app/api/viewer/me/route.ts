import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// Get current viewer's profile
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)

    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Determine target viewer ID based on channel selection
    let targetViewerId = session.viewerId
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    if (channelId && session.availableChannels) {
      const channelData = session.availableChannels.find(c => c.channelId === channelId)
      if (channelData) {
        targetViewerId = channelData.viewerId
      } else {
        return NextResponse.json({ error: 'Unauthorized for this channel' }, { status: 403 })
      }
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(targetViewerId, ip)
    const rateLimit = await checkRateLimit(viewerPublicLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const viewer = await prisma.viewer.findUnique({
      where: { id: targetViewerId },
      select: {
        id: true,
        displayName: true,
        profileImageUrl: true,
        totalPoints: true,
        availablePoints: true,
        lifetimePoints: true,
        rank: true,
        trustScore: true,
        totalStreamsAttended: true,
        totalMessagesCount: true,
        totalCodesRedeemed: true,
        currentStreak: true,
        longestStreak: true,
        pauseEndsAt: true,
        shortPausesUsedThisMonth: true,
        longPausesUsedThisMonth: true,
        referralCode: true,
        totalWatchTimeMinutes: true,
        firstSeenAt: true,
        lastSeenAt: true,
        isMember: true,
        isModerator: true,
        channel: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
          },
        },
      },
    })

    if (!viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    // Calculate tokens (1000 points = 1 token)
    const tokens = Math.floor(viewer.availablePoints / 1000)

    return NextResponse.json({
      viewer: {
        ...viewer,
        tokens,
      },
    })
  } catch (error) {
    logger.error('Get viewer profile error', error)
    return NextResponse.json(
      { error: 'Failed to get profile' },
      { status: 500 }
    )
  }
}
