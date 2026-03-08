import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { adminReadLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { rewardConfigSchema } from '@/lib/validators'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// Get a single reward
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params

    const reward = await prisma.rewardConfig.findUnique({
      where: { id },
      include: {
        channel: {
          select: { id: true, title: true, thumbnailUrl: true, ownerId: true },
        },
        _count: {
          select: { redemptions: true },
        },
        redemptions: {
          take: 10,
          orderBy: { redeemedAt: 'desc' },
          include: {
            viewer: {
              select: { id: true, displayName: true, profileImageUrl: true },
            },
          },
        },
      },
    })

    if (!reward) {
      return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
    }

    // Verify ownership
    if (reward.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ reward })
  } catch (error) {
    logger.error('Get reward error', error)
    return NextResponse.json(
      { error: 'Failed to get reward' },
      { status: 500 }
    )
  }
}

// Update a reward
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params
    const body = await request.json()

    // Validate input with partial schema (all fields optional for PATCH)
    const validatedData = rewardConfigSchema.partial().parse(body)

    // Get existing reward
    const existing = await prisma.rewardConfig.findUnique({
      where: { id },
      include: {
        channel: { select: { ownerId: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
    }

    // Verify ownership
    if (existing.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build update data from validated fields
    const updateData: Record<string, unknown> = {}

    if (validatedData.name !== undefined) updateData.name = validatedData.name
    if (validatedData.description !== undefined) updateData.description = validatedData.description
    if (validatedData.imageUrl !== undefined) updateData.imageUrl = validatedData.imageUrl
    if (validatedData.rewardType !== undefined) updateData.rewardType = validatedData.rewardType
    if (validatedData.requiresShipping !== undefined) updateData.requiresShipping = validatedData.requiresShipping
    if (validatedData.stockQuantity !== undefined) updateData.stockQuantity = validatedData.stockQuantity
    if (validatedData.tokenCost !== undefined) updateData.tokenCost = validatedData.tokenCost
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive

    // Additional optional fields not in schema
    const { maxPerViewer, maxTotal, minTrustScore, minAccountAgeDays, minRank, availableFrom, availableUntil } = body
    if (maxPerViewer !== undefined) updateData.maxPerViewer = maxPerViewer
    if (maxTotal !== undefined) updateData.maxTotal = maxTotal
    if (minTrustScore !== undefined) updateData.minTrustScore = minTrustScore
    if (minAccountAgeDays !== undefined) updateData.minAccountAgeDays = minAccountAgeDays
    if (minRank !== undefined) updateData.minRank = minRank
    if (availableFrom !== undefined) updateData.availableFrom = availableFrom ? new Date(availableFrom) : null
    if (availableUntil !== undefined) updateData.availableUntil = availableUntil ? new Date(availableUntil) : null

    const reward = await prisma.rewardConfig.update({
      where: { id },
      data: updateData,
      include: {
        channel: {
          select: { id: true, title: true },
        },
      },
    })

    return NextResponse.json({ reward })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Update reward error', error)
    return NextResponse.json(
      { error: 'Failed to update reward' },
      { status: 500 }
    )
  }
}

// Delete a reward (soft delete by setting isActive=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params

    // Get existing reward
    const existing = await prisma.rewardConfig.findUnique({
      where: { id },
      include: {
        channel: { select: { ownerId: true } },
        _count: { select: { redemptions: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
    }

    // Verify ownership
    if (existing.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // If there are redemptions, soft delete by setting isActive=false
    if (existing._count.redemptions > 0) {
      await prisma.rewardConfig.update({
        where: { id },
        data: { isActive: false },
      })
      return NextResponse.json({ message: 'Reward deactivated (has redemptions)' })
    }

    // If no redemptions, hard delete
    await prisma.rewardConfig.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Reward deleted' })
  } catch (error) {
    logger.error('Delete reward error', error)
    return NextResponse.json(
      { error: 'Failed to delete reward' },
      { status: 500 }
    )
  }
}
