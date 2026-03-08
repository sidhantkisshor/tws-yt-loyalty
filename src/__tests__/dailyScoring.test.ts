import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock modules with env/DB side effects BEFORE imports
vi.mock('@/lib/prisma', () => ({
  default: {
    jobRun: { findFirst: vi.fn() },
    engagementEvent: { findMany: vi.fn() },
    fanProfile: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    pointLedger: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    fraudEvent: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    viewer: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/redis', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import {
  detectVelocityAnomaly,
  detectDuplicateText,
  detectTimingPatterns,
  detectRapidAccountBehavior,
  runBatchAntiCheat,
} from '@/services/batchAntiCheat'
import {
  calculateBasePoints,
  applyChannelMultiplier,
  applyFraudPenalty,
  DEFAULT_SCORING_CONFIG,
} from '@/services/dailyScoring'
import type { EngagementEvent, FanProfile } from '@prisma/client'

// ============================================
// HELPERS
// ============================================

function makeEvent(
  overrides: Partial<EngagementEvent> & { eventType: EngagementEvent['eventType'] }
): EngagementEvent {
  const { eventType, ...rest } = overrides
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    fanProfileId: 'fan-1',
    channelId: 'ch-1',
    streamId: 'stream-1',
    externalId: `ext-${Math.random().toString(36).slice(2)}`,
    eventType,
    payload: {},
    occurredAt: new Date(),
    ingestedAt: new Date(),
    ...rest,
  }
}

function makeFanProfile(overrides?: Partial<FanProfile>): FanProfile {
  return {
    id: 'fan-1',
    googleId: 'google-1',
    email: 'test@example.com',
    displayName: 'Test Fan',
    profileImageUrl: null,
    totalPoints: 100,
    availablePoints: 100,
    lifetimePoints: 100,
    rank: 'PAPER_TRADER',
    trustScore: 50.0,
    currentStreak: 0,
    longestStreak: 0,
    isBanned: false,
    banReason: null,
    bannedAt: null,
    workspaceId: null,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    updatedAt: new Date(),
    ...overrides,
  }
}

// ============================================
// BATCH ANTI-CHEAT TESTS
// ============================================

describe('batchAntiCheat', () => {
  describe('detectVelocityAnomaly', () => {
    it('returns null when under 100 messages per hour', () => {
      const events = Array.from({ length: 50 }, (_, i) =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          occurredAt: new Date(Date.now() - i * 60000), // 1 per minute
        })
      )
      expect(detectVelocityAnomaly(events)).toBeNull()
    })

    it('flags when >100 messages in a 1-hour window', () => {
      // 110 messages in 30 minutes (all within 1 hour)
      const events = Array.from({ length: 110 }, (_, i) =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          occurredAt: new Date(Date.now() - i * 15000), // every 15 seconds
        })
      )
      const flag = detectVelocityAnomaly(events)
      expect(flag).not.toBeNull()
      expect(flag!.ruleType).toBe('MESSAGE_SPAM')
      expect(flag!.severity).toBe('HIGH')
      expect(flag!.pointsPenaltyPercent).toBe(50)
    })

    it('returns null for non-chat events only', () => {
      const events = Array.from({ length: 120 }, (_, i) =>
        makeEvent({
          eventType: 'VIDEO_COMMENT',
          occurredAt: new Date(Date.now() - i * 10000),
        })
      )
      expect(detectVelocityAnomaly(events)).toBeNull()
    })

    it('returns null for empty events', () => {
      expect(detectVelocityAnomaly([])).toBeNull()
    })
  })

  describe('detectDuplicateText', () => {
    it('returns null when messages are diverse', () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          payload: { messageText: `unique message ${i}` },
        })
      )
      expect(detectDuplicateText(events)).toBeNull()
    })

    it('flags when >60% of messages are identical', () => {
      const events: EngagementEvent[] = []
      // 8 identical messages out of 10 = 80%
      for (let i = 0; i < 8; i++) {
        events.push(
          makeEvent({
            eventType: 'CHAT_MESSAGE',
            payload: { messageText: 'spam message' },
          })
        )
      }
      for (let i = 0; i < 2; i++) {
        events.push(
          makeEvent({
            eventType: 'CHAT_MESSAGE',
            payload: { messageText: `unique ${i}` },
          })
        )
      }

      const flag = detectDuplicateText(events)
      expect(flag).not.toBeNull()
      expect(flag!.ruleType).toBe('PATTERN_DETECTION')
      expect(flag!.severity).toBe('MEDIUM')
      expect(flag!.pointsPenaltyPercent).toBe(30)
    })

    it('returns null for fewer than 5 messages', () => {
      const events = Array.from({ length: 3 }, () =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          payload: { messageText: 'same' },
        })
      )
      expect(detectDuplicateText(events)).toBeNull()
    })

    it('is case-insensitive when checking duplicates', () => {
      const events: EngagementEvent[] = []
      for (let i = 0; i < 7; i++) {
        events.push(
          makeEvent({
            eventType: 'CHAT_MESSAGE',
            payload: { messageText: i % 2 === 0 ? 'SPAM' : 'spam' },
          })
        )
      }
      for (let i = 0; i < 3; i++) {
        events.push(
          makeEvent({
            eventType: 'CHAT_MESSAGE',
            payload: { messageText: `unique ${i}` },
          })
        )
      }
      // 7/10 = 70% identical (case-insensitive)
      const flag = detectDuplicateText(events)
      expect(flag).not.toBeNull()
      expect(flag!.pointsPenaltyPercent).toBe(30)
    })
  })

  describe('detectTimingPatterns', () => {
    it('returns null when fewer than 20 messages', () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          occurredAt: new Date(Date.now() - i * 5000),
        })
      )
      expect(detectTimingPatterns(events)).toBeNull()
    })

    it('flags when messages have suspiciously regular intervals (stdDev < 500ms)', () => {
      // 25 messages at exactly 5-second intervals (stdDev = 0)
      const baseTime = Date.now()
      const events = Array.from({ length: 25 }, (_, i) =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          occurredAt: new Date(baseTime + i * 5000),
        })
      )
      const flag = detectTimingPatterns(events)
      expect(flag).not.toBeNull()
      expect(flag!.ruleType).toBe('PATTERN_DETECTION')
      expect(flag!.severity).toBe('HIGH')
      expect(flag!.pointsPenaltyPercent).toBe(50)
    })

    it('returns null when timing has natural variance', () => {
      const baseTime = Date.now()
      const events = Array.from({ length: 25 }, (_, i) =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          // Random intervals between 2-15 seconds
          occurredAt: new Date(baseTime + i * 8000 + Math.random() * 10000),
        })
      )
      const flag = detectTimingPatterns(events)
      // With large random variance, stdDev should be well above 500ms
      expect(flag).toBeNull()
    })
  })

  describe('detectRapidAccountBehavior', () => {
    it('returns null for old accounts', () => {
      const fanProfile = makeFanProfile({
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days old
      })
      const events = Array.from({ length: 100 }, () =>
        makeEvent({ eventType: 'CHAT_MESSAGE' })
      )
      expect(detectRapidAccountBehavior(fanProfile, events)).toBeNull()
    })

    it('returns null for new accounts with few events', () => {
      const fanProfile = makeFanProfile({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours old
      })
      const events = Array.from({ length: 10 }, () =>
        makeEvent({ eventType: 'CHAT_MESSAGE' })
      )
      expect(detectRapidAccountBehavior(fanProfile, events)).toBeNull()
    })

    it('flags new account with >50 events', () => {
      const fanProfile = makeFanProfile({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours old
      })
      const events = Array.from({ length: 51 }, () =>
        makeEvent({ eventType: 'CHAT_MESSAGE' })
      )
      const flag = detectRapidAccountBehavior(fanProfile, events)
      expect(flag).not.toBeNull()
      expect(flag!.ruleType).toBe('NEW_ACCOUNT')
      expect(flag!.severity).toBe('LOW')
      expect(flag!.pointsPenaltyPercent).toBe(20)
    })
  })

  describe('runBatchAntiCheat', () => {
    it('returns empty array for clean fan', () => {
      const fanProfile = makeFanProfile()
      const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          payload: { messageText: `message ${i}` },
          occurredAt: new Date(Date.now() - i * 120000), // 2min intervals
        })
      )
      const flags = runBatchAntiCheat('fan-1', events, fanProfile)
      expect(flags).toHaveLength(0)
    })

    it('returns multiple flags when multiple rules trigger', () => {
      // New account (< 24h) with many events at regular intervals
      const fanProfile = makeFanProfile({
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour old
      })
      const baseTime = Date.now()
      // 110 messages at exact 10s intervals, all identical text
      const events = Array.from({ length: 110 }, (_, i) =>
        makeEvent({
          eventType: 'CHAT_MESSAGE',
          payload: { messageText: 'bot message' },
          occurredAt: new Date(baseTime + i * 10000),
        })
      )
      const flags = runBatchAntiCheat('fan-1', events, fanProfile)
      // Should get: velocity anomaly, duplicate text, timing patterns, rapid account
      expect(flags.length).toBeGreaterThanOrEqual(3)
      const ruleTypes = flags.map((f) => f.ruleType)
      expect(ruleTypes).toContain('MESSAGE_SPAM')
      expect(ruleTypes).toContain('PATTERN_DETECTION')
      expect(ruleTypes).toContain('NEW_ACCOUNT')
    })
  })
})

// ============================================
// DAILY SCORING CALCULATION TESTS
// ============================================

describe('dailyScoring', () => {
  describe('DEFAULT_SCORING_CONFIG', () => {
    it('has correct default values', () => {
      expect(DEFAULT_SCORING_CONFIG.chatPointsPerMessage).toBe(1)
      expect(DEFAULT_SCORING_CONFIG.chatDailyCap).toBe(50)
      expect(DEFAULT_SCORING_CONFIG.commentPointsPerComment).toBe(2)
      expect(DEFAULT_SCORING_CONFIG.commentDailyCap).toBe(20)
      expect(DEFAULT_SCORING_CONFIG.superChatMultiplier).toBe(0.1)
      expect(DEFAULT_SCORING_CONFIG.attendancePoints).toBe(5)
      expect(DEFAULT_SCORING_CONFIG.channelMultipliers).toEqual({})
    })
  })

  describe('calculateBasePoints', () => {
    it('calculates chat points correctly', () => {
      const result = calculateBasePoints(
        {
          chatMessages: 30,
          videoComments: 0,
          superChatAmountCents: 0,
          attendanceStreams: new Set(),
          channelIds: new Set(['ch-1']),
        },
        DEFAULT_SCORING_CONFIG
      )
      expect(result.chatPoints).toBe(30)
    })

    it('caps chat points at chatDailyCap', () => {
      const result = calculateBasePoints(
        {
          chatMessages: 100,
          videoComments: 0,
          superChatAmountCents: 0,
          attendanceStreams: new Set(),
          channelIds: new Set(['ch-1']),
        },
        DEFAULT_SCORING_CONFIG
      )
      expect(result.chatPoints).toBe(50) // capped
    })

    it('calculates comment points correctly', () => {
      const result = calculateBasePoints(
        {
          chatMessages: 0,
          videoComments: 8,
          superChatAmountCents: 0,
          attendanceStreams: new Set(),
          channelIds: new Set(['ch-1']),
        },
        DEFAULT_SCORING_CONFIG
      )
      expect(result.commentPoints).toBe(16) // 8 * 2
    })

    it('caps comment points at commentDailyCap', () => {
      const result = calculateBasePoints(
        {
          chatMessages: 0,
          videoComments: 50,
          superChatAmountCents: 0,
          attendanceStreams: new Set(),
          channelIds: new Set(['ch-1']),
        },
        DEFAULT_SCORING_CONFIG
      )
      expect(result.commentPoints).toBe(20) // capped
    })

    it('calculates super chat points correctly', () => {
      const result = calculateBasePoints(
        {
          chatMessages: 0,
          videoComments: 0,
          superChatAmountCents: 5000, // $50.00
          attendanceStreams: new Set(),
          channelIds: new Set(['ch-1']),
        },
        DEFAULT_SCORING_CONFIG
      )
      expect(result.superChatPoints).toBe(500) // 5000 * 0.1
    })

    it('calculates attendance points per unique stream', () => {
      const result = calculateBasePoints(
        {
          chatMessages: 0,
          videoComments: 0,
          superChatAmountCents: 0,
          attendanceStreams: new Set(['s1', 's2', 's3']),
          channelIds: new Set(['ch-1']),
        },
        DEFAULT_SCORING_CONFIG
      )
      expect(result.attendancePoints).toBe(15) // 3 * 5
    })

    it('calculates combined points correctly', () => {
      const result = calculateBasePoints(
        {
          chatMessages: 20,
          videoComments: 5,
          superChatAmountCents: 1000,
          attendanceStreams: new Set(['s1', 's2']),
          channelIds: new Set(['ch-1']),
        },
        DEFAULT_SCORING_CONFIG
      )
      expect(result.chatPoints).toBe(20) // 20 * 1
      expect(result.commentPoints).toBe(10) // 5 * 2
      expect(result.superChatPoints).toBe(100) // 1000 * 0.1
      expect(result.attendancePoints).toBe(10) // 2 * 5
    })
  })

  describe('applyChannelMultiplier', () => {
    it('returns original points when no multiplier configured', () => {
      const result = applyChannelMultiplier(100, new Set(['ch-1']), {})
      expect(result).toBe(100) // default 1.0
    })

    it('applies channel multiplier correctly', () => {
      const result = applyChannelMultiplier(100, new Set(['ch-1']), { 'ch-1': 1.5 })
      expect(result).toBe(150)
    })

    it('averages multipliers across multiple channels', () => {
      const result = applyChannelMultiplier(100, new Set(['ch-1', 'ch-2']), {
        'ch-1': 2.0,
        'ch-2': 1.0,
      })
      // Average multiplier = 1.5
      expect(result).toBe(150)
    })

    it('uses default 1.0 for channels without configured multiplier', () => {
      const result = applyChannelMultiplier(100, new Set(['ch-1', 'ch-2']), {
        'ch-1': 2.0,
        // ch-2 defaults to 1.0
      })
      // Average = (2.0 + 1.0) / 2 = 1.5
      expect(result).toBe(150)
    })

    it('returns original points when no channels', () => {
      const result = applyChannelMultiplier(100, new Set(), { 'ch-1': 2.0 })
      expect(result).toBe(100)
    })

    it('floors the result', () => {
      const result = applyChannelMultiplier(33, new Set(['ch-1']), { 'ch-1': 1.5 })
      expect(result).toBe(49) // floor(33 * 1.5) = floor(49.5) = 49
    })
  })

  describe('applyFraudPenalty', () => {
    it('returns full points when no fraud flags', () => {
      expect(applyFraudPenalty(100, [])).toBe(100)
    })

    it('applies penalty percentage from fraud flags', () => {
      const flags: import('@/services/batchAntiCheat').FraudFlag[] = [
        {
          fanProfileId: 'fan-1',
          ruleType: 'MESSAGE_SPAM',
          severity: 'HIGH',
          evidence: {},
          trustPenalty: 15,
          pointsPenaltyPercent: 50,
        },
      ]
      expect(applyFraudPenalty(100, flags)).toBe(50)
    })

    it('uses the highest penalty when multiple flags', () => {
      const flags: import('@/services/batchAntiCheat').FraudFlag[] = [
        {
          fanProfileId: 'fan-1',
          ruleType: 'PATTERN_DETECTION',
          severity: 'MEDIUM',
          evidence: {},
          trustPenalty: 10,
          pointsPenaltyPercent: 30,
        },
        {
          fanProfileId: 'fan-1',
          ruleType: 'MESSAGE_SPAM',
          severity: 'HIGH',
          evidence: {},
          trustPenalty: 15,
          pointsPenaltyPercent: 50,
        },
      ]
      // Should use 50% (highest), not sum
      expect(applyFraudPenalty(100, flags)).toBe(50)
    })

    it('floors the result after applying penalty', () => {
      const flags: import('@/services/batchAntiCheat').FraudFlag[] = [
        {
          fanProfileId: 'fan-1',
          ruleType: 'NEW_ACCOUNT',
          severity: 'LOW',
          evidence: {},
          trustPenalty: 5,
          pointsPenaltyPercent: 20,
        },
      ]
      expect(applyFraudPenalty(33, flags)).toBe(26) // floor(33 * 0.8) = 26
    })

    it('returns zero for 100% penalty', () => {
      const flags: import('@/services/batchAntiCheat').FraudFlag[] = [
        {
          fanProfileId: 'fan-1',
          ruleType: 'MESSAGE_SPAM',
          severity: 'HIGH',
          evidence: {},
          trustPenalty: 20,
          pointsPenaltyPercent: 100,
        },
      ]
      expect(applyFraudPenalty(100, flags)).toBe(0)
    })
  })

  describe('scoring integration scenarios', () => {
    it('clean fans get full points', () => {
      const scoring = {
        chatMessages: 30,
        videoComments: 5,
        superChatAmountCents: 0,
        attendanceStreams: new Set(['s1']),
        channelIds: new Set(['ch-1']),
      }
      const base = calculateBasePoints(scoring, DEFAULT_SCORING_CONFIG)
      const total = base.chatPoints + base.commentPoints + base.superChatPoints + base.attendancePoints
      const multiplied = applyChannelMultiplier(total, scoring.channelIds, {})
      const final = applyFraudPenalty(multiplied, [])

      expect(base.chatPoints).toBe(30)
      expect(base.commentPoints).toBe(10)
      expect(base.attendancePoints).toBe(5)
      expect(total).toBe(45)
      expect(final).toBe(45) // No penalty
    })

    it('flagged fans get reduced points', () => {
      const scoring = {
        chatMessages: 30,
        videoComments: 5,
        superChatAmountCents: 0,
        attendanceStreams: new Set(['s1']),
        channelIds: new Set(['ch-1']),
      }
      const base = calculateBasePoints(scoring, DEFAULT_SCORING_CONFIG)
      const total = base.chatPoints + base.commentPoints + base.superChatPoints + base.attendancePoints
      const multiplied = applyChannelMultiplier(total, scoring.channelIds, {})
      const flags: import('@/services/batchAntiCheat').FraudFlag[] = [
        {
          fanProfileId: 'fan-1',
          ruleType: 'MESSAGE_SPAM',
          severity: 'HIGH',
          evidence: {},
          trustPenalty: 15,
          pointsPenaltyPercent: 50,
        },
      ]
      const final = applyFraudPenalty(multiplied, flags)

      expect(total).toBe(45)
      expect(final).toBe(22) // floor(45 * 0.5) = 22
    })

    it('channel multiplier stacks with scoring', () => {
      const scoring = {
        chatMessages: 40,
        videoComments: 0,
        superChatAmountCents: 0,
        attendanceStreams: new Set<string>(),
        channelIds: new Set(['ch-1']),
      }
      const base = calculateBasePoints(scoring, DEFAULT_SCORING_CONFIG)
      const total = base.chatPoints + base.commentPoints + base.superChatPoints + base.attendancePoints
      const multiplied = applyChannelMultiplier(total, scoring.channelIds, {
        'ch-1': 2.0,
      })
      expect(total).toBe(40)
      expect(multiplied).toBe(80) // 40 * 2.0
    })
  })
})
