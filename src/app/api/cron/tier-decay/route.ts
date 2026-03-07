import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { TIER_MAINTENANCE_90DAY, isPrestigeTier, type ViewerRankName } from '@/lib/ranks'
import { dispatchWebhooks } from '@/services/webhookDispatcher'

// Ordered tiers for demotion (index - 1 = one tier lower)
const TIER_ORDER: ViewerRankName[] = [
  'PAPER_TRADER',
  'RETAIL_TRADER',
  'SWING_TRADER',
  'FUND_MANAGER',
  'MARKET_MAKER',
]

// POST: Daily cron for tier decay (auth via Bearer CRON_SECRET header)
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  if (!env.CRON_SECRET) {
    logger.error('CRON_SECRET environment variable is not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    let demotions = 0

    // Process each tier that has maintenance requirements
    const tiersToCheck = Object.keys(TIER_MAINTENANCE_90DAY) as ViewerRankName[]

    for (const tier of tiersToCheck) {
      // Skip prestige tiers (they never decay)
      if (isPrestigeTier(tier)) continue

      const threshold = TIER_MAINTENANCE_90DAY[tier]
      if (threshold === undefined) continue

      // Find viewers at this tier
      const viewers = await prisma.viewer.findMany({
        where: {
          rank: tier,
          // Skip viewers with active pause
          OR: [
            { pauseEndsAt: null },
            { pauseEndsAt: { lte: now } },
          ],
        },
        select: {
          id: true,
          channelId: true,
          rank: true,
          displayName: true,
        },
      })

      for (const viewer of viewers) {
        // Sum positive points earned in last 90 days
        const pointsResult = await prisma.pointTransaction.aggregate({
          where: {
            viewerId: viewer.id,
            amount: { gt: 0 },
            createdAt: { gte: ninetyDaysAgo },
          },
          _sum: { amount: true },
        })

        const pointsEarned = pointsResult._sum.amount ?? 0

        if (pointsEarned < threshold) {
          // Demote one tier
          const currentTierIndex = TIER_ORDER.indexOf(tier)
          if (currentTierIndex <= 0) continue // Already at lowest tier

          const newTier = TIER_ORDER[currentTierIndex - 1]

          await prisma.viewer.update({
            where: { id: viewer.id },
            data: { rank: newTier },
          })

          demotions++

          // Fire webhook
          await dispatchWebhooks(viewer.channelId, 'viewer.tier_changed', {
            viewerId: viewer.id,
            displayName: viewer.displayName,
            previousTier: tier,
            newTier,
            reason: 'maintenance_decay',
            pointsEarned90d: pointsEarned,
            threshold,
          })

          logger.info('Viewer demoted due to tier decay', {
            viewerId: viewer.id,
            previousTier: tier,
            newTier,
            pointsEarned90d: pointsEarned,
            threshold,
          })
        }
      }
    }

    return NextResponse.json({ success: true, demotions })
  } catch (error) {
    logger.error('Tier decay cron error', error)
    return NextResponse.json(
      { error: 'Tier decay cron failed' },
      { status: 500 }
    )
  }
}
