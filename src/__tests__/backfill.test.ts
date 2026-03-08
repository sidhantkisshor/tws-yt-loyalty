import { describe, it, expect } from 'vitest'
import {
  aggregateViewerPoints,
  pickHighestRank,
  averageTrustScore,
} from '@/scripts/backfillHelpers'

describe('aggregateViewerPoints', () => {
  it('sums availablePoints across viewers', () => {
    const viewers = [
      { availablePoints: 100, totalPoints: 200, lifetimePoints: 300 },
      { availablePoints: 50, totalPoints: 150, lifetimePoints: 250 },
    ]
    const result = aggregateViewerPoints(viewers)
    expect(result.availablePoints).toBe(150)
  })

  it('takes max totalPoints and lifetimePoints', () => {
    const viewers = [
      { availablePoints: 100, totalPoints: 200, lifetimePoints: 300 },
      { availablePoints: 50, totalPoints: 150, lifetimePoints: 250 },
    ]
    const result = aggregateViewerPoints(viewers)
    expect(result.totalPoints).toBe(200)
    expect(result.lifetimePoints).toBe(300)
  })

  it('returns zeros for empty array', () => {
    const result = aggregateViewerPoints([])
    expect(result.availablePoints).toBe(0)
    expect(result.totalPoints).toBe(0)
    expect(result.lifetimePoints).toBe(0)
  })
})

describe('pickHighestRank', () => {
  it('returns highest rank among viewers', () => {
    expect(pickHighestRank(['PAPER_TRADER', 'SWING_TRADER', 'RETAIL_TRADER']))
      .toBe('SWING_TRADER')
  })

  it('returns PAPER_TRADER for empty array', () => {
    expect(pickHighestRank([])).toBe('PAPER_TRADER')
  })

  it('handles single viewer', () => {
    expect(pickHighestRank(['FUND_MANAGER'])).toBe('FUND_MANAGER')
  })
})

describe('averageTrustScore', () => {
  it('averages trust scores', () => {
    expect(averageTrustScore([40, 60])).toBe(50)
  })

  it('returns 50 for empty array', () => {
    expect(averageTrustScore([])).toBe(50)
  })
})
