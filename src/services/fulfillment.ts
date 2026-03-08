import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { randomUUID } from 'crypto'

// ============================================
// TYPES
// ============================================

export interface FulfillmentResult {
  success: boolean
  deliveryCode?: string
  deliveryMethod: 'IN_APP' | 'EMAIL'
  error?: string
}

// ============================================
// DIGITAL CODE GENERATION
// ============================================

/**
 * Generate a unique digital code for a reward.
 * Format: {REWARD_PREFIX}-{UUID_SEGMENT}
 */
export function generateDigitalCode(rewardType: string): string {
  const prefix = rewardType
    .replace(/[^A-Za-z0-9]/g, '')
    .substring(0, 6)
    .toUpperCase() || 'REWARD'
  const uuidSegment = randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()
  return `${prefix}-${uuidSegment}`
}

// ============================================
// SINGLE REDEMPTION FULFILLMENT
// ============================================

/**
 * Process a single redemption for fulfillment.
 * Idempotent: if already delivered, returns success without re-processing.
 */
export async function fulfillRedemption(redemptionId: string): Promise<FulfillmentResult> {
  try {
    // 1. Load the RewardRedemption with its Reward
    const redemption = await prisma.rewardRedemption.findUnique({
      where: { id: redemptionId },
      include: {
        reward: {
          select: {
            id: true,
            name: true,
            rewardType: true,
          },
        },
      },
    })

    if (!redemption) {
      return {
        success: false,
        deliveryMethod: 'IN_APP',
        error: 'Redemption not found',
      }
    }

    // 2. Skip non-digital rewards (physical rewards need manual fulfillment)
    if (redemption.reward.rewardType !== 'DIGITAL') {
      return {
        success: false,
        deliveryMethod: 'IN_APP',
        error: 'Physical rewards require manual fulfillment',
      }
    }

    // 3. Skip cancelled redemptions
    if (redemption.deliveryStatus === 'CANCELLED') {
      return {
        success: false,
        deliveryMethod: 'IN_APP',
        error: 'Redemption has been cancelled',
      }
    }

    // 4. Try to claim the redemption atomically (optimistic update)
    const updated = await prisma.rewardRedemption.updateMany({
      where: { id: redemptionId, deliveryStatus: { not: 'DELIVERED' } },
      data: { deliveryStatus: 'PROCESSING' },
    })

    if (updated.count === 0) {
      // Already delivered or being processed - fetch current state for idempotent response
      const existing = await prisma.rewardRedemption.findUnique({
        where: { id: redemptionId },
      })
      if (existing?.deliveryStatus === 'DELIVERED') {
        logger.info('Redemption already fulfilled, returning idempotently', {
          redemptionId,
          rewardCode: existing.rewardCode,
        })
        return {
          success: true,
          deliveryCode: existing.rewardCode ?? undefined,
          deliveryMethod: 'IN_APP',
        }
      }
      return {
        success: false,
        deliveryMethod: 'IN_APP',
        error: 'Already being processed',
      }
    }

    // 5. Now safe to generate code and deliver
    const deliveryCode = generateDigitalCode(redemption.reward.name)

    // 6. Update RewardRedemption: set rewardCode, deliveredAt, status = DELIVERED
    await prisma.rewardRedemption.update({
      where: { id: redemptionId },
      data: {
        rewardCode: deliveryCode,
        deliveredAt: new Date(),
        deliveryStatus: 'DELIVERED',
      },
    })

    logger.info('Redemption fulfilled successfully', {
      redemptionId,
      rewardId: redemption.reward.id,
      rewardName: redemption.reward.name,
    })

    return {
      success: true,
      deliveryCode,
      deliveryMethod: 'IN_APP',
    }
  } catch (error) {
    // Fulfillment failed: set status to FAILED and log error
    const errorMessage = error instanceof Error ? error.message : 'Unknown fulfillment error'

    logger.error('Fulfillment failed', error, { redemptionId })

    try {
      await prisma.rewardRedemption.update({
        where: { id: redemptionId },
        data: {
          deliveryStatus: 'FAILED',
          adminNotes: `Auto-fulfillment failed: ${errorMessage}`,
        },
      })
    } catch (updateError) {
      logger.error('Failed to update redemption status to FAILED', updateError, {
        redemptionId,
      })
    }

    return {
      success: false,
      deliveryMethod: 'IN_APP',
      error: errorMessage,
    }
  }
}

// ============================================
// RETRY FAILED FULFILLMENTS
// ============================================

/**
 * Retry all failed fulfillments.
 * Only processes redemptions with status 'FAILED' and digital reward type.
 */
export async function retryFailedFulfillments(): Promise<{
  processed: number
  succeeded: number
  failed: number
}> {
  const stats = { processed: 0, succeeded: 0, failed: 0 }

  const failedRedemptions = await prisma.rewardRedemption.findMany({
    where: {
      deliveryStatus: 'FAILED',
      reward: {
        rewardType: 'DIGITAL',
      },
    },
    select: { id: true },
    orderBy: { redeemedAt: 'asc' },
    take: 100, // Process in batches of 100
  })

  for (const redemption of failedRedemptions) {
    stats.processed++
    const result = await fulfillRedemption(redemption.id)
    if (result.success) {
      stats.succeeded++
    } else {
      stats.failed++
    }
  }

  logger.info('Retry failed fulfillments completed', stats)
  return stats
}
