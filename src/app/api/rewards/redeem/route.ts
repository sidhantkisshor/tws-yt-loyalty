import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import prisma from '@/lib/prisma'
import { nanoid } from 'nanoid'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import { rewardRedemptionLimiter } from '@/lib/redis'
import { redeemRewardSchema } from '@/lib/validators'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// Redeem a reward
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify viewer is authenticated
    const session = await getServerSession(viewerAuthOptions)
    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use authenticated viewer's ID instead of trusting request body
    const viewerId = session.viewerId

    // Rate limit check (3 redemptions per minute per viewer)
    const { success, limit, remaining, reset } = await rewardRedemptionLimiter.limit(viewerId)

    if (!success) {
      return NextResponse.json({ error: 'Too many redemption attempts. Please wait before trying again.' }, {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(reset),
          'Retry-After': '60',
        }
      })
    }

    const body = await request.json()

    // Validate input with Zod
    const { rewardId } = redeemRewardSchema.parse(body)

    // Get viewer and reward
    const [viewer, reward] = await Promise.all([
      prisma.viewer.findUnique({
        where: { id: viewerId },
      }),
      prisma.rewardConfig.findUnique({
        where: { id: rewardId },
        include: {
          _count: { select: { redemptions: true } },
        },
      }),
    ])

    if (!viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    if (!reward) {
      return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
    }

    if (!reward.isActive) {
      return NextResponse.json(
        { error: 'Reward is no longer available' },
        { status: 400 }
      )
    }

    // Check viewer belongs to this channel
    if (viewer.channelId !== reward.channelId) {
      return NextResponse.json(
        { error: 'Reward not available for your channel' },
        { status: 400 }
      )
    }

    // Check trust score
    if (viewer.trustScore < reward.minTrustScore) {
      return NextResponse.json(
        { error: 'Trust score too low for this reward' },
        { status: 400 }
      )
    }

    // Check account age
    const accountAgeDays = Math.floor(
      (Date.now() - viewer.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (accountAgeDays < reward.minAccountAgeDays) {
      return NextResponse.json(
        { error: 'Account too new for this reward' },
        { status: 400 }
      )
    }

    // Check minimum rank
    if (reward.minRank) {
      const rankOrder = ['PAPER_TRADER', 'RETAIL_TRADER', 'SWING_TRADER', 'FUND_MANAGER', 'MARKET_MAKER', 'HEDGE_FUND', 'WHALE']
      const viewerRankIndex = rankOrder.indexOf(viewer.rank)
      const requiredRankIndex = rankOrder.indexOf(reward.minRank)
      if (viewerRankIndex < requiredRankIndex) {
        return NextResponse.json(
          { error: `Requires ${reward.minRank} rank or higher` },
          { status: 400 }
        )
      }
    }

    // Calculate points needed (prefer pointsCost, fall back to legacy tokenCost conversion)
    const pointsNeeded = reward.pointsCost > 0 ? reward.pointsCost : (reward.tokenCost * 1000)
    if (viewer.availablePoints < pointsNeeded) {
      return NextResponse.json(
        { error: 'Not enough points' },
        { status: 400 }
      )
    }

    // Generate reward code
    const rewardCode = `${reward.name.substring(0, 3).toUpperCase()}-${nanoid(8)}`

    // Use interactive transaction with isolation to prevent race conditions
    // All stock/limit checks happen inside the transaction
    const redemption = await prisma.$transaction(async (tx) => {
      // Re-check max per viewer inside transaction
      if (reward.maxPerViewer) {
        const viewerRedemptions = await tx.rewardRedemption.count({
          where: { viewerId, rewardId },
        })
        if (viewerRedemptions >= reward.maxPerViewer) {
          throw new Error('MAX_PER_VIEWER_EXCEEDED')
        }
      }

      // Re-check max total inside transaction with fresh data
      if (reward.maxTotal) {
        const totalRedemptions = await tx.rewardRedemption.count({
          where: { rewardId },
        })
        if (totalRedemptions >= reward.maxTotal) {
          throw new Error('SOLD_OUT')
        }
      }

      // Re-check viewer points inside transaction
      const freshViewer = await tx.viewer.findUnique({
        where: { id: viewerId },
        select: { availablePoints: true },
      })
      if (!freshViewer || freshViewer.availablePoints < pointsNeeded) {
        throw new Error('INSUFFICIENT_POINTS')
      }

      // Create redemption
      const newRedemption = await tx.rewardRedemption.create({
        data: {
          rewardId,
          viewerId,
          tokensSpent: reward.tokenCost,
          pointsSpent: pointsNeeded,
          rewardCode,
          deliveryStatus: 'PENDING',
        },
      })

      // Deduct points
      await tx.viewer.update({
        where: { id: viewerId },
        data: {
          availablePoints: { decrement: pointsNeeded },
        },
      })

      // Create transaction record
      await tx.pointTransaction.create({
        data: {
          viewerId,
          type: 'REWARD_REDEMPTION',
          amount: -pointsNeeded,
          balanceBefore: freshViewer.availablePoints,
          balanceAfter: freshViewer.availablePoints - pointsNeeded,
          referenceType: 'reward_redemption',
          referenceId: rewardId,
          description: `Redeemed: ${reward.name}`,
        },
      })

      // Increment redemption count
      await tx.rewardConfig.update({
        where: { id: rewardId },
        data: {
          currentTotal: { increment: 1 },
        },
      })

      return newRedemption
    }, {
      isolationLevel: 'Serializable', // Prevents race conditions
    })

    return NextResponse.json({
      success: true,
      redemption: {
        id: redemption.id,
        rewardCode,
        pointsSpent: pointsNeeded,
        tokensSpent: reward.tokenCost,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    // Handle specific transaction errors
    if (error instanceof Error) {
      switch (error.message) {
        case 'MAX_PER_VIEWER_EXCEEDED':
          return NextResponse.json(
            { error: 'Maximum redemptions reached for this reward' },
            { status: 400 }
          )
        case 'SOLD_OUT':
          return NextResponse.json(
            { error: 'Reward is sold out' },
            { status: 400 }
          )
        case 'INSUFFICIENT_POINTS':
          return NextResponse.json(
            { error: 'Not enough points' },
            { status: 400 }
          )
      }
    }
    logger.error('Reward redemption error', error, { viewerId: (error as Error & { viewerId?: string }).viewerId })
    return NextResponse.json(
      { error: 'Failed to redeem reward' },
      { status: 500 }
    )
  }
}
