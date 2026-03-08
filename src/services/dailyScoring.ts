import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { runBatchAntiCheat, type FraudFlag } from '@/services/batchAntiCheat'
import type { EngagementEvent, FanProfile, TransactionType } from '@prisma/client'

// ============================================
// DAILY SCORING SERVICE
// ============================================
// Core scoring engine that processes EngagementEvents in batch,
// calculates points, runs anti-cheat, and creates PointLedger entries.

export interface ScoringConfig {
  chatPointsPerMessage: number // 1
  chatDailyCap: number // 50
  commentPointsPerComment: number // 2
  commentDailyCap: number // 20
  superChatMultiplier: number // 0.1 (10% of amount in cents)
  attendancePoints: number // 5
  channelMultipliers: Record<string, number> // channelId -> multiplier (default 1.0)
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  chatPointsPerMessage: 1,
  chatDailyCap: 50,
  commentPointsPerComment: 2,
  commentDailyCap: 20,
  superChatMultiplier: 0.1,
  attendancePoints: 5,
  channelMultipliers: {},
}

export interface DailyScoringResult {
  fansScored: number
  totalPointsAwarded: number
  fraudFlagged: number
  eventsProcessed: number
  windowStart: Date
  windowEnd: Date
}

interface FanScoring {
  chatMessages: number
  videoComments: number
  superChatAmountCents: number
  attendanceStreams: Set<string>
  channelIds: Set<string>
}

/**
 * Calculate base points for a fan's events with daily caps
 */
export function calculateBasePoints(
  scoring: FanScoring,
  config: ScoringConfig
): { chatPoints: number; commentPoints: number; superChatPoints: number; attendancePoints: number } {
  const chatPoints = Math.min(
    scoring.chatMessages * config.chatPointsPerMessage,
    config.chatDailyCap
  )

  const commentPoints = Math.min(
    scoring.videoComments * config.commentPointsPerComment,
    config.commentDailyCap
  )

  const superChatPoints = Math.floor(scoring.superChatAmountCents * config.superChatMultiplier)

  const attendancePoints = scoring.attendanceStreams.size * config.attendancePoints

  return { chatPoints, commentPoints, superChatPoints, attendancePoints }
}

/**
 * Apply channel multiplier (average across all channels the fan interacted with)
 */
export function applyChannelMultiplier(
  points: number,
  channelIds: Set<string>,
  channelMultipliers: Record<string, number>
): number {
  if (channelIds.size === 0) return points

  let totalMultiplier = 0
  for (const channelId of channelIds) {
    totalMultiplier += channelMultipliers[channelId] ?? 1.0
  }
  const avgMultiplier = totalMultiplier / channelIds.size

  return Math.floor(points * avgMultiplier)
}

/**
 * Apply fraud penalty to points
 */
export function applyFraudPenalty(points: number, flags: FraudFlag[]): number {
  if (flags.length === 0) return points

  // Use the highest penalty percentage among all flags
  const maxPenaltyPercent = Math.max(...flags.map((f) => f.pointsPenaltyPercent))
  const penaltyFraction = maxPenaltyPercent / 100
  return Math.floor(points * (1 - penaltyFraction))
}

/**
 * Main daily scoring function
 */
export async function runDailyScoring(
  config?: Partial<ScoringConfig>
): Promise<DailyScoringResult> {
  const fullConfig: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, ...config }
  const windowEnd = new Date()

  // Find scoring window: query last successful DAILY_SCORING JobRun
  const lastJob = await prisma.jobRun.findFirst({
    where: {
      jobType: 'DAILY_SCORING',
      status: 'COMPLETED',
    },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  })

  const windowStart = lastJob?.completedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)

  logger.info('Daily scoring window', {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  })

  // Aggregate EngagementEvents in the window
  const events = await prisma.engagementEvent.findMany({
    where: {
      occurredAt: {
        gte: windowStart,
        lte: windowEnd,
      },
      fanProfileId: { not: null },
    },
    orderBy: { occurredAt: 'asc' },
  })

  if (events.length === 0) {
    logger.info('No engagement events to score')
    return {
      fansScored: 0,
      totalPointsAwarded: 0,
      fraudFlagged: 0,
      eventsProcessed: 0,
      windowStart,
      windowEnd,
    }
  }

  // Group events by fanProfileId
  const eventsByFan = new Map<string, EngagementEvent[]>()
  for (const event of events) {
    const fanId = event.fanProfileId!
    if (!eventsByFan.has(fanId)) {
      eventsByFan.set(fanId, [])
    }
    eventsByFan.get(fanId)!.push(event)
  }

  let fansScored = 0
  let totalPointsAwarded = 0
  let fraudFlagged = 0

  // Process fans in batches of 500
  const fanIds = Array.from(eventsByFan.keys())
  const BATCH_SIZE = 500

  for (let batchStart = 0; batchStart < fanIds.length; batchStart += BATCH_SIZE) {
    const batchFanIds = fanIds.slice(batchStart, batchStart + BATCH_SIZE)

    // Fetch all FanProfiles in this batch
    const fanProfiles = await prisma.fanProfile.findMany({
      where: { id: { in: batchFanIds } },
    })

    const fanProfileMap = new Map<string, FanProfile>()
    for (const fp of fanProfiles) {
      fanProfileMap.set(fp.id, fp)
    }

    for (const fanId of batchFanIds) {
      const fanEvents = eventsByFan.get(fanId)!
      const fanProfile = fanProfileMap.get(fanId)

      if (!fanProfile) {
        logger.warn('FanProfile not found for scoring', { fanProfileId: fanId })
        continue
      }

      if (fanProfile.isBanned) {
        logger.info('Skipping banned fan', { fanProfileId: fanId })
        continue
      }

      try {
        // Count events by type
        const scoring: FanScoring = {
          chatMessages: 0,
          videoComments: 0,
          superChatAmountCents: 0,
          attendanceStreams: new Set<string>(),
          channelIds: new Set<string>(),
        }

        for (const event of fanEvents) {
          scoring.channelIds.add(event.channelId)

          switch (event.eventType) {
            case 'CHAT_MESSAGE':
              scoring.chatMessages++
              break
            case 'VIDEO_COMMENT':
              scoring.videoComments++
              break
            case 'SUPER_CHAT': {
              const payload = event.payload as Record<string, unknown>
              const amountCents = Number(payload?.amountCents ?? payload?.amount ?? 0)
              scoring.superChatAmountCents += amountCents
              break
            }
            case 'ATTENDANCE':
              if (event.streamId) {
                scoring.attendanceStreams.add(event.streamId)
              }
              break
          }
        }

        // Calculate base points
        const basePoints = calculateBasePoints(scoring, fullConfig)
        const totalBasePoints =
          basePoints.chatPoints +
          basePoints.commentPoints +
          basePoints.superChatPoints +
          basePoints.attendancePoints

        if (totalBasePoints === 0) continue

        // Run batch anti-cheat
        const fraudFlags = runBatchAntiCheat(fanId, fanEvents, fanProfile)

        if (fraudFlags.length > 0) {
          fraudFlagged++

          // Create FraudEvents for each flag
          // FraudEvent requires viewerId, so look up a viewer linked to this fanProfile
          const viewer = await prisma.viewer.findFirst({
            where: { fanProfileId: fanId },
            select: { id: true },
          })

          if (viewer) {
            for (const flag of fraudFlags) {
              await prisma.fraudEvent.create({
                data: {
                  viewerId: viewer.id,
                  eventType: flag.ruleType,
                  severity: flag.severity,
                  description: `Batch anti-cheat: ${flag.ruleType}`,
                  evidence: flag.evidence as Record<string, string | number | boolean>,
                  trustPenaltyApplied: flag.trustPenalty,
                },
              })
            }
          }
        }

        // Apply channel multiplier and fraud penalty per-category (bottom-up)
        // This ensures the sum of per-category penalized amounts equals finalPoints exactly,
        // avoiding rounding desync between totalPoints and availablePoints.
        const chatCommentPenalized = applyFraudPenalty(
          applyChannelMultiplier(
            basePoints.chatPoints + basePoints.commentPoints,
            scoring.channelIds,
            fullConfig.channelMultipliers
          ),
          fraudFlags
        )
        const superChatPenalized = applyFraudPenalty(
          applyChannelMultiplier(
            basePoints.superChatPoints,
            scoring.channelIds,
            fullConfig.channelMultipliers
          ),
          fraudFlags
        )
        const attendancePenalized = applyFraudPenalty(
          applyChannelMultiplier(
            basePoints.attendancePoints,
            scoring.channelIds,
            fullConfig.channelMultipliers
          ),
          fraudFlags
        )

        // finalPoints is the sum of individually-penalized categories (bottom-up)
        const finalPoints = chatCommentPenalized + superChatPenalized + attendancePenalized

        if (finalPoints <= 0) continue

        // Wrap ledger creates + profile update in a transaction for atomicity
        await prisma.$transaction(async (tx) => {
          // Read current FanProfile inside transaction for consistent balance
          const currentProfile = await tx.fanProfile.findUnique({
            where: { id: fanId },
          })

          if (!currentProfile) return

          let runningBalance = currentProfile.totalPoints

          // Create ledger entries for each type of points earned
          const ledgerEntries: {
            type: TransactionType
            amount: number
          }[] = []

          if (chatCommentPenalized > 0) {
            ledgerEntries.push({ type: 'CHAT_ACTIVITY', amount: chatCommentPenalized })
          }
          if (superChatPenalized > 0) {
            ledgerEntries.push({ type: 'SUPER_CHAT_BONUS', amount: superChatPenalized })
          }
          if (attendancePenalized > 0) {
            ledgerEntries.push({ type: 'ATTENDANCE_BONUS', amount: attendancePenalized })
          }

          for (const entry of ledgerEntries) {
            const balanceBefore = runningBalance
            runningBalance += entry.amount

            await tx.pointLedger.create({
              data: {
                fanProfileId: fanId,
                type: entry.type,
                amount: entry.amount,
                balanceBefore,
                balanceAfter: runningBalance,
                description: `Daily scoring: ${entry.type} (${windowStart.toISOString().split('T')[0]})`,
                referenceType: 'DAILY_SCORING',
              },
            })
          }

          // Update FanProfile totals - finalPoints equals sum of ledger entries
          await tx.fanProfile.update({
            where: { id: fanId },
            data: {
              totalPoints: runningBalance,
              availablePoints: { increment: finalPoints },
              lifetimePoints: { increment: finalPoints },
            },
          })
        }, { isolationLevel: 'ReadCommitted' })

        fansScored++
        totalPointsAwarded += finalPoints
      } catch (error) {
        logger.error('Error scoring fan', error, { fanProfileId: fanId })
      }
    }
  }

  logger.info('Daily scoring complete', {
    fansScored,
    totalPointsAwarded,
    fraudFlagged,
    eventsProcessed: events.length,
  })

  return {
    fansScored,
    totalPointsAwarded,
    fraudFlagged,
    eventsProcessed: events.length,
    windowStart,
    windowEnd,
  }
}
