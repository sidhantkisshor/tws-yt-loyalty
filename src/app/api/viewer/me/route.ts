import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// Get current viewer's profile with global wallet from FanProfile
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
        fanProfileId: true,
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

    // Fetch FanProfile for global wallet data
    let globalWallet = null
    if (viewer.fanProfileId) {
      const fanProfile = await prisma.fanProfile.findUnique({
        where: { id: viewer.fanProfileId },
        select: {
          totalPoints: true,
          availablePoints: true,
          lifetimePoints: true,
          rank: true,
          trustScore: true,
          currentStreak: true,
          longestStreak: true,
        },
      })

      if (fanProfile) {
        globalWallet = {
          totalPoints: fanProfile.totalPoints,
          availablePoints: fanProfile.availablePoints,
          lifetimePoints: fanProfile.lifetimePoints,
          rank: fanProfile.rank,
          trustScore: fanProfile.trustScore,
          currentStreak: fanProfile.currentStreak,
          longestStreak: fanProfile.longestStreak,
        }
      }
    }

    // Calculate tokens from global wallet if available, else channel-local
    const globalAvailable = globalWallet?.availablePoints ?? viewer.availablePoints
    const tokens = Math.floor(globalAvailable / 1000)

    // Build channel profile (per-channel data)
    const channelProfile = {
      totalPoints: viewer.totalPoints,
      availablePoints: viewer.availablePoints,
      lifetimePoints: viewer.lifetimePoints,
      rank: viewer.rank,
      trustScore: viewer.trustScore,
      totalStreamsAttended: viewer.totalStreamsAttended,
      totalMessagesCount: viewer.totalMessagesCount,
      totalCodesRedeemed: viewer.totalCodesRedeemed,
      currentStreak: viewer.currentStreak,
      longestStreak: viewer.longestStreak,
      totalWatchTimeMinutes: viewer.totalWatchTimeMinutes,
      isMember: viewer.isMember,
      isModerator: viewer.isModerator,
    }

    return NextResponse.json({
      viewer: {
        id: viewer.id,
        displayName: viewer.displayName,
        profileImageUrl: viewer.profileImageUrl,
        // Use global wallet values as primary when available
        totalPoints: globalWallet?.totalPoints ?? viewer.totalPoints,
        availablePoints: globalAvailable,
        lifetimePoints: globalWallet?.lifetimePoints ?? viewer.lifetimePoints,
        rank: globalWallet?.rank ?? viewer.rank,
        trustScore: globalWallet?.trustScore ?? viewer.trustScore,
        currentStreak: globalWallet?.currentStreak ?? viewer.currentStreak,
        longestStreak: globalWallet?.longestStreak ?? viewer.longestStreak,
        totalStreamsAttended: viewer.totalStreamsAttended,
        totalMessagesCount: viewer.totalMessagesCount,
        totalCodesRedeemed: viewer.totalCodesRedeemed,
        pauseEndsAt: viewer.pauseEndsAt,
        shortPausesUsedThisMonth: viewer.shortPausesUsedThisMonth,
        longPausesUsedThisMonth: viewer.longPausesUsedThisMonth,
        referralCode: viewer.referralCode,
        totalWatchTimeMinutes: viewer.totalWatchTimeMinutes,
        firstSeenAt: viewer.firstSeenAt,
        lastSeenAt: viewer.lastSeenAt,
        isMember: viewer.isMember,
        isModerator: viewer.isModerator,
        channel: viewer.channel,
        tokens,
      },
      globalWallet,
      channelProfile,
    })
  } catch (error) {
    logger.error('Get viewer profile error', error)
    return NextResponse.json(
      { error: 'Failed to get profile' },
      { status: 500 }
    )
  }
}
