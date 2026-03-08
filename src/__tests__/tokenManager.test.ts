import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ default: {} }))
vi.mock('@/lib/redis', () => ({
  getRecentRedemptionCount: vi.fn(),
  checkIdenticalTiming: vi.fn(),
  trackRedemption: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import {
  isTokenExpired,
  shouldRefreshToken,
  parseTokenExpiry,
} from '@/services/tokenManager'

describe('isTokenExpired', () => {
  it('returns true when tokenExpiresAt is in the past', () => {
    const pastDate = new Date(Date.now() - 60000)
    expect(isTokenExpired(pastDate)).toBe(true)
  })

  it('returns false when tokenExpiresAt is in the future', () => {
    const futureDate = new Date(Date.now() + 60000)
    expect(isTokenExpired(futureDate)).toBe(false)
  })

  it('returns true when tokenExpiresAt is null', () => {
    expect(isTokenExpired(null)).toBe(true)
  })
})

describe('shouldRefreshToken', () => {
  it('returns true when token expires within 5 min buffer', () => {
    const soonDate = new Date(Date.now() + 2 * 60 * 1000)
    expect(shouldRefreshToken(soonDate)).toBe(true)
  })

  it('returns false when token has plenty of time left', () => {
    const laterDate = new Date(Date.now() + 30 * 60 * 1000)
    expect(shouldRefreshToken(laterDate)).toBe(false)
  })

  it('returns true when tokenExpiresAt is null', () => {
    expect(shouldRefreshToken(null)).toBe(true)
  })
})

describe('parseTokenExpiry', () => {
  it('parses expires_in seconds to Date', () => {
    const now = Date.now()
    const result = parseTokenExpiry(3600)
    expect(result.getTime()).toBeGreaterThanOrEqual(now + 3599000)
    expect(result.getTime()).toBeLessThanOrEqual(now + 3601000)
  })
})
