import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

/**
 * Comprehensive health check endpoint
 * Checks all critical services: app, database, and Redis
 */
export async function GET() {
  const checks = {
    app: { status: 'healthy', responseTimeMs: 0 },
    database: { status: 'unknown', responseTimeMs: 0 },
    redis: { status: 'unknown', responseTimeMs: 0 },
  }

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

  // Check Database
  try {
    const startTime = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database.responseTimeMs = Date.now() - startTime
    checks.database.status = 'healthy'
  } catch (error) {
    logger.error('Database health check failed in full health check', error)
    checks.database.status = 'unhealthy'
    overallStatus = 'unhealthy'
  }

  // Check Redis
  try {
    const startTime = Date.now()
    await redis.ping()
    checks.redis.responseTimeMs = Date.now() - startTime
    checks.redis.status = 'healthy'
  } catch (error) {
    logger.error('Redis health check failed in full health check', error)
    checks.redis.status = 'unhealthy'
    // Redis failure is degraded, not unhealthy (app can run without it)
    if (overallStatus === 'healthy') {
      overallStatus = 'degraded'
    }
  }

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503

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
