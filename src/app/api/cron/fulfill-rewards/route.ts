import { NextRequest, NextResponse } from 'next/server'
import { acquireLock, releaseLock } from '@/lib/redis'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { startJob, completeJob, failJob } from '@/services/jobTracker'
import { fulfillRedemption, retryFailedFulfillments } from '@/services/fulfillment'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // SECURITY: Fail closed
  if (!env.CRON_SECRET) {
    logger.error('CRON_SECRET environment variable is not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Acquire distributed lock (TTL 300s = 5 minutes)
  const lockId = await acquireLock('cron:fulfill-rewards', 300)
  if (!lockId) {
    return NextResponse.json({ error: 'Already running' }, { status: 409 })
  }

  // Use BACKFILL job type since there's no FULFILLMENT type
  const ctx = await startJob('BACKFILL', undefined, { task: 'fulfill-rewards' })

  try {
    // 1. Process pending digital redemptions
    const pendingRedemptions = await prisma.rewardRedemption.findMany({
      where: {
        deliveryStatus: { in: ['PENDING', 'PROCESSING'] },
        reward: {
          rewardType: 'DIGITAL',
        },
      },
      select: { id: true },
      orderBy: { redeemedAt: 'asc' },
      take: 200, // Process up to 200 per run
    })

    let succeeded = 0
    let failed = 0

    for (const redemption of pendingRedemptions) {
      const result = await fulfillRedemption(redemption.id)
      if (result.success) {
        succeeded++
      } else {
        failed++
      }
    }

    // 2. Retry previously failed fulfillments
    const retryResult = await retryFailedFulfillments()

    ctx.eventsProcessed = pendingRedemptions.length + retryResult.processed
    ctx.errorsCount = failed + retryResult.failed
    await completeJob(ctx)

    return NextResponse.json({
      message: 'Fulfillment cron completed',
      pending: {
        processed: pendingRedemptions.length,
        succeeded,
        failed,
      },
      retries: retryResult,
      jobRunId: ctx.jobRunId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    await failJob(ctx, error instanceof Error ? error.message : 'Unknown error')
    logger.error('Fulfillment cron error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fulfillment cron failed' },
      { status: 500 }
    )
  } finally {
    await releaseLock('cron:fulfill-rewards', lockId)
  }
}
