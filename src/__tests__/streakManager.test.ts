import { describe, it, expect } from 'vitest'
import {
  STREAK_MILESTONES,
  calculateStreakBonus,
  getStreakMilestoneBonus,
  canActivatePause,
  getPauseCost,
  getPauseDurationDays,
  isStreakProtectedByPause,
} from '@/services/streakManager'

describe('STREAK_MILESTONES', () => {
  it('should have the correct milestone values', () => {
    expect(STREAK_MILESTONES[7]).toBe(100)
    expect(STREAK_MILESTONES[14]).toBe(150)
    expect(STREAK_MILESTONES[30]).toBe(400)
    expect(STREAK_MILESTONES[60]).toBe(800)
    expect(STREAK_MILESTONES[100]).toBe(1500)
    expect(STREAK_MILESTONES[200]).toBe(3000)
    expect(STREAK_MILESTONES[365]).toBe(7500)
  })
})

describe('calculateStreakBonus', () => {
  it('should return 0 for day 1', () => {
    expect(calculateStreakBonus(1)).toBe(0)
  })

  it('should return 10 for day 2', () => {
    expect(calculateStreakBonus(2)).toBe(10)
  })

  it('should return 15 for day 3', () => {
    expect(calculateStreakBonus(3)).toBe(15)
  })

  it('should return 20 for day 4', () => {
    expect(calculateStreakBonus(4)).toBe(20)
  })

  it('should cap at 25 for day 5+', () => {
    expect(calculateStreakBonus(5)).toBe(25)
  })

  it('should cap at 25 for day 100', () => {
    expect(calculateStreakBonus(100)).toBe(25)
  })
})

describe('getStreakMilestoneBonus', () => {
  it('should return 100 at day 7', () => {
    expect(getStreakMilestoneBonus(7)).toBe(100)
  })

  it('should return 400 at day 30', () => {
    expect(getStreakMilestoneBonus(30)).toBe(400)
  })

  it('should return 7500 at day 365', () => {
    expect(getStreakMilestoneBonus(365)).toBe(7500)
  })

  it('should return 0 for non-milestone days', () => {
    expect(getStreakMilestoneBonus(1)).toBe(0)
    expect(getStreakMilestoneBonus(5)).toBe(0)
    expect(getStreakMilestoneBonus(8)).toBe(0)
    expect(getStreakMilestoneBonus(50)).toBe(0)
    expect(getStreakMilestoneBonus(366)).toBe(0)
  })
})

describe('canActivatePause', () => {
  it('should allow 3-day pause when under limit', () => {
    expect(canActivatePause('3day', 0, 0, null)).toBe(true)
    expect(canActivatePause('3day', 1, 0, null)).toBe(true)
  })

  it('should block 3-day pause at 2 used', () => {
    expect(canActivatePause('3day', 2, 0, null)).toBe(false)
  })

  it('should allow 7-day pause when under limit', () => {
    expect(canActivatePause('7day', 0, 0, null)).toBe(true)
  })

  it('should block 7-day pause at 1 used', () => {
    expect(canActivatePause('7day', 0, 1, null)).toBe(false)
  })

  it('should block any pause when another is active (future pauseEndsAt)', () => {
    const futureDate = new Date(Date.now() + 86400000) // tomorrow
    expect(canActivatePause('3day', 0, 0, futureDate)).toBe(false)
    expect(canActivatePause('7day', 0, 0, futureDate)).toBe(false)
  })

  it('should allow pause when previous pause has expired (past pauseEndsAt)', () => {
    const pastDate = new Date(Date.now() - 86400000) // yesterday
    expect(canActivatePause('3day', 0, 0, pastDate)).toBe(true)
    expect(canActivatePause('7day', 0, 0, pastDate)).toBe(true)
  })
})

describe('getPauseCost', () => {
  it('should return 0 for 3day', () => {
    expect(getPauseCost('3day')).toBe(0)
  })

  it('should return 500 for 7day', () => {
    expect(getPauseCost('7day')).toBe(500)
  })
})

describe('getPauseDurationDays', () => {
  it('should return 3 for 3day', () => {
    expect(getPauseDurationDays('3day')).toBe(3)
  })

  it('should return 7 for 7day', () => {
    expect(getPauseDurationDays('7day')).toBe(7)
  })
})

describe('isStreakProtectedByPause', () => {
  it('should return false for null', () => {
    expect(isStreakProtectedByPause(null)).toBe(false)
  })

  it('should return true for future date', () => {
    const futureDate = new Date(Date.now() + 86400000) // tomorrow
    expect(isStreakProtectedByPause(futureDate)).toBe(true)
  })

  it('should return false for past date', () => {
    const pastDate = new Date(Date.now() - 86400000) // yesterday
    expect(isStreakProtectedByPause(pastDate)).toBe(false)
  })
})
