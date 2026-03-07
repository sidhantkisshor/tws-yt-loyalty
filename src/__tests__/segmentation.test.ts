import { describe, it, expect } from 'vitest'
import { calculateSegment, SegmentInput } from '@/services/segmentation'

/** Helper to create a base SegmentInput with sensible defaults. */
function makeViewer(overrides: Partial<SegmentInput> = {}): SegmentInput {
  return {
    rank: 'PAPER_TRADER',
    totalStreamsAttended: 0,
    hasPurchasedCourse: false,
    hasPurchasedPremiumCohort: false,
    currentStreak: 0,
    helpfulUpvotesReceived: 0,
    lastSeenAt: new Date(), // just seen
    hasRedeemedModuleUnlock: false,
    ...overrides,
  }
}

/** Returns a Date that is `days` days in the past. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

describe('calculateSegment', () => {
  describe('null (no segment)', () => {
    it('should return null for a new Paper Trader with no activity', () => {
      const viewer = makeViewer()
      expect(calculateSegment(viewer)).toBeNull()
    })

    it('should return null for an unknown rank', () => {
      const viewer = makeViewer({ rank: 'UNKNOWN_RANK', totalStreamsAttended: 100 })
      expect(calculateSegment(viewer)).toBeNull()
    })
  })

  describe('warming_lead', () => {
    it('should classify Retail Trader with 12 streams and no course purchase', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 12,
        hasPurchasedCourse: false,
      })
      expect(calculateSegment(viewer)).toBe('warming_lead')
    })

    it('should NOT classify if course is already purchased', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 12,
        hasPurchasedCourse: true,
      })
      expect(calculateSegment(viewer)).toBeNull()
    })

    it('should classify at exactly 10 streams (threshold)', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 10,
        hasPurchasedCourse: false,
      })
      expect(calculateSegment(viewer)).toBe('warming_lead')
    })

    it('should NOT classify at 9 streams (below threshold)', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 9,
        hasPurchasedCourse: false,
      })
      expect(calculateSegment(viewer)).toBeNull()
    })
  })

  describe('hot_lead', () => {
    it('should classify Swing Trader with 22 streams, module unlock, and no course purchase', () => {
      const viewer = makeViewer({
        rank: 'SWING_TRADER',
        totalStreamsAttended: 22,
        hasRedeemedModuleUnlock: true,
        hasPurchasedCourse: false,
      })
      expect(calculateSegment(viewer)).toBe('hot_lead')
    })

    it('should NOT classify if course is already purchased', () => {
      const viewer = makeViewer({
        rank: 'SWING_TRADER',
        totalStreamsAttended: 22,
        hasRedeemedModuleUnlock: true,
        hasPurchasedCourse: true,
      })
      expect(calculateSegment(viewer)).not.toBe('hot_lead')
    })

    it('should NOT classify without module unlock redeemed', () => {
      const viewer = makeViewer({
        rank: 'SWING_TRADER',
        totalStreamsAttended: 22,
        hasRedeemedModuleUnlock: false,
        hasPurchasedCourse: false,
      })
      // Should fall through to warming_lead instead
      expect(calculateSegment(viewer)).toBe('warming_lead')
    })

    it('should classify at exactly 20 streams (threshold)', () => {
      const viewer = makeViewer({
        rank: 'SWING_TRADER',
        totalStreamsAttended: 20,
        hasRedeemedModuleUnlock: true,
        hasPurchasedCourse: false,
      })
      expect(calculateSegment(viewer)).toBe('hot_lead')
    })
  })

  describe('at_risk', () => {
    it('should classify active Swing Trader not seen for 15+ days', () => {
      const viewer = makeViewer({
        rank: 'SWING_TRADER',
        totalStreamsAttended: 20,
        lastSeenAt: daysAgo(15),
      })
      expect(calculateSegment(viewer)).toBe('at_risk')
    })

    it('should classify at exactly 14 days unseen (threshold)', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 5,
        lastSeenAt: daysAgo(14),
      })
      expect(calculateSegment(viewer)).toBe('at_risk')
    })

    it('should NOT classify at 13 days unseen (below threshold)', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 5,
        lastSeenAt: daysAgo(13),
      })
      expect(calculateSegment(viewer)).not.toBe('at_risk')
    })

    it('should classify at exactly 5 streams (threshold)', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 5,
        lastSeenAt: daysAgo(20),
      })
      expect(calculateSegment(viewer)).toBe('at_risk')
    })

    it('should NOT classify at 4 streams (below threshold)', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 4,
        lastSeenAt: daysAgo(20),
      })
      expect(calculateSegment(viewer)).toBeNull()
    })
  })

  describe('superfan', () => {
    it('should classify Fund Manager with 35 day streak', () => {
      const viewer = makeViewer({
        rank: 'FUND_MANAGER',
        currentStreak: 35,
      })
      expect(calculateSegment(viewer)).toBe('superfan')
    })

    it('should classify at exactly 30 day streak (threshold)', () => {
      const viewer = makeViewer({
        rank: 'FUND_MANAGER',
        currentStreak: 30,
      })
      expect(calculateSegment(viewer)).toBe('superfan')
    })

    it('should NOT classify at 29 day streak (below threshold)', () => {
      const viewer = makeViewer({
        rank: 'FUND_MANAGER',
        currentStreak: 29,
      })
      expect(calculateSegment(viewer)).toBeNull()
    })

    it('should NOT classify Swing Trader with 35 day streak (rank too low)', () => {
      const viewer = makeViewer({
        rank: 'SWING_TRADER',
        currentStreak: 35,
      })
      expect(calculateSegment(viewer)).not.toBe('superfan')
    })
  })

  describe('whale_candidate', () => {
    it('should classify Market Maker with course purchase and 50+ upvotes', () => {
      const viewer = makeViewer({
        rank: 'MARKET_MAKER',
        hasPurchasedCourse: true,
        helpfulUpvotesReceived: 50,
      })
      expect(calculateSegment(viewer)).toBe('whale_candidate')
    })

    it('should classify with more than 50 upvotes', () => {
      const viewer = makeViewer({
        rank: 'WHALE',
        hasPurchasedCourse: true,
        helpfulUpvotesReceived: 200,
      })
      expect(calculateSegment(viewer)).toBe('whale_candidate')
    })

    it('should NOT classify without course purchase', () => {
      const viewer = makeViewer({
        rank: 'MARKET_MAKER',
        hasPurchasedCourse: false,
        helpfulUpvotesReceived: 100,
      })
      expect(calculateSegment(viewer)).not.toBe('whale_candidate')
    })

    it('should NOT classify at 49 upvotes (below threshold)', () => {
      const viewer = makeViewer({
        rank: 'MARKET_MAKER',
        hasPurchasedCourse: true,
        helpfulUpvotesReceived: 49,
      })
      expect(calculateSegment(viewer)).not.toBe('whale_candidate')
    })
  })

  describe('priority ordering', () => {
    it('at_risk should take priority over warming_lead', () => {
      const viewer = makeViewer({
        rank: 'RETAIL_TRADER',
        totalStreamsAttended: 15,
        hasPurchasedCourse: false,
        lastSeenAt: daysAgo(20),
      })
      // Qualifies for both at_risk and warming_lead; at_risk should win
      expect(calculateSegment(viewer)).toBe('at_risk')
    })

    it('at_risk should take priority over hot_lead', () => {
      const viewer = makeViewer({
        rank: 'SWING_TRADER',
        totalStreamsAttended: 25,
        hasPurchasedCourse: false,
        hasRedeemedModuleUnlock: true,
        lastSeenAt: daysAgo(30),
      })
      // Qualifies for both at_risk and hot_lead; at_risk should win
      expect(calculateSegment(viewer)).toBe('at_risk')
    })

    it('whale_candidate should take priority over superfan', () => {
      const viewer = makeViewer({
        rank: 'MARKET_MAKER',
        hasPurchasedCourse: true,
        helpfulUpvotesReceived: 60,
        currentStreak: 50,
      })
      // Qualifies for both whale_candidate and superfan; whale_candidate should win
      expect(calculateSegment(viewer)).toBe('whale_candidate')
    })

    it('superfan should take priority over hot_lead', () => {
      const viewer = makeViewer({
        rank: 'FUND_MANAGER',
        currentStreak: 35,
        totalStreamsAttended: 25,
        hasRedeemedModuleUnlock: true,
        hasPurchasedCourse: false,
      })
      // Qualifies for both superfan and hot_lead; superfan should win
      expect(calculateSegment(viewer)).toBe('superfan')
    })
  })
})
