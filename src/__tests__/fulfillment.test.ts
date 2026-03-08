import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// MOCK SETUP (hoisted)
// ============================================

vi.mock('@/lib/prisma', () => ({
  default: {
    rewardRedemption: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocking
import prisma from '@/lib/prisma'
import {
  generateDigitalCode,
  fulfillRedemption,
  retryFailedFulfillments,
} from '@/services/fulfillment'

// Cast for type access
const mockPrisma = prisma as unknown as {
  rewardRedemption: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

// ============================================
// TEST DATA
// ============================================

function makeRedemption(overrides: Record<string, unknown> = {}) {
  return {
    id: 'redemption-1',
    rewardCode: null,
    deliveryStatus: 'PENDING',
    deliveredAt: null,
    adminNotes: null,
    reward: {
      id: 'reward-1',
      name: 'Premium Access',
      rewardType: 'DIGITAL',
    },
    ...overrides,
  }
}

// ============================================
// TESTS
// ============================================

describe('generateDigitalCode', () => {
  it('produces a valid format: PREFIX-UUID_SEGMENT', () => {
    const code = generateDigitalCode('Premium Access')
    expect(code).toMatch(/^[A-Z0-9]{1,6}-[A-Z0-9]{12}$/)
  })

  it('uses the first 6 characters of the reward type as prefix', () => {
    const code = generateDigitalCode('Discord')
    expect(code.startsWith('DISCOR-')).toBe(true)
  })

  it('strips non-alphanumeric characters from prefix', () => {
    const code = generateDigitalCode('VIP Access!')
    expect(code).toMatch(/^[A-Z0-9]{1,6}-[A-Z0-9]{12}$/)
    expect(code.startsWith('VIPACC-')).toBe(true)
  })

  it('falls back to REWARD for empty input', () => {
    const code = generateDigitalCode('')
    expect(code.startsWith('REWARD-')).toBe(true)
  })

  it('generates unique codes on repeated calls', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      codes.add(generateDigitalCode('Test'))
    }
    expect(codes.size).toBe(100)
  })
})

describe('fulfillRedemption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delivers and updates status for a pending digital redemption', async () => {
    const redemption = makeRedemption()
    mockPrisma.rewardRedemption.findUnique.mockResolvedValue(redemption)
    mockPrisma.rewardRedemption.update.mockResolvedValue({
      ...redemption,
      deliveryStatus: 'DELIVERED',
    })

    const result = await fulfillRedemption('redemption-1')

    expect(result.success).toBe(true)
    expect(result.deliveryCode).toBeDefined()
    expect(result.deliveryCode).toMatch(/^[A-Z0-9]{1,6}-[A-Z0-9]{12}$/)
    expect(result.deliveryMethod).toBe('IN_APP')

    expect(mockPrisma.rewardRedemption.update).toHaveBeenCalledWith({
      where: { id: 'redemption-1' },
      data: expect.objectContaining({
        deliveryStatus: 'DELIVERED',
        deliveredAt: expect.any(Date),
        rewardCode: expect.stringMatching(/^[A-Z0-9]{1,6}-[A-Z0-9]{12}$/),
      }),
    })
  })

  it('returns success idempotently for already-delivered redemptions', async () => {
    const redemption = makeRedemption({
      deliveryStatus: 'DELIVERED',
      rewardCode: 'PREMI-ABC123DEF456',
      deliveredAt: new Date(),
    })
    mockPrisma.rewardRedemption.findUnique.mockResolvedValue(redemption)

    const result = await fulfillRedemption('redemption-1')

    expect(result.success).toBe(true)
    expect(result.deliveryCode).toBe('PREMI-ABC123DEF456')
    expect(result.deliveryMethod).toBe('IN_APP')
    // Should NOT call update
    expect(mockPrisma.rewardRedemption.update).not.toHaveBeenCalled()
  })

  it('returns error for non-existent redemption', async () => {
    mockPrisma.rewardRedemption.findUnique.mockResolvedValue(null)

    const result = await fulfillRedemption('does-not-exist')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Redemption not found')
  })

  it('skips physical rewards', async () => {
    const redemption = makeRedemption({
      reward: {
        id: 'reward-1',
        name: 'T-Shirt',
        rewardType: 'PHYSICAL',
      },
    })
    mockPrisma.rewardRedemption.findUnique.mockResolvedValue(redemption)

    const result = await fulfillRedemption('redemption-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Physical rewards require manual fulfillment')
    expect(mockPrisma.rewardRedemption.update).not.toHaveBeenCalled()
  })

  it('skips cancelled redemptions', async () => {
    const redemption = makeRedemption({ deliveryStatus: 'CANCELLED' })
    mockPrisma.rewardRedemption.findUnique.mockResolvedValue(redemption)

    const result = await fulfillRedemption('redemption-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Redemption has been cancelled')
  })

  it('sets status to FAILED on database error and returns error', async () => {
    const redemption = makeRedemption()
    mockPrisma.rewardRedemption.findUnique.mockResolvedValue(redemption)
    mockPrisma.rewardRedemption.update
      .mockRejectedValueOnce(new Error('Database connection lost'))
      .mockResolvedValueOnce({}) // For the FAILED status update

    const result = await fulfillRedemption('redemption-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Database connection lost')
    // Should attempt to set status to FAILED
    expect(mockPrisma.rewardRedemption.update).toHaveBeenCalledWith({
      where: { id: 'redemption-1' },
      data: {
        deliveryStatus: 'FAILED',
        adminNotes: expect.stringContaining('Database connection lost'),
      },
    })
  })

  it('processes FAILED status redemptions for retry', async () => {
    const redemption = makeRedemption({ deliveryStatus: 'FAILED' })
    mockPrisma.rewardRedemption.findUnique.mockResolvedValue(redemption)
    mockPrisma.rewardRedemption.update.mockResolvedValue({
      ...redemption,
      deliveryStatus: 'DELIVERED',
    })

    const result = await fulfillRedemption('redemption-1')

    expect(result.success).toBe(true)
    expect(result.deliveryCode).toBeDefined()
  })
})

describe('retryFailedFulfillments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processes only FAILED status digital redemptions', async () => {
    mockPrisma.rewardRedemption.findMany.mockResolvedValue([
      { id: 'fail-1' },
      { id: 'fail-2' },
    ])

    // Mock individual fulfillment calls
    const failedRedemption = makeRedemption({ deliveryStatus: 'FAILED' })
    mockPrisma.rewardRedemption.findUnique.mockResolvedValue(failedRedemption)
    mockPrisma.rewardRedemption.update.mockResolvedValue({
      ...failedRedemption,
      deliveryStatus: 'DELIVERED',
    })

    const result = await retryFailedFulfillments()

    expect(result.processed).toBe(2)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(0)

    // Verify the query filters for FAILED and DIGITAL
    expect(mockPrisma.rewardRedemption.findMany).toHaveBeenCalledWith({
      where: {
        deliveryStatus: 'FAILED',
        reward: { rewardType: 'DIGITAL' },
      },
      select: { id: true },
      orderBy: { redeemedAt: 'asc' },
      take: 100,
    })
  })

  it('returns zeros when no failed redemptions exist', async () => {
    mockPrisma.rewardRedemption.findMany.mockResolvedValue([])

    const result = await retryFailedFulfillments()

    expect(result.processed).toBe(0)
    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(0)
  })

  it('tracks partial failures in retry batch', async () => {
    mockPrisma.rewardRedemption.findMany.mockResolvedValue([
      { id: 'fail-1' },
      { id: 'fail-2' },
      { id: 'fail-3' },
    ])

    // First succeeds, second fails (not found), third succeeds
    mockPrisma.rewardRedemption.findUnique
      .mockResolvedValueOnce(makeRedemption({ id: 'fail-1', deliveryStatus: 'FAILED' }))
      .mockResolvedValueOnce(null) // Not found
      .mockResolvedValueOnce(makeRedemption({ id: 'fail-3', deliveryStatus: 'FAILED' }))

    mockPrisma.rewardRedemption.update.mockResolvedValue({
      deliveryStatus: 'DELIVERED',
    })

    const result = await retryFailedFulfillments()

    expect(result.processed).toBe(3)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(1)
  })
})
