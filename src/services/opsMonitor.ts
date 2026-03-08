import prisma from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

// ============================================
// TYPES
// ============================================

export interface SystemHealth {
  database: { status: 'healthy' | 'degraded' | 'down'; latencyMs: number }
  redis: { status: 'healthy' | 'degraded' | 'down'; latencyMs: number }
  channels: { total: number; healthy: number; expired: number; revoked: number }
  jobs: {
    recentFailures: number
    avgDurationMs: number
    lastRun: Record<string, { status: string; completedAt: Date | null; eventsProcessed: number }>
  }
  ingestion: {
    lagMinutes: number
    eventsLast24h: number
    eventsLastHour: number
  }
  quota: {
    dailyUsed: number
    dailyLimit: number
    percentUsed: number
  }
}

export interface Alert {
  severity: 'WARNING' | 'CRITICAL'
  message: string
  timestamp: Date
  category: string
}

// ============================================
// HEALTH CHECKS
// ============================================

async function checkDatabaseHealth(): Promise<SystemHealth['database']> {
  const start = Date.now()
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    const latencyMs = Date.now() - start
    return {
      status: latencyMs > 1000 ? 'degraded' : 'healthy',
      latencyMs,
    }
  } catch (error) {
    logger.error('Database health check failed', error as Error)
    return { status: 'down', latencyMs: Date.now() - start }
  }
}

async function checkRedisHealth(): Promise<SystemHealth['redis']> {
  const start = Date.now()
  try {
    const testKey = 'health:ping'
    await redis.set(testKey, 'pong', { ex: 10 })
    const result = await redis.get(testKey)
    const latencyMs = Date.now() - start
    if (result !== 'pong') {
      return { status: 'degraded', latencyMs }
    }
    return {
      status: latencyMs > 500 ? 'degraded' : 'healthy',
      latencyMs,
    }
  } catch (error) {
    logger.error('Redis health check failed', error as Error)
    return { status: 'down', latencyMs: Date.now() - start }
  }
}

async function checkChannelHealth(): Promise<SystemHealth['channels']> {
  try {
    const credentials = await prisma.channelCredential.groupBy({
      by: ['tokenStatus'],
      _count: { id: true },
    })

    let total = 0
    let healthy = 0
    let expired = 0
    let revoked = 0

    for (const group of credentials) {
      const count = group._count.id
      total += count
      switch (group.tokenStatus) {
        case 'VALID':
          healthy += count
          break
        case 'EXPIRED':
          expired += count
          break
        case 'REVOKED':
          revoked += count
          break
      }
    }

    return { total, healthy, expired, revoked }
  } catch (error) {
    logger.error('Channel health check failed', error as Error)
    return { total: 0, healthy: 0, expired: 0, revoked: 0 }
  }
}

async function checkJobHealth(): Promise<SystemHealth['jobs']> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Get failure count in last 24h
    const failureCount = await prisma.jobRun.count({
      where: {
        status: 'FAILED',
        createdAt: { gte: twentyFourHoursAgo },
      },
    })

    // Get completed jobs for average duration
    const completedJobs = await prisma.jobRun.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: twentyFourHoursAgo },
        startedAt: { not: null },
        completedAt: { not: null },
      },
      select: {
        startedAt: true,
        completedAt: true,
      },
    })

    let avgDurationMs = 0
    if (completedJobs.length > 0) {
      const totalDuration = completedJobs.reduce((sum, job) => {
        if (job.startedAt && job.completedAt) {
          return sum + (job.completedAt.getTime() - job.startedAt.getTime())
        }
        return sum
      }, 0)
      avgDurationMs = Math.round(totalDuration / completedJobs.length)
    }

    // Get last run for each job type
    const jobTypes = ['INGEST_CHAT', 'INGEST_COMMENTS', 'DISCOVER_VIDEOS', 'DAILY_SCORING', 'FRAUD_SCAN', 'BACKFILL'] as const
    const lastRun: Record<string, { status: string; completedAt: Date | null; eventsProcessed: number }> = {}

    for (const jobType of jobTypes) {
      const latest = await prisma.jobRun.findFirst({
        where: { jobType },
        orderBy: { createdAt: 'desc' },
        select: {
          status: true,
          completedAt: true,
          eventsProcessed: true,
        },
      })

      if (latest) {
        lastRun[jobType] = {
          status: latest.status,
          completedAt: latest.completedAt,
          eventsProcessed: latest.eventsProcessed,
        }
      }
    }

    return {
      recentFailures: failureCount,
      avgDurationMs,
      lastRun,
    }
  } catch (error) {
    logger.error('Job health check failed', error as Error)
    return { recentFailures: 0, avgDurationMs: 0, lastRun: {} }
  }
}

async function checkIngestionHealth(): Promise<SystemHealth['ingestion']> {
  try {
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    // Find last successful ingest
    const lastIngest = await prisma.jobRun.findFirst({
      where: {
        jobType: 'INGEST_CHAT',
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    })

    const lagMinutes = lastIngest?.completedAt
      ? Math.round((now.getTime() - lastIngest.completedAt.getTime()) / (60 * 1000))
      : -1 // -1 indicates no ingest has ever run

    // Count engagement events in last 24h
    const eventsLast24h = await prisma.engagementEvent.count({
      where: {
        ingestedAt: { gte: twentyFourHoursAgo },
      },
    })

    // Count engagement events in last hour
    const eventsLastHour = await prisma.engagementEvent.count({
      where: {
        ingestedAt: { gte: oneHourAgo },
      },
    })

    return { lagMinutes, eventsLast24h, eventsLastHour }
  } catch (error) {
    logger.error('Ingestion health check failed', error as Error)
    return { lagMinutes: -1, eventsLast24h: 0, eventsLastHour: 0 }
  }
}

async function checkQuotaHealth(): Promise<SystemHealth['quota']> {
  try {
    const dailyUsed = await redis.get<number>('quota:global:daily') ?? 0
    const dailyLimit = parseInt(process.env.YOUTUBE_DAILY_QUOTA_LIMIT || '10000', 10)
    const percentUsed = dailyLimit > 0 ? Math.round((dailyUsed / dailyLimit) * 100) : 0

    return { dailyUsed, dailyLimit, percentUsed }
  } catch (error) {
    logger.error('Quota health check failed', error as Error)
    return { dailyUsed: 0, dailyLimit: 10000, percentUsed: 0 }
  }
}

// ============================================
// PUBLIC API
// ============================================

export async function getSystemHealth(): Promise<SystemHealth> {
  const [database, redisHealth, channels, jobs, ingestion, quota] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
    checkChannelHealth(),
    checkJobHealth(),
    checkIngestionHealth(),
    checkQuotaHealth(),
  ])

  return {
    database,
    redis: redisHealth,
    channels,
    jobs,
    ingestion,
    quota,
  }
}

export async function getJobHistory(days: number = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const jobs = await prisma.jobRun.findMany({
    where: {
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      jobType: true,
      status: true,
      channelId: true,
      startedAt: true,
      completedAt: true,
      eventsProcessed: true,
      errorsCount: true,
      errorMessage: true,
      createdAt: true,
    },
    take: 500,
  })

  return jobs
}

export async function getIngestionMetrics(): Promise<{
  lagMinutes: number
  eventsPerHour: { hour: string; count: number }[]
}> {
  const now = new Date()

  // Find last successful ingest
  const lastIngest = await prisma.jobRun.findFirst({
    where: {
      jobType: 'INGEST_CHAT',
      status: 'COMPLETED',
    },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  })

  const lagMinutes = lastIngest?.completedAt
    ? Math.round((now.getTime() - lastIngest.completedAt.getTime()) / (60 * 1000))
    : -1

  // Get events per hour for the last 24 hours
  const eventsPerHour: { hour: string; count: number }[] = []
  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000)
    const hourEnd = new Date(now.getTime() - i * 60 * 60 * 1000)

    const count = await prisma.engagementEvent.count({
      where: {
        ingestedAt: {
          gte: hourStart,
          lt: hourEnd,
        },
      },
    })

    eventsPerHour.push({
      hour: hourStart.toISOString().slice(11, 16),
      count,
    })
  }

  return { lagMinutes, eventsPerHour }
}

// ============================================
// ALERT GENERATION
// ============================================

export async function generateAlerts(): Promise<Alert[]> {
  const health = await getSystemHealth()
  const alerts: Alert[] = []
  const now = new Date()

  // Ingestion lag alerts
  if (health.ingestion.lagMinutes >= 0) {
    if (health.ingestion.lagMinutes > 120) {
      alerts.push({
        severity: 'CRITICAL',
        message: `Ingestion lag is ${health.ingestion.lagMinutes} minutes (>2 hours)`,
        timestamp: now,
        category: 'ingestion',
      })
    } else if (health.ingestion.lagMinutes > 30) {
      alerts.push({
        severity: 'WARNING',
        message: `Ingestion lag is ${health.ingestion.lagMinutes} minutes (>30 min)`,
        timestamp: now,
        category: 'ingestion',
      })
    }
  }

  // Job failure alerts - check last hour
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const recentFailures = await prisma.jobRun.count({
    where: {
      status: 'FAILED',
      createdAt: { gte: oneHourAgo },
    },
  })
  if (recentFailures > 0) {
    alerts.push({
      severity: 'WARNING',
      message: `${recentFailures} job failure(s) in the last hour`,
      timestamp: now,
      category: 'jobs',
    })
  }

  // Token health alerts
  if (health.channels.expired > 0) {
    alerts.push({
      severity: 'WARNING',
      message: `${health.channels.expired} channel(s) with expired tokens`,
      timestamp: now,
      category: 'tokens',
    })
  }
  if (health.channels.revoked > 0) {
    alerts.push({
      severity: 'WARNING',
      message: `${health.channels.revoked} channel(s) with revoked tokens`,
      timestamp: now,
      category: 'tokens',
    })
  }

  // Quota alerts
  if (health.quota.percentUsed > 95) {
    alerts.push({
      severity: 'CRITICAL',
      message: `YouTube API quota at ${health.quota.percentUsed}% (>${health.quota.dailyUsed}/${health.quota.dailyLimit})`,
      timestamp: now,
      category: 'quota',
    })
  } else if (health.quota.percentUsed > 80) {
    alerts.push({
      severity: 'WARNING',
      message: `YouTube API quota at ${health.quota.percentUsed}% (${health.quota.dailyUsed}/${health.quota.dailyLimit})`,
      timestamp: now,
      category: 'quota',
    })
  }

  // Database latency alerts
  if (health.database.status === 'down') {
    alerts.push({
      severity: 'CRITICAL',
      message: 'Database is unreachable',
      timestamp: now,
      category: 'database',
    })
  } else if (health.database.latencyMs > 1000) {
    alerts.push({
      severity: 'WARNING',
      message: `Database latency is ${health.database.latencyMs}ms (>1000ms)`,
      timestamp: now,
      category: 'database',
    })
  }

  // Redis latency alerts
  if (health.redis.status === 'down') {
    alerts.push({
      severity: 'CRITICAL',
      message: 'Redis is unreachable',
      timestamp: now,
      category: 'redis',
    })
  } else if (health.redis.latencyMs > 500) {
    alerts.push({
      severity: 'WARNING',
      message: `Redis latency is ${health.redis.latencyMs}ms (>500ms)`,
      timestamp: now,
      category: 'redis',
    })
  }

  return alerts
}
