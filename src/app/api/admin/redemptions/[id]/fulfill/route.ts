import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { fulfillRedemption } from '@/services/fulfillment'
import { writeAuditLog, getClientIP } from '@/lib/admin'
import { logger } from '@/lib/logger'

// POST /api/admin/redemptions/[id]/fulfill
// Manually trigger fulfillment for a specific redemption
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    if (redemption.reward.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Call the fulfillment service
    const result = await fulfillRedemption(id)

    // Write audit log
    await writeAuditLog({
      userId: session.user.id,
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
