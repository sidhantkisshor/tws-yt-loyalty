import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { checkAllChannelHealth } from '@/services/tokenManager'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await checkAllChannelHealth()

    if (result.errors.length > 0) {
      logger.warn('Channel token health issues', {
        healthy: result.healthy,
        expired: result.expired,
        revoked: result.revoked,
        errors: result.errors,
      })
    } else {
      logger.info('All channel tokens healthy', { healthy: result.healthy })
    }

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Token health check failed', error)
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
