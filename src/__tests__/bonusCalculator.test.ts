import { describe, it, expect, vi } from 'vitest'

// Mock modules with env/DB side effects
vi.mock('@/lib/prisma', () => ({ default: {} }))

import { calculateBonuses, isEarlyBirdEligible } from '@/services/bonusCalculator'

describe('calculateBonuses', () => {
  const baseViewer = {
    rank: 'PAPER_TRADER' as const,
    currentStreak: 0,
    isMember: false,
    isModerator: false,
  }

  const baseCode = {
    memberBonus: 50,
    modBonus: 25,
    firstResponseBonus: 100,
    currentRedemptions: 10,
    firstResponseLimit: 3,
  }

  it('returns base points with no bonuses for a basic viewer', () => {
    const result = calculateBonuses(100, baseViewer, baseCode, false)

    expect(result.basePoints).toBe(100)
    expect(result.streakBonus).toBe(0)
    expect(result.rankBonus).toBe(0)
    expect(result.earlyBirdBonus).toBe(0)
    expect(result.memberBonus).toBe(0)
    expect(result.modBonus).toBe(0)
    expect(result.totalBonus).toBe(0)
    expect(result.totalPoints).toBe(100)
    expect(result.bonusTypes).toEqual([])
  })

  describe('streak bonus', () => {
    it('adds 10% per consecutive stream', () => {
      const viewer = { ...baseViewer, currentStreak: 2 }
      const result = calculateBonuses(100, viewer, baseCode, false)

      expect(result.streakBonus).toBe(20) // 2 * 10% of 100
      expect(result.bonusTypes).toContain('streak_2')
    })

    it('caps streak bonus at 50%', () => {
      const viewer = { ...baseViewer, currentStreak: 10 }
      const result = calculateBonuses(100, viewer, baseCode, false)

      expect(result.streakBonus).toBe(50) // capped at 50%
    })
  })

  describe('rank bonus', () => {
    it('adds 10% for RETAIL_TRADER', () => {
      const viewer = { ...baseViewer, rank: 'RETAIL_TRADER' as const }
      const result = calculateBonuses(100, viewer, baseCode, false)

      expect(result.rankBonus).toBe(10)
      expect(result.bonusTypes).toContain('rank_retail_trader')
    })

    it('adds 50% for MARKET_MAKER', () => {
      const viewer = { ...baseViewer, rank: 'MARKET_MAKER' as const }
      const result = calculateBonuses(100, viewer, baseCode, false)

      expect(result.rankBonus).toBe(50)
    })

    it('gives no rank bonus for PAPER_TRADER', () => {
      const result = calculateBonuses(100, baseViewer, baseCode, false)
      expect(result.rankBonus).toBe(0)
    })
  })

  describe('early bird bonus', () => {
    it('adds 25 points when isEarlyBird is true', () => {
      const result = calculateBonuses(100, baseViewer, baseCode, true)

      expect(result.earlyBirdBonus).toBe(25)
      expect(result.bonusTypes).toContain('early_bird')
    })

    it('adds nothing when isEarlyBird is false', () => {
      const result = calculateBonuses(100, baseViewer, baseCode, false)
      expect(result.earlyBirdBonus).toBe(0)
    })
  })

  describe('member bonus', () => {
    it('awards member bonus from code config when viewer is a member', () => {
      const viewer = { ...baseViewer, isMember: true }
      const result = calculateBonuses(100, viewer, baseCode, false)

      expect(result.memberBonus).toBe(50)
      expect(result.bonusTypes).toContain('member')
    })

    it('awards nothing when viewer is not a member', () => {
      const result = calculateBonuses(100, baseViewer, baseCode, false)
      expect(result.memberBonus).toBe(0)
    })
  })

  describe('mod bonus', () => {
    it('awards mod bonus from code config when viewer is a moderator', () => {
      const viewer = { ...baseViewer, isModerator: true }
      const result = calculateBonuses(100, viewer, baseCode, false)

      expect(result.modBonus).toBe(25)
      expect(result.bonusTypes).toContain('mod')
    })
  })

  describe('first response bonus', () => {
    it('awards first response bonus when under the limit', () => {
      const code = { ...baseCode, currentRedemptions: 1, firstResponseLimit: 3 }
      const result = calculateBonuses(100, baseViewer, code, false)

      expect(result.totalBonus).toBe(100) // firstResponseBonus
      expect(result.bonusTypes).toContain('first')
    })

    it('does not award when redemptions have reached the limit', () => {
      const code = { ...baseCode, currentRedemptions: 3, firstResponseLimit: 3 }
      const result = calculateBonuses(100, baseViewer, code, false)

      expect(result.bonusTypes).not.toContain('first')
    })

    it('does not award when firstResponseBonus is 0', () => {
      const code = { ...baseCode, currentRedemptions: 0, firstResponseBonus: 0 }
      const result = calculateBonuses(100, baseViewer, code, false)

      expect(result.bonusTypes).not.toContain('first')
    })
  })

  describe('combined bonuses', () => {
    it('stacks all bonuses correctly', () => {
      const viewer = {
        rank: 'SWING_TRADER' as const, // 20% boost
        currentStreak: 3,               // 30% streak
        isMember: true,                 // +50
        isModerator: true,              // +25
      }
      const code = {
        memberBonus: 50,
        modBonus: 25,
        firstResponseBonus: 100,
        currentRedemptions: 0,
        firstResponseLimit: 3,
      }

      const result = calculateBonuses(100, viewer, code, true)

      expect(result.streakBonus).toBe(30)   // 30% of 100
      expect(result.rankBonus).toBe(20)     // 20% of 100
      expect(result.earlyBirdBonus).toBe(25)
      expect(result.memberBonus).toBe(50)
      expect(result.modBonus).toBe(25)
      // first response bonus: 100
      expect(result.totalBonus).toBe(30 + 20 + 25 + 50 + 25 + 100)
      expect(result.totalPoints).toBe(100 + 250)
    })
  })
})

describe('isEarlyBirdEligible', () => {
  it('returns true when message is within 5 minutes of stream start', () => {
    const streamStart = new Date('2024-01-01T10:00:00Z')
    const messageTime = new Date('2024-01-01T10:03:00Z') // 3 minutes later

    expect(isEarlyBirdEligible(messageTime, streamStart)).toBe(true)
  })

  it('returns true at exactly the 5 minute boundary', () => {
    const streamStart = new Date('2024-01-01T10:00:00Z')
    const messageTime = new Date('2024-01-01T10:05:00Z') // exactly 5 minutes

    expect(isEarlyBirdEligible(messageTime, streamStart)).toBe(true)
  })

  it('returns false after 5 minutes', () => {
    const streamStart = new Date('2024-01-01T10:00:00Z')
    const messageTime = new Date('2024-01-01T10:05:01Z') // 5 min + 1 sec

    expect(isEarlyBirdEligible(messageTime, streamStart)).toBe(false)
  })

  it('returns false when streamStartTime is null', () => {
    const messageTime = new Date('2024-01-01T10:03:00Z')
    expect(isEarlyBirdEligible(messageTime, null)).toBe(false)
  })

  it('returns false when message is before stream start', () => {
    const streamStart = new Date('2024-01-01T10:00:00Z')
    const messageTime = new Date('2024-01-01T09:59:00Z')

    expect(isEarlyBirdEligible(messageTime, streamStart)).toBe(false)
  })

  it('returns true at exactly stream start time', () => {
    const streamStart = new Date('2024-01-01T10:00:00Z')
    expect(isEarlyBirdEligible(streamStart, streamStart)).toBe(true)
  })
})
