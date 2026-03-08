import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// Get viewer's redemption history
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

    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const [redemptions, total] = await Promise.all([
      prisma.rewardRedemption.findMany({
        where: { viewerId: targetViewerId },
        orderBy: { redeemedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          tokensSpent: true,
          pointsSpent: true,
          rewardCode: true,
          deliveryStatus: true,
          redeemedAt: true,
          deliveredAt: true,
          shippedAt: true,
          trackingNumber: true,
          reward: {
            select: {
              id: true,
              name: true,
              description: true,
              imageUrl: true,
              rewardType: true,
            },
          },
        },
      }),
      prisma.rewardRedemption.count({ where: { viewerId: targetViewerId } }),
    ])

    return NextResponse.json({ redemptions, total })
  } catch (error) {
    logger.error('Get redemptions error', error)
    return NextResponse.json(
      { error: 'Failed to get redemptions' },
      { status: 500 }
    )
  }
}
