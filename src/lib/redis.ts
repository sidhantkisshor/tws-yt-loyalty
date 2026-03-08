import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { env } from './env'

// Initialize Redis client
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})

// ============================================
// RATE LIMITING
// ============================================

// Rate limiter for reward redemptions: 3 redemptions per minute per viewer
export const rewardRedemptionLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 m'),
  prefix: 'ratelimit:reward:',
  analytics: true,
})

// Rate limiter for code redemptions: 10 per minute per viewer (across all codes)
export const codeRedemptionLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'ratelimit:code:',
  analytics: true,
})

// ============================================
// LEADERBOARD OPERATIONS
// ============================================

export interface LeaderboardEntry {
  viewerId: string
  displayName: string
  points: number
  rank: number
}

// Leaderboard TTLs
const STREAM_LEADERBOARD_TTL_SECONDS = 7 * 24 * 3600 // 7 days after last update
const CHANNEL_LEADERBOARD_TTL_SECONDS = 30 * 24 * 3600 // 30 days after last update

/**
 * Update viewer's score in stream leaderboard
 */
export async function updateStreamLeaderboard(
  streamId: string,
  viewerId: string,
  points: number,
  displayName?: string
): Promise<void> {
  const key = `leaderboard:stream:${streamId}`
  const pipeline = redis.pipeline()
  pipeline.zincrby(key, points, viewerId)
  pipeline.expire(key, STREAM_LEADERBOARD_TTL_SECONDS) // Refresh TTL on update
  // Cache display name if provided (24 hour TTL)
  if (displayName) {
    pipeline.set(`viewer:${viewerId}:displayName`, displayName, { ex: 86400 })
  }
  await pipeline.exec()
}

/**
 * Update viewer's score in channel all-time leaderboard
 */
export async function updateChannelLeaderboard(
  channelId: string,
  viewerId: string,
  points: number,
  displayName?: string
): Promise<void> {
  const key = `leaderboard:channel:${channelId}:alltime`
  const pipeline = redis.pipeline()
  pipeline.zincrby(key, points, viewerId)
  pipeline.expire(key, CHANNEL_LEADERBOARD_TTL_SECONDS) // Refresh TTL on update
  // Cache display name if provided (24 hour TTL)
  if (displayName) {
    pipeline.set(`viewer:${viewerId}:displayName`, displayName, { ex: 86400 })
  }
  await pipeline.exec()
}

/**
 * Get cached display names for multiple viewers
 */
export async function getCachedDisplayNames(
  viewerIds: string[]
): Promise<Map<string, string>> {
  if (viewerIds.length === 0) return new Map()

  const pipeline = redis.pipeline()
  for (const viewerId of viewerIds) {
    pipeline.get(`viewer:${viewerId}:displayName`)
  }
  const results = await pipeline.exec()

  const displayNames = new Map<string, string>()
  results.forEach((result, index) => {
    if (result && typeof result === 'string') {
      displayNames.set(viewerIds[index], result)
    }
  })
  return displayNames
}

/**
 * Get top N viewers for a stream
 */
export async function getStreamLeaderboard(
  streamId: string,
  limit: number = 10
): Promise<{ viewerId: string; points: number }[]> {
  const result = await redis.zrange(`leaderboard:stream:${streamId}`, 0, limit - 1, {
    rev: true,
    withScores: true,
  })

  const entries: { viewerId: string; points: number }[] = []
  for (let i = 0; i < result.length; i += 2) {
    entries.push({
      viewerId: result[i] as string,
      points: result[i + 1] as number,
    })
  }
  return entries
}

/**
 * Get top N viewers for a channel (all-time)
 */
export async function getChannelLeaderboard(
  channelId: string,
  limit: number = 10
): Promise<{ viewerId: string; points: number }[]> {
  const result = await redis.zrange(`leaderboard:channel:${channelId}:alltime`, 0, limit - 1, {
    rev: true,
    withScores: true,
  })

  const entries: { viewerId: string; points: number }[] = []
  for (let i = 0; i < result.length; i += 2) {
    entries.push({
      viewerId: result[i] as string,
      points: result[i + 1] as number,
    })
  }
  return entries
}

/**
 * Get viewer's rank in stream leaderboard
 */
export async function getViewerRank(
  streamId: string,
  viewerId: string
): Promise<number | null> {
  const rank = await redis.zrevrank(`leaderboard:stream:${streamId}`, viewerId)
  return rank !== null ? rank + 1 : null // Convert 0-indexed to 1-indexed
}

// ============================================
// ACTIVE CODE TRACKING
// ============================================

export interface ActiveCode {
  codeId: string
  code: string
  basePoints: number
  expiresAt: number
  announcedAt: number
}

/**
 * Set active code for a stream with TTL
 */
export async function setActiveCode(
  streamId: string,
  codeId: string,
  code: string,
  basePoints: number,
  ttlSeconds: number
): Promise<void> {
  const now = Date.now()
  const data: ActiveCode = {
    codeId,
    code,
    basePoints,
    expiresAt: now + ttlSeconds * 1000,
    announcedAt: now,
  }

  await redis.set(`stream:${streamId}:activeCode`, JSON.stringify(data), {
    ex: ttlSeconds,
  })
}

/**
 * Get active code for a stream
 */
export async function getActiveCode(streamId: string): Promise<ActiveCode | null> {
  const data = await redis.get<string>(`stream:${streamId}:activeCode`)
  if (!data) return null
  return JSON.parse(data)
}

/**
 * Clear active code for a stream
 */
export async function clearActiveCode(streamId: string): Promise<void> {
  await redis.del(`stream:${streamId}:activeCode`)
}

// ============================================
// STREAM STATE MANAGEMENT
// ============================================

export interface StreamState {
  channelId?: string
  youtubeLiveChatId?: string
  status?: 'live' | 'ended'
  lastPollAt?: string
  nextPageToken?: string
  pollingIntervalMs?: number
}

// Stream state TTL: 24 hours (prevents orphaned state if stream ends unexpectedly)
const STREAM_STATE_TTL_SECONDS = 86400

/**
 * Set stream state with TTL to prevent orphaned entries
 */
export async function setStreamState(
  streamId: string,
  state: StreamState
): Promise<void> {
  const key = `stream:${streamId}:state`
  await redis.hset(key, state as unknown as Record<string, string>)
  await redis.expire(key, STREAM_STATE_TTL_SECONDS)
}

/**
 * Get stream state
 */
export async function getStreamState(streamId: string): Promise<StreamState | null> {
  const state = await redis.hgetall(`stream:${streamId}:state`)
  if (!state || Object.keys(state).length === 0) return null
  return state as unknown as StreamState
}

/**
 * Update stream state fields and refresh TTL
 */
export async function updateStreamState(
  streamId: string,
  updates: Partial<StreamState>
): Promise<void> {
  const key = `stream:${streamId}:state`
  await redis.hset(key, updates as unknown as Record<string, string>)
  // Refresh TTL on every update to keep active streams alive
  await redis.expire(key, STREAM_STATE_TTL_SECONDS)
}

/**
 * Clear stream state
 */
export async function clearStreamState(streamId: string): Promise<void> {
  await redis.del(`stream:${streamId}:state`)
}

// ============================================
// FRAUD DETECTION TRACKING
// ============================================

/**
 * Track code redemption for fraud detection
 * Uses sorted set with timestamp as score
 */
export async function trackRedemption(
  viewerId: string,
  codeId: string,
  latencyMs: number
): Promise<void> {
  const now = Date.now()

  // Track viewer's recent redemptions
  await redis.zadd(`fraud:viewer:${viewerId}:redemptions`, {
    score: now,
    member: codeId,
  })

  // Expire old entries (keep last hour)
  await redis.zremrangebyscore(
    `fraud:viewer:${viewerId}:redemptions`,
    0,
    now - 3600000
  )

  // Track code redemption timings for identical timing detection
  await redis.zadd(`fraud:code:${codeId}:times`, {
    score: latencyMs,
    member: viewerId,
  })
}

/**
 * Get viewer's recent redemption count (last N minutes)
 */
export async function getRecentRedemptionCount(
  viewerId: string,
  minutes: number
): Promise<number> {
  const now = Date.now()
  const minTime = now - minutes * 60 * 1000

  return await redis.zcount(
    `fraud:viewer:${viewerId}:redemptions`,
    minTime,
    now
  )
}

/**
 * Check for identical timing on a code (within tolerance)
 */
export async function checkIdenticalTiming(
  codeId: string,
  latencyMs: number,
  toleranceMs: number = 50
): Promise<string[]> {
  const similarTimings = await redis.zrange(
    `fraud:code:${codeId}:times`,
    latencyMs - toleranceMs,
    latencyMs + toleranceMs,
    { byScore: true }
  )
  return similarTimings as string[]
}

// ============================================
// QUOTA TRACKING
// ============================================

/**
 * Increment daily quota usage for a channel
 */
export async function incrementQuota(channelId: string, units: number = 1): Promise<number> {
  const key = `quota:channel:${channelId}:daily`
  const newValue = await redis.incrby(key, units)

  // Set expiry to midnight UTC if not set
  const ttl = await redis.ttl(key)
  if (ttl === -1) {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setUTCHours(24, 0, 0, 0)
    const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000)
    await redis.expire(key, secondsUntilMidnight)
  }

  return newValue
}

/**
 * Get current quota usage for a channel
 */
export async function getQuotaUsage(channelId: string): Promise<number> {
  const usage = await redis.get<number>(`quota:channel:${channelId}:daily`)
  return usage ?? 0
}

/**
 * Increment global quota usage
 */
export async function incrementGlobalQuota(units: number = 1): Promise<number> {
  const key = 'quota:global:daily'
  const newValue = await redis.incrby(key, units)

  const ttl = await redis.ttl(key)
  if (ttl === -1) {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setUTCHours(24, 0, 0, 0)
    const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000)
    await redis.expire(key, secondsUntilMidnight)
  }

  return newValue
}

// ============================================
// DISTRIBUTED LOCKS
// ============================================

export async function acquireLock(
  key: string,
  ttlSeconds: number = 60
): Promise<string | null> {
  const lockId = `lock:${Date.now()}:${Math.random().toString(36).slice(2)}`
  const result = await redis.set(`lock:${key}`, lockId, { nx: true, ex: ttlSeconds })
  return result === 'OK' ? lockId : null
}

export async function releaseLock(key: string, lockId: string): Promise<boolean> {
  const currentValue = await redis.get(`lock:${key}`)
  if (currentValue === lockId) {
    await redis.del(`lock:${key}`)
    return true
  }
  return false
}

export async function isLocked(key: string): Promise<boolean> {
  const value = await redis.get(`lock:${key}`)
  return value !== null
}

export default redis
