import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { adminReadLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// GET: Funnel analytics (admin auth, requires channelId query param)
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

    // Run queries in parallel
    const [
      tierCounts,
      courseBuyers,
      premiumCohortBuyers,
    ] = await Promise.all([
      // Per-tier viewer counts
      prisma.viewer.groupBy({
        by: ['rank'],
        where: { channelId },
        _count: { rank: true },
      }),

      // Course buyers count
      prisma.viewer.count({
        where: {
          channelId,
          hasPurchasedCourse: true,
        },
      }),

      // Premium cohort buyers count
      prisma.viewer.count({
        where: {
          channelId,
          hasPurchasedPremiumCohort: true,
        },
      }),
    ])

    return NextResponse.json({
      tiers: tierCounts.map((t) => ({
        tier: t.rank,
        count: t._count.rank,
      })),
      courseBuyers,
      premiumCohortBuyers,
    })
  } catch (error) {
    logger.error('Analytics funnel error', error)
    return NextResponse.json(
      { error: 'Failed to get funnel analytics' },
      { status: 500 }
    )
  }
}
