# Cross-Channel Loyalty System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the existing YouTube livestream loyalty system with new tier names, prestige tiers, funnel-aligned rewards, referral system, chat commands, stream overlay, superfan segmentation, webhooks, and analytics.

**Architecture:** Extend the existing Next.js 15 + Prisma + Upstash Redis stack. Schema-first approach — migrate the database, then update services, then API routes, then UI. All new features follow existing patterns (Zod validation, rate limiting, SERIALIZABLE transactions).

**Tech Stack:** Next.js 15, Prisma 7.2, PostgreSQL, Upstash Redis, Vitest, Zod 4, TypeScript 5

**Design Doc:** `docs/plans/2026-03-07-cross-channel-loyalty-system-design.md`

---

## Phase 1: Schema & Database Migration

### Task 1: Update Enums and Viewer Model

**Files:**
- Modify: `prisma/schema.prisma:183-189` (ViewerRank enum)
- Modify: `prisma/schema.prisma:398-409` (TransactionType enum)
- Modify: `prisma/schema.prisma:118-181` (Viewer model)
- Modify: `prisma/schema.prisma:521-562` (RewardConfig model)
- Modify: `prisma/schema.prisma:195-238` (Stream model)

**Step 1: Update ViewerRank enum**

Replace the existing enum at lines 183-189 with:

```prisma
enum ViewerRank {
  PAPER_TRADER
  RETAIL_TRADER
  SWING_TRADER
  FUND_MANAGER
  MARKET_MAKER
  HEDGE_FUND
  WHALE
}
```

**Step 2: Add new TransactionType values**

Add to enum at lines 398-409:

```prisma
enum TransactionType {
  CODE_REDEMPTION
  CHAT_ACTIVITY
  ATTENDANCE_BONUS
  STREAK_BONUS
  RANK_BONUS
  WATCH_TIME
  MANUAL_CREDIT
  MANUAL_DEBIT
  REWARD_REDEMPTION
  FRAUD_REVERSAL
  REFERRAL_BONUS
  HOMEWORK_SUBMISSION
  POLL_PARTICIPATION
  CTA_BONUS
  QUALITY_QUESTION
  HELPFUL_UPVOTE
  STREAK_MILESTONE
  COURSE_COMPLETION
  MODULE_COMPLETION
  STREAK_PAUSE_COST
}
```

**Step 3: Add new fields to Viewer model**

Add after line 155 (`totalWatchTimeMinutes`):

```prisma
  // Prestige tier fields
  hasPurchasedCourse      Boolean   @default(false)
  hasPurchasedPremiumCohort Boolean  @default(false)
  courseCompleted          Boolean   @default(false)
  premiumCohortCompleted  Boolean   @default(false)
  purchasedCourseId       String?
  purchasedCohortId       String?

  // Community contribution
  helpfulUpvotesReceived  Int       @default(0)
  helpfulUpvotesGiven     Int       @default(0)
  qualityQuestionsCount   Int       @default(0)
  homeworkSubmissions      Int       @default(0)

  // Referral tracking
  referralCode            String?   @unique
  referredById            String?

  // Streak pause
  activePauseType         String?   // "3day" or "7day"
  pauseStartedAt          DateTime?
  pauseEndsAt             DateTime?
  shortPausesUsedThisMonth Int      @default(0)
  longPausesUsedThisMonth  Int      @default(0)
  lastPauseResetMonth     Int?

  // Segment
  currentSegment          String?   // "warming_lead", "hot_lead", "at_risk", "superfan", "whale_candidate"
  segmentUpdatedAt        DateTime?
```

**Step 4: Add CTA timestamp to Stream model**

Add after line 214 (`quotaUsedThisStream`):

```prisma
  // CTA tracking
  ctaTimestamp            DateTime?   // When the CTA moment happens
  ctaPointsAwarded        Boolean   @default(false)
```

**Step 5: Update RewardConfig model**

Add new enum and field. Add before the RewardConfig model:

```prisma
enum RewardCategory {
  GATEWAY
  ENGAGEMENT
  COMMITMENT
  PREMIUM
  PRESTIGE
  ROTATING
}
```

Add to RewardConfig after line 551 (`minRank`):

```prisma
  category              RewardCategory @default(GATEWAY)
  funnelPosition        Int            @default(0)  // Order in value ladder
  externalCourseId      String?        // LMS course ID for auto-enrollment
  externalModuleId      String?        // LMS module ID for unlock
  isLimitedTime         Boolean        @default(false)
  limitedTimeEndsAt     DateTime?
```

**Step 6: Run migration**

```bash
cd "/mnt/e/Dev Projects/Cursor/YT Loyalty/yt-loyalty"
npx prisma migrate dev --name add_loyalty_v2_enums_and_fields
```

**Step 7: Commit**

```bash
git add prisma/
git commit -m "feat: add loyalty v2 schema - new tiers, referrals, CTA, segments"
```

---

### Task 2: Add Referral, Poll, Homework, and Webhook Models

**Files:**
- Modify: `prisma/schema.prisma` (add new models at end of file)

**Step 1: Add new models**

Append to the end of schema.prisma:

```prisma
// ─── Referral System ───

model Referral {
  id              String    @id @default(cuid())
  referrerId      String
  referredId      String
  channelId       String

  referredAttended  Boolean @default(false)
  referredPurchased Boolean @default(false)
  referrerPointsAwarded Int @default(0)
  referredPointsAwarded Int @default(0)

  createdAt       DateTime  @default(now())
  convertedAt     DateTime?

  referrer        Viewer    @relation("ReferralsMade", fields: [referrerId], references: [id], onDelete: Cascade)
  referred        Viewer    @relation("ReferralsReceived", fields: [referredId], references: [id], onDelete: Cascade)
  channel         Channel   @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([referrerId, referredId, channelId])
  @@index([referrerId])
  @@index([referredId])
  @@index([channelId])
}

// ─── Stream Polls ───

model StreamPoll {
  id              String    @id @default(cuid())
  streamId        String
  question        String
  options         Json      // ["Option A", "Option B", ...]
  isActive        Boolean   @default(true)
  closedAt        DateTime?
  createdAt       DateTime  @default(now())

  stream          Stream    @relation(fields: [streamId], references: [id], onDelete: Cascade)
  responses       PollResponse[]

  @@index([streamId])
}

model PollResponse {
  id              String    @id @default(cuid())
  pollId          String
  viewerId        String
  selectedOption  Int       // Index of chosen option
  pointsAwarded   Int       @default(15)
  createdAt       DateTime  @default(now())

  poll            StreamPoll @relation(fields: [pollId], references: [id], onDelete: Cascade)
  viewer          Viewer     @relation(fields: [viewerId], references: [id], onDelete: Cascade)

  @@unique([pollId, viewerId]) // One vote per viewer per poll
  @@index([viewerId])
}

// ─── Homework Submissions ───

model HomeworkSubmission {
  id              String    @id @default(cuid())
  viewerId        String
  channelId       String
  title           String
  content         String    // Description or link to submission
  imageUrl        String?
  status          HomeworkStatus @default(PENDING)
  reviewedBy      String?   // Mod who verified
  pointsAwarded   Int       @default(0)
  createdAt       DateTime  @default(now())
  reviewedAt      DateTime?

  viewer          Viewer    @relation(fields: [viewerId], references: [id], onDelete: Cascade)
  channel         Channel   @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([viewerId])
  @@index([channelId])
  @@index([status])
}

enum HomeworkStatus {
  PENDING
  APPROVED
  REJECTED
}

// ─── Webhook Configuration ───

model WebhookConfig {
  id              String    @id @default(cuid())
  channelId       String
  url             String
  events          Json      // ["viewer.tier_changed", "viewer.reward_redeemed", ...]
  secret          String    // HMAC signing secret
  isActive        Boolean   @default(true)
  lastTriggeredAt DateTime?
  failureCount    Int       @default(0)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  channel         Channel   @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId])
}

model WebhookDelivery {
  id              String    @id @default(cuid())
  webhookId       String
  event           String
  payload         Json
  statusCode      Int?
  response        String?
  deliveredAt     DateTime?
  createdAt       DateTime  @default(now())

  @@index([webhookId])
  @@index([event])
}

// ─── Helpful Upvotes ───

model HelpfulUpvote {
  id              String    @id @default(cuid())
  giverId         String
  receiverId      String
  streamId        String
  createdAt       DateTime  @default(now())

  giver           Viewer    @relation("UpvotesGiven", fields: [giverId], references: [id], onDelete: Cascade)
  receiver        Viewer    @relation("UpvotesReceived", fields: [receiverId], references: [id], onDelete: Cascade)
  stream          Stream    @relation(fields: [streamId], references: [id], onDelete: Cascade)

  @@unique([giverId, receiverId, streamId]) // One upvote per pair per stream
  @@index([receiverId])
  @@index([streamId])
}

// ─── Streak Pause Log ───

model StreakPause {
  id              String    @id @default(cuid())
  viewerId        String
  pauseType       String    // "3day" or "7day"
  pointsCost      Int       @default(0)
  startedAt       DateTime
  endsAt          DateTime
  wasUsed         Boolean   @default(true) // Did the pause actually prevent a streak break?
  createdAt       DateTime  @default(now())

  viewer          Viewer    @relation(fields: [viewerId], references: [id], onDelete: Cascade)

  @@index([viewerId])
}
```

**Step 2: Add relations to existing models**

Add to Viewer model relations (after line 169):

```prisma
  referralsMade       Referral[]          @relation("ReferralsMade")
  referralsReceived   Referral[]          @relation("ReferralsReceived")
  pollResponses       PollResponse[]
  homeworkSubmissions  HomeworkSubmission[] @relation("ViewerHomework")
  upvotesGiven        HelpfulUpvote[]     @relation("UpvotesGiven")
  upvotesReceived     HelpfulUpvote[]     @relation("UpvotesReceived")
  streakPauses        StreakPause[]
  referredBy          Viewer?             @relation("ViewerReferrals", fields: [referredById], references: [id])
  referredViewers     Viewer[]            @relation("ViewerReferrals")
```

Add to Stream model relations (after line 232):

```prisma
  polls               StreamPoll[]
  helpfulUpvotes      HelpfulUpvote[]
```

Add to Channel model relations:

```prisma
  referrals           Referral[]
  homeworkSubmissions  HomeworkSubmission[]
  webhookConfigs      WebhookConfig[]
```

**Step 3: Run migration**

```bash
npx prisma migrate dev --name add_referral_poll_homework_webhook_models
```

**Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add referral, poll, homework, webhook, upvote models"
```

---

## Phase 2: Core Service Updates

### Task 3: Update Rank Thresholds and Multiplier System

**Files:**
- Modify: `src/services/messageProcessor.ts:456-462` (rank thresholds)
- Modify: `src/services/bonusCalculator.ts:5-15` (rank bonuses → multipliers)
- Create: `src/lib/ranks.ts` (centralized rank config)
- Test: `src/__tests__/ranks.test.ts`

**Step 1: Create centralized rank config**

Write the failing test first:

```typescript
// src/__tests__/ranks.test.ts
import { describe, it, expect } from 'vitest'
import {
  RANK_THRESHOLDS,
  RANK_MULTIPLIERS,
  getRankForPoints,
  getMultiplierForViewer,
  isPrestigeTier,
  RANK_BADGE_COLORS,
} from '@/lib/ranks'

describe('ranks', () => {
  describe('getRankForPoints', () => {
    it('returns PAPER_TRADER for 0 points', () => {
      expect(getRankForPoints(0)).toBe('PAPER_TRADER')
    })

    it('returns RETAIL_TRADER at 2500 points', () => {
      expect(getRankForPoints(2500)).toBe('RETAIL_TRADER')
    })

    it('returns SWING_TRADER at 10000 points', () => {
      expect(getRankForPoints(10000)).toBe('SWING_TRADER')
    })

    it('returns FUND_MANAGER at 35000 points', () => {
      expect(getRankForPoints(35000)).toBe('FUND_MANAGER')
    })

    it('returns MARKET_MAKER at 100000 points', () => {
      expect(getRankForPoints(100000)).toBe('MARKET_MAKER')
    })

    it('does not return prestige tiers based on points alone', () => {
      expect(getRankForPoints(200000)).toBe('MARKET_MAKER')
      expect(getRankForPoints(500000)).toBe('MARKET_MAKER')
    })
  })

  describe('isPrestigeTier', () => {
    it('returns true for HEDGE_FUND and WHALE', () => {
      expect(isPrestigeTier('HEDGE_FUND')).toBe(true)
      expect(isPrestigeTier('WHALE')).toBe(true)
    })

    it('returns false for free tiers', () => {
      expect(isPrestigeTier('PAPER_TRADER')).toBe(false)
      expect(isPrestigeTier('MARKET_MAKER')).toBe(false)
    })
  })

  describe('getMultiplierForViewer', () => {
    it('returns 1.0 for regular viewer', () => {
      const viewer = { isMember: false, isModerator: false, hasPurchasedCourse: false, hasPurchasedPremiumCohort: false }
      expect(getMultiplierForViewer(viewer)).toBe(1.0)
    })

    it('returns 1.25 for YouTube member', () => {
      const viewer = { isMember: true, isModerator: false, hasPurchasedCourse: false, hasPurchasedPremiumCohort: false }
      expect(getMultiplierForViewer(viewer)).toBe(1.25)
    })

    it('returns 1.5 for moderator', () => {
      const viewer = { isMember: false, isModerator: true, hasPurchasedCourse: false, hasPurchasedPremiumCohort: false }
      expect(getMultiplierForViewer(viewer)).toBe(1.5)
    })

    it('caps at 2.0 when multiple multipliers stack', () => {
      const viewer = { isMember: true, isModerator: true, hasPurchasedCourse: true, hasPurchasedPremiumCohort: true }
      expect(getMultiplierForViewer(viewer)).toBe(2.0)
    })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/ranks.test.ts
```

Expected: FAIL — module not found

**Step 3: Implement rank config**

```typescript
// src/lib/ranks.ts

export const RANK_THRESHOLDS = {
  PAPER_TRADER: 0,
  RETAIL_TRADER: 2500,
  SWING_TRADER: 10000,
  FUND_MANAGER: 35000,
  MARKET_MAKER: 100000,
  HEDGE_FUND: 200000,  // + achievement conditions
  WHALE: 400000,        // + achievement conditions
} as const

export const RANK_EARNING_BOOST = {
  PAPER_TRADER: 0,
  RETAIL_TRADER: 0.10,
  SWING_TRADER: 0.20,
  FUND_MANAGER: 0.35,
  MARKET_MAKER: 0.50,
  HEDGE_FUND: 0.50,
  WHALE: 0.50,
} as const

export const RANK_BADGE_COLORS = {
  PAPER_TRADER: 'gray',
  RETAIL_TRADER: 'green',
  SWING_TRADER: 'blue',
  FUND_MANAGER: 'purple',
  MARKET_MAKER: 'gold',
  HEDGE_FUND: 'platinum',
  WHALE: 'animated',
} as const

export const TIER_MAINTENANCE_90DAY = {
  RETAIL_TRADER: 750,
  SWING_TRADER: 3000,
  FUND_MANAGER: 10500,
  MARKET_MAKER: 30000,
} as const

export const PRESTIGE_REQUIREMENTS = {
  HEDGE_FUND: {
    lifetimePoints: 200000,
    requiresCourse: true,
    requiresCourseCompletion: true,
    minStreamsAttended: 400,
    minAccountAgeMonths: 12,
    minHelpfulUpvotes: 50,
  },
  WHALE: {
    lifetimePoints: 400000,
    requiresPremiumCohort: true,
    requiresCohortCompletion: true,
    minStreamsAttended: 800,
    minAccountAgeMonths: 24,
    minHelpfulUpvotes: 200,
  },
} as const

const STATUS_MULTIPLIERS = {
  member: 1.25,
  moderator: 1.5,
  courseBuyer: 1.3,
  premiumCohortBuyer: 1.5,
} as const

const MAX_MULTIPLIER = 2.0

type FreeTier = 'PAPER_TRADER' | 'RETAIL_TRADER' | 'SWING_TRADER' | 'FUND_MANAGER' | 'MARKET_MAKER'
type PrestigeTier = 'HEDGE_FUND' | 'WHALE'
export type RankName = FreeTier | PrestigeTier

export function getRankForPoints(lifetimePoints: number): FreeTier {
  if (lifetimePoints >= RANK_THRESHOLDS.MARKET_MAKER) return 'MARKET_MAKER'
  if (lifetimePoints >= RANK_THRESHOLDS.FUND_MANAGER) return 'FUND_MANAGER'
  if (lifetimePoints >= RANK_THRESHOLDS.SWING_TRADER) return 'SWING_TRADER'
  if (lifetimePoints >= RANK_THRESHOLDS.RETAIL_TRADER) return 'RETAIL_TRADER'
  return 'PAPER_TRADER'
}

export function isPrestigeTier(rank: string): boolean {
  return rank === 'HEDGE_FUND' || rank === 'WHALE'
}

interface ViewerMultiplierInput {
  isMember: boolean
  isModerator: boolean
  hasPurchasedCourse: boolean
  hasPurchasedPremiumCohort: boolean
}

export function getMultiplierForViewer(viewer: ViewerMultiplierInput): number {
  let multiplier = 1.0

  if (viewer.isMember) multiplier *= STATUS_MULTIPLIERS.member
  if (viewer.isModerator) multiplier *= STATUS_MULTIPLIERS.moderator
  if (viewer.hasPurchasedCourse) multiplier *= STATUS_MULTIPLIERS.courseBuyer
  if (viewer.hasPurchasedPremiumCohort) multiplier *= STATUS_MULTIPLIERS.premiumCohortBuyer

  return Math.min(multiplier, MAX_MULTIPLIER)
}

interface PrestigeCheckInput {
  lifetimePoints: number
  hasPurchasedCourse: boolean
  hasPurchasedPremiumCohort: boolean
  courseCompleted: boolean
  premiumCohortCompleted: boolean
  totalStreamsAttended: number
  createdAt: Date
  helpfulUpvotesReceived: number
}

export function checkPrestigeEligibility(viewer: PrestigeCheckInput): RankName | null {
  const accountAgeMonths = Math.floor(
    (Date.now() - viewer.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
  )

  const whaleReqs = PRESTIGE_REQUIREMENTS.WHALE
  if (
    viewer.lifetimePoints >= whaleReqs.lifetimePoints &&
    viewer.hasPurchasedPremiumCohort &&
    viewer.premiumCohortCompleted &&
    viewer.totalStreamsAttended >= whaleReqs.minStreamsAttended &&
    accountAgeMonths >= whaleReqs.minAccountAgeMonths &&
    viewer.helpfulUpvotesReceived >= whaleReqs.minHelpfulUpvotes
  ) {
    return 'WHALE'
  }

  const hfReqs = PRESTIGE_REQUIREMENTS.HEDGE_FUND
  if (
    viewer.lifetimePoints >= hfReqs.lifetimePoints &&
    viewer.hasPurchasedCourse &&
    viewer.courseCompleted &&
    viewer.totalStreamsAttended >= hfReqs.minStreamsAttended &&
    accountAgeMonths >= hfReqs.minAccountAgeMonths &&
    viewer.helpfulUpvotesReceived >= hfReqs.minHelpfulUpvotes
  ) {
    return 'HEDGE_FUND'
  }

  return null
}
```

**Step 4: Run tests and verify they pass**

```bash
npx vitest run src/__tests__/ranks.test.ts
```

Expected: PASS

**Step 5: Update messageProcessor.ts rank thresholds**

Replace lines 456-462 in `src/services/messageProcessor.ts` with an import:

```typescript
import { getRankForPoints } from '@/lib/ranks'
```

Replace the inline rank calculation with `getRankForPoints(viewer.lifetimePoints)`.

**Step 6: Update bonusCalculator.ts rank bonuses**

Replace the RANK_BONUSES object at lines 9-15 in `src/services/bonusCalculator.ts` with:

```typescript
import { RANK_EARNING_BOOST } from '@/lib/ranks'
```

Use `RANK_EARNING_BOOST[viewer.rank]` instead of the old `RANK_BONUSES` lookup.

**Step 7: Update viewer/page.tsx rank display**

Replace the rank config at lines 38-77 in `src/app/viewer/page.tsx` with imports from `@/lib/ranks`.

**Step 8: Commit**

```bash
git add src/lib/ranks.ts src/__tests__/ranks.test.ts src/services/messageProcessor.ts src/services/bonusCalculator.ts src/app/viewer/page.tsx
git commit -m "feat: centralized rank config with new tier names and multipliers"
```

---

### Task 4: Streak Milestones and Pause System

**Files:**
- Create: `src/services/streakManager.ts`
- Test: `src/__tests__/streakManager.test.ts`
- Modify: `src/services/bonusCalculator.ts:136-211` (extract streak logic)

**Step 1: Write failing tests**

```typescript
// src/__tests__/streakManager.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  calculateStreakBonus,
  getStreakMilestoneBonus,
  canActivatePause,
  STREAK_MILESTONES,
} from '@/services/streakManager'

describe('streakManager', () => {
  describe('calculateStreakBonus', () => {
    it('returns 0 for day 1 (no streak yet)', () => {
      expect(calculateStreakBonus(1)).toBe(0)
    })

    it('returns 10 for day 2', () => {
      expect(calculateStreakBonus(2)).toBe(10)
    })

    it('returns 15 for day 3', () => {
      expect(calculateStreakBonus(3)).toBe(15)
    })

    it('returns 20 for day 4', () => {
      expect(calculateStreakBonus(4)).toBe(20)
    })

    it('caps at 25 for day 5+', () => {
      expect(calculateStreakBonus(5)).toBe(25)
      expect(calculateStreakBonus(100)).toBe(25)
    })
  })

  describe('getStreakMilestoneBonus', () => {
    it('returns 100 at 7-day milestone', () => {
      expect(getStreakMilestoneBonus(7)).toBe(100)
    })

    it('returns 400 at 30-day milestone', () => {
      expect(getStreakMilestoneBonus(30)).toBe(400)
    })

    it('returns 7500 at 365-day milestone', () => {
      expect(getStreakMilestoneBonus(365)).toBe(7500)
    })

    it('returns 0 for non-milestone days', () => {
      expect(getStreakMilestoneBonus(8)).toBe(0)
      expect(getStreakMilestoneBonus(29)).toBe(0)
    })
  })

  describe('canActivatePause', () => {
    it('allows 3-day pause when under monthly limit', () => {
      expect(canActivatePause('3day', 0, 0, null)).toBe(true)
      expect(canActivatePause('3day', 1, 0, null)).toBe(true)
    })

    it('blocks 3-day pause when 2 already used this month', () => {
      expect(canActivatePause('3day', 2, 0, null)).toBe(false)
    })

    it('allows 7-day pause when under monthly limit', () => {
      expect(canActivatePause('7day', 0, 0, null)).toBe(true)
    })

    it('blocks 7-day pause when 1 already used this month', () => {
      expect(canActivatePause('7day', 0, 1, null)).toBe(false)
    })

    it('blocks any pause when another is active', () => {
      const futureDate = new Date(Date.now() + 86400000)
      expect(canActivatePause('3day', 0, 0, futureDate)).toBe(false)
    })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/streakManager.test.ts
```

**Step 3: Implement streakManager**

```typescript
// src/services/streakManager.ts

export const STREAK_DAILY_BONUS: Record<number, number> = {
  2: 10,
  3: 15,
  4: 20,
}
const STREAK_CAP_BONUS = 25

export const STREAK_MILESTONES: Record<number, number> = {
  7: 100,
  14: 150,
  30: 400,
  60: 800,
  100: 1500,
  200: 3000,
  365: 7500,
}

const PAUSE_LIMITS = {
  '3day': { maxPerMonth: 2, durationDays: 3, pointsCost: 0 },
  '7day': { maxPerMonth: 1, durationDays: 7, pointsCost: 500 },
} as const

export type PauseType = '3day' | '7day'

export function calculateStreakBonus(currentStreak: number): number {
  if (currentStreak <= 1) return 0
  return STREAK_DAILY_BONUS[currentStreak] ?? STREAK_CAP_BONUS
}

export function getStreakMilestoneBonus(currentStreak: number): number {
  return STREAK_MILESTONES[currentStreak] ?? 0
}

export function canActivatePause(
  pauseType: PauseType,
  shortPausesUsed: number,
  longPausesUsed: number,
  currentPauseEndsAt: Date | null,
): boolean {
  // Block if a pause is already active
  if (currentPauseEndsAt && currentPauseEndsAt > new Date()) return false

  if (pauseType === '3day') {
    return shortPausesUsed < PAUSE_LIMITS['3day'].maxPerMonth
  }
  return longPausesUsed < PAUSE_LIMITS['7day'].maxPerMonth
}

export function getPauseCost(pauseType: PauseType): number {
  return PAUSE_LIMITS[pauseType].pointsCost
}

export function getPauseDurationDays(pauseType: PauseType): number {
  return PAUSE_LIMITS[pauseType].durationDays
}

export function isStreakProtectedByPause(
  pauseEndsAt: Date | null,
): boolean {
  if (!pauseEndsAt) return false
  return pauseEndsAt > new Date()
}
```

**Step 4: Run tests**

```bash
npx vitest run src/__tests__/streakManager.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/streakManager.ts src/__tests__/streakManager.test.ts
git commit -m "feat: streak milestones and pause system"
```

---

### Task 5: Chat Command Parser

**Files:**
- Create: `src/services/chatCommandParser.ts`
- Test: `src/__tests__/chatCommandParser.test.ts`

**Step 1: Write failing tests**

```typescript
// src/__tests__/chatCommandParser.test.ts
import { describe, it, expect } from 'vitest'
import { parseChatCommand, ChatCommand } from '@/services/chatCommandParser'

describe('chatCommandParser', () => {
  it('parses !helpful @username', () => {
    const result = parseChatCommand('!helpful @TraderJoe')
    expect(result).toEqual({ type: 'helpful', targetUsername: 'TraderJoe' })
  })

  it('parses !goodq @username', () => {
    const result = parseChatCommand('!goodq @TraderJoe')
    expect(result).toEqual({ type: 'goodq', targetUsername: 'TraderJoe' })
  })

  it('parses !points', () => {
    const result = parseChatCommand('!points')
    expect(result).toEqual({ type: 'points' })
  })

  it('parses !streak', () => {
    const result = parseChatCommand('!streak')
    expect(result).toEqual({ type: 'streak' })
  })

  it('parses !leaderboard', () => {
    const result = parseChatCommand('!leaderboard')
    expect(result).toEqual({ type: 'leaderboard' })
  })

  it('parses !refer', () => {
    const result = parseChatCommand('!refer')
    expect(result).toEqual({ type: 'refer' })
  })

  it('returns null for non-commands', () => {
    expect(parseChatCommand('hello world')).toBeNull()
    expect(parseChatCommand('I love this stream!')).toBeNull()
  })

  it('returns null for unknown commands', () => {
    expect(parseChatCommand('!unknown')).toBeNull()
  })

  it('is case-insensitive', () => {
    const result = parseChatCommand('!HELPFUL @TraderJoe')
    expect(result).toEqual({ type: 'helpful', targetUsername: 'TraderJoe' })
  })

  it('handles @ with or without space', () => {
    expect(parseChatCommand('!helpful @Joe')).toEqual({ type: 'helpful', targetUsername: 'Joe' })
    expect(parseChatCommand('!helpful Joe')).toBeNull() // @ required
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/chatCommandParser.test.ts
```

**Step 3: Implement parser**

```typescript
// src/services/chatCommandParser.ts

export type ChatCommand =
  | { type: 'helpful'; targetUsername: string }
  | { type: 'goodq'; targetUsername: string }
  | { type: 'points' }
  | { type: 'streak' }
  | { type: 'leaderboard' }
  | { type: 'refer' }

const TARGETED_COMMANDS = ['helpful', 'goodq'] as const
const SIMPLE_COMMANDS = ['points', 'streak', 'leaderboard', 'refer'] as const

const TARGETED_PATTERN = /^!(\w+)\s+@(\S+)/i
const SIMPLE_PATTERN = /^!(\w+)$/i

export function parseChatCommand(message: string): ChatCommand | null {
  const trimmed = message.trim()

  // Try targeted command first (e.g., !helpful @username)
  const targetedMatch = trimmed.match(TARGETED_PATTERN)
  if (targetedMatch) {
    const command = targetedMatch[1].toLowerCase()
    const target = targetedMatch[2]
    if ((TARGETED_COMMANDS as readonly string[]).includes(command)) {
      return { type: command as 'helpful' | 'goodq', targetUsername: target }
    }
  }

  // Try simple command (e.g., !points)
  const simpleMatch = trimmed.match(SIMPLE_PATTERN)
  if (simpleMatch) {
    const command = simpleMatch[1].toLowerCase()
    if ((SIMPLE_COMMANDS as readonly string[]).includes(command)) {
      return { type: command } as ChatCommand
    }
  }

  return null
}
```

**Step 4: Run tests**

```bash
npx vitest run src/__tests__/chatCommandParser.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/chatCommandParser.ts src/__tests__/chatCommandParser.test.ts
git commit -m "feat: chat command parser for !helpful, !goodq, !points, etc"
```

---

### Task 6: Superfan Segmentation Service

**Files:**
- Create: `src/services/segmentation.ts`
- Test: `src/__tests__/segmentation.test.ts`

**Step 1: Write failing tests**

```typescript
// src/__tests__/segmentation.test.ts
import { describe, it, expect } from 'vitest'
import { calculateSegment, SegmentName } from '@/services/segmentation'

describe('segmentation', () => {
  const baseViewer = {
    rank: 'PAPER_TRADER' as const,
    totalStreamsAttended: 0,
    hasPurchasedCourse: false,
    hasPurchasedPremiumCohort: false,
    currentStreak: 0,
    helpfulUpvotesReceived: 0,
    lastSeenAt: new Date(),
    // Whether they redeemed a module unlock reward
    hasRedeemedModuleUnlock: false,
  }

  it('returns null for new Paper Traders', () => {
    expect(calculateSegment(baseViewer)).toBeNull()
  })

  it('returns warming_lead for Retail Trader with 10+ streams, no purchase', () => {
    expect(calculateSegment({
      ...baseViewer,
      rank: 'RETAIL_TRADER',
      totalStreamsAttended: 12,
    })).toBe('warming_lead')
  })

  it('returns hot_lead for Swing Trader with 20+ streams and module unlock', () => {
    expect(calculateSegment({
      ...baseViewer,
      rank: 'SWING_TRADER',
      totalStreamsAttended: 22,
      hasRedeemedModuleUnlock: true,
    })).toBe('hot_lead')
  })

  it('returns at_risk for active viewer not seen in 14+ days', () => {
    const twoWeeksAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    expect(calculateSegment({
      ...baseViewer,
      rank: 'SWING_TRADER',
      totalStreamsAttended: 20,
      lastSeenAt: twoWeeksAgo,
    })).toBe('at_risk')
  })

  it('returns superfan for Fund Manager+ with 30+ day streak', () => {
    expect(calculateSegment({
      ...baseViewer,
      rank: 'FUND_MANAGER',
      totalStreamsAttended: 100,
      currentStreak: 35,
    })).toBe('superfan')
  })

  it('returns whale_candidate for Market Maker + course buyer + high contribution', () => {
    expect(calculateSegment({
      ...baseViewer,
      rank: 'MARKET_MAKER',
      totalStreamsAttended: 200,
      hasPurchasedCourse: true,
      helpfulUpvotesReceived: 50,
      currentStreak: 10,
    })).toBe('whale_candidate')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/segmentation.test.ts
```

**Step 3: Implement segmentation**

```typescript
// src/services/segmentation.ts

import type { RankName } from '@/lib/ranks'

export type SegmentName =
  | 'warming_lead'
  | 'hot_lead'
  | 'at_risk'
  | 'superfan'
  | 'whale_candidate'

const RANK_ORDER: Record<string, number> = {
  PAPER_TRADER: 0,
  RETAIL_TRADER: 1,
  SWING_TRADER: 2,
  FUND_MANAGER: 3,
  MARKET_MAKER: 4,
  HEDGE_FUND: 5,
  WHALE: 6,
}

interface SegmentInput {
  rank: RankName | string
  totalStreamsAttended: number
  hasPurchasedCourse: boolean
  hasPurchasedPremiumCohort: boolean
  currentStreak: number
  helpfulUpvotesReceived: number
  lastSeenAt: Date
  hasRedeemedModuleUnlock: boolean
}

export function calculateSegment(viewer: SegmentInput): SegmentName | null {
  const rankLevel = RANK_ORDER[viewer.rank] ?? 0
  const daysSinceLastSeen = Math.floor(
    (Date.now() - viewer.lastSeenAt.getTime()) / (1000 * 60 * 60 * 24)
  )

  // At-risk: was active (Retail Trader+, 5+ streams) but gone 14+ days
  if (rankLevel >= 1 && viewer.totalStreamsAttended >= 5 && daysSinceLastSeen >= 14) {
    return 'at_risk'
  }

  // Whale candidate: Market Maker + course buyer + high community contribution
  if (
    rankLevel >= 4 &&
    viewer.hasPurchasedCourse &&
    viewer.helpfulUpvotesReceived >= 50
  ) {
    return 'whale_candidate'
  }

  // Superfan: Fund Manager+ with 30+ day streak
  if (rankLevel >= 3 && viewer.currentStreak >= 30) {
    return 'superfan'
  }

  // Hot lead: Swing Trader + 20+ streams + redeemed module unlock
  if (
    rankLevel >= 2 &&
    viewer.totalStreamsAttended >= 20 &&
    viewer.hasRedeemedModuleUnlock &&
    !viewer.hasPurchasedCourse
  ) {
    return 'hot_lead'
  }

  // Warming lead: Retail Trader + 10+ streams + no purchase
  if (
    rankLevel >= 1 &&
    viewer.totalStreamsAttended >= 10 &&
    !viewer.hasPurchasedCourse
  ) {
    return 'warming_lead'
  }

  return null
}
```

**Step 4: Run tests**

```bash
npx vitest run src/__tests__/segmentation.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/segmentation.ts src/__tests__/segmentation.test.ts
git commit -m "feat: superfan segmentation service with 5 auto-segments"
```

---

### Task 7: Webhook Dispatch Service

**Files:**
- Create: `src/services/webhookDispatcher.ts`
- Test: `src/__tests__/webhookDispatcher.test.ts`

**Step 1: Write failing tests**

```typescript
// src/__tests__/webhookDispatcher.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildWebhookPayload, signPayload } from '@/services/webhookDispatcher'

describe('webhookDispatcher', () => {
  describe('buildWebhookPayload', () => {
    it('builds a tier_changed payload', () => {
      const payload = buildWebhookPayload('viewer.tier_changed', {
        viewerId: 'v1',
        oldTier: 'PAPER_TRADER',
        newTier: 'RETAIL_TRADER',
      })
      expect(payload.event).toBe('viewer.tier_changed')
      expect(payload.data.viewerId).toBe('v1')
      expect(payload.timestamp).toBeDefined()
    })
  })

  describe('signPayload', () => {
    it('produces consistent HMAC for same payload and secret', () => {
      const payload = JSON.stringify({ test: true })
      const sig1 = signPayload(payload, 'secret123')
      const sig2 = signPayload(payload, 'secret123')
      expect(sig1).toBe(sig2)
    })

    it('produces different HMAC for different secrets', () => {
      const payload = JSON.stringify({ test: true })
      const sig1 = signPayload(payload, 'secret1')
      const sig2 = signPayload(payload, 'secret2')
      expect(sig1).not.toBe(sig2)
    })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/webhookDispatcher.test.ts
```

**Step 3: Implement webhook dispatcher**

```typescript
// src/services/webhookDispatcher.ts

import { createHmac } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export type WebhookEvent =
  | 'viewer.tier_changed'
  | 'viewer.reward_redeemed'
  | 'viewer.segment_changed'
  | 'viewer.referral_converted'
  | 'viewer.milestone_reached'
  | 'stream.ended'

interface WebhookPayload {
  event: WebhookEvent
  data: Record<string, unknown>
  timestamp: string
}

export function buildWebhookPayload(
  event: WebhookEvent,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    event,
    data,
    timestamp: new Date().toISOString(),
  }
}

export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export async function dispatchWebhooks(
  channelId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const configs = await prisma.webhookConfig.findMany({
    where: {
      channelId,
      isActive: true,
    },
  })

  const relevantConfigs = configs.filter((config) => {
    const events = config.events as string[]
    return events.includes(event)
  })

  const payload = buildWebhookPayload(event, data)
  const payloadString = JSON.stringify(payload)

  await Promise.allSettled(
    relevantConfigs.map(async (config) => {
      const signature = signPayload(payloadString, config.secret)

      try {
        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event,
          },
          body: payloadString,
          signal: AbortSignal.timeout(10000),
        })

        await prisma.webhookDelivery.create({
          data: {
            webhookId: config.id,
            event,
            payload: payload as object,
            statusCode: response.status,
            deliveredAt: new Date(),
          },
        })

        await prisma.webhookConfig.update({
          where: { id: config.id },
          data: { lastTriggeredAt: new Date(), failureCount: 0 },
        })
      } catch (error) {
        logger.error('Webhook delivery failed', { webhookId: config.id, event, error })

        await prisma.webhookDelivery.create({
          data: {
            webhookId: config.id,
            event,
            payload: payload as object,
            response: error instanceof Error ? error.message : 'Unknown error',
          },
        })

        await prisma.webhookConfig.update({
          where: { id: config.id },
          data: { failureCount: { increment: 1 } },
        })
      }
    }),
  )
}
```

**Step 4: Run tests**

```bash
npx vitest run src/__tests__/webhookDispatcher.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/webhookDispatcher.ts src/__tests__/webhookDispatcher.test.ts
git commit -m "feat: webhook dispatch service with HMAC signing"
```

---

## Phase 3: API Routes

### Task 8: Referral System API

**Files:**
- Create: `src/app/api/viewer/referral/route.ts`
- Create: `src/app/api/viewer/referral/convert/route.ts`
- Modify: `src/lib/validators.ts` (add referral schema)

**Step 1: Add validation schema**

Add to `src/lib/validators.ts`:

```typescript
export const referralConvertSchema = z.object({
  referralCode: z.string().min(6).max(20),
  channelId: z.string().min(1),
})
```

**Step 2: Create referral link endpoint**

```typescript
// src/app/api/viewer/referral/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import { nanoid } from 'nanoid'

// GET: Get or create referral code for the viewer
export async function GET() {
  const session = await getServerSession(viewerAuthOptions)
  if (!session?.user?.viewerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const viewer = await prisma.viewer.findUnique({
    where: { id: session.user.viewerId },
    select: { id: true, referralCode: true },
  })

  if (!viewer) {
    return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
  }

  // Generate referral code if not exists
  if (!viewer.referralCode) {
    const code = nanoid(10)
    await prisma.viewer.update({
      where: { id: viewer.id },
      data: { referralCode: code },
    })
    return NextResponse.json({ referralCode: code })
  }

  return NextResponse.json({ referralCode: viewer.referralCode })
}
```

**Step 3: Create referral conversion endpoint**

```typescript
// src/app/api/viewer/referral/convert/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import { referralConvertSchema } from '@/lib/validators'

// POST: Link a referred viewer to a referrer
export async function POST(request: NextRequest) {
  const session = await getServerSession(viewerAuthOptions)
  if (!session?.user?.viewerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = referralConvertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { referralCode, channelId } = parsed.data

  // Find referrer
  const referrer = await prisma.viewer.findFirst({
    where: { referralCode, channelId },
  })

  if (!referrer) {
    return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 })
  }

  if (referrer.id === session.user.viewerId) {
    return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 })
  }

  // Check if already referred
  const existing = await prisma.referral.findUnique({
    where: {
      referrerId_referredId_channelId: {
        referrerId: referrer.id,
        referredId: session.user.viewerId,
        channelId,
      },
    },
  })

  if (existing) {
    return NextResponse.json({ error: 'Already referred' }, { status: 409 })
  }

  // Create referral and award welcome bonus to referred viewer
  await prisma.$transaction([
    prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: session.user.viewerId,
        channelId,
        referredPointsAwarded: 25,
      },
    }),
    prisma.viewer.update({
      where: { id: session.user.viewerId },
      data: {
        referredById: referrer.id,
        availablePoints: { increment: 25 },
        totalPoints: { increment: 25 },
        lifetimePoints: { increment: 25 },
      },
    }),
    prisma.pointTransaction.create({
      data: {
        viewerId: session.user.viewerId,
        streamId: null,
        type: 'REFERRAL_BONUS',
        points: 25,
        description: 'Welcome bonus from referral',
        balanceBefore: 0,
        balanceAfter: 25,
      },
    }),
  ])

  return NextResponse.json({ success: true, bonusPoints: 25 })
}
```

**Step 4: Commit**

```bash
git add src/app/api/viewer/referral/ src/lib/validators.ts
git commit -m "feat: referral system API endpoints"
```

---

### Task 9: Poll System API

**Files:**
- Create: `src/app/api/streams/[id]/polls/route.ts`
- Create: `src/app/api/streams/[id]/polls/[pollId]/vote/route.ts`

**Step 1: Create poll management endpoint**

```typescript
// src/app/api/streams/[id]/polls/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const createPollSchema = z.object({
  question: z.string().min(3).max(200),
  options: z.array(z.string().min(1).max(100)).min(2).max(6),
})

// GET: List polls for a stream
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: streamId } = await params
  const polls = await prisma.streamPoll.findMany({
    where: { streamId },
    include: { _count: { select: { responses: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(polls)
}

// POST: Create a new poll (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: streamId } = await params
  const body = await request.json()
  const parsed = createPollSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Close any active polls for this stream
  await prisma.streamPoll.updateMany({
    where: { streamId, isActive: true },
    data: { isActive: false, closedAt: new Date() },
  })

  const poll = await prisma.streamPoll.create({
    data: {
      streamId,
      question: parsed.data.question,
      options: parsed.data.options,
    },
  })

  return NextResponse.json(poll, { status: 201 })
}
```

**Step 2: Create vote endpoint**

```typescript
// src/app/api/streams/[id]/polls/[pollId]/vote/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import { z } from 'zod'

const voteSchema = z.object({
  selectedOption: z.number().int().min(0),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pollId: string }> },
) {
  const session = await getServerSession(viewerAuthOptions)
  if (!session?.user?.viewerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pollId } = await params
  const body = await request.json()
  const parsed = voteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const poll = await prisma.streamPoll.findUnique({ where: { id: pollId } })
  if (!poll || !poll.isActive) {
    return NextResponse.json({ error: 'Poll not found or closed' }, { status: 404 })
  }

  const options = poll.options as string[]
  if (parsed.data.selectedOption >= options.length) {
    return NextResponse.json({ error: 'Invalid option' }, { status: 400 })
  }

  // Award points for participating
  const POLL_POINTS = 15
  try {
    await prisma.$transaction([
      prisma.pollResponse.create({
        data: {
          pollId,
          viewerId: session.user.viewerId,
          selectedOption: parsed.data.selectedOption,
          pointsAwarded: POLL_POINTS,
        },
      }),
      prisma.viewer.update({
        where: { id: session.user.viewerId },
        data: {
          availablePoints: { increment: POLL_POINTS },
          totalPoints: { increment: POLL_POINTS },
          lifetimePoints: { increment: POLL_POINTS },
        },
      }),
      prisma.pointTransaction.create({
        data: {
          viewerId: session.user.viewerId,
          streamId: poll.streamId,
          type: 'POLL_PARTICIPATION',
          points: POLL_POINTS,
          description: `Answered poll: ${poll.question}`,
        },
      }),
    ])
  } catch {
    // Unique constraint = already voted
    return NextResponse.json({ error: 'Already voted' }, { status: 409 })
  }

  return NextResponse.json({ success: true, pointsAwarded: POLL_POINTS })
}
```

**Step 3: Commit**

```bash
git add src/app/api/streams/
git commit -m "feat: poll system with voting and point awards"
```

---

### Task 10: Homework Submission API

**Files:**
- Create: `src/app/api/viewer/homework/route.ts`
- Create: `src/app/api/admin/homework/[id]/route.ts`

**Step 1: Create viewer homework submission endpoint**

```typescript
// src/app/api/viewer/homework/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import { z } from 'zod'

const submitHomeworkSchema = z.object({
  channelId: z.string().min(1),
  title: z.string().min(3).max(200),
  content: z.string().min(10).max(2000),
  imageUrl: z.string().url().optional(),
})

// GET: List viewer's homework submissions
export async function GET() {
  const session = await getServerSession(viewerAuthOptions)
  if (!session?.user?.viewerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const submissions = await prisma.homeworkSubmission.findMany({
    where: { viewerId: session.user.viewerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(submissions)
}

// POST: Submit homework
export async function POST(request: NextRequest) {
  const session = await getServerSession(viewerAuthOptions)
  if (!session?.user?.viewerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = submitHomeworkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Rate limit: max 3 submissions per day
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayCount = await prisma.homeworkSubmission.count({
    where: {
      viewerId: session.user.viewerId,
      createdAt: { gte: today },
    },
  })
  if (todayCount >= 3) {
    return NextResponse.json({ error: 'Max 3 submissions per day' }, { status: 429 })
  }

  const submission = await prisma.homeworkSubmission.create({
    data: {
      viewerId: session.user.viewerId,
      channelId: parsed.data.channelId,
      title: parsed.data.title,
      content: parsed.data.content,
      imageUrl: parsed.data.imageUrl,
    },
  })

  return NextResponse.json(submission, { status: 201 })
}
```

**Step 2: Create admin review endpoint**

```typescript
// src/app/api/admin/homework/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
})

const HOMEWORK_POINTS = 30

// PATCH: Approve or reject homework
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const submission = await prisma.homeworkSubmission.findUnique({
    where: { id },
  })
  if (!submission || submission.status !== 'PENDING') {
    return NextResponse.json({ error: 'Not found or already reviewed' }, { status: 404 })
  }

  if (parsed.data.status === 'APPROVED') {
    await prisma.$transaction([
      prisma.homeworkSubmission.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          pointsAwarded: HOMEWORK_POINTS,
        },
      }),
      prisma.viewer.update({
        where: { id: submission.viewerId },
        data: {
          availablePoints: { increment: HOMEWORK_POINTS },
          totalPoints: { increment: HOMEWORK_POINTS },
          lifetimePoints: { increment: HOMEWORK_POINTS },
          homeworkSubmissions: { increment: 1 },
        },
      }),
      prisma.pointTransaction.create({
        data: {
          viewerId: submission.viewerId,
          type: 'HOMEWORK_SUBMISSION',
          points: HOMEWORK_POINTS,
          description: `Homework approved: ${submission.title}`,
        },
      }),
    ])
  } else {
    await prisma.homeworkSubmission.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      },
    })
  }

  return NextResponse.json({ success: true })
}
```

**Step 3: Commit**

```bash
git add src/app/api/viewer/homework/ src/app/api/admin/homework/
git commit -m "feat: homework submission and mod review system"
```

---

### Task 11: CTA Tracking API

**Files:**
- Create: `src/app/api/streams/[id]/cta/route.ts`

**Step 1: Create CTA endpoint**

```typescript
// src/app/api/streams/[id]/cta/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const CTA_POINTS = 30

// POST: Set CTA timestamp and award points to present viewers
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: streamId } = await params

  const stream = await prisma.stream.findUnique({ where: { id: streamId } })
  if (!stream || stream.status !== 'LIVE') {
    return NextResponse.json({ error: 'Stream not live' }, { status: 400 })
  }

  if (stream.ctaPointsAwarded) {
    return NextResponse.json({ error: 'CTA already triggered for this stream' }, { status: 409 })
  }

  // Find viewers who sent a message in the last 5 minutes (proxy for "present")
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  const activeAttendances = await prisma.streamAttendance.findMany({
    where: {
      streamId,
      lastMessageAt: { gte: fiveMinAgo },
    },
    select: { viewerId: true },
  })

  const viewerIds = activeAttendances.map((a) => a.viewerId)

  // Award CTA points to all present viewers
  await prisma.$transaction([
    prisma.stream.update({
      where: { id: streamId },
      data: { ctaTimestamp: new Date(), ctaPointsAwarded: true },
    }),
    ...viewerIds.map((viewerId) =>
      prisma.viewer.update({
        where: { id: viewerId },
        data: {
          availablePoints: { increment: CTA_POINTS },
          totalPoints: { increment: CTA_POINTS },
          lifetimePoints: { increment: CTA_POINTS },
        },
      }),
    ),
    ...viewerIds.map((viewerId) =>
      prisma.pointTransaction.create({
        data: {
          viewerId,
          streamId,
          type: 'CTA_BONUS',
          points: CTA_POINTS,
          description: 'Stayed till CTA',
        },
      }),
    ),
  ])

  return NextResponse.json({
    success: true,
    viewersAwarded: viewerIds.length,
    pointsPerViewer: CTA_POINTS,
  })
}
```

**Step 2: Commit**

```bash
git add src/app/api/streams/
git commit -m "feat: CTA tracking - award points to viewers present at CTA moment"
```

---

### Task 12: Stream Leaderboard Overlay

**Files:**
- Create: `src/app/overlay/leaderboard/[streamId]/page.tsx`

**Step 1: Create overlay page**

```typescript
// src/app/overlay/leaderboard/[streamId]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'

interface LeaderboardEntry {
  displayName: string
  pointsEarned: number
  rank: string
}

const BADGE_COLORS: Record<string, string> = {
  PAPER_TRADER: '#9CA3AF',
  RETAIL_TRADER: '#22C55E',
  SWING_TRADER: '#3B82F6',
  FUND_MANAGER: '#A855F7',
  MARKET_MAKER: '#EAB308',
  HEDGE_FUND: '#E5E7EB',
  WHALE: '#F59E0B',
}

const BADGE_LABELS: Record<string, string> = {
  PAPER_TRADER: 'PT',
  RETAIL_TRADER: 'RT',
  SWING_TRADER: 'ST',
  FUND_MANAGER: 'FM',
  MARKET_MAKER: 'MM',
  HEDGE_FUND: 'HF',
  WHALE: 'W',
}

export default function LeaderboardOverlay({
  params,
}: {
  params: Promise<{ streamId: string }>
}) {
  const { streamId } = use(params)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch(`/api/streams/${streamId}/leaderboard`)
        if (res.ok) {
          const data = await res.json()
          setEntries(data.slice(0, 10))
        }
      } catch {
        // Silently retry on next interval
      }
    }

    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 12000) // 12s refresh
    return () => clearInterval(interval)
  }, [streamId])

  if (entries.length === 0) return null

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      background: 'rgba(0, 0, 0, 0.75)',
      borderRadius: '12px',
      padding: '16px',
      color: 'white',
      width: '280px',
      backdropFilter: 'blur(10px)',
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: '12px',
        color: '#EAB308',
      }}>
        Live Leaderboard
      </div>
      {entries.map((entry, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 0',
          borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 700,
            width: '20px',
            color: i < 3 ? '#EAB308' : '#9CA3AF',
          }}>
            {i + 1}
          </span>
          <span style={{
            background: BADGE_COLORS[entry.rank] || '#9CA3AF',
            color: entry.rank === 'HEDGE_FUND' ? '#111' : '#fff',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            minWidth: '24px',
            textAlign: 'center',
            boxShadow: entry.rank === 'WHALE' ? '0 0 8px #F59E0B' : 'none',
            animation: entry.rank === 'WHALE' ? 'glow 2s ease-in-out infinite alternate' : 'none',
          }}>
            {BADGE_LABELS[entry.rank] || '?'}
          </span>
          <span style={{
            flex: 1,
            fontSize: '13px',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {entry.displayName}
          </span>
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#22C55E',
          }}>
            +{entry.pointsEarned}
          </span>
        </div>
      ))}
      <style>{`
        @keyframes glow {
          from { box-shadow: 0 0 4px #F59E0B; }
          to { box-shadow: 0 0 12px #F59E0B, 0 0 20px #F59E0B40; }
        }
      `}</style>
    </div>
  )
}
```

**Step 2: Create leaderboard API for overlay**

```typescript
// src/app/api/streams/[id]/leaderboard/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: streamId } = await params

  const attendances = await prisma.streamAttendance.findMany({
    where: { streamId },
    orderBy: { pointsEarned: 'desc' },
    take: 10,
    include: {
      viewer: {
        select: { displayName: true, rank: true },
      },
    },
  })

  const leaderboard = attendances.map((a) => ({
    displayName: a.viewer.displayName,
    pointsEarned: a.pointsEarned,
    rank: a.viewer.rank,
  }))

  return NextResponse.json(leaderboard)
}
```

**Step 3: Commit**

```bash
git add src/app/overlay/ src/app/api/streams/
git commit -m "feat: OBS browser source leaderboard overlay with tier badges"
```

---

### Task 13: Streak Pause API

**Files:**
- Create: `src/app/api/viewer/streak/pause/route.ts`

**Step 1: Create pause endpoint**

```typescript
// src/app/api/viewer/streak/pause/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import { canActivatePause, getPauseCost, getPauseDurationDays } from '@/services/streakManager'
import { z } from 'zod'

const pauseSchema = z.object({
  pauseType: z.enum(['3day', '7day']),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(viewerAuthOptions)
  if (!session?.user?.viewerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = pauseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const viewer = await prisma.viewer.findUnique({
    where: { id: session.user.viewerId },
  })
  if (!viewer) {
    return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
  }

  // Reset monthly pause counts if new month
  const currentMonth = new Date().getMonth()
  let shortUsed = viewer.shortPausesUsedThisMonth
  let longUsed = viewer.longPausesUsedThisMonth
  if (viewer.lastPauseResetMonth !== currentMonth) {
    shortUsed = 0
    longUsed = 0
  }

  const { pauseType } = parsed.data

  if (!canActivatePause(pauseType, shortUsed, longUsed, viewer.pauseEndsAt)) {
    return NextResponse.json({ error: 'Pause limit reached or pause already active' }, { status: 400 })
  }

  const cost = getPauseCost(pauseType)
  if (viewer.availablePoints < cost) {
    return NextResponse.json({ error: 'Not enough points' }, { status: 400 })
  }

  const durationDays = getPauseDurationDays(pauseType)
  const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

  const updates: Record<string, unknown> = {
    activePauseType: pauseType,
    pauseStartedAt: new Date(),
    pauseEndsAt: endsAt,
    lastPauseResetMonth: currentMonth,
    shortPausesUsedThisMonth: pauseType === '3day' ? shortUsed + 1 : shortUsed,
    longPausesUsedThisMonth: pauseType === '7day' ? longUsed + 1 : longUsed,
  }

  if (cost > 0) {
    updates.availablePoints = { decrement: cost }
    updates.totalPoints = { decrement: cost }
  }

  await prisma.$transaction([
    prisma.viewer.update({
      where: { id: viewer.id },
      data: updates,
    }),
    prisma.streakPause.create({
      data: {
        viewerId: viewer.id,
        pauseType,
        pointsCost: cost,
        startedAt: new Date(),
        endsAt,
      },
    }),
    ...(cost > 0
      ? [
          prisma.pointTransaction.create({
            data: {
              viewerId: viewer.id,
              type: 'STREAK_PAUSE_COST',
              points: -cost,
              description: `${pauseType} streak pause`,
            },
          }),
        ]
      : []),
  ])

  return NextResponse.json({
    success: true,
    pauseType,
    endsAt,
    pointsDeducted: cost,
  })
}
```

**Step 2: Commit**

```bash
git add src/app/api/viewer/streak/
git commit -m "feat: streak pause API with 3-day free and 7-day paid options"
```

---

### Task 14: Analytics API Endpoints

**Files:**
- Create: `src/app/api/admin/analytics/overview/route.ts`
- Create: `src/app/api/admin/analytics/funnel/route.ts`

**Step 1: Create overview analytics endpoint**

```typescript
// src/app/api/admin/analytics/overview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelId = request.nextUrl.searchParams.get('channelId')
  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalViewers,
    tierDistribution,
    segmentDistribution,
    activeViewers30d,
    totalPointsIssued,
    totalPointsRedeemed,
    repeatAttendance,
    averageStreak,
    rewardRedemptions30d,
  ] = await Promise.all([
    prisma.viewer.count({ where: { channelId } }),
    prisma.viewer.groupBy({
      by: ['rank'],
      where: { channelId },
      _count: true,
    }),
    prisma.viewer.groupBy({
      by: ['currentSegment'],
      where: { channelId, currentSegment: { not: null } },
      _count: true,
    }),
    prisma.viewer.count({
      where: { channelId, lastSeenAt: { gte: thirtyDaysAgo } },
    }),
    prisma.pointTransaction.aggregate({
      where: {
        viewer: { channelId },
        points: { gt: 0 },
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { points: true },
    }),
    prisma.pointTransaction.aggregate({
      where: {
        viewer: { channelId },
        points: { lt: 0 },
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { points: true },
    }),
    // Viewers who attended 2+ streams in last 30 days
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT sa."viewerId") as count
      FROM "StreamAttendance" sa
      JOIN "Viewer" v ON sa."viewerId" = v.id
      WHERE v."channelId" = ${channelId}
        AND sa."createdAt" >= ${thirtyDaysAgo}
      GROUP BY sa."viewerId"
      HAVING COUNT(sa."streamId") >= 2
    ` as Promise<{ count: bigint }[]>,
    prisma.viewer.aggregate({
      where: { channelId, currentStreak: { gt: 0 } },
      _avg: { currentStreak: true },
    }),
    prisma.rewardRedemption.count({
      where: {
        viewer: { channelId },
        redeemedAt: { gte: thirtyDaysAgo },
      },
    }),
  ])

  const issued = totalPointsIssued._sum.points ?? 0
  const redeemed = Math.abs(totalPointsRedeemed._sum.points ?? 0)
  const earnToBurnRatio = issued > 0 ? (redeemed / issued) * 100 : 0

  return NextResponse.json({
    totalViewers,
    activeViewers30d,
    tierDistribution: tierDistribution.map((t) => ({
      tier: t.rank,
      count: t._count,
    })),
    segmentDistribution: segmentDistribution.map((s) => ({
      segment: s.currentSegment,
      count: s._count,
    })),
    pointsEconomy: {
      issued,
      redeemed,
      earnToBurnRatio: Math.round(earnToBurnRatio * 10) / 10,
    },
    repeatAttendanceCount: repeatAttendance.length,
    repeatAttendanceRate: totalViewers > 0
      ? Math.round((repeatAttendance.length / totalViewers) * 100 * 10) / 10
      : 0,
    averageStreak: Math.round((averageStreak._avg.currentStreak ?? 0) * 10) / 10,
    rewardRedemptions30d,
  })
}
```

**Step 2: Create funnel analytics endpoint**

```typescript
// src/app/api/admin/analytics/funnel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelId = request.nextUrl.searchParams.get('channelId')
  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 })
  }

  const [
    paperTraders,
    retailTraders,
    swingTraders,
    fundManagers,
    marketMakers,
    hedgeFunds,
    whales,
    courseBuyers,
    premiumBuyers,
  ] = await Promise.all([
    prisma.viewer.count({ where: { channelId, rank: 'PAPER_TRADER' } }),
    prisma.viewer.count({ where: { channelId, rank: 'RETAIL_TRADER' } }),
    prisma.viewer.count({ where: { channelId, rank: 'SWING_TRADER' } }),
    prisma.viewer.count({ where: { channelId, rank: 'FUND_MANAGER' } }),
    prisma.viewer.count({ where: { channelId, rank: 'MARKET_MAKER' } }),
    prisma.viewer.count({ where: { channelId, rank: 'HEDGE_FUND' } }),
    prisma.viewer.count({ where: { channelId, rank: 'WHALE' } }),
    prisma.viewer.count({ where: { channelId, hasPurchasedCourse: true } }),
    prisma.viewer.count({ where: { channelId, hasPurchasedPremiumCohort: true } }),
  ])

  return NextResponse.json({
    funnel: [
      { stage: 'Paper Trader', count: paperTraders },
      { stage: 'Retail Trader', count: retailTraders },
      { stage: 'Swing Trader', count: swingTraders },
      { stage: 'Fund Manager', count: fundManagers },
      { stage: 'Market Maker', count: marketMakers },
      { stage: 'Hedge Fund', count: hedgeFunds },
      { stage: 'Whale', count: whales },
    ],
    conversions: {
      courseBuyers,
      premiumCohortBuyers: premiumBuyers,
    },
  })
}
```

**Step 3: Commit**

```bash
git add src/app/api/admin/analytics/
git commit -m "feat: analytics API - overview metrics, tier funnel, earn-to-burn ratio"
```

---

### Task 15: Tier Decay Cron Job

**Files:**
- Create: `src/app/api/cron/tier-decay/route.ts`

**Step 1: Create decay cron endpoint**

```typescript
// src/app/api/cron/tier-decay/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TIER_MAINTENANCE_90DAY } from '@/lib/ranks'
import { isPrestigeTier } from '@/lib/ranks'
import { dispatchWebhooks } from '@/services/webhookDispatcher'
import { logger } from '@/lib/logger'

const RANK_DEMOTION_ORDER = [
  'WHALE',
  'HEDGE_FUND',
  'MARKET_MAKER',
  'FUND_MANAGER',
  'SWING_TRADER',
  'RETAIL_TRADER',
  'PAPER_TRADER',
] as const

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  let demotions = 0

  // Process each tier that has maintenance requirements
  for (const [rank, requiredPoints] of Object.entries(TIER_MAINTENANCE_90DAY)) {
    // Skip prestige tiers — they don't decay
    if (isPrestigeTier(rank)) continue

    const viewers = await prisma.viewer.findMany({
      where: { rank },
      select: {
        id: true,
        channelId: true,
        rank: true,
        pauseEndsAt: true,
        pointTransactions: {
          where: { createdAt: { gte: ninetyDaysAgo }, points: { gt: 0 } },
          select: { points: true },
        },
      },
    })

    for (const viewer of viewers) {
      // Skip if streak pause is active
      if (viewer.pauseEndsAt && viewer.pauseEndsAt > new Date()) continue

      const points90d = viewer.pointTransactions.reduce((sum, t) => sum + t.points, 0)

      if (points90d < requiredPoints) {
        // Find the tier one below current
        const currentIndex = RANK_DEMOTION_ORDER.indexOf(rank as typeof RANK_DEMOTION_ORDER[number])
        const newRank = RANK_DEMOTION_ORDER[currentIndex + 1] || 'PAPER_TRADER'

        await prisma.viewer.update({
          where: { id: viewer.id },
          data: { rank: newRank },
        })

        // Dispatch webhook
        await dispatchWebhooks(viewer.channelId, 'viewer.tier_changed', {
          viewerId: viewer.id,
          oldTier: rank,
          newTier: newRank,
          reason: 'decay',
        }).catch((e) => logger.error('Webhook dispatch failed', { error: e }))

        demotions++
      }
    }
  }

  logger.info('Tier decay cron completed', { demotions })
  return NextResponse.json({ success: true, demotions })
}
```

**Step 2: Add to vercel.json cron config**

Read existing `vercel.json` and add the new cron job:

```json
{
  "crons": [
    {
      "path": "/api/cron/poll-streams",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/tier-decay",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**Step 3: Commit**

```bash
git add src/app/api/cron/tier-decay/ vercel.json
git commit -m "feat: daily tier decay cron with 90-day rolling window"
```

---

### Task 16: Webhook Management Admin API

**Files:**
- Create: `src/app/api/admin/webhooks/route.ts`

**Step 1: Create webhook CRUD endpoint**

```typescript
// src/app/api/admin/webhooks/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const createWebhookSchema = z.object({
  channelId: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
})

// GET: List webhooks for a channel
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelId = request.nextUrl.searchParams.get('channelId')
  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 })
  }

  const webhooks = await prisma.webhookConfig.findMany({
    where: { channelId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(webhooks)
}

// POST: Create webhook
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createWebhookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const secret = nanoid(32)
  const webhook = await prisma.webhookConfig.create({
    data: {
      channelId: parsed.data.channelId,
      url: parsed.data.url,
      events: parsed.data.events,
      secret,
    },
  })

  // Return secret only on creation — it won't be shown again
  return NextResponse.json({ ...webhook, secret }, { status: 201 })
}
```

**Step 2: Commit**

```bash
git add src/app/api/admin/webhooks/
git commit -m "feat: webhook management API for admin"
```

---

### Task 17: Integrate Chat Commands into Message Processor

**Files:**
- Modify: `src/services/messageProcessor.ts` (add command handling to processMessage)

**Step 1: Add command parsing to processMessage**

At the top of `messageProcessor.ts`, add import:

```typescript
import { parseChatCommand } from '@/services/chatCommandParser'
```

Inside the `processMessage` function (after code detection, around line 80), add:

```typescript
// Check for chat commands
const command = parseChatCommand(messageText)
if (command) {
  switch (command.type) {
    case 'helpful': {
      // Find target viewer by display name
      const target = await prisma.viewer.findFirst({
        where: { displayName: command.targetUsername, channelId },
      })
      if (target && target.id !== viewerId) {
        // Check daily upvote cap (5 given per stream per viewer)
        const givenThisStream = await prisma.helpfulUpvote.count({
          where: { giverId: viewerId, streamId },
        })
        if (givenThisStream < 5) {
          // Check per-receiver cap (25 per stream)
          const receivedThisStream = await prisma.helpfulUpvote.count({
            where: { receiverId: target.id, streamId },
          })
          if (receivedThisStream < 5) { // 5 upvotes * 5pts = 25 cap
            await prisma.$transaction([
              prisma.helpfulUpvote.create({
                data: { giverId: viewerId, receiverId: target.id, streamId },
              }),
              prisma.viewer.update({
                where: { id: target.id },
                data: {
                  helpfulUpvotesReceived: { increment: 1 },
                  availablePoints: { increment: 5 },
                  totalPoints: { increment: 5 },
                  lifetimePoints: { increment: 5 },
                },
              }),
              prisma.viewer.update({
                where: { id: viewerId },
                data: { helpfulUpvotesGiven: { increment: 1 } },
              }),
              prisma.pointTransaction.create({
                data: {
                  viewerId: target.id,
                  streamId,
                  type: 'HELPFUL_UPVOTE',
                  points: 5,
                  description: `Helpful upvote from ${viewer.displayName}`,
                },
              }),
            ])
          }
        }
      }
      break
    }
    case 'goodq': {
      // Only mods and streamer can use !goodq
      if (isModerator) {
        const target = await prisma.viewer.findFirst({
          where: { displayName: command.targetUsername, channelId },
        })
        if (target) {
          await prisma.$transaction([
            prisma.viewer.update({
              where: { id: target.id },
              data: {
                qualityQuestionsCount: { increment: 1 },
                availablePoints: { increment: 20 },
                totalPoints: { increment: 20 },
                lifetimePoints: { increment: 20 },
              },
            }),
            prisma.pointTransaction.create({
              data: {
                viewerId: target.id,
                streamId,
                type: 'QUALITY_QUESTION',
                points: 20,
                description: 'Quality question recognized by moderator',
              },
            }),
          ])
        }
      }
      break
    }
    // points, streak, leaderboard, refer — these would need a response mechanism
    // (YouTube API write access or a separate display). For now, log them.
    default:
      break
  }
}
```

**Step 2: Commit**

```bash
git add src/services/messageProcessor.ts
git commit -m "feat: integrate !helpful and !goodq chat commands into message processor"
```

---

### Task 18: Update Reward Redemption for Value Ladder

**Files:**
- Modify: `src/app/api/rewards/redeem/route.ts` (use points directly, not tokens)
- Modify: `src/lib/validators.ts` (update reward schema with new fields)

**Step 1: Update reward config validator**

In `src/lib/validators.ts`, update `rewardConfigSchema` to include new fields:

```typescript
export const rewardConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  rewardType: z.enum(['DIGITAL', 'PHYSICAL']),
  requiresShipping: z.boolean().optional(),
  stockQuantity: z.number().int().min(-1).optional(), // -1 = unlimited
  pointsCost: z.number().int().min(1), // Direct points cost (replaces tokenCost)
  maxPerViewer: z.number().int().min(1).optional(),
  maxTotal: z.number().int().min(1).optional(),
  minRank: z.string().optional(),
  category: z.enum(['GATEWAY', 'ENGAGEMENT', 'COMMITMENT', 'PREMIUM', 'PRESTIGE', 'ROTATING']).optional(),
  funnelPosition: z.number().int().optional(),
  externalCourseId: z.string().optional(),
  externalModuleId: z.string().optional(),
  isLimitedTime: z.boolean().optional(),
  limitedTimeEndsAt: z.string().datetime().optional(),
})
```

**Step 2: Update redeem endpoint to use points directly**

In `src/app/api/rewards/redeem/route.ts`, replace the token-based calculation (`tokenCost * 1000`) with direct `pointsCost` field. Change:

```typescript
// Old: const pointsRequired = reward.tokenCost * 1000
// New:
const pointsRequired = reward.pointsCost ?? (reward.tokenCost * 1000) // backwards compatible
```

**Step 3: Commit**

```bash
git add src/app/api/rewards/redeem/route.ts src/lib/validators.ts
git commit -m "feat: update rewards to use direct points cost and value-ladder categories"
```

---

### Task 19: Segmentation Cron Job

**Files:**
- Create: `src/app/api/cron/update-segments/route.ts`

**Step 1: Create segmentation cron**

```typescript
// src/app/api/cron/update-segments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateSegment } from '@/services/segmentation'
import { dispatchWebhooks } from '@/services/webhookDispatcher'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Process viewers in batches
  const batchSize = 100
  let cursor: string | undefined
  let updated = 0

  while (true) {
    const viewers = await prisma.viewer.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        channelId: true,
        rank: true,
        totalStreamsAttended: true,
        hasPurchasedCourse: true,
        hasPurchasedPremiumCohort: true,
        currentStreak: true,
        helpfulUpvotesReceived: true,
        lastSeenAt: true,
        currentSegment: true,
        rewardRedemptions: {
          where: { reward: { externalModuleId: { not: null } } },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
    })

    if (viewers.length === 0) break
    cursor = viewers[viewers.length - 1].id

    for (const viewer of viewers) {
      const newSegment = calculateSegment({
        rank: viewer.rank,
        totalStreamsAttended: viewer.totalStreamsAttended,
        hasPurchasedCourse: viewer.hasPurchasedCourse,
        hasPurchasedPremiumCohort: viewer.hasPurchasedPremiumCohort,
        currentStreak: viewer.currentStreak,
        helpfulUpvotesReceived: viewer.helpfulUpvotesReceived,
        lastSeenAt: viewer.lastSeenAt,
        hasRedeemedModuleUnlock: viewer.rewardRedemptions.length > 0,
      })

      if (newSegment !== viewer.currentSegment) {
        await prisma.viewer.update({
          where: { id: viewer.id },
          data: {
            currentSegment: newSegment,
            segmentUpdatedAt: new Date(),
          },
        })

        if (newSegment) {
          await dispatchWebhooks(viewer.channelId, 'viewer.segment_changed', {
            viewerId: viewer.id,
            oldSegment: viewer.currentSegment,
            newSegment,
          }).catch((e) => logger.error('Segment webhook failed', { error: e }))
        }

        updated++
      }
    }
  }

  logger.info('Segment update cron completed', { updated })
  return NextResponse.json({ success: true, updated })
}
```

**Step 2: Add to vercel.json**

Add cron entry:

```json
{
  "path": "/api/cron/update-segments",
  "schedule": "0 */6 * * *"
}
```

**Step 3: Commit**

```bash
git add src/app/api/cron/update-segments/ vercel.json
git commit -m "feat: segmentation cron job runs every 6 hours"
```

---

## Phase 4: Data Migration

### Task 20: Migrate Existing Viewer Ranks

**Files:**
- Create: `prisma/migrations/YYYYMMDD_migrate_rank_names/migration.sql` (via prisma migrate)
- Create: `scripts/migrate-ranks.ts`

**Step 1: Create rank migration script**

```typescript
// scripts/migrate-ranks.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RANK_MAPPING = {
  OBSERVER: 'PAPER_TRADER',
  OPERATOR: 'RETAIL_TRADER',
  SNIPER: 'SWING_TRADER',
  ARCHITECT: 'FUND_MANAGER',
  INNER_CIRCLE: 'MARKET_MAKER',
} as const

async function migrateRanks() {
  console.log('Migrating viewer ranks...')

  for (const [oldRank, newRank] of Object.entries(RANK_MAPPING)) {
    const result = await prisma.viewer.updateMany({
      where: { rank: oldRank as any },
      data: { rank: newRank as any },
    })
    console.log(`  ${oldRank} -> ${newRank}: ${result.count} viewers`)
  }

  // Generate referral codes for existing viewers
  const viewers = await prisma.viewer.findMany({
    where: { referralCode: null },
    select: { id: true },
  })

  console.log(`Generating referral codes for ${viewers.length} viewers...`)
  const { nanoid } = await import('nanoid')

  for (const viewer of viewers) {
    await prisma.viewer.update({
      where: { id: viewer.id },
      data: { referralCode: nanoid(10) },
    })
  }

  console.log('Migration complete!')
  await prisma.$disconnect()
}

migrateRanks().catch(console.error)
```

**Step 2: Run migration**

```bash
npx tsx scripts/migrate-ranks.ts
```

**Step 3: Commit**

```bash
git add scripts/migrate-ranks.ts
git commit -m "feat: rank migration script from old names to new trading tier names"
```

---

## Summary

| Task | Description | Phase |
|------|-------------|-------|
| 1 | Update enums, Viewer, Stream, RewardConfig schema | Phase 1: Schema |
| 2 | Add Referral, Poll, Homework, Webhook, Upvote, StreakPause models | Phase 1: Schema |
| 3 | Centralized rank config with multipliers | Phase 2: Services |
| 4 | Streak milestones and pause system | Phase 2: Services |
| 5 | Chat command parser | Phase 2: Services |
| 6 | Superfan segmentation service | Phase 2: Services |
| 7 | Webhook dispatch service | Phase 2: Services |
| 8 | Referral system API | Phase 3: API |
| 9 | Poll system API | Phase 3: API |
| 10 | Homework submission API | Phase 3: API |
| 11 | CTA tracking API | Phase 3: API |
| 12 | Stream leaderboard overlay | Phase 3: API + UI |
| 13 | Streak pause API | Phase 3: API |
| 14 | Analytics API endpoints | Phase 3: API |
| 15 | Tier decay cron job | Phase 3: API |
| 16 | Webhook management admin API | Phase 3: API |
| 17 | Integrate chat commands into message processor | Phase 3: Integration |
| 18 | Update reward redemption for value ladder | Phase 3: Integration |
| 19 | Segmentation cron job | Phase 3: Integration |
| 20 | Migrate existing viewer ranks | Phase 4: Migration |

**Dependencies:**
- Tasks 1-2 must complete before all others (schema changes)
- Task 3 must complete before Tasks 15, 17 (rank config used by decay and message processor)
- Task 4 must complete before Task 13 (streak manager used by pause API)
- Task 5 must complete before Task 17 (parser used by message processor)
- Task 6 must complete before Task 19 (segmentation service used by cron)
- Task 7 must complete before Tasks 15, 19 (webhook dispatcher used by crons)
- Task 20 should run last (after schema and rank config are finalized)
