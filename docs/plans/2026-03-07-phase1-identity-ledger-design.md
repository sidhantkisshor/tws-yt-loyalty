# Phase 1: Identity + Ledger Foundation

## Objective

Introduce global fan identity, immutable point ledger, per-channel OAuth credentials, raw event tracking, and job monitoring. This enables cross-channel loyalty with a single wallet per fan.

## New Tables

### Workspace

Container for the loyalty program. One workspace per deployment.

| Column | Type | Notes |
|--------|------|-------|
| id | String (cuid) | PK |
| name | String | e.g. "My Loyalty Program" |
| slug | String (unique) | URL-safe identifier |
| ownerId | FK -> User | Creator of the workspace |
| settings | Json | timezone, currency, quotaLimit |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### WorkspaceMember

Links admin users to workspace with roles.

| Column | Type | Notes |
|--------|------|-------|
| id | String (cuid) | PK |
| workspaceId | FK -> Workspace | |
| userId | FK -> User | |
| role | Enum | OWNER, ADMIN, MODERATOR |
| createdAt | DateTime | |

Unique constraint: (workspaceId, userId)

### FanProfile (renamed from ViewerAccount)

Canonical fan identity with global wallet. Evolved from ViewerAccount.

| Column | Type | Notes |
|--------|------|-------|
| id | String (cuid) | PK (keep existing ViewerAccount IDs) |
| googleId | String (unique) | Google account identifier |
| email | String | |
| displayName | String | |
| profileImageUrl | String? | |
| totalPoints | Int (default 0) | Aggregated from all channels |
| availablePoints | Int (default 0) | Spendable balance |
| lifetimePoints | Int (default 0) | Never decreases |
| rank | ViewerRank (default PAPER_TRADER) | Global rank |
| trustScore | Float (default 50.0) | Global trust |
| currentStreak | Int (default 0) | Cross-channel streak |
| longestStreak | Int (default 0) | |
| isBanned | Boolean (default false) | Global ban |
| banReason | String? | |
| bannedAt | DateTime? | |
| workspaceId | FK -> Workspace | nullable during migration |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### ChannelCredential

Per-channel OAuth tokens. Supports different Google accounts per channel.

| Column | Type | Notes |
|--------|------|-------|
| id | String (cuid) | PK |
| channelId | FK -> Channel (unique) | One credential per channel |
| googleAccountEmail | String | Which Google account owns this |
| accessToken | String | Encrypted at rest |
| refreshToken | String | Encrypted at rest |
| tokenExpiresAt | DateTime? | |
| tokenStatus | Enum | VALID, EXPIRED, REVOKED |
| lastRefreshedAt | DateTime? | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### EngagementEvent

Immutable raw events from YouTube. Idempotent via externalId.

| Column | Type | Notes |
|--------|------|-------|
| id | String (cuid) | PK |
| fanProfileId | FK -> FanProfile | nullable during migration |
| channelId | FK -> Channel | |
| streamId | FK -> Stream | nullable (non-stream events) |
| externalId | String (unique) | YouTube message ID or synthetic |
| eventType | Enum | CHAT_MESSAGE, SUPER_CHAT, MEMBERSHIP, CODE_REDEMPTION, ATTENDANCE |
| payload | Json | Raw event data |
| occurredAt | DateTime | When it happened on YouTube |
| ingestedAt | DateTime (default now) | When we recorded it |

Indexes: (channelId, occurredAt), (fanProfileId), (eventType)

### PointLedger (renamed from PointTransaction)

Immutable credit/debit entries. Evolved from PointTransaction.

| Column | Type | Notes |
|--------|------|-------|
| id | String (cuid) | PK (keep existing IDs) |
| fanProfileId | FK -> FanProfile | nullable during migration |
| viewerId | FK -> Viewer | nullable, kept for channel context |
| streamId | FK -> Stream? | |
| type | TransactionType | Keep existing enum |
| amount | Int | |
| balanceBefore | Int | |
| balanceAfter | Int | |
| referenceType | String? | |
| referenceId | String? | |
| description | String? | |
| adjustedBy | String? | |
| isReversed | Boolean (default false) | NEW: audit trail |
| reversedBy | String? | NEW |
| reversedAt | DateTime? | NEW |
| createdAt | DateTime | |

### JobRun

Tracks ingestion/scoring job execution.

| Column | Type | Notes |
|--------|------|-------|
| id | String (cuid) | PK |
| jobType | Enum | INGEST_CHAT, DAILY_SCORING, FRAUD_SCAN, BACKFILL |
| status | Enum | PENDING, RUNNING, COMPLETED, FAILED |
| channelId | FK -> Channel? | nullable for global jobs |
| startedAt | DateTime? | |
| completedAt | DateTime? | |
| eventsProcessed | Int (default 0) | |
| errorsCount | Int (default 0) | |
| errorMessage | String? | |
| metadata | Json? | |
| createdAt | DateTime (default now) | |

## Changes to Existing Tables

### Viewer

Remove global wallet fields (moved to FanProfile):
- Remove: totalPoints, availablePoints, lifetimePoints, rank, trustScore, isBanned, banReason, bannedAt, bannedBy, currentStreak, longestStreak
- Keep: channel-specific fields (attendance, messages, member/mod, watch time, referral, segment, etc.)
- Add: fanProfileId FK -> FanProfile (nullable during migration)
- Rename: viewerAccountId -> fanProfileId (since ViewerAccount becomes FanProfile)

### Channel

- Add: workspaceId FK -> Workspace (nullable during migration)
- Add: channelCredential relation

### User

- Remove: googleAccessToken, googleRefreshToken, googleTokenExpiry
- User is admin auth only; YouTube API tokens live in ChannelCredential

### PointTransaction -> PointLedger

- Rename table
- Add: fanProfileId FK
- Add: isReversed, reversedBy, reversedAt

## Backfill Strategy

All backfill runs as a TypeScript script, not in migration SQL.

### Step 1: Create default Workspace
- Insert one Workspace row for the deployment

### Step 2: Evolve ViewerAccount -> FanProfile
- Rename table
- Add new columns with defaults
- For each FanProfile: aggregate points from all linked Viewer rows
  - totalPoints = MAX(v.totalPoints) across linked viewers
  - availablePoints = SUM(v.availablePoints)
  - lifetimePoints = MAX(v.lifetimePoints)
  - rank = highest rank among linked viewers
  - trustScore = AVG(v.trustScore)
  - streaks = MAX values

### Step 3: Create ChannelCredentials
- For each Channel: create ChannelCredential from owner User's OAuth tokens
- Copy accessToken, refreshToken, tokenExpiry from User to ChannelCredential

### Step 4: Link PointTransaction -> FanProfile
- For each PointTransaction: look up Viewer -> FanProfile mapping, set fanProfileId

### Step 5: Set Channel.workspaceId
- All existing channels get linked to the default workspace

### Step 6: Reconciliation
- For each FanProfile: verify SUM(ledger credits) - SUM(ledger debits) = availablePoints
- Report mismatches for manual review

## Migration Safety

1. All new FKs are nullable initially
2. Backfill script runs after migration
3. Follow-up migration adds NOT NULL constraints after verification
4. No existing data is deleted until backfill is confirmed
5. Viewer rows are kept (channel-specific data) but wallet fields become read-through to FanProfile

## Endpoint Migration (Post-Schema)

After schema is stable, update these endpoints to read/write FanProfile:
- Leaderboard API: rank by FanProfile.totalPoints globally
- Viewer profile API: return FanProfile wallet
- Reward redemption: deduct from FanProfile.availablePoints
- Code redemption: credit to FanProfile + write PointLedger

This is a follow-up phase, not part of this migration.
