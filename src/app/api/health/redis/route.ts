import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

/**
 * Redis health check endpoint
 * Verifies Redis connectivity and performance
 */
export async function GET() {
  try {
    // Test Redis connectivity with a simple ping
    const startTime = Date.now()
    await redis.ping()
    const responseTime = Date.now() - startTime

    // Test basic read/write
    const testKey = 'health:check'
    const testValue = Date.now().toString()
    await redis.set(testKey, testValue, { ex: 10 }) // Expire in 10 seconds
    const readValue = await redis.get(testKey)

    if (readValue !== testValue) {
      throw new Error('Redis read/write verification failed')
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'redis',
      responseTimeMs: responseTime,
      readWriteTest: 'passed',
    })
  } catch (error) {
    logger.error('Redis health check failed', error)

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'redis',
        error: 'Redis connection or operation failed',
      },
      { status: 503 }
    )
  }
}
