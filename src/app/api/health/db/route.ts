import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Database health check endpoint
 * Verifies database connectivity
 */
export async function GET() {
  try {
    // Simple query to check database connectivity
    const startTime = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const responseTime = Date.now() - startTime

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'database',
      responseTimeMs: responseTime,
    })
  } catch (error) {
    logger.error('Database health check failed', error)

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'database',
        error: 'Database connection failed',
      },
      { status: 503 }
    )
  }
}
