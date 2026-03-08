import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// Get a single reward (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // Rate limit check (public endpoint)
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(undefined, ip)
    const rateLimit = await checkRateLimit(viewerPublicLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const { id } = await params

    const reward = await prisma.rewardConfig.findUnique({
      where: { id },
      include: {
        channel: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
          },
        },
        _count: {
          select: { redemptions: true },
        },
      },
    })

    if (!reward) {
      return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
    }

    return NextResponse.json({
      reward: {
        ...reward,
        redemptionCount: reward._count.redemptions,
        _count: undefined,
      },
    })
  } catch (error) {
    logger.error('Get reward error', error)
    return NextResponse.json(
      { error: 'Failed to get reward' },
      { status: 500 }
    )
  }
}
