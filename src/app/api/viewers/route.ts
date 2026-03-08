import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { adminReadLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// GET /api/viewers - List viewers for user's channels
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

    const ALLOWED_SORT_FIELDS = ['totalPoints', 'lifetimePoints', 'createdAt', 'lastSeenAt', 'displayName', 'rank']
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    const search = searchParams.get('search')
    const rawSortBy = searchParams.get('sortBy') || 'totalPoints'
    const sortBy = ALLOWED_SORT_FIELDS.includes(rawSortBy) ? rawSortBy : 'totalPoints'
    const order = searchParams.get('order') || 'desc'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get user's channels
    const channels = await prisma.channel.findMany({
      where: { ownerId: session.user.id },
      select: { id: true },
    })

    const channelIds = channels.map((c: { id: string }) => c.id)

    // Build where clause
    const where: Record<string, unknown> = {
      channelId: channelId ? channelId : { in: channelIds },
    }

    if (search) {
      where.displayName = {
        contains: search,
        mode: 'insensitive',
      }
    }

    // Get total count
    const total = await prisma.viewer.count({ where })

    // Get viewers
    const viewers = await prisma.viewer.findMany({
      where,
      orderBy: { [sortBy]: order },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        channel: {
          select: { title: true },
        },
        fanProfile: {
          select: {
            totalPoints: true,
            availablePoints: true,
            lifetimePoints: true,
            rank: true,
            trustScore: true,
          },
        },
        _count: {
          select: {
            codeRedemptions: true,
            streamAttendances: true,
          },
        },
      },
    })

    return NextResponse.json({
      viewers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('Error fetching viewers', error)
    return NextResponse.json(
      { error: 'Failed to fetch viewers' },
      { status: 500 }
    )
  }
}
