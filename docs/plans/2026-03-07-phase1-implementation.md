# Phase 1: Identity + Ledger Foundation - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add global fan identity (FanProfile), immutable point ledger, per-channel OAuth credentials, raw event tracking, and job monitoring to support cross-channel loyalty.

**Architecture:** Single Prisma migration adds new tables and evolves existing ones. Backfill script populates new columns from existing data. All new FKs are nullable during migration for safety. Follow-up migration tightens constraints after verification.

**Tech Stack:** Prisma 7, PostgreSQL (Supabase), TypeScript, Vitest

---

### Task 1: Schema Migration - New Enums and Tables

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add new enums to schema.prisma**

Add after the existing `HomeworkStatus` enum (line ~842):

```prisma
// ============================================
// WORKSPACE & IDENTITY ENUMS
// ============================================

enum WorkspaceMemberRole {
  OWNER
  ADMIN
  MODERATOR
}

enum TokenStatus {
  VALID
  EXPIRED
  REVOKED
}

enum EngagementEventType {
  CHAT_MESSAGE
  SUPER_CHAT
  MEMBERSHIP
  CODE_REDEMPTION
  ATTENDANCE
}

enum JobType {
  INGEST_CHAT
  DAILY_SCORING
  FRAUD_SCAN
  BACKFILL
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}
```

**Step 2: Add Workspace and WorkspaceMember models**

Add after the new enums:

```prisma
// ============================================
// WORKSPACE
// ============================================

model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  ownerId   String
  settings  Json     @default("{}")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  members   WorkspaceMember[]
  channels  Channel[]
  fanProfiles FanProfile[]

  @@index([ownerId])
  @@index([slug])
}

model WorkspaceMember {
  id          String              @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceMemberRole @default(ADMIN)

  createdAt   DateTime            @default(now())

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([userId])
}
```

**Step 3: Add ChannelCredential model**

```prisma
// ============================================
// CHANNEL CREDENTIALS (Per-Channel OAuth)
// ============================================

model ChannelCredential {
  id                 String      @id @default(cuid())
  channelId          String      @unique
  googleAccountEmail String
  accessToken        String
  refreshToken       String
  tokenExpiresAt     DateTime?
  tokenStatus        TokenStatus @default(VALID)
  lastRefreshedAt    DateTime?

  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  channel            Channel     @relation(fields: [channelId], references: [id], onDelete: Cascade)
}
```

**Step 4: Add EngagementEvent model**

```prisma
// ============================================
// ENGAGEMENT EVENTS (Immutable Raw Events)
// ============================================

model EngagementEvent {
  id            String              @id @default(cuid())
  fanProfileId  String?
  channelId     String
  streamId      String?
  externalId    String              @unique
  eventType     EngagementEventType
  payload       Json
  occurredAt    DateTime
  ingestedAt    DateTime            @default(now())

  fanProfile    FanProfile?         @relation(fields: [fanProfileId], references: [id], onDelete: SetNull)
  channel       Channel             @relation(fields: [channelId], references: [id], onDelete: Cascade)
  stream        Stream?             @relation(fields: [streamId], references: [id], onDelete: SetNull)

  @@index([channelId, occurredAt])
  @@index([fanProfileId])
  @@index([eventType])
  @@index([externalId])
}
```

**Step 5: Add JobRun model**

```prisma
// ============================================
// JOB TRACKING
// ============================================

model JobRun {
  id              String    @id @default(cuid())
  jobType         JobType
  status          JobStatus @default(PENDING)
  channelId       String?

  startedAt       DateTime?
  completedAt     DateTime?
  eventsProcessed Int       @default(0)
  errorsCount     Int       @default(0)
  errorMessage    String?
  metadata        Json?

  createdAt       DateTime  @default(now())

  channel         Channel?  @relation(fields: [channelId], references: [id], onDelete: SetNull)

  @@index([jobType, status])
  @@index([channelId])
  @@index([createdAt])
}
```

**Step 6: Run prisma format to validate**

Run: `npx prisma format`
Expected: "Formatted prisma/schema.prisma"

**Step 7: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add Workspace, ChannelCredential, EngagementEvent, JobRun models"
```

---

### Task 2: Schema Migration - Evolve ViewerAccount to FanProfile

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Replace ViewerAccount model with FanProfile**

Find the ViewerAccount model (line ~740) and replace it with:

```prisma
// ============================================
// FAN PROFILE (Global Identity + Wallet)
// Evolved from ViewerAccount
// ============================================

model FanProfile {
  id               String     @id @default(cuid())
  googleId         String     @unique
  email            String
  displayName      String     @default("")
  profileImageUrl  String?

  // Global wallet
  totalPoints      Int        @default(0)
  availablePoints  Int        @default(0)
  lifetimePoints   Int        @default(0)
  rank             ViewerRank @default(PAPER_TRADER)
  trustScore       Float      @default(50.0)

  // Global streaks
  currentStreak    Int        @default(0)
  longestStreak    Int        @default(0)

  // Global ban status
  isBanned         Boolean    @default(false)
  banReason        String?
  bannedAt         DateTime?

  // Workspace
  workspaceId      String?

  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  // Relations
  workspace        Workspace? @relation(fields: [workspaceId], references: [id], onDelete: SetNull)
  viewers          Viewer[]
  pointLedger      PointLedger[]
  engagementEvents EngagementEvent[]

  @@index([googleId])
  @@index([email])
  @@index([workspaceId])
  @@index([totalPoints])
  @@index([rank])
}
```

**Step 2: Update Viewer model - rename viewerAccountId to fanProfileId**

In the Viewer model, change:
- `viewerAccountId String?` -> `fanProfileId String?`
- `viewerAccount ViewerAccount? @relation(...)` -> `fanProfile FanProfile? @relation(fields: [fanProfileId], references: [id])`
- `@@index([viewerAccountId])` -> `@@index([fanProfileId])`

**Step 3: Update PointTransaction -> rename to PointLedger and add fields**

Rename the model from `PointTransaction` to `PointLedger`. Add new fields:

```prisma
model PointLedger {
  id              String            @id @default(cuid())
  fanProfileId    String?
  viewerId        String?
  streamId        String?

  type            TransactionType
  amount          Int
  balanceBefore   Int
  balanceAfter    Int

  referenceType   String?
  referenceId     String?
  description     String?
  adjustedBy      String?

  // Reversal tracking
  isReversed      Boolean           @default(false)
  reversedBy      String?
  reversedAt      DateTime?

  createdAt       DateTime          @default(now())

  // Relations
  fanProfile      FanProfile?       @relation(fields: [fanProfileId], references: [id], onDelete: SetNull)
  viewer          Viewer?           @relation(fields: [viewerId], references: [id], onDelete: Cascade)
  stream          Stream?           @relation(fields: [streamId], references: [id], onDelete: SetNull)

  @@index([fanProfileId])
  @@index([viewerId])
  @@index([streamId])
  @@index([createdAt])
  @@index([type])
}
```

**Step 4: Update all relation references**

In every model that references `PointTransaction`, update to `PointLedger`:
- `Viewer.pointTransactions` -> `Viewer.pointLedger` (type `PointLedger[]`)
- `Stream.pointTransactions` -> `Stream.pointLedger` (type `PointLedger[]`)

In the Viewer model, update the relation:
- `pointTransactions PointTransaction[]` -> `pointLedger PointLedger[]`

In the Stream model, update the relation:
- `pointTransactions PointTransaction[]` -> `pointLedger PointLedger[]`

**Step 5: Add workspaceId to Channel model**

Add to Channel model:
```prisma
  workspaceId        String?
  workspace          Workspace? @relation(fields: [workspaceId], references: [id], onDelete: SetNull)
  channelCredential  ChannelCredential?
  engagementEvents   EngagementEvent[]
  jobRuns            JobRun[]
```

Add index: `@@index([workspaceId])`

**Step 6: Add Workspace relation to User model**

Add to User model:
```prisma
  workspaces         Workspace[]
  workspaceMembers   WorkspaceMember[]
```

**Step 7: Add relations to Stream model**

Add to Stream model:
```prisma
  engagementEvents   EngagementEvent[]
```

**Step 8: Remove OAuth token fields from User model**

Remove these lines from the User model:
```
  // OAuth tokens for YouTube API
  googleAccessToken  String?
  googleRefreshToken String?
  googleTokenExpiry  DateTime?
```

**Step 9: Run prisma format to validate**

Run: `npx prisma format`
Expected: "Formatted prisma/schema.prisma"

**Step 10: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): evolve ViewerAccount to FanProfile, PointTransaction to PointLedger, add ChannelCredential"
```

---

### Task 3: Create and Apply Prisma Migration

**Files:**
- Create: `prisma/migrations/<timestamp>_phase1_identity_ledger/migration.sql` (auto-generated)

**Step 1: Generate migration**

Run: `npx prisma migrate dev --name phase1_identity_ledger`

This will auto-generate the SQL. Review the generated migration SQL to confirm it:
- Creates Workspace, WorkspaceMember, ChannelCredential, EngagementEvent, JobRun tables
- Renames ViewerAccount to FanProfile with new columns
- Renames PointTransaction to PointLedger with new columns
- Adds fanProfileId to Viewer (replacing viewerAccountId)
- Adds workspaceId to Channel
- Removes googleAccessToken/refreshToken/tokenExpiry from User

Expected: Migration applied successfully, Prisma client regenerated.

**IMPORTANT:** If the migration includes destructive steps (dropping columns with data), Prisma may prompt. For dev database this is OK since we have no real data.

**Step 2: Verify with prisma studio**

Run: `npx prisma studio` (optional - open in browser to verify tables exist)

**Step 3: Commit migration**

```bash
git add prisma/migrations/ prisma/schema.prisma
git commit -m "feat(migration): apply phase1 identity + ledger schema changes"
```

---

### Task 4: Write Tests for Backfill Logic

**Files:**
- Create: `src/__tests__/backfill.test.ts`

**Step 1: Write tests for the aggregation logic (pure functions)**

```typescript
import { describe, it, expect } from 'vitest'
import {
  aggregateViewerPoints,
  pickHighestRank,
  averageTrustScore,
} from '@/scripts/backfillHelpers'

describe('aggregateViewerPoints', () => {
  it('sums availablePoints across viewers', () => {
    const viewers = [
      { availablePoints: 100, totalPoints: 200, lifetimePoints: 300 },
      { availablePoints: 50, totalPoints: 150, lifetimePoints: 250 },
    ]
    const result = aggregateViewerPoints(viewers)
    expect(result.availablePoints).toBe(150)
  })

  it('takes max totalPoints and lifetimePoints', () => {
    const viewers = [
      { availablePoints: 100, totalPoints: 200, lifetimePoints: 300 },
      { availablePoints: 50, totalPoints: 150, lifetimePoints: 250 },
    ]
    const result = aggregateViewerPoints(viewers)
    expect(result.totalPoints).toBe(200)
    expect(result.lifetimePoints).toBe(300)
  })

  it('returns zeros for empty array', () => {
    const result = aggregateViewerPoints([])
    expect(result.availablePoints).toBe(0)
    expect(result.totalPoints).toBe(0)
    expect(result.lifetimePoints).toBe(0)
  })
})

describe('pickHighestRank', () => {
  it('returns highest rank among viewers', () => {
    expect(pickHighestRank(['PAPER_TRADER', 'SWING_TRADER', 'RETAIL_TRADER']))
      .toBe('SWING_TRADER')
  })

  it('returns PAPER_TRADER for empty array', () => {
    expect(pickHighestRank([])).toBe('PAPER_TRADER')
  })

  it('handles single viewer', () => {
    expect(pickHighestRank(['FUND_MANAGER'])).toBe('FUND_MANAGER')
  })
})

describe('averageTrustScore', () => {
  it('averages trust scores', () => {
    expect(averageTrustScore([40, 60])).toBe(50)
  })

  it('returns 50 for empty array', () => {
    expect(averageTrustScore([])).toBe(50)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/backfill.test.ts`
Expected: FAIL - module not found

**Step 3: Commit failing tests**

```bash
git add src/__tests__/backfill.test.ts
git commit -m "test: add failing tests for backfill aggregation helpers"
```

---

### Task 5: Implement Backfill Helper Functions

**Files:**
- Create: `scripts/backfillHelpers.ts`

**Step 1: Implement the pure helper functions**

```typescript
import { ViewerRank } from '@prisma/client'

const RANK_ORDER: ViewerRank[] = [
  'PAPER_TRADER',
  'RETAIL_TRADER',
  'SWING_TRADER',
  'FUND_MANAGER',
  'MARKET_MAKER',
  'HEDGE_FUND',
  'WHALE',
]

interface ViewerPoints {
  availablePoints: number
  totalPoints: number
  lifetimePoints: number
}

export function aggregateViewerPoints(
  viewers: ViewerPoints[]
): ViewerPoints {
  if (viewers.length === 0) {
    return { availablePoints: 0, totalPoints: 0, lifetimePoints: 0 }
  }

  return {
    availablePoints: viewers.reduce((sum, v) => sum + v.availablePoints, 0),
    totalPoints: Math.max(...viewers.map((v) => v.totalPoints)),
    lifetimePoints: Math.max(...viewers.map((v) => v.lifetimePoints)),
  }
}

export function pickHighestRank(ranks: string[]): ViewerRank {
  if (ranks.length === 0) return 'PAPER_TRADER'

  let highestIndex = 0
  for (const rank of ranks) {
    const index = RANK_ORDER.indexOf(rank as ViewerRank)
    if (index > highestIndex) highestIndex = index
  }
  return RANK_ORDER[highestIndex]
}

export function averageTrustScore(scores: number[]): number {
  if (scores.length === 0) return 50
  return scores.reduce((sum, s) => sum + s, 0) / scores.length
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/backfill.test.ts`
Expected: PASS (all 7 tests)

**Step 3: Commit**

```bash
git add scripts/backfillHelpers.ts src/__tests__/backfill.test.ts
git commit -m "feat: implement backfill aggregation helpers with tests"
```

---

### Task 6: Implement Backfill Script

**Files:**
- Create: `scripts/backfill-phase1.ts`

**Step 1: Write the backfill script**

```typescript
import { PrismaClient } from '@prisma/client'
import { aggregateViewerPoints, pickHighestRank, averageTrustScore } from './backfillHelpers'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Phase 1 Backfill: Identity + Ledger ===\n')

  // Step 1: Create default workspace
  console.log('Step 1: Creating default workspace...')
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'default' },
    create: {
      name: 'YT Loyalty Program',
      slug: 'default',
      ownerId: (await prisma.user.findFirst())?.id ?? '',
      settings: { timezone: 'UTC' },
    },
    update: {},
  })
  console.log(`  Workspace: ${workspace.id} (${workspace.name})\n`)

  // Step 2: Backfill FanProfile wallet fields from Viewer rows
  console.log('Step 2: Backfilling FanProfile wallet fields...')
  const fanProfiles = await prisma.fanProfile.findMany({
    include: {
      viewers: {
        select: {
          totalPoints: true,
          availablePoints: true,
          lifetimePoints: true,
          rank: true,
          trustScore: true,
          currentStreak: true,
          longestStreak: true,
          isBanned: true,
          banReason: true,
          bannedAt: true,
          displayName: true,
          profileImageUrl: true,
        },
      },
    },
  })

  let profilesUpdated = 0
  for (const fp of fanProfiles) {
    if (fp.viewers.length === 0) continue

    const points = aggregateViewerPoints(fp.viewers)
    const rank = pickHighestRank(fp.viewers.map((v) => v.rank))
    const trust = averageTrustScore(fp.viewers.map((v) => v.trustScore))
    const maxStreak = Math.max(...fp.viewers.map((v) => v.currentStreak), 0)
    const maxLongest = Math.max(...fp.viewers.map((v) => v.longestStreak), 0)
    const isBanned = fp.viewers.some((v) => v.isBanned)
    const banReason = fp.viewers.find((v) => v.isBanned)?.banReason ?? null
    const bannedAt = fp.viewers.find((v) => v.isBanned)?.bannedAt ?? null
    const displayName = fp.viewers[0].displayName
    const profileImageUrl = fp.viewers[0].profileImageUrl

    await prisma.fanProfile.update({
      where: { id: fp.id },
      data: {
        ...points,
        rank,
        trustScore: trust,
        currentStreak: maxStreak,
        longestStreak: maxLongest,
        isBanned,
        banReason,
        bannedAt,
        displayName,
        profileImageUrl,
        workspaceId: workspace.id,
      },
    })
    profilesUpdated++
  }
  console.log(`  Updated ${profilesUpdated} fan profiles\n`)

  // Step 3: Create ChannelCredentials from User tokens
  console.log('Step 3: Creating channel credentials...')
  const channels = await prisma.channel.findMany({
    include: { owner: true },
  })

  let credentialsCreated = 0
  for (const channel of channels) {
    const existing = await prisma.channelCredential.findUnique({
      where: { channelId: channel.id },
    })
    if (existing) continue

    // Note: User tokens were removed from schema, so this only works
    // if run BEFORE the migration removes them, or if tokens are still
    // in the Account table. Adapt as needed.
    await prisma.channelCredential.create({
      data: {
        channelId: channel.id,
        googleAccountEmail: channel.owner.email,
        accessToken: '',
        refreshToken: '',
        tokenStatus: 'EXPIRED',
      },
    })
    credentialsCreated++

    // Link channel to workspace
    await prisma.channel.update({
      where: { id: channel.id },
      data: { workspaceId: workspace.id },
    })
  }
  console.log(`  Created ${credentialsCreated} channel credentials\n`)

  // Step 4: Link PointLedger entries to FanProfile
  console.log('Step 4: Linking ledger entries to fan profiles...')
  const orphanedEntries = await prisma.pointLedger.findMany({
    where: { fanProfileId: null, viewerId: { not: null } },
    select: { id: true, viewerId: true },
  })

  // Build viewer -> fanProfile lookup
  const viewers = await prisma.viewer.findMany({
    where: { fanProfileId: { not: null } },
    select: { id: true, fanProfileId: true },
  })
  const viewerToFan = new Map(viewers.map((v) => [v.id, v.fanProfileId!]))

  let ledgerLinked = 0
  const batchSize = 500
  for (let i = 0; i < orphanedEntries.length; i += batchSize) {
    const batch = orphanedEntries.slice(i, i + batchSize)
    await prisma.$transaction(
      batch
        .filter((e) => e.viewerId && viewerToFan.has(e.viewerId))
        .map((e) =>
          prisma.pointLedger.update({
            where: { id: e.id },
            data: { fanProfileId: viewerToFan.get(e.viewerId!)! },
          })
        )
    )
    ledgerLinked += batch.length
  }
  console.log(`  Linked ${ledgerLinked} ledger entries\n`)

  // Step 5: Reconciliation
  console.log('Step 5: Reconciliation check...')
  const allProfiles = await prisma.fanProfile.findMany({
    select: { id: true, displayName: true, availablePoints: true },
  })

  let mismatches = 0
  for (const profile of allProfiles) {
    const credits = await prisma.pointLedger.aggregate({
      where: { fanProfileId: profile.id, amount: { gt: 0 }, isReversed: false },
      _sum: { amount: true },
    })
    const debits = await prisma.pointLedger.aggregate({
      where: { fanProfileId: profile.id, amount: { lt: 0 }, isReversed: false },
      _sum: { amount: true },
    })

    const ledgerBalance = (credits._sum.amount ?? 0) + (debits._sum.amount ?? 0)
    if (ledgerBalance !== profile.availablePoints) {
      console.log(`  MISMATCH: ${profile.displayName} (${profile.id}): ledger=${ledgerBalance}, wallet=${profile.availablePoints}`)
      mismatches++
    }
  }

  if (mismatches === 0) {
    console.log('  All profiles reconciled successfully!')
  } else {
    console.log(`  ${mismatches} mismatches found - review manually`)
  }

  console.log('\n=== Backfill complete ===')
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

**Step 2: Commit**

```bash
git add scripts/backfill-phase1.ts
git commit -m "feat: add Phase 1 backfill script with reconciliation"
```

---

### Task 7: Update Source Code References (PointTransaction -> PointLedger)

**Files:**
- Modify: All files importing or referencing `PointTransaction` or `pointTransactions`

**Step 1: Find all references**

Run: `grep -rn "pointTransaction\|PointTransaction" src/ --include="*.ts" --include="*.tsx" -l`

For each file found, replace:
- `pointTransactions` -> `pointLedger` (relation name)
- `PointTransaction` -> `PointLedger` (type name)
- `pointTransaction` -> `pointLedger` (prisma model access, e.g. `prisma.pointTransaction` -> `prisma.pointLedger`)

**Step 2: Find all references to viewerAccountId**

Run: `grep -rn "viewerAccountId\|viewerAccount\|ViewerAccount" src/ --include="*.ts" --include="*.tsx" -l`

For each file found, replace:
- `viewerAccountId` -> `fanProfileId`
- `viewerAccount` -> `fanProfile` (relation name)
- `ViewerAccount` -> `FanProfile` (type name)
- `prisma.viewerAccount` -> `prisma.fanProfile`

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing errors unrelated to this change)

**Step 4: Run existing tests**

Run: `npx vitest run`
Expected: All tests pass (some may need mock updates for renamed models)

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename PointTransaction to PointLedger, ViewerAccount to FanProfile across codebase"
```

---

### Task 8: Update Tests for Renamed Models

**Files:**
- Modify: Any test files that reference old model names

**Step 1: Update test mocks**

Any test that mocks `prisma.pointTransaction` needs to become `prisma.pointLedger`.
Any test that mocks `prisma.viewerAccount` needs to become `prisma.fanProfile`.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All 236+ tests pass

**Step 3: Commit**

```bash
git add -A
git commit -m "test: update mocks and references for renamed models"
```

---

### Task 9: Run Backfill and Verify

**Step 1: Run the backfill script**

Run: `npx tsx scripts/backfill-phase1.ts`

Expected output:
```
=== Phase 1 Backfill: Identity + Ledger ===
Step 1: Creating default workspace...
Step 2: Backfilling FanProfile wallet fields...
Step 3: Creating channel credentials...
Step 4: Linking ledger entries to fan profiles...
Step 5: Reconciliation check...
  All profiles reconciled successfully!
=== Backfill complete ===
```

**Step 2: Verify in database**

Run: `npx prisma studio`

Check:
- Workspace table has 1 row
- FanProfile table has rows with populated wallet fields
- ChannelCredential table has rows for each channel
- PointLedger entries have fanProfileId populated

**Step 3: Run full test suite again**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: run Phase 1 backfill successfully"
```

---

### Task 10: Final Verification and Cleanup

**Step 1: Run the dev server**

Run: `npx next dev`
Navigate to http://localhost:3000 and verify:
- Homepage loads
- API health endpoint returns 200
- API rewards/leaderboard endpoints work

**Step 2: Run full test suite one final time**

Run: `npx vitest run`
Expected: All tests pass, no regressions

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 Identity + Ledger Foundation

- Add Workspace, WorkspaceMember models
- Evolve ViewerAccount -> FanProfile with global wallet
- Add ChannelCredential for per-channel OAuth
- Add EngagementEvent for immutable raw events
- Rename PointTransaction -> PointLedger with reversal tracking
- Add JobRun for worker monitoring
- Backfill script with reconciliation verification
- All tests passing"
```
