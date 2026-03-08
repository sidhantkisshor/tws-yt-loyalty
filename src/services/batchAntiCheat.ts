import type { EngagementEvent, FanProfile, FraudEventType, FraudSeverity } from '@prisma/client'

// ============================================
// BATCH ANTI-CHEAT SERVICE
// ============================================
// Runs anti-cheat analysis on daily event batches.
// Separate from the real-time fraud detection in fraudDetection.ts
// which handles redemption-time checks.

export interface FraudFlag {
  fanProfileId: string
  ruleType: FraudEventType
  severity: FraudSeverity
  evidence: Record<string, unknown>
  trustPenalty: number
  pointsPenaltyPercent: number // 0-100, how much to reduce points
}

/**
 * Rule 1: Velocity anomaly — >100 messages in a 1-hour window
 * HIGH severity, 50% point penalty
 */
export function detectVelocityAnomaly(events: EngagementEvent[]): FraudFlag | null {
  const chatEvents = events.filter((e) => e.eventType === 'CHAT_MESSAGE')
  if (chatEvents.length === 0) return null

  // Sort by occurredAt
  const sorted = [...chatEvents].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  )

  // Sliding 1-hour window
  const ONE_HOUR_MS = 60 * 60 * 1000
  let maxInWindow = 0

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = sorted[i].occurredAt.getTime()
    const windowEnd = windowStart + ONE_HOUR_MS
    let count = 0
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j].occurredAt.getTime() <= windowEnd) {
        count++
      } else {
        break
      }
    }
    if (count > maxInWindow) {
      maxInWindow = count
    }
  }

  if (maxInWindow > 100) {
    return {
      fanProfileId: events[0].fanProfileId ?? '',
      ruleType: 'MESSAGE_SPAM',
      severity: 'HIGH',
      evidence: {
        maxMessagesInOneHour: maxInWindow,
        threshold: 100,
        totalChatMessages: chatEvents.length,
      },
      trustPenalty: 15,
      pointsPenaltyPercent: 50,
    }
  }

  return null
}

/**
 * Rule 2: Duplicate text — >60% of messages are identical text
 * MEDIUM severity, 30% point penalty
 */
export function detectDuplicateText(events: EngagementEvent[]): FraudFlag | null {
  const chatEvents = events.filter((e) => e.eventType === 'CHAT_MESSAGE')
  if (chatEvents.length < 5) return null // Need minimum sample size

  // Extract message text from payload
  const messages: string[] = []
  for (const event of chatEvents) {
    const payload = event.payload as Record<string, unknown>
    const text = (payload?.messageText ?? payload?.text ?? '') as string
    if (text) {
      messages.push(text.trim().toLowerCase())
    }
  }

  if (messages.length < 5) return null

  // Count occurrences of each message
  const counts = new Map<string, number>()
  for (const msg of messages) {
    counts.set(msg, (counts.get(msg) ?? 0) + 1)
  }

  // Find the most common message
  let maxCount = 0
  let mostCommonMessage = ''
  for (const [msg, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count
      mostCommonMessage = msg
    }
  }

  const duplicateRatio = maxCount / messages.length

  if (duplicateRatio > 0.6) {
    return {
      fanProfileId: events[0].fanProfileId ?? '',
      ruleType: 'PATTERN_DETECTION',
      severity: 'MEDIUM',
      evidence: {
        duplicateRatio: Math.round(duplicateRatio * 100),
        mostCommonMessage:
          mostCommonMessage.length > 100
            ? mostCommonMessage.slice(0, 100) + '...'
            : mostCommonMessage,
        duplicateCount: maxCount,
        totalMessages: messages.length,
        threshold: 60,
      },
      trustPenalty: 10,
      pointsPenaltyPercent: 30,
    }
  }

  return null
}

/**
 * Rule 3: Timing patterns — messages at suspiciously regular intervals
 * (std dev < 500ms over 20+ messages)
 * HIGH severity, 50% penalty
 */
export function detectTimingPatterns(events: EngagementEvent[]): FraudFlag | null {
  const chatEvents = events.filter((e) => e.eventType === 'CHAT_MESSAGE')
  if (chatEvents.length < 20) return null

  // Sort by occurredAt
  const sorted = [...chatEvents].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  )

  // Calculate intervals between consecutive messages
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const interval = sorted[i].occurredAt.getTime() - sorted[i - 1].occurredAt.getTime()
    intervals.push(interval)
  }

  if (intervals.length < 19) return null // Need at least 19 intervals (20 messages)

  // Calculate mean and standard deviation
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const variance =
    intervals.reduce((sum, interval) => sum + Math.pow(interval - mean, 2), 0) /
    intervals.length
  const stdDev = Math.sqrt(variance)

  if (stdDev < 500) {
    return {
      fanProfileId: events[0].fanProfileId ?? '',
      ruleType: 'PATTERN_DETECTION',
      severity: 'HIGH',
      evidence: {
        stdDevMs: Math.round(stdDev),
        meanIntervalMs: Math.round(mean),
        sampleSize: sorted.length,
        threshold: 500,
      },
      trustPenalty: 20,
      pointsPenaltyPercent: 50,
    }
  }

  return null
}

/**
 * Rule 4: Rapid account behavior — account < 24h old with > 50 events
 * LOW severity, 20% penalty
 */
export function detectRapidAccountBehavior(
  fanProfile: FanProfile,
  events: EngagementEvent[]
): FraudFlag | null {
  const accountAgeMs = Date.now() - fanProfile.createdAt.getTime()
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

  if (accountAgeMs < TWENTY_FOUR_HOURS_MS && events.length > 50) {
    return {
      fanProfileId: fanProfile.id,
      ruleType: 'NEW_ACCOUNT',
      severity: 'LOW',
      evidence: {
        accountAgeHours: Math.round(accountAgeMs / (60 * 60 * 1000) * 10) / 10,
        eventCount: events.length,
        threshold: 50,
      },
      trustPenalty: 5,
      pointsPenaltyPercent: 20,
    }
  }

  return null
}

/**
 * Run all batch anti-cheat checks for a fan's events
 */
export function runBatchAntiCheat(
  fanProfileId: string,
  events: EngagementEvent[],
  fanProfile: FanProfile
): FraudFlag[] {
  const flags: FraudFlag[] = []

  const velocityFlag = detectVelocityAnomaly(events)
  if (velocityFlag) {
    velocityFlag.fanProfileId = fanProfileId
    flags.push(velocityFlag)
  }

  const duplicateFlag = detectDuplicateText(events)
  if (duplicateFlag) {
    duplicateFlag.fanProfileId = fanProfileId
    flags.push(duplicateFlag)
  }

  const timingFlag = detectTimingPatterns(events)
  if (timingFlag) {
    timingFlag.fanProfileId = fanProfileId
    flags.push(timingFlag)
  }

  const rapidAccountFlag = detectRapidAccountBehavior(fanProfile, events)
  if (rapidAccountFlag) {
    flags.push(rapidAccountFlag)
  }

  return flags
}
