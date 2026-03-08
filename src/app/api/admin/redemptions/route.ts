import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { adminReadLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// List all redemptions for admin's channels
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
        headers: rateLimit.headers
      })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const rewardType = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Get admin's channels
    const channels = await prisma.channel.findMany({
      where: { ownerId: session.user.id },
      select: { id: true },
    })
    const channelIds = channels.map((c: { id: string }) => c.id)

    if (channelIds.length === 0) {
      return NextResponse.json({ redemptions: [], total: 0 })
    }

    // Build filter
    const where: Record<string, unknown> = {
      reward: {
        channelId: { in: channelIds },
      },
    }

    if (status) {
      where.deliveryStatus = status
    }

    if (rewardType) {
      where.reward = {
        ...where.reward as Record<string, unknown>,
        rewardType,
      }
    }

    const [redemptions, total] = await Promise.all([
      prisma.rewardRedemption.findMany({
        where,
        include: {
          reward: {
            select: {
              id: true,
              name: true,
              rewardType: true,
              requiresShipping: true,
              channel: {
                select: { id: true, title: true },
              },
            },
          },
          viewer: {
            select: {
              id: true,
              displayName: true,
              profileImageUrl: true,
              youtubeChannelId: true,
            },
          },
        },
        orderBy: { redeemedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.rewardRedemption.count({ where }),
    ])

    return NextResponse.json({ redemptions, total })
  } catch (error) {
    logger.error('List redemptions error', error)
    return NextResponse.json(
      { error: 'Failed to list redemptions' },
      { status: 500 }
    )
  }
}
