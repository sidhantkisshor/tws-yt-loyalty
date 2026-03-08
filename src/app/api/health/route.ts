import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { redis } from '@/lib/redis'

/**
 * Health check endpoint for uptime monitoring services.
 * Returns structured health response with DB and Redis connectivity status.
 */
export async function GET() {
  const checks: Record<string, { status: string; latencyMs: number }> = {}
  let overallStatus: 'healthy' | 'degraded' | 'down' = 'healthy'

  // Database check
  const dbStart = Date.now()
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    const latencyMs = Date.now() - dbStart
    checks.database = { status: latencyMs > 1000 ? 'degraded' : 'healthy', latencyMs }
    if (latencyMs > 1000) overallStatus = 'degraded'
  } catch {
    checks.database = { status: 'down', latencyMs: Date.now() - dbStart }
    overallStatus = 'down'
  }

  // Redis check
  const redisStart = Date.now()
  try {
    await redis.set('health:check', '1', { ex: 10 })
    const val = await redis.get('health:check')
    const latencyMs = Date.now() - redisStart
    if (val !== '1') {
      checks.redis = { status: 'degraded', latencyMs }
      if (overallStatus === 'healthy') overallStatus = 'degraded'
    } else {
      checks.redis = { status: latencyMs > 500 ? 'degraded' : 'healthy', latencyMs }
      if (latencyMs > 500 && overallStatus === 'healthy') overallStatus = 'degraded'
    }
  } catch {
    checks.redis = { status: 'down', latencyMs: Date.now() - redisStart }
    overallStatus = 'down'
  }

  const statusCode = overallStatus === 'down' ? 503 : 200

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: 'yt-loyalty',
      version: process.env.npm_package_version || '1.0.0',
      checks,
    },
    { status: statusCode }
  )
}
