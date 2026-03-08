import prisma from '@/lib/prisma'
import {
  getRecentRedemptionCount,
  checkIdenticalTiming,
  trackRedemption,
} from '@/lib/redis'
import { FraudEventType, FraudSeverity, Viewer } from '@prisma/client'
import { logger } from '@/lib/logger'

// ============================================
// TRUST SCORE CALCULATION
// ============================================

interface TrustScoreFactors {
  accountAgeDays: number
  totalStreamsAttended: number
  totalMessagesCount: number
  totalCodesRedeemed: number
  isMember: boolean
  isModerator: boolean
  fraudEventCount: number
  recentFraudEventCount: number
  averageRedemptionLatencyMs?: number
}

/**
 * Calculate trust score based on various factors
 * Returns a score between 0-100
 */
export function calculateTrustScore(factors: TrustScoreFactors): number {
  let score = 50 // Base score

  // Positive adjustments
  score += Math.min(factors.accountAgeDays * 0.5, 15) // Max +15 for tenure
  score += Math.min(factors.totalStreamsAttended * 2, 20) // Max +20 for loyalty
  score += Math.min(factors.totalMessagesCount * 0.01, 5) // Max +5 for engagement
  score += factors.isMember ? 10 : 0 // +10 for members
  score += factors.isModerator ? 10 : 0 // +10 for mods

  // Negative adjustments
  score -= factors.fraudEventCount * 5 // -5 per fraud event
  score -= factors.recentFraudEventCount * 10 // -10 per recent event

  // Latency penalty (too fast = bot-like)
  if (factors.averageRedemptionLatencyMs !== undefined) {
    if (factors.averageRedemptionLatencyMs < 500) {
      score -= 20 // Suspiciously fast
    } else if (factors.averageRedemptionLatencyMs < 1000) {
      score -= 10
    }
  }

  return Math.max(0, Math.min(100, score)) // Clamp 0-100
}

/**
 * Get trust score factors for a viewer
 */
export async function getTrustScoreFactors(
  viewerId: string
): Promise<TrustScoreFactors> {
  const viewer = await prisma.viewer.findUnique({
    where: { id: viewerId },
    include: {
      fraudEvents: true,
      codeRedemptions: {
        orderBy: { redeemedAt: 'desc' },
        take: 20,
      },
    },
  })

  if (!viewer) {
    return {
      accountAgeDays: 0,
      totalStreamsAttended: 0,
      totalMessagesCount: 0,
      totalCodesRedeemed: 0,
      isMember: false,
      isModerator: false,
      fraudEventCount: 0,
      recentFraudEventCount: 0,
    }
  }

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const recentFraudEvents = viewer.fraudEvents.filter(
    (e) => e.createdAt > sevenDaysAgo
  ).length

  // Calculate average redemption latency
  let avgLatency: number | undefined
  if (viewer.codeRedemptions.length > 0) {
    const totalLatency = viewer.codeRedemptions.reduce(
      (sum, r) => sum + r.redemptionLatencyMs,
      0
    )
    avgLatency = totalLatency / viewer.codeRedemptions.length
  }

  return {
    accountAgeDays: Math.floor(
      (now.getTime() - viewer.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24)
    ),
    totalStreamsAttended: viewer.totalStreamsAttended,
    totalMessagesCount: viewer.totalMessagesCount,
    totalCodesRedeemed: viewer.totalCodesRedeemed,
    isMember: viewer.isMember,
    isModerator: viewer.isModerator,
    fraudEventCount: viewer.fraudEvents.length,
    recentFraudEventCount: recentFraudEvents,
    averageRedemptionLatencyMs: avgLatency,
  }
}

/**
 * Recalculate and update viewer's trust score
 */
export async function updateViewerTrustScore(viewerId: string): Promise<number> {
  const factors = await getTrustScoreFactors(viewerId)
  const newScore = calculateTrustScore(factors)

  await prisma.viewer.update({
    where: { id: viewerId },
    data: { trustScore: newScore },
  })

  return newScore
}

// ============================================
// FRAUD DETECTION RULES
// ============================================

interface FraudCheckContext {
  viewerId: string
  viewer: Viewer
  codeId: string
  streamId: string
  redemptionLatencyMs: number
  codeAnnouncedAt: Date
}

interface FraudCheckResult {
  triggered: boolean
  eventType?: FraudEventType
  severity?: FraudSeverity
  description?: string
  evidence?: Record<string, unknown>
  trustPenalty?: number
}

interface FraudRule {
  name: string
  eventType: FraudEventType
  severity: FraudSeverity
  trustPenalty: number
  autoBanThreshold: number
  check: (context: FraudCheckContext) => Promise<FraudCheckResult>
}

const FRAUD_RULES: FraudRule[] = [
  // Rule 1: Inhuman Response Time (<800ms)
  {
    name: 'INSTANT_RESPONSE',
    eventType: 'INSTANT_RESPONSE',
    severity: 'HIGH',
    trustPenalty: 15,
    autoBanThreshold: 3,
    check: async (ctx) => {
      // Minimum 800ms to read + type code (accounting for network delay)
      if (ctx.redemptionLatencyMs < 800) {
        return {
          triggered: true,
          eventType: 'INSTANT_RESPONSE',
          severity: 'HIGH',
          description: `Responded in ${ctx.redemptionLatencyMs}ms (threshold: 800ms)`,
          evidence: {
            latencyMs: ctx.redemptionLatencyMs,
            threshold: 800,
          },
          trustPenalty: 15,
        }
      }
      return { triggered: false }
    },
  },

  // Rule 2: Rapid Fire Redemptions (5+ in 5 minutes)
  {
    name: 'RAPID_REDEMPTION',
    eventType: 'RAPID_REDEMPTION',
    severity: 'MEDIUM',
    trustPenalty: 10,
    autoBanThreshold: 5,
    check: async (ctx) => {
      const recentCount = await getRecentRedemptionCount(ctx.viewerId, 5)

      if (recentCount >= 5) {
        return {
          triggered: true,
          eventType: 'RAPID_REDEMPTION',
          severity: 'MEDIUM',
          description: `${recentCount} redemptions in last 5 minutes (threshold: 5)`,
          evidence: {
            redemptionsIn5Min: recentCount,
            threshold: 5,
          },
          trustPenalty: 10,
        }
      }
      return { triggered: false }
    },
  },

  // Rule 3: Identical Timing Pattern (Multi-Account)
  {
    name: 'IDENTICAL_TIMING',
    eventType: 'IDENTICAL_TIMING',
    severity: 'CRITICAL',
    trustPenalty: 30,
    autoBanThreshold: 1,
    check: async (ctx) => {
      // Check for other redemptions within 50ms of this one
      const similarTimings = await checkIdenticalTiming(
        ctx.codeId,
        ctx.redemptionLatencyMs,
        50
      )

      // Filter out current viewer
      const otherViewers = similarTimings.filter((v) => v !== ctx.viewerId)

      if (otherViewers.length > 0) {
        return {
          triggered: true,
          eventType: 'IDENTICAL_TIMING',
          severity: 'CRITICAL',
          description: `Identical timing with ${otherViewers.length} other viewer(s) (within 50ms)`,
          evidence: {
            otherViewers,
            latencyMs: ctx.redemptionLatencyMs,
            windowMs: 50,
          },
          trustPenalty: 30,
        }
      }
      return { triggered: false }
    },
  },

  // Rule 4: New Account Suspicion
  {
    name: 'NEW_ACCOUNT',
    eventType: 'NEW_ACCOUNT',
    severity: 'LOW',
    trustPenalty: 5,
    autoBanThreshold: 10,
    check: async (ctx) => {
      const accountAgeDays =
        (Date.now() - ctx.viewer.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24)

      // First-time viewer redeeming code immediately
      if (accountAgeDays < 1 && ctx.viewer.totalCodesRedeemed === 0) {
        return {
          triggered: true,
          eventType: 'NEW_ACCOUNT',
          severity: 'LOW',
          description: 'First redemption on new account (less than 1 day old)',
          evidence: {
            accountAgeDays: accountAgeDays.toFixed(2),
            isFirstRedemption: true,
          },
          trustPenalty: 5,
        }
      }
      return { triggered: false }
    },
  },

  // Rule 5: Pattern Detection (Bot-like consistency)
  {
    name: 'PATTERN_DETECTION',
    eventType: 'PATTERN_DETECTION',
    severity: 'HIGH',
    trustPenalty: 20,
    autoBanThreshold: 2,
    check: async (ctx) => {
      // Need at least 5 redemptions to analyze pattern
      if (ctx.viewer.totalCodesRedeemed < 5) {
        return { triggered: false }
      }

      // Get recent redemptions to analyze variance
      const recentRedemptions = await prisma.codeRedemption.findMany({
        where: { viewerId: ctx.viewerId },
        orderBy: { redeemedAt: 'desc' },
        take: 10,
        select: { redemptionLatencyMs: true },
      })

      if (recentRedemptions.length < 5) {
        return { triggered: false }
      }

      // Calculate variance in latency
      const latencies = recentRedemptions.map((r) => r.redemptionLatencyMs)
      const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length
      const variance =
        latencies.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) /
        latencies.length
      const stdDev = Math.sqrt(variance)

      // Humans have high variance (500-5000ms), bots are consistent
      if (stdDev < 200 && mean < 2000) {
        return {
          triggered: true,
          eventType: 'PATTERN_DETECTION',
          severity: 'HIGH',
          description: `Suspiciously consistent timing (stdDev: ${stdDev.toFixed(0)}ms, mean: ${mean.toFixed(0)}ms)`,
          evidence: {
            latencyStdDev: stdDev.toFixed(0),
            latencyMean: mean.toFixed(0),
            sampleSize: latencies.length,
            threshold: 200,
          },
          trustPenalty: 20,
        }
      }
      return { triggered: false }
    },
  },
]

// ============================================
// FRAUD DETECTION PIPELINE
// ============================================

export interface FraudDetectionResult {
  allowed: boolean
  violations: FraudCheckResult[]
  newTrustScore: number
  shouldBan: boolean
  requiresReview: boolean
}

/**
 * Run all fraud checks for a redemption attempt
 */
export async function runFraudChecks(
  context: FraudCheckContext
): Promise<FraudDetectionResult> {
  const violations: FraudCheckResult[] = []
  let totalPenalty = 0
  let shouldBan = false
  let requiresReview = false

  // Pre-fetch all recent fraud event counts in a single query (fixes N+1)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentFraudCounts = await prisma.fraudEvent.groupBy({
    by: ['eventType'],
    where: {
      viewerId: context.viewerId,
      createdAt: { gte: sevenDaysAgo },
    },
    _count: { eventType: true },
  })
  const fraudCountMap = new Map(
    recentFraudCounts.map((r) => [r.eventType, r._count.eventType])
  )

  // Run all fraud rules in parallel for better performance
  const ruleResults = await Promise.allSettled(
    FRAUD_RULES.map((rule) => rule.check(context).then((result) => ({ rule, result })))
  )

  for (const settledResult of ruleResults) {
    if (settledResult.status === 'rejected') {
      logger.error('Error running fraud rule', settledResult.reason)
      continue
    }

    const { rule, result } = settledResult.value
    if (result.triggered) {
      violations.push(result)
      totalPenalty += result.trustPenalty ?? 0

      // Check severity for review/ban decisions
      if (result.severity === 'HIGH' || result.severity === 'CRITICAL') {
        requiresReview = true
      }

      // Check auto-ban threshold using pre-fetched counts
      const violationCount = fraudCountMap.get(rule.eventType) ?? 0
      if (violationCount + 1 >= rule.autoBanThreshold) {
        shouldBan = true
      }
    }
  }

  // Calculate new trust score
  const newTrustScore = Math.max(0, context.viewer.trustScore - totalPenalty)

  // Auto-ban if trust score drops too low
  if (newTrustScore < 20) {
    shouldBan = true
  }

  // Determine if redemption is allowed
  const allowed = newTrustScore >= 20 && !shouldBan

  return {
    allowed,
    violations,
    newTrustScore,
    shouldBan,
    requiresReview,
  }
}

/**
 * Log fraud events to database (batched for performance)
 */
export async function logFraudEvents(
  viewerId: string,
  streamId: string | null,
  violations: FraudCheckResult[]
): Promise<void> {
  const eventsToCreate = violations
    .filter((v) => v.triggered && v.eventType)
    .map((violation) => ({
      viewerId,
      streamId,
      eventType: violation.eventType!,
      severity: violation.severity as FraudSeverity,
      description: violation.description ?? 'Fraud detected',
      evidence: (violation.evidence ?? {}) as object,
      trustPenaltyApplied: violation.trustPenalty ?? 0,
      wasAutoBanned: false,
    }))

  if (eventsToCreate.length > 0) {
    await prisma.fraudEvent.createMany({ data: eventsToCreate })
  }
}

/**
 * Ban a viewer for fraud
 */
export async function banViewerForFraud(
  viewerId: string,
  reason: string,
  bannedBy?: string
): Promise<void> {
  await prisma.viewer.update({
    where: { id: viewerId },
    data: {
      isBanned: true,
      banReason: reason,
      bannedAt: new Date(),
      bannedBy,
      trustScore: 0,
    },
  })

  // Update the most recent fraud event to mark as auto-banned
  await prisma.fraudEvent.updateMany({
    where: { viewerId },
    data: { wasAutoBanned: true },
  })
}

/**
 * Complete fraud check flow for a redemption
 */
export async function processFraudCheck(
  viewerId: string,
  codeId: string,
  streamId: string,
  redemptionLatencyMs: number,
  codeAnnouncedAt: Date
): Promise<FraudDetectionResult> {
  // Get viewer
  const viewer = await prisma.viewer.findUnique({
    where: { id: viewerId },
  })

  if (!viewer) {
    return {
      allowed: false,
      violations: [],
      newTrustScore: 0,
      shouldBan: false,
      requiresReview: false,
    }
  }

  // Check if already banned
  if (viewer.isBanned) {
    return {
      allowed: false,
      violations: [],
      newTrustScore: viewer.trustScore,
      shouldBan: false,
      requiresReview: false,
    }
  }

  // Create context
  const context: FraudCheckContext = {
    viewerId,
    viewer,
    codeId,
    streamId,
    redemptionLatencyMs,
    codeAnnouncedAt,
  }

  // Run fraud checks
  const result = await runFraudChecks(context)

  // Log violations
  if (result.violations.length > 0) {
    await logFraudEvents(viewerId, streamId, result.violations)
  }

  // Update trust score
  if (result.newTrustScore !== viewer.trustScore) {
    await prisma.viewer.update({
      where: { id: viewerId },
      data: { trustScore: result.newTrustScore },
    })
  }

  // Auto-ban if needed
  if (result.shouldBan) {
    const reasons = result.violations.map((v) => v.description).join('; ')
    await banViewerForFraud(viewerId, `Auto-banned: ${reasons}`)
  }

  // Track redemption for future fraud detection
  await trackRedemption(viewerId, codeId, redemptionLatencyMs)

  return result
}

const fraudDetectionService = {
  calculateTrustScore,
  getTrustScoreFactors,
  updateViewerTrustScore,
  runFraudChecks,
  logFraudEvents,
  banViewerForFraud,
  processFraudCheck,
}

export default fraudDetectionService
