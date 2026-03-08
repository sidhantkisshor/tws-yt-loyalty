import { Ratelimit } from '@upstash/ratelimit'
import { redis } from './redis'

/**
 * Rate Limiting Configuration for YT Loyalty API
 *
 * All rate limiters use Upstash Redis with sliding window algorithm
 * for accurate rate limiting across distributed deployments.
 */

// ============================================
// AUTHENTICATION ENDPOINTS (Strictest)
// ============================================

/**
 * Auth rate limiter - Prevents brute force attacks
 * Applies to: /api/auth/[...nextauth], /api/viewer-auth/[...nextauth]
 * Limit: 5 attempts per 15 minutes per IP address
 */
export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'ratelimit:auth:',
  analytics: true,
})

// ============================================
// STREAM POLLING (Quota-Conscious)
// ============================================

/**
 * Stream poll rate limiter - Prevents YouTube API quota exhaustion
 * Applies to: /api/streams/[id]/poll
 * Limit: 20 polls per minute per stream (cron polls every 3-4 seconds = ~15-20 req/min)
 * Analytics disabled for performance (high-frequency endpoint)
 */
export const streamPollLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'ratelimit:poll:',
  analytics: false,
})

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * Admin write rate limiter - Moderate protection for admin operations
 * Applies to: POST/PUT/DELETE on admin endpoints
 * Limit: 30 requests per minute per user
 */
export const adminWriteLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'ratelimit:admin:write:',
  analytics: true,
})

/**
 * Admin read rate limiter - Generous limits for data fetching
 * Applies to: GET on admin endpoints
 * Limit: 100 requests per minute per user
 */
export const adminReadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  prefix: 'ratelimit:admin:read:',
  analytics: true,
})

// ============================================
// PUBLIC VIEWER ENDPOINTS
// ============================================

/**
 * Viewer public rate limiter - For public-facing viewer endpoints
 * Applies to: /api/viewer/*, /api/rewards (public), /api/leaderboard
 * Limit: 60 requests per minute per user/IP
 * Analytics disabled for performance (high-traffic public endpoints)
 */
export const viewerPublicLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'ratelimit:viewer:',
  analytics: false,
})

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get identifier for rate limiting
 * Uses userId if authenticated, otherwise falls back to IP address
 */
export function getRateLimitIdentifier(
  userId?: string,
  ip?: string | null
): string {
  if (userId) return userId
  if (ip) return ip
  return 'anonymous'
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(
  remaining: number,
  reset: number
): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
    'Retry-After': '60',
  }
}

/**
 * Check rate limit and return standardized response
 *
 * @example
 * const result = await checkRateLimit(authLimiter, session?.user?.id || request.ip)
 * if (!result.success) {
 *   return NextResponse.json({ error: 'Too many requests' }, {
 *     status: 429,
 *     headers: result.headers
 *   })
 * }
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string
) {
  const { success, limit, remaining, reset } = await limiter.limit(identifier)

  return {
    success,
    limit,
    remaining,
    reset,
    headers: createRateLimitHeaders(remaining, reset),
  }
}
