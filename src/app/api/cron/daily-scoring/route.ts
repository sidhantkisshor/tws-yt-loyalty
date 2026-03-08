import { NextRequest, NextResponse } from 'next/server'
import { acquireLock, releaseLock } from '@/lib/redis'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { startJob, completeJob, failJob } from '@/services/jobTracker'
import { runDailyScoring } from '@/services/dailyScoring'

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

  // Acquire distributed lock (TTL 600s = 10 minutes)
  const lockId = await acquireLock('cron:daily-scoring', 600)
  if (!lockId) {
    return NextResponse.json({ error: 'Already running' }, { status: 409 })
  }

  const ctx = await startJob('DAILY_SCORING')

  try {
    const result = await runDailyScoring()

    ctx.eventsProcessed = result.eventsProcessed
    await completeJob(ctx)

    return NextResponse.json({
      message: 'Daily scoring completed',
      ...result,
      jobRunId: ctx.jobRunId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    await failJob(ctx, error instanceof Error ? error.message : 'Unknown error')
    logger.error('Daily scoring cron error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Daily scoring failed' },
      { status: 500 }
    )
  } finally {
    await releaseLock('cron:daily-scoring', lockId)
  }
}
