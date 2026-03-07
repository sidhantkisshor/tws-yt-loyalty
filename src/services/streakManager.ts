export type PauseType = '3day' | '7day'

/**
 * Milestone day -> bonus points awarded when a streak reaches that day.
 */
export const STREAK_MILESTONES: Record<number, number> = {
  7: 100,
  14: 150,
  30: 400,
  60: 800,
  100: 1500,
  200: 3000,
  365: 7500,
}

/**
 * Returns the daily streak bonus for the given streak day.
 *
 * - Day 1: 0
 * - Day 2: 10, Day 3: 15, Day 4: 20 (linear ramp)
 * - Day 5+: capped at 25
 */
export function calculateStreakBonus(currentStreak: number): number {
  if (currentStreak <= 1) return 0
  if (currentStreak >= 5) return 25

  // Days 2-4: linear ramp from 10 to 20
  // day 2 -> 10, day 3 -> 15, day 4 -> 20
  return currentStreak * 5
}

/**
 * Returns the milestone bonus if the current streak matches a milestone day,
 * otherwise returns 0.
 */
export function getStreakMilestoneBonus(currentStreak: number): number {
  return STREAK_MILESTONES[currentStreak] ?? 0
}

/**
 * Determines whether a pause can be activated.
 *
 * Rules:
 * - 3-day pause: max 2 per month
 * - 7-day pause: max 1 per month
 * - Cannot activate if another pause is currently active (pauseEndsAt in the future)
 */
export function canActivatePause(
  pauseType: PauseType,
  shortPausesUsed: number,
  longPausesUsed: number,
  currentPauseEndsAt: Date | null
): boolean {
  // Block if a pause is currently active
  if (currentPauseEndsAt && currentPauseEndsAt.getTime() > Date.now()) {
    return false
  }

  if (pauseType === '3day') {
    return shortPausesUsed < 2
  }

  // pauseType === '7day'
  return longPausesUsed < 1
}

/**
 * Returns the point cost for activating a pause.
 * 3-day pauses are free; 7-day pauses cost 500 points.
 */
export function getPauseCost(pauseType: PauseType): number {
  return pauseType === '3day' ? 0 : 500
}

/**
 * Returns the duration in days for the given pause type.
 */
export function getPauseDurationDays(pauseType: PauseType): number {
  return pauseType === '3day' ? 3 : 7
}

/**
 * Returns true if a streak is currently protected by an active pause
 * (i.e., pauseEndsAt is in the future).
 */
export function isStreakProtectedByPause(pauseEndsAt: Date | null): boolean {
  if (!pauseEndsAt) return false
  return pauseEndsAt.getTime() > Date.now()
}
