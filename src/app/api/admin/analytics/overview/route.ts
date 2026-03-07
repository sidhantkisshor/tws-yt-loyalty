import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { adminReadLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// GET: Overview analytics (admin auth, requires channelId query param)
export async function GET(request: NextRequest): Promise<NextResponse> {
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
        headers: rateLimit.headers,
      })
    }

    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
    }

    // Verify channel ownership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    })

    if (!channel || channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Run queries in parallel
    const [
      totalViewers,
      activeViewers30d,
      tierDistribution,
      segmentDistribution,
      pointsIssued,
      pointsRedeemed,
      averageStreakResult,
      rewardRedemptions30d,
    ] = await Promise.all([
      // Total viewers
      prisma.viewer.count({
        where: { channelId },
      }),

      // Active viewers in last 30 days
      prisma.viewer.count({
        where: {
          channelId,
          lastSeenAt: { gte: thirtyDaysAgo },
        },
      }),

      // Tier distribution
      prisma.viewer.groupBy({
        by: ['rank'],
        where: { channelId },
        _count: { rank: true },
      }),

      // Segment distribution
      prisma.viewer.groupBy({
        by: ['currentSegment'],
        where: { channelId },
        _count: { currentSegment: true },
      }),

      // Points issued (positive transactions)
      prisma.pointLedger.aggregate({
        where: {
          viewer: { channelId },
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      }),

      // Points redeemed (negative transactions)
      prisma.pointLedger.aggregate({
        where: {
          viewer: { channelId },
          amount: { lt: 0 },
        },
        _sum: { amount: true },
      }),

      // Average streak
      prisma.viewer.aggregate({
        where: { channelId },
        _avg: { currentStreak: true },
      }),

      // Reward redemptions in last 30 days
      prisma.rewardRedemption.count({
        where: {
          viewer: { channelId },
          redeemedAt: { gte: thirtyDaysAgo },
        },
      }),
    ])

    const issued = pointsIssued._sum.amount ?? 0
    const redeemed = Math.abs(pointsRedeemed._sum.amount ?? 0)
    const earnToBurnRatio = redeemed > 0 ? issued / redeemed : 0

    return NextResponse.json({
      totalViewers,
      activeViewers30d,
      tierDistribution: tierDistribution.map((t) => ({
        tier: t.rank,
        count: t._count.rank,
      })),
      segmentDistribution: segmentDistribution.map((s) => ({
        segment: s.currentSegment ?? 'UNASSIGNED',
        count: s._count.currentSegment,
      })),
      pointsEconomy: {
        issued,
        redeemed,
        earnToBurnRatio: Math.round(earnToBurnRatio * 100) / 100,
      },
      averageStreak: Math.round((averageStreakResult._avg.currentStreak ?? 0) * 100) / 100,
      rewardRedemptions30d,
    })
  } catch (error) {
    logger.error('Analytics overview error', error)
    return NextResponse.json(
      { error: 'Failed to get analytics overview' },
      { status: 500 }
    )
  }
}
