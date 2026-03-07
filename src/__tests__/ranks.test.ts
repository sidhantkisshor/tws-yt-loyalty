import { describe, it, expect } from 'vitest'
import {
  RANK_THRESHOLDS,
  RANK_EARNING_BOOST,
  RANK_BADGE_COLORS,
  TIER_MAINTENANCE_90DAY,
  PRESTIGE_REQUIREMENTS,
  getRankForPoints,
  isPrestigeTier,
  getMultiplierForViewer,
  checkPrestigeEligibility,
} from '@/lib/ranks'

// ============================================
// CONSTANTS
// ============================================

describe('RANK_THRESHOLDS', () => {
  it('has all 7 ranks defined', () => {
    expect(Object.keys(RANK_THRESHOLDS)).toHaveLength(7)
  })

  it('has correct threshold values', () => {
    expect(RANK_THRESHOLDS.PAPER_TRADER).toBe(0)
    expect(RANK_THRESHOLDS.RETAIL_TRADER).toBe(2500)
    expect(RANK_THRESHOLDS.SWING_TRADER).toBe(10000)
    expect(RANK_THRESHOLDS.FUND_MANAGER).toBe(35000)
    expect(RANK_THRESHOLDS.MARKET_MAKER).toBe(100000)
    expect(RANK_THRESHOLDS.HEDGE_FUND).toBe(200000)
    expect(RANK_THRESHOLDS.WHALE).toBe(400000)
  })

  it('thresholds are in ascending order', () => {
    const values = Object.values(RANK_THRESHOLDS)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })
})

describe('RANK_EARNING_BOOST', () => {
  it('has all 7 ranks', () => {
    expect(Object.keys(RANK_EARNING_BOOST)).toHaveLength(7)
  })

  it('has correct boost values', () => {
    expect(RANK_EARNING_BOOST.PAPER_TRADER).toBe(0)
    expect(RANK_EARNING_BOOST.RETAIL_TRADER).toBe(0.10)
    expect(RANK_EARNING_BOOST.SWING_TRADER).toBe(0.20)
    expect(RANK_EARNING_BOOST.FUND_MANAGER).toBe(0.35)
    expect(RANK_EARNING_BOOST.MARKET_MAKER).toBe(0.50)
    expect(RANK_EARNING_BOOST.HEDGE_FUND).toBe(0.50)
    expect(RANK_EARNING_BOOST.WHALE).toBe(0.50)
  })
})

describe('RANK_BADGE_COLORS', () => {
  it('has all 7 ranks', () => {
    expect(Object.keys(RANK_BADGE_COLORS)).toHaveLength(7)
  })

  it('has correct color values', () => {
    expect(RANK_BADGE_COLORS.PAPER_TRADER).toBe('gray')
    expect(RANK_BADGE_COLORS.RETAIL_TRADER).toBe('green')
    expect(RANK_BADGE_COLORS.SWING_TRADER).toBe('blue')
    expect(RANK_BADGE_COLORS.FUND_MANAGER).toBe('purple')
    expect(RANK_BADGE_COLORS.MARKET_MAKER).toBe('gold')
    expect(RANK_BADGE_COLORS.HEDGE_FUND).toBe('platinum')
    expect(RANK_BADGE_COLORS.WHALE).toBe('animated')
  })
})

describe('TIER_MAINTENANCE_90DAY', () => {
  it('has 4 tiers with maintenance requirements', () => {
    expect(Object.keys(TIER_MAINTENANCE_90DAY)).toHaveLength(4)
  })

  it('has correct maintenance values', () => {
    expect(TIER_MAINTENANCE_90DAY.RETAIL_TRADER).toBe(750)
    expect(TIER_MAINTENANCE_90DAY.SWING_TRADER).toBe(3000)
    expect(TIER_MAINTENANCE_90DAY.FUND_MANAGER).toBe(10500)
    expect(TIER_MAINTENANCE_90DAY.MARKET_MAKER).toBe(30000)
  })

  it('does not include PAPER_TRADER or prestige tiers', () => {
    expect(TIER_MAINTENANCE_90DAY).not.toHaveProperty('PAPER_TRADER')
    expect(TIER_MAINTENANCE_90DAY).not.toHaveProperty('HEDGE_FUND')
    expect(TIER_MAINTENANCE_90DAY).not.toHaveProperty('WHALE')
  })
})

describe('PRESTIGE_REQUIREMENTS', () => {
  it('has requirements for HEDGE_FUND and WHALE', () => {
    expect(PRESTIGE_REQUIREMENTS).toHaveProperty('HEDGE_FUND')
    expect(PRESTIGE_REQUIREMENTS).toHaveProperty('WHALE')
  })
})

// ============================================
// getRankForPoints
// ============================================

describe('getRankForPoints', () => {
  it('returns PAPER_TRADER for 0 points', () => {
    expect(getRankForPoints(0)).toBe('PAPER_TRADER')
  })

  it('returns PAPER_TRADER for points below RETAIL_TRADER threshold', () => {
    expect(getRankForPoints(1)).toBe('PAPER_TRADER')
    expect(getRankForPoints(2499)).toBe('PAPER_TRADER')
  })

  it('returns RETAIL_TRADER at exactly 2500 points', () => {
    expect(getRankForPoints(2500)).toBe('RETAIL_TRADER')
  })

  it('returns RETAIL_TRADER between thresholds', () => {
    expect(getRankForPoints(5000)).toBe('RETAIL_TRADER')
    expect(getRankForPoints(9999)).toBe('RETAIL_TRADER')
  })

  it('returns SWING_TRADER at exactly 10000 points', () => {
    expect(getRankForPoints(10000)).toBe('SWING_TRADER')
  })

  it('returns FUND_MANAGER at exactly 35000 points', () => {
    expect(getRankForPoints(35000)).toBe('FUND_MANAGER')
  })

  it('returns MARKET_MAKER at exactly 100000 points', () => {
    expect(getRankForPoints(100000)).toBe('MARKET_MAKER')
  })

  it('does NOT return prestige tiers (HEDGE_FUND or WHALE)', () => {
    // Even with enough points, prestige tiers require achievement conditions
    expect(getRankForPoints(200000)).toBe('MARKET_MAKER')
    expect(getRankForPoints(400000)).toBe('MARKET_MAKER')
    expect(getRankForPoints(1000000)).toBe('MARKET_MAKER')
  })
})

// ============================================
// isPrestigeTier
// ============================================

describe('isPrestigeTier', () => {
  it('returns true for HEDGE_FUND', () => {
    expect(isPrestigeTier('HEDGE_FUND')).toBe(true)
  })

  it('returns true for WHALE', () => {
    expect(isPrestigeTier('WHALE')).toBe(true)
  })

  it('returns false for free tiers', () => {
    expect(isPrestigeTier('PAPER_TRADER')).toBe(false)
    expect(isPrestigeTier('RETAIL_TRADER')).toBe(false)
    expect(isPrestigeTier('SWING_TRADER')).toBe(false)
    expect(isPrestigeTier('FUND_MANAGER')).toBe(false)
    expect(isPrestigeTier('MARKET_MAKER')).toBe(false)
  })

  it('returns false for unknown ranks', () => {
    expect(isPrestigeTier('UNKNOWN')).toBe(false)
    expect(isPrestigeTier('')).toBe(false)
  })
})

// ============================================
// getMultiplierForViewer
// ============================================

describe('getMultiplierForViewer', () => {
  it('returns 1.0 for a regular viewer with no status', () => {
    const viewer = {
      isMember: false,
      isModerator: false,
      isCourseBuyer: false,
      isPremiumCohortBuyer: false,
    }
    expect(getMultiplierForViewer(viewer)).toBe(1.0)
  })

  it('returns 1.25 for a member', () => {
    const viewer = {
      isMember: true,
      isModerator: false,
      isCourseBuyer: false,
      isPremiumCohortBuyer: false,
    }
    expect(getMultiplierForViewer(viewer)).toBe(1.25)
  })

  it('returns 1.5 for a moderator', () => {
    const viewer = {
      isMember: false,
      isModerator: true,
      isCourseBuyer: false,
      isPremiumCohortBuyer: false,
    }
    expect(getMultiplierForViewer(viewer)).toBe(1.5)
  })

  it('returns 1.3 for a course buyer', () => {
    const viewer = {
      isMember: false,
      isModerator: false,
      isCourseBuyer: true,
      isPremiumCohortBuyer: false,
    }
    expect(getMultiplierForViewer(viewer)).toBe(1.3)
  })

  it('returns 1.5 for a premium cohort buyer', () => {
    const viewer = {
      isMember: false,
      isModerator: false,
      isCourseBuyer: false,
      isPremiumCohortBuyer: true,
    }
    expect(getMultiplierForViewer(viewer)).toBe(1.5)
  })

  it('stacks multipliers multiplicatively', () => {
    const viewer = {
      isMember: true,       // 1.25x
      isModerator: false,
      isCourseBuyer: true,  // 1.3x
      isPremiumCohortBuyer: false,
    }
    // 1.25 * 1.3 = 1.625
    expect(getMultiplierForViewer(viewer)).toBeCloseTo(1.625, 5)
  })

  it('caps the multiplier at 2.0', () => {
    const viewer = {
      isMember: true,            // 1.25x
      isModerator: true,         // 1.5x
      isCourseBuyer: true,       // 1.3x
      isPremiumCohortBuyer: true, // 1.5x
    }
    // 1.25 * 1.5 * 1.3 * 1.5 = 3.65625, but capped at 2.0
    expect(getMultiplierForViewer(viewer)).toBe(2.0)
  })

  it('caps at exactly 2.0 when multiplied result exceeds 2.0', () => {
    const viewer = {
      isMember: true,       // 1.25x
      isModerator: true,    // 1.5x
      isCourseBuyer: false,
      isPremiumCohortBuyer: false,
    }
    // 1.25 * 1.5 = 1.875, under cap
    expect(getMultiplierForViewer(viewer)).toBeCloseTo(1.875, 5)
  })
})

// ============================================
// checkPrestigeEligibility
// ============================================

describe('checkPrestigeEligibility', () => {
  it('returns null when viewer has insufficient lifetime points', () => {
    const viewer = {
      lifetimePoints: 100000,
      totalStreamsAttended: 200,
      longestStreak: 30,
      currentStreak: 10,
      totalCodesRedeemed: 500,
      rank: 'MARKET_MAKER' as const,
    }
    expect(checkPrestigeEligibility(viewer)).toBeNull()
  })

  it('returns WHALE when viewer meets all WHALE requirements', () => {
    const viewer = {
      lifetimePoints: PRESTIGE_REQUIREMENTS.WHALE.minLifetimePoints,
      totalStreamsAttended: PRESTIGE_REQUIREMENTS.WHALE.minStreamsAttended,
      longestStreak: PRESTIGE_REQUIREMENTS.WHALE.minLongestStreak,
      currentStreak: 10,
      totalCodesRedeemed: PRESTIGE_REQUIREMENTS.WHALE.minCodesRedeemed,
      rank: 'MARKET_MAKER' as const,
    }
    expect(checkPrestigeEligibility(viewer)).toBe('WHALE')
  })

  it('returns HEDGE_FUND when viewer meets HEDGE_FUND but not WHALE requirements', () => {
    const viewer = {
      lifetimePoints: PRESTIGE_REQUIREMENTS.HEDGE_FUND.minLifetimePoints,
      totalStreamsAttended: PRESTIGE_REQUIREMENTS.HEDGE_FUND.minStreamsAttended,
      longestStreak: PRESTIGE_REQUIREMENTS.HEDGE_FUND.minLongestStreak,
      currentStreak: 10,
      totalCodesRedeemed: PRESTIGE_REQUIREMENTS.HEDGE_FUND.minCodesRedeemed,
      rank: 'MARKET_MAKER' as const,
    }
    expect(checkPrestigeEligibility(viewer)).toBe('HEDGE_FUND')
  })

  it('checks WHALE first (higher prestige wins)', () => {
    // A viewer meeting both WHALE and HEDGE_FUND should get WHALE
    const viewer = {
      lifetimePoints: PRESTIGE_REQUIREMENTS.WHALE.minLifetimePoints,
      totalStreamsAttended: PRESTIGE_REQUIREMENTS.WHALE.minStreamsAttended,
      longestStreak: PRESTIGE_REQUIREMENTS.WHALE.minLongestStreak,
      currentStreak: 50,
      totalCodesRedeemed: PRESTIGE_REQUIREMENTS.WHALE.minCodesRedeemed,
      rank: 'MARKET_MAKER' as const,
    }
    expect(checkPrestigeEligibility(viewer)).toBe('WHALE')
  })

  it('returns null when viewer meets points but not other conditions', () => {
    const viewer = {
      lifetimePoints: PRESTIGE_REQUIREMENTS.HEDGE_FUND.minLifetimePoints,
      totalStreamsAttended: 5, // too few
      longestStreak: 2,       // too short
      currentStreak: 1,
      totalCodesRedeemed: 10, // too few
      rank: 'MARKET_MAKER' as const,
    }
    expect(checkPrestigeEligibility(viewer)).toBeNull()
  })
})
