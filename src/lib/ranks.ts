/**
 * Centralized rank configuration module.
 *
 * All rank names, thresholds, boosts, badge colours, maintenance
 * requirements, prestige conditions and viewer-multiplier logic live
 * here so every consumer (services, UI, cron jobs) shares one
 * source of truth.
 */

// ============================================
// TYPES
// ============================================

export type FreeRank =
  | 'PAPER_TRADER'
  | 'RETAIL_TRADER'
  | 'SWING_TRADER'
  | 'FUND_MANAGER'
  | 'MARKET_MAKER'

export type PrestigeRank = 'HEDGE_FUND' | 'WHALE'

export type ViewerRankName = FreeRank | PrestigeRank

// ============================================
// RANK THRESHOLDS (lifetime points required)
// ============================================

export const RANK_THRESHOLDS: Record<ViewerRankName, number> = {
  PAPER_TRADER: 0,
  RETAIL_TRADER: 2500,
  SWING_TRADER: 10000,
  FUND_MANAGER: 35000,
  MARKET_MAKER: 100000,
  HEDGE_FUND: 200000,
  WHALE: 400000,
}

// ============================================
// RANK EARNING BOOST (percentage as decimal)
// ============================================

export const RANK_EARNING_BOOST: Record<ViewerRankName, number> = {
  PAPER_TRADER: 0,
  RETAIL_TRADER: 0.10,
  SWING_TRADER: 0.20,
  FUND_MANAGER: 0.35,
  MARKET_MAKER: 0.50,
  HEDGE_FUND: 0.50,
  WHALE: 0.50,
}

// ============================================
// RANK BADGE COLORS
// ============================================

export const RANK_BADGE_COLORS: Record<ViewerRankName, string> = {
  PAPER_TRADER: 'gray',
  RETAIL_TRADER: 'green',
  SWING_TRADER: 'blue',
  FUND_MANAGER: 'purple',
  MARKET_MAKER: 'gold',
  HEDGE_FUND: 'platinum',
  WHALE: 'animated',
}

// ============================================
// TIER MAINTENANCE (points required in 90 days)
// Only free tiers above PAPER_TRADER have maintenance.
// ============================================

export const TIER_MAINTENANCE_90DAY: Record<string, number> = {
  RETAIL_TRADER: 750,
  SWING_TRADER: 3000,
  FUND_MANAGER: 10500,
  MARKET_MAKER: 30000,
}

// ============================================
// PRESTIGE REQUIREMENTS
// ============================================

export interface PrestigeRequirement {
  minLifetimePoints: number
  minStreamsAttended: number
  minLongestStreak: number
  minCodesRedeemed: number
}

export const PRESTIGE_REQUIREMENTS: Record<PrestigeRank, PrestigeRequirement> = {
  HEDGE_FUND: {
    minLifetimePoints: 200000,
    minStreamsAttended: 100,
    minLongestStreak: 15,
    minCodesRedeemed: 200,
  },
  WHALE: {
    minLifetimePoints: 400000,
    minStreamsAttended: 200,
    minLongestStreak: 30,
    minCodesRedeemed: 500,
  },
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Free-tier ranks in descending threshold order (for lookup).
 * Prestige tiers are excluded — they require achievement conditions.
 */
const FREE_RANKS_DESC: { rank: FreeRank; minPoints: number }[] = [
  { rank: 'MARKET_MAKER', minPoints: RANK_THRESHOLDS.MARKET_MAKER },
  { rank: 'FUND_MANAGER', minPoints: RANK_THRESHOLDS.FUND_MANAGER },
  { rank: 'SWING_TRADER', minPoints: RANK_THRESHOLDS.SWING_TRADER },
  { rank: 'RETAIL_TRADER', minPoints: RANK_THRESHOLDS.RETAIL_TRADER },
  { rank: 'PAPER_TRADER', minPoints: RANK_THRESHOLDS.PAPER_TRADER },
]

/**
 * Returns the free-tier rank for a given lifetime points total.
 *
 * This intentionally does NOT return prestige tiers (HEDGE_FUND, WHALE)
 * because those require additional achievement conditions beyond just
 * accumulating points.
 */
export function getRankForPoints(lifetimePoints: number): FreeRank {
  for (const { rank, minPoints } of FREE_RANKS_DESC) {
    if (lifetimePoints >= minPoints) {
      return rank
    }
  }
  return 'PAPER_TRADER'
}

/**
 * Returns true if the given rank is a prestige tier (HEDGE_FUND or WHALE).
 */
export function isPrestigeTier(rank: string): rank is PrestigeRank {
  return rank === 'HEDGE_FUND' || rank === 'WHALE'
}

/**
 * Viewer shape accepted by getMultiplierForViewer.
 */
export interface MultiplierViewer {
  isMember: boolean
  isModerator: boolean
  isCourseBuyer: boolean
  isPremiumCohortBuyer: boolean
}

const MULTIPLIER_CAP = 2.0

/**
 * Calculates the point multiplier for a viewer based on their status flags.
 *
 * Multipliers stack multiplicatively and are capped at 2.0x.
 *
 * - member:             1.25x
 * - moderator:          1.5x
 * - courseBuyer:        1.3x
 * - premiumCohortBuyer: 1.5x
 */
export function getMultiplierForViewer(viewer: MultiplierViewer): number {
  let multiplier = 1.0

  if (viewer.isMember) multiplier *= 1.25
  if (viewer.isModerator) multiplier *= 1.5
  if (viewer.isCourseBuyer) multiplier *= 1.3
  if (viewer.isPremiumCohortBuyer) multiplier *= 1.5

  return Math.min(multiplier, MULTIPLIER_CAP)
}

/**
 * Viewer shape accepted by checkPrestigeEligibility.
 */
export interface PrestigeViewer {
  lifetimePoints: number
  totalStreamsAttended: number
  longestStreak: number
  totalCodesRedeemed: number
}

/**
 * Checks whether a viewer qualifies for a prestige tier.
 *
 * Returns the highest eligible prestige rank, or null if the viewer
 * does not qualify for any.  WHALE is checked first because it is
 * the higher tier.
 */
export function checkPrestigeEligibility(viewer: PrestigeViewer): PrestigeRank | null {
  // Check WHALE first (higher prestige)
  const whaleReq = PRESTIGE_REQUIREMENTS.WHALE
  if (
    viewer.lifetimePoints >= whaleReq.minLifetimePoints &&
    viewer.totalStreamsAttended >= whaleReq.minStreamsAttended &&
    viewer.longestStreak >= whaleReq.minLongestStreak &&
    viewer.totalCodesRedeemed >= whaleReq.minCodesRedeemed
  ) {
    return 'WHALE'
  }

  // Check HEDGE_FUND
  const hfReq = PRESTIGE_REQUIREMENTS.HEDGE_FUND
  if (
    viewer.lifetimePoints >= hfReq.minLifetimePoints &&
    viewer.totalStreamsAttended >= hfReq.minStreamsAttended &&
    viewer.longestStreak >= hfReq.minLongestStreak &&
    viewer.totalCodesRedeemed >= hfReq.minCodesRedeemed
  ) {
    return 'HEDGE_FUND'
  }

  return null
}
