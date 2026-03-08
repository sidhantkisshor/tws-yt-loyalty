import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  requireAdmin,
  isValidStatusTransition,
  writeAuditLog,
  getClientIP,
} from '@/lib/admin'
import { adminReadLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { updateRedemptionSchema } from '@/lib/validators'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// Get a single redemption
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const adminAuth = await requireAdmin()
    if (!adminAuth.authorized) {
      return adminAuth.response
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(adminAuth.userId, ip)
    const rateLimit = await checkRateLimit(adminReadLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const { id } = await params

    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id },
      include: {
        reward: {
          include: {
            channel: {
              select: { id: true, title: true, ownerId: true },
            },
          },
        },
        viewer: {
          select: {
            id: true,
            displayName: true,
            profileImageUrl: true,
            youtubeChannelId: true,
            totalPoints: true,
            rank: true,
          },
        },
      },
    })

    if (!redemption) {
      return NextResponse.json({ error: 'Redemption not found' }, { status: 404 })
    }

    // Verify ownership
    if (redemption.reward.channel.ownerId !== adminAuth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ redemption })
  } catch (error) {
    logger.error('Get redemption error', error)
    return NextResponse.json(
      { error: 'Failed to get redemption' },
      { status: 500 }
    )
  }
}

// Update redemption status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const adminAuth = await requireAdmin()
    if (!adminAuth.authorized) {
      return adminAuth.response
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(adminAuth.userId, ip)
    const rateLimit = await checkRateLimit(adminWriteLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const { id } = await params
    const body = await request.json()

    // Validate input with Zod
    const validatedData = updateRedemptionSchema.parse(body)

    // Get existing redemption
    const existing = await prisma.rewardRedemption.findUnique({
      where: { id },
      include: {
        reward: {
          include: {
            channel: { select: { ownerId: true } },
          },
          // Need rewardType for physical reward tracking validation
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Redemption not found' }, { status: 404 })
    }

    // Verify ownership
    if (existing.reward.channel.ownerId !== adminAuth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const {
      deliveryStatus,
      trackingNumber,
      adminNotes,
    } = validatedData

    const updateData: Record<string, unknown> = {}

    // Validate status transition using state machine
    if (deliveryStatus !== undefined) {
      if (!isValidStatusTransition(existing.deliveryStatus, deliveryStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from ${existing.deliveryStatus} to ${deliveryStatus}`,
            validTransitions:
              existing.deliveryStatus === 'PENDING'
                ? ['PROCESSING', 'CANCELLED']
                : existing.deliveryStatus === 'PROCESSING'
                  ? ['SHIPPED', 'CANCELLED', 'FAILED']
                  : existing.deliveryStatus === 'SHIPPED'
                    ? ['DELIVERED', 'FAILED']
                    : existing.deliveryStatus === 'FAILED'
                      ? ['PROCESSING']
                      : [],
          },
          { status: 400 }
        )
      }

      // Require tracking number when shipping physical rewards
      if (
        deliveryStatus === 'SHIPPED' &&
        existing.reward.rewardType === 'PHYSICAL' &&
        !trackingNumber &&
        !existing.trackingNumber
      ) {
        return NextResponse.json(
          { error: 'Tracking number required for shipping physical rewards' },
          { status: 400 }
        )
      }

      updateData.deliveryStatus = deliveryStatus

      // Set timestamps based on status
      if (deliveryStatus === 'SHIPPED') {
        updateData.shippedAt = new Date()
      } else if (deliveryStatus === 'DELIVERED') {
        updateData.deliveredAt = new Date()
      }
    }

    if (trackingNumber !== undefined) {
      updateData.trackingNumber = trackingNumber
    }

    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes
    }

    const redemption = await prisma.rewardRedemption.update({
      where: { id },
      data: updateData,
      include: {
        reward: {
          select: { id: true, name: true, rewardType: true },
        },
        viewer: {
          select: { id: true, displayName: true },
        },
      },
    })

    // Write audit log
    await writeAuditLog({
      userId: adminAuth.userId,
      entityType: 'RewardRedemption',
      entityId: id,
      action: 'UPDATE',
      previousValue: {
        deliveryStatus: existing.deliveryStatus,
        trackingNumber: existing.trackingNumber,
        adminNotes: existing.adminNotes,
      },
      newValue: updateData,
      ipAddress: getClientIP(request),
    })

    return NextResponse.json({ redemption })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Update redemption error', error)
    return NextResponse.json(
      { error: 'Failed to update redemption' },
      { status: 500 }
    )
  }
}
