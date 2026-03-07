const RANK_ORDER = [
  'PAPER_TRADER',
  'RETAIL_TRADER',
  'SWING_TRADER',
  'FUND_MANAGER',
  'MARKET_MAKER',
  'HEDGE_FUND',
  'WHALE',
] as const

type ViewerRank = typeof RANK_ORDER[number]

interface ViewerPoints {
  availablePoints: number
  totalPoints: number
  lifetimePoints: number
}

export function aggregateViewerPoints(
  viewers: ViewerPoints[]
): ViewerPoints {
  if (viewers.length === 0) {
    return { availablePoints: 0, totalPoints: 0, lifetimePoints: 0 }
  }

  return {
    availablePoints: viewers.reduce((sum, v) => sum + v.availablePoints, 0),
    totalPoints: Math.max(...viewers.map((v) => v.totalPoints)),
    lifetimePoints: Math.max(...viewers.map((v) => v.lifetimePoints)),
  }
}

export function pickHighestRank(ranks: string[]): string {
  if (ranks.length === 0) return 'PAPER_TRADER'

  let highestIndex = 0
  for (const rank of ranks) {
    const index = RANK_ORDER.indexOf(rank as ViewerRank)
    if (index > highestIndex) highestIndex = index
  }
  return RANK_ORDER[highestIndex]
}

export function averageTrustScore(scores: number[]): number {
  if (scores.length === 0) return 50
  return scores.reduce((sum, s) => sum + s, 0) / scores.length
}
