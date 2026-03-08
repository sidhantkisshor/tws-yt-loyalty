import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// MOCKS - vi.hoisted ensures variables exist before vi.mock hoisting
// ============================================

const { mockPrisma, mockRedis } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRawUnsafe: vi.fn(),
    channelCredential: {
      groupBy: vi.fn(),
    },
    jobRun: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    engagementEvent: {
      count: vi.fn(),
    },
  },
  mockRedis: {
    set: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }))
vi.mock('@/lib/redis', () => ({
  redis: mockRedis,
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { getSystemHealth, generateAlerts, getJobHistory, getIngestionMetrics } from '@/services/opsMonitor'

// ============================================
// TESTS
// ============================================

describe('opsMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset YOUTUBE_DAILY_QUOTA_LIMIT for quota tests
    process.env.YOUTUBE_DAILY_QUOTA_LIMIT = '10000'
  })

  describe('getSystemHealth', () => {
    it('returns all health sections', async () => {
      // Setup mocks for a healthy system
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([
        { tokenStatus: 'VALID', _count: { id: 3 } },
      ])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health).toHaveProperty('database')
      expect(health).toHaveProperty('redis')
      expect(health).toHaveProperty('channels')
      expect(health).toHaveProperty('jobs')
      expect(health).toHaveProperty('ingestion')
      expect(health).toHaveProperty('quota')
    })

    it('reports database as healthy with low latency', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health.database.status).toBe('healthy')
      expect(health.database.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('reports database as down when query fails', async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('Connection refused'))
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health.database.status).toBe('down')
    })

    it('reports redis as healthy with successful set/get', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health.redis.status).toBe('healthy')
      expect(health.redis.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('reports redis as down when it throws', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'))
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health.redis.status).toBe('down')
    })

    it('aggregates channel health by token status', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([
        { tokenStatus: 'VALID', _count: { id: 5 } },
        { tokenStatus: 'EXPIRED', _count: { id: 2 } },
        { tokenStatus: 'REVOKED', _count: { id: 1 } },
      ])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health.channels.total).toBe(8)
      expect(health.channels.healthy).toBe(5)
      expect(health.channels.expired).toBe(2)
      expect(health.channels.revoked).toBe(1)
    })

    it('counts job failures in last 24h', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(3) // 3 failures
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health.jobs.recentFailures).toBe(3)
    })

    it('calculates ingestion lag from last successful ingest', async () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000)

      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue({
        completedAt: thirtyMinsAgo,
      })
      mockPrisma.engagementEvent.count.mockResolvedValue(100)

      const health = await getSystemHealth()

      // Allow for slight timing variance in test execution
      expect(health.ingestion.lagMinutes).toBeGreaterThanOrEqual(29)
      expect(health.ingestion.lagMinutes).toBeLessThanOrEqual(31)
    })

    it('returns -1 lag when no ingest has run', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health.ingestion.lagMinutes).toBe(-1)
    })

    it('reads quota from redis', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      // Use implementation to distinguish health ping vs quota key
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'quota:global:daily') return Promise.resolve(5000)
        return Promise.resolve('pong') // health ping
      })
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const health = await getSystemHealth()

      expect(health.quota.dailyUsed).toBe(5000)
      expect(health.quota.dailyLimit).toBe(10000)
      expect(health.quota.percentUsed).toBe(50)
    })
  })

  describe('generateAlerts', () => {
    function setupHealthyMocks() {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([
        { tokenStatus: 'VALID', _count: { id: 3 } },
      ])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue({
        completedAt: new Date(), // just now
      })
      mockPrisma.engagementEvent.count.mockResolvedValue(100)
    }

    it('produces no alerts for a healthy system', async () => {
      setupHealthyMocks()

      const alerts = await generateAlerts()

      expect(alerts).toHaveLength(0)
    })

    it('produces WARNING for ingestion lag > 30 minutes', async () => {
      setupHealthyMocks()
      // Override findFirst for ingestion lag
      const fortyMinsAgo = new Date(Date.now() - 40 * 60 * 1000)
      mockPrisma.jobRun.findFirst.mockResolvedValue({
        completedAt: fortyMinsAgo,
      })

      const alerts = await generateAlerts()

      const ingestionAlerts = alerts.filter(a => a.category === 'ingestion')
      expect(ingestionAlerts.length).toBe(1)
      expect(ingestionAlerts[0].severity).toBe('WARNING')
    })

    it('produces CRITICAL for ingestion lag > 2 hours', async () => {
      setupHealthyMocks()
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
      mockPrisma.jobRun.findFirst.mockResolvedValue({
        completedAt: threeHoursAgo,
      })

      const alerts = await generateAlerts()

      const ingestionAlerts = alerts.filter(a => a.category === 'ingestion')
      expect(ingestionAlerts.length).toBe(1)
      expect(ingestionAlerts[0].severity).toBe('CRITICAL')
    })

    it('produces WARNING for job failures in last hour', async () => {
      setupHealthyMocks()
      // The second call to jobRun.count is for alert generation (last hour failures)
      mockPrisma.jobRun.count
        .mockResolvedValueOnce(0) // 24h failures for health
        .mockResolvedValueOnce(2) // last hour failures for alerts

      const alerts = await generateAlerts()

      const jobAlerts = alerts.filter(a => a.category === 'jobs')
      expect(jobAlerts.length).toBe(1)
      expect(jobAlerts[0].severity).toBe('WARNING')
      expect(jobAlerts[0].message).toContain('2 job failure')
    })

    it('produces WARNING for expired tokens', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([
        { tokenStatus: 'VALID', _count: { id: 2 } },
        { tokenStatus: 'EXPIRED', _count: { id: 1 } },
      ])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue({
        completedAt: new Date(),
      })
      mockPrisma.engagementEvent.count.mockResolvedValue(100)

      const alerts = await generateAlerts()

      const tokenAlerts = alerts.filter(a => a.category === 'tokens')
      expect(tokenAlerts.length).toBe(1)
      expect(tokenAlerts[0].severity).toBe('WARNING')
      expect(tokenAlerts[0].message).toContain('expired')
    })

    it('produces WARNING for quota > 80%', async () => {
      setupHealthyMocks()
      // Override redis.get to return high quota by key
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'quota:global:daily') return Promise.resolve(8500)
        return Promise.resolve('pong')
      })

      const alerts = await generateAlerts()

      const quotaAlerts = alerts.filter(a => a.category === 'quota')
      expect(quotaAlerts.length).toBe(1)
      expect(quotaAlerts[0].severity).toBe('WARNING')
    })

    it('produces CRITICAL for quota > 95%', async () => {
      setupHealthyMocks()
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'quota:global:daily') return Promise.resolve(9600)
        return Promise.resolve('pong')
      })

      const alerts = await generateAlerts()

      const quotaAlerts = alerts.filter(a => a.category === 'quota')
      expect(quotaAlerts.length).toBe(1)
      expect(quotaAlerts[0].severity).toBe('CRITICAL')
    })

    it('produces CRITICAL when database is down', async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('DB down'))
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.get.mockResolvedValue('pong')
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const alerts = await generateAlerts()

      const dbAlerts = alerts.filter(a => a.category === 'database')
      expect(dbAlerts.length).toBe(1)
      expect(dbAlerts[0].severity).toBe('CRITICAL')
      expect(dbAlerts[0].message).toContain('unreachable')
    })

    it('produces CRITICAL when redis is down', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
      mockRedis.set.mockRejectedValue(new Error('Redis down'))
      // quota check also uses redis.get
      mockRedis.get.mockRejectedValue(new Error('Redis down'))
      mockPrisma.channelCredential.groupBy.mockResolvedValue([])
      mockPrisma.jobRun.count.mockResolvedValue(0)
      mockPrisma.jobRun.findMany.mockResolvedValue([])
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const alerts = await generateAlerts()

      const redisAlerts = alerts.filter(a => a.category === 'redis')
      expect(redisAlerts.length).toBe(1)
      expect(redisAlerts[0].severity).toBe('CRITICAL')
      expect(redisAlerts[0].message).toContain('unreachable')
    })
  })

  describe('getJobHistory', () => {
    it('returns job runs within the specified period', async () => {
      const mockJobs = [
        {
          id: '1',
          jobType: 'INGEST_CHAT',
          status: 'COMPLETED',
          channelId: 'ch1',
          startedAt: new Date(),
          completedAt: new Date(),
          eventsProcessed: 50,
          errorsCount: 0,
          errorMessage: null,
          createdAt: new Date(),
        },
      ]
      mockPrisma.jobRun.findMany.mockResolvedValue(mockJobs)

      const result = await getJobHistory(7)

      expect(result).toHaveLength(1)
      expect(result[0].jobType).toBe('INGEST_CHAT')
      expect(mockPrisma.jobRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
          orderBy: { createdAt: 'desc' },
          take: 500,
        })
      )
    })
  })

  describe('getIngestionMetrics', () => {
    it('returns lag and events per hour', async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
      mockPrisma.jobRun.findFirst.mockResolvedValue({
        completedAt: fiveMinAgo,
      })
      mockPrisma.engagementEvent.count.mockResolvedValue(10)

      const result = await getIngestionMetrics()

      expect(result.lagMinutes).toBeGreaterThanOrEqual(4)
      expect(result.lagMinutes).toBeLessThanOrEqual(6)
      expect(result.eventsPerHour).toHaveLength(24)
      expect(result.eventsPerHour[0]).toHaveProperty('hour')
      expect(result.eventsPerHour[0]).toHaveProperty('count')
    })

    it('returns -1 lag when no ingest has run', async () => {
      mockPrisma.jobRun.findFirst.mockResolvedValue(null)
      mockPrisma.engagementEvent.count.mockResolvedValue(0)

      const result = await getIngestionMetrics()

      expect(result.lagMinutes).toBe(-1)
    })
  })
})
