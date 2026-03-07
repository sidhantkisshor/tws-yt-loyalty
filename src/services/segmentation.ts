export type SegmentName =
  | 'warming_lead'
  | 'hot_lead'
  | 'at_risk'
  | 'superfan'
  | 'whale_candidate'

export interface SegmentInput {
  rank: string
  totalStreamsAttended: number
  hasPurchasedCourse: boolean
  hasPurchasedPremiumCohort: boolean
  currentStreak: number
  helpfulUpvotesReceived: number
  lastSeenAt: Date
  hasRedeemedModuleUnlock: boolean
}

/**
 * Rank order mapping for comparing viewer ranks.
 * Higher values indicate higher-tier ranks.
 */
export const RANK_ORDER: Record<string, number> = {
  PAPER_TRADER: 0,
  RETAIL_TRADER: 1,
  SWING_TRADER: 2,
  FUND_MANAGER: 3,
  MARKET_MAKER: 4,
  HEDGE_FUND: 5,
  WHALE: 6,
}

function rankValue(rank: string): number {
  return RANK_ORDER[rank] ?? -1
}

function daysSince(date: Date): number {
  const now = Date.now()
  const diffMs = now - date.getTime()
  return diffMs / (1000 * 60 * 60 * 24)
}

/**
 * Auto-classifies a viewer into a segment based on their behavior.
 *
 * Segments are checked in priority order:
 * 1. at_risk — rank >= Retail Trader AND 5+ streams AND not seen in 14+ days
 * 2. whale_candidate — rank >= Market Maker AND has purchased course AND 50+ helpful upvotes
 * 3. superfan — rank >= Fund Manager AND 30+ day streak
 * 4. hot_lead — rank >= Swing Trader AND 20+ streams AND redeemed module unlock AND NOT purchased course
 * 5. warming_lead — rank >= Retail Trader AND 10+ streams AND NOT purchased course
 *
 * Returns null if no segment matches.
 */
export function calculateSegment(viewer: SegmentInput): SegmentName | null {
  const rv = rankValue(viewer.rank)

  // 1. at_risk
  if (
    rv >= RANK_ORDER.RETAIL_TRADER &&
    viewer.totalStreamsAttended >= 5 &&
    daysSince(viewer.lastSeenAt) >= 14
  ) {
    return 'at_risk'
  }

  // 2. whale_candidate
  if (
    rv >= RANK_ORDER.MARKET_MAKER &&
    viewer.hasPurchasedCourse &&
    viewer.helpfulUpvotesReceived >= 50
  ) {
    return 'whale_candidate'
  }

  // 3. superfan
  if (rv >= RANK_ORDER.FUND_MANAGER && viewer.currentStreak >= 30) {
    return 'superfan'
  }

  // 4. hot_lead
  if (
    rv >= RANK_ORDER.SWING_TRADER &&
    viewer.totalStreamsAttended >= 20 &&
    viewer.hasRedeemedModuleUnlock &&
    !viewer.hasPurchasedCourse
  ) {
    return 'hot_lead'
  }

  // 5. warming_lead
  if (
    rv >= RANK_ORDER.RETAIL_TRADER &&
    viewer.totalStreamsAttended >= 10 &&
    !viewer.hasPurchasedCourse
  ) {
    return 'warming_lead'
  }

  return null
}
