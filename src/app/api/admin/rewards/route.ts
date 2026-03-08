import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { writeAuditLog, getClientIP } from '@/lib/admin'
import { adminReadLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { rewardConfigSchema } from '@/lib/validators'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// List all rewards for admin's channels
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
    const channelId = searchParams.get('channelId')
    const rewardType = searchParams.get('type') // DIGITAL or PHYSICAL
    const isActive = searchParams.get('active')

    // Get admin's channels
    const channels = await prisma.channel.findMany({
      where: { ownerId: session.user.id },
      select: { id: true },
    })
    const channelIds = channels.map((c: { id: string }) => c.id)

    if (channelIds.length === 0) {
      return NextResponse.json({ rewards: [] })
    }

    // Build filter
    const where: Record<string, unknown> = {
      channelId: channelId ? channelId : { in: channelIds },
    }

    if (rewardType) {
      where.rewardType = rewardType
    }

    if (isActive !== null) {
      where.isActive = isActive === 'true'
    }

    const rewards = await prisma.rewardConfig.findMany({
      where,
      include: {
        channel: {
          select: { id: true, title: true, thumbnailUrl: true },
        },
        _count: {
          select: { redemptions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ rewards })
  } catch (error) {
    logger.error('List rewards error', error)
    return NextResponse.json(
      { error: 'Failed to list rewards' },
      { status: 500 }
    )
  }
}

// Create a new reward
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

    // Validate input with Zod
    const validatedData = rewardConfigSchema.parse(body)
    const {
      channelId,
      name,
      description,
      imageUrl,
      rewardType,
      requiresShipping,
      stockQuantity,
      tokenCost,
    } = validatedData

    // Additional optional fields not in base schema
    const {
      maxPerViewer,
      maxTotal,
      minTrustScore = 30,
      minAccountAgeDays = 7,
      minRank,
      availableFrom,
      availableUntil,
    } = body

    // Verify channel ownership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    })

    if (!channel || channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    const reward = await prisma.rewardConfig.create({
      data: {
        channelId,
        name,
        description,
        imageUrl,
        rewardType,
        requiresShipping: rewardType === 'PHYSICAL' ? true : requiresShipping,
        stockQuantity,
        tokenCost,
        maxPerViewer,
        maxTotal,
        minTrustScore,
        minAccountAgeDays,
        minRank,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableUntil: availableUntil ? new Date(availableUntil) : null,
      },
      include: {
        channel: {
          select: { id: true, title: true },
        },
      },
    })

    // Write audit log
    await writeAuditLog({
      userId: session.user.id,
      entityType: 'RewardConfig',
      entityId: reward.id,
      action: 'CREATE',
      previousValue: null,
      newValue: {
        name,
        tokenCost,
        rewardType,
        channelId,
      },
      ipAddress: getClientIP(request),
    })

    return NextResponse.json({ reward }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Create reward error', error)
    return NextResponse.json(
      { error: 'Failed to create reward' },
      { status: 500 }
    )
  }
}
