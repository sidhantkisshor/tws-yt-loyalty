import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { viewerPublicLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// Get available rewards for a channel
export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    const where: { isActive: boolean; channelId?: string } = {
      isActive: true,
    }

    if (channelId) {
      where.channelId = channelId
    }

    const rewards = await prisma.rewardConfig.findMany({
      where,
      orderBy: { tokenCost: 'asc' },
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

    return NextResponse.json({
      rewards: rewards.map((reward: typeof rewards[number]) => ({
        ...reward,
        redemptionCount: reward._count.redemptions,
        _count: undefined,
      })),
    })
  } catch (error) {
    logger.error('Get rewards error', error)
    return NextResponse.json(
      { error: 'Failed to get rewards' },
      { status: 500 }
    )
  }
}

// Create a new reward (admin only)
export async function POST(request: NextRequest): Promise<NextResponse> {
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
    const {
      channelId,
      name,
      description,
      imageUrl,
      tokenCost,
      maxPerViewer,
      maxTotal,
      minTrustScore,
      minAccountAgeDays,
      minRank,
    } = body

    // Verify channel ownership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    })

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    if (channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const reward = await prisma.rewardConfig.create({
      data: {
        channelId,
        name,
        description,
        imageUrl,
        tokenCost,
        maxPerViewer,
        maxTotal,
        minTrustScore: minTrustScore ?? 30,
        minAccountAgeDays: minAccountAgeDays ?? 7,
        minRank,
      },
    })

    return NextResponse.json({ reward }, { status: 201 })
  } catch (error) {
    logger.error('Create reward error', error)
    return NextResponse.json(
      { error: 'Failed to create reward' },
      { status: 500 }
    )
  }
}
