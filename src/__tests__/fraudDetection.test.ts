import { describe, it, expect, vi } from 'vitest'

// Mock modules with env/DB side effects
vi.mock('@/lib/prisma', () => ({ default: {} }))
vi.mock('@/lib/redis', () => ({
  getRecentRedemptionCount: vi.fn(),
  checkIdenticalTiming: vi.fn(),
  trackRedemption: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { calculateTrustScore } from '@/services/fraudDetection'

describe('calculateTrustScore', () => {
  const baseFactors = {
    accountAgeDays: 0,
    totalStreamsAttended: 0,
    totalMessagesCount: 0,
    totalCodesRedeemed: 0,
    isMember: false,
    isModerator: false,
    fraudEventCount: 0,
    recentFraudEventCount: 0,
  }

  it('returns base score of 50 for a brand new viewer', () => {
    expect(calculateTrustScore(baseFactors)).toBe(50)
  })

  describe('positive adjustments', () => {
    it('adds up to +15 for account age (0.5 per day, capped)', () => {
      expect(calculateTrustScore({ ...baseFactors, accountAgeDays: 10 })).toBe(55)
      expect(calculateTrustScore({ ...baseFactors, accountAgeDays: 30 })).toBe(65)
      // Cap at 15
      expect(calculateTrustScore({ ...baseFactors, accountAgeDays: 100 })).toBe(65)
    })

    it('adds up to +20 for streams attended (2 per stream, capped)', () => {
      expect(calculateTrustScore({ ...baseFactors, totalStreamsAttended: 5 })).toBe(60)
      // Cap at 20
      expect(calculateTrustScore({ ...baseFactors, totalStreamsAttended: 50 })).toBe(70)
    })

    it('adds up to +5 for message count (0.01 per message, capped)', () => {
      expect(calculateTrustScore({ ...baseFactors, totalMessagesCount: 200 })).toBe(52)
      // Cap at 5
      expect(calculateTrustScore({ ...baseFactors, totalMessagesCount: 1000 })).toBe(55)
    })

    it('adds +10 for members', () => {
      expect(calculateTrustScore({ ...baseFactors, isMember: true })).toBe(60)
    })

    it('adds +10 for moderators', () => {
      expect(calculateTrustScore({ ...baseFactors, isModerator: true })).toBe(60)
    })

    it('stacks member and moderator bonuses', () => {
      expect(
        calculateTrustScore({ ...baseFactors, isMember: true, isModerator: true })
      ).toBe(70)
    })
  })

  describe('negative adjustments', () => {
    it('subtracts 5 per fraud event', () => {
      expect(calculateTrustScore({ ...baseFactors, fraudEventCount: 2 })).toBe(40)
    })

    it('subtracts 10 per recent fraud event', () => {
      expect(calculateTrustScore({ ...baseFactors, recentFraudEventCount: 3 })).toBe(20)
    })

    it('applies latency penalty of -20 for sub-500ms response', () => {
      expect(
        calculateTrustScore({ ...baseFactors, averageRedemptionLatencyMs: 300 })
      ).toBe(30)
    })

    it('applies latency penalty of -10 for 500-1000ms response', () => {
      expect(
        calculateTrustScore({ ...baseFactors, averageRedemptionLatencyMs: 700 })
      ).toBe(40)
    })

    it('applies no latency penalty for 1000ms+ response', () => {
      expect(
        calculateTrustScore({ ...baseFactors, averageRedemptionLatencyMs: 2000 })
      ).toBe(50)
    })
  })

  describe('clamping', () => {
    it('never goes below 0', () => {
      expect(
        calculateTrustScore({
          ...baseFactors,
          fraudEventCount: 10,
          recentFraudEventCount: 10,
        })
      ).toBe(0)
    })

    it('never exceeds 100', () => {
      expect(
        calculateTrustScore({
          ...baseFactors,
          accountAgeDays: 999,
          totalStreamsAttended: 999,
          totalMessagesCount: 99999,
          isMember: true,
          isModerator: true,
        })
      ).toBe(100)
    })
  })

  describe('combined scenarios', () => {
    it('calculates correctly for a trusted veteran viewer', () => {
      const score = calculateTrustScore({
        accountAgeDays: 60,   // +15 (capped)
        totalStreamsAttended: 20, // +20 (capped at 40 but 20*2=40 -> capped at 20)
        totalMessagesCount: 500, // +5
        totalCodesRedeemed: 15,
        isMember: true,       // +10
        isModerator: false,
        fraudEventCount: 0,
        recentFraudEventCount: 0,
      })
      expect(score).toBe(100) // 50+15+20+5+10 = 100
    })

    it('calculates correctly for a suspicious new account', () => {
      const score = calculateTrustScore({
        accountAgeDays: 0,
        totalStreamsAttended: 0,
        totalMessagesCount: 0,
        totalCodesRedeemed: 0,
        isMember: false,
        isModerator: false,
        fraudEventCount: 1,          // -5
        recentFraudEventCount: 1,    // -10
        averageRedemptionLatencyMs: 200, // -20
      })
      expect(score).toBe(15) // 50-5-10-20 = 15
    })
  })
})
