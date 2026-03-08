import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { fulfillRedemption } from '@/services/fulfillment'
import { requireAdmin, writeAuditLog, getClientIP } from '@/lib/admin'
import { logger } from '@/lib/logger'

// POST /api/admin/redemptions/[id]/fulfill
// Manually trigger fulfillment for a specific redemption
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const adminAuth = await requireAdmin()
    if (!adminAuth.authorized) {
      return adminAuth.response
    }

    const { id } = await params

    // Load redemption and verify channel ownership
    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id },
      include: {
        reward: {
          include: {
            channel: { select: { ownerId: true } },
          },
        },
      },
    })

    if (!redemption) {
      return NextResponse.json({ error: 'Redemption not found' }, { status: 404 })
    }

    if (redemption.reward.channel.ownerId !== adminAuth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Call the fulfillment service
    const result = await fulfillRedemption(id)

    // Write audit log
    await writeAuditLog({
      userId: adminAuth.userId,
      entityType: 'RewardRedemption',
      entityId: id,
      action: 'MANUAL_FULFILL',
      previousValue: { deliveryStatus: redemption.deliveryStatus },
      newValue: {
        deliveryStatus: result.success ? 'DELIVERED' : 'FAILED',
        deliveryCode: result.deliveryCode,
      },
      ipAddress: getClientIP(request),
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, result },
        { status: 422 }
      )
    }

    return NextResponse.json({ result })
  } catch (error) {
    logger.error('Manual fulfillment error', error)
    return NextResponse.json(
      { error: 'Failed to fulfill redemption' },
      { status: 500 }
    )
  }
}
