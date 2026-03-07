import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { nanoid } from 'nanoid'
import { rewardRedemptionLimiter } from '@/lib/redis'
import { redeemRewardSchema } from '@/lib/validators'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// Redeem a reward (viewer-authenticated version with shipping support)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)

    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // #17: Rate limit redemption attempts (3 per minute per viewer)
    // Note: session.viewerId is the primary viewer ID for this account, serving as a global identifier for the user
    const { success, reset } = await rewardRedemptionLimiter.limit(session.viewerId)
    if (!success) {
      return NextResponse.json(
        {
          error: 'Too many redemption attempts. Please wait before trying again.',
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
          remaining: 0,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    const body = await request.json()

    // Validate input with Zod
    const validatedData = redeemRewardSchema.parse(body)
    const { rewardId, shippingAddress } = validatedData

    // Extract shipping fields if provided
    const shippingName = shippingAddress?.fullName
    const shippingAddressLine = shippingAddress?.addressLine1
    const shippingCity = shippingAddress?.city
    const shippingState = shippingAddress?.state
    const shippingZip = shippingAddress?.postalCode
    const shippingCountry = shippingAddress?.country
    const shippingPhone = body.shippingPhone // Optional, not in schema

    // 1. Fetch reward to identify the channel
    const reward = await prisma.rewardConfig.findUnique({
      where: { id: rewardId },
      include: {
        _count: { select: { redemptions: true } },
      },
    })

    if (!reward) {
      return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
    }

    // 2. Determine which viewer identity to use based on reward channel
    let targetViewerId = session.viewerId // Default fallback
    if (session.availableChannels) {
      const channelData = session.availableChannels.find(c => c.channelId === reward.channelId)
      if (channelData) {
        targetViewerId = channelData.viewerId
      } else {
        // User is not associated with this channel
        return NextResponse.json({ error: 'You are not a member of this channel' }, { status: 403 })
      }
    }

    // 3. Fetch viewer
    const viewer = await prisma.viewer.findUnique({
      where: { id: targetViewerId },
    })

    if (!viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
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

    // Check if physical reward has shipping info
    if (reward.requiresShipping && !shippingAddress) {
      return NextResponse.json(
        { error: 'Shipping information is required for physical rewards' },
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

    // Calculate points needed
    const pointsNeeded = reward.tokenCost * 1000
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
          where: { viewerId: viewer.id, rewardId },
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

      // Re-check stock for physical rewards inside transaction
      if (reward.rewardType === 'PHYSICAL' && reward.stockQuantity !== null) {
        const freshReward = await tx.rewardConfig.findUnique({
          where: { id: rewardId },
          select: { stockQuantity: true },
        })
        if (!freshReward || (freshReward.stockQuantity !== null && freshReward.stockQuantity <= 0)) {
          throw new Error('OUT_OF_STOCK')
        }
      }

      // Re-check viewer points inside transaction
      const freshViewer = await tx.viewer.findUnique({
        where: { id: viewer.id },
        select: { availablePoints: true },
      })
      if (!freshViewer || freshViewer.availablePoints < pointsNeeded) {
        throw new Error('INSUFFICIENT_POINTS')
      }

      // Create redemption
      const newRedemption = await tx.rewardRedemption.create({
        data: {
          rewardId,
          viewerId: viewer.id,
          tokensSpent: reward.tokenCost,
          pointsSpent: pointsNeeded,
          rewardCode,
          deliveryStatus: 'PENDING',
          // Shipping info
          shippingName: reward.requiresShipping ? shippingName : null,
          shippingAddress: reward.requiresShipping ? shippingAddressLine : null,
          shippingCity: reward.requiresShipping ? shippingCity : null,
          shippingState: reward.requiresShipping ? shippingState : null,
          shippingZip: reward.requiresShipping ? shippingZip : null,
          shippingCountry: reward.requiresShipping ? shippingCountry : null,
          shippingPhone: reward.requiresShipping ? shippingPhone : null,
        },
      })

      // Deduct points
      await tx.viewer.update({
        where: { id: viewer.id },
        data: {
          availablePoints: { decrement: pointsNeeded },
        },
      })

      // Create transaction record
      await tx.pointLedger.create({
        data: {
          viewerId: viewer.id,
          type: 'REWARD_REDEMPTION',
          amount: -pointsNeeded,
          balanceBefore: freshViewer.availablePoints,
          balanceAfter: freshViewer.availablePoints - pointsNeeded,
          referenceType: 'reward_redemption',
          referenceId: rewardId,
          description: `Redeemed: ${reward.name}`,
        },
      })

      // Update reward config
      await tx.rewardConfig.update({
        where: { id: rewardId },
        data: {
          currentTotal: { increment: 1 },
          ...(reward.stockQuantity !== null && {
            stockQuantity: { decrement: 1 },
          }),
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
        rewardName: reward.name,
        rewardType: reward.rewardType,
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
        case 'OUT_OF_STOCK':
          return NextResponse.json(
            { error: 'Reward is out of stock' },
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
