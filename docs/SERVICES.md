# Services & Business Logic

Core business logic lives in `src/services/` and `src/lib/`. This document explains each service's purpose, algorithms, and configuration.

## Token Manager (`src/services/tokenManager.ts`)

Manages per-channel OAuth token lifecycle. Each channel stores its own Google OAuth credentials in `ChannelCredential`.

### Key Functions

| Function | Purpose |
|----------|---------|
| `refreshChannelToken(channelId)` | Exchanges refresh token for new access token via Google OAuth |
| `getValidCredentials(channelId)` | Returns valid credentials, auto-refreshing if within 5-minute expiry buffer |
| `checkAllChannelHealth()` | Iterates all channels, attempts refresh on expiring tokens, returns health summary |
| `isTokenExpired(expiresAt)` | True if token is past expiry |
| `shouldRefreshToken(expiresAt)` | True if token expires within 5 minutes |

### Token Status Flow

```
VALID → (expiry approaching) → auto-refresh → VALID
VALID → (refresh fails: invalid_grant) → REVOKED
VALID → (refresh fails: other) → remains VALID (retry next cycle)
EXPIRED → (no refresh token) → REVOKED
```

On `invalid_grant`, the credential is marked `REVOKED` and the channel owner must reconnect via the OAuth flow.

---

## Job Tracker (`src/services/jobTracker.ts`)

Records cron job execution lifecycle in the `JobRun` table.

### Interface

```typescript
startJob(jobType, channelId?, metadata?) → JobContext { jobRunId, eventsProcessed, errorsCount }
completeJob(ctx)    → sets status=COMPLETED, records counts
failJob(ctx, error) → sets status=FAILED, records error message
```

Workers increment `ctx.eventsProcessed` and `ctx.errorsCount` during execution. The ops monitoring dashboard queries `JobRun` for health metrics and failure trends.

---

## Batch Anti-Cheat (`src/services/batchAntiCheat.ts`)

Runs fraud analysis on daily event batches. Separate from real-time fraud detection (which handles redemption-time checks).

### Rules

| Rule | Trigger | Severity | Point Penalty | Trust Penalty |
|------|---------|----------|---------------|---------------|
| Velocity anomaly | >100 messages in any 1-hour window | HIGH | 50% | -15 |
| Duplicate text | >60% of messages are identical (min 5 msgs) | MEDIUM | 30% | -10 |
| Timing patterns | Message interval stddev < 500ms over 20+ messages | HIGH | 50% | -20 |
| Rapid account | Account < 24h old with > 50 events | LOW | 20% | -5 |

`runBatchAntiCheat(fanProfileId, events, fanProfile)` runs all four rules and returns an array of `FraudFlag` objects. The daily scoring engine uses the highest penalty percentage among all flags.

---

## Daily Scoring (`src/services/dailyScoring.ts`)

Core scoring engine that processes `EngagementEvent` records in batch, calculates points, runs anti-cheat, and creates `PointLedger` entries.

### Scoring Config

| Parameter | Default | Description |
|-----------|---------|-------------|
| `chatPointsPerMessage` | 1 | Points per chat message |
| `chatDailyCap` | 50 | Max chat points per day |
| `commentPointsPerComment` | 2 | Points per video comment |
| `commentDailyCap` | 20 | Max comment points per day |
| `superChatMultiplier` | 0.1 | 10% of super chat amount in cents |
| `attendancePoints` | 5 | Points per stream attended |
| `channelMultipliers` | {} | Per-channel point multiplier (default 1.0) |

### Pipeline

1. **Window calculation**: Finds the last successful `DAILY_SCORING` JobRun's completion time. Events between that time and now are in scope.
2. **Event aggregation**: Groups `EngagementEvent` records by `fanProfileId`.
3. **Base points**: Calculates per-type points with daily caps.
4. **Anti-cheat**: Runs `batchAntiCheat` on each fan's events. Creates `FraudEvent` records for flagged behavior.
5. **Multipliers**: Applies channel multiplier (averaged across channels) and fraud penalty (highest %).
6. **Settlement**: Creates `PointLedger` entries and updates `FanProfile` totals in a `ReadCommitted` transaction. Fans are processed in batches of 500.

---

## Fulfillment (`src/services/fulfillment.ts`)

Handles digital reward delivery.

### `fulfillRedemption(redemptionId)`

1. Loads the `RewardRedemption` with its reward config
2. Skips non-digital and cancelled redemptions
3. Atomically claims the redemption via `updateMany` with `deliveryStatus != DELIVERED` filter
4. Generates a unique code: `{PREFIX}-{UUID_SEGMENT}` (e.g., `REWARD-A1B2C3D4E5F6`)
5. Updates status to `DELIVERED` with `deliveredAt` timestamp

Idempotent: re-processing an already-delivered redemption returns the existing code. On failure, status is set to `FAILED` with error in `adminNotes`.

### `retryFailedFulfillments()`

Finds up to 100 `FAILED` digital redemptions (oldest first) and re-runs `fulfillRedemption` on each.

---

## Ops Monitor (`src/services/opsMonitor.ts`)

Provides system health metrics and alert generation for the admin ops dashboard.

### `getSystemHealth()`

Runs six checks in parallel:

| Check | Metrics |
|-------|---------|
| Database | Latency (ms), status (healthy/degraded/down) |
| Redis | Latency (ms), status |
| Channels | Token counts by status (VALID/EXPIRED/REVOKED) |
| Jobs | Failure count (24h), avg duration, last run per job type |
| Ingestion | Lag (minutes since last ingest), events in last 24h and last hour |
| Quota | YouTube API daily usage vs limit |

### `generateAlerts()`

Produces alerts based on thresholds:

| Condition | Severity |
|-----------|----------|
| Ingestion lag > 2 hours | CRITICAL |
| Ingestion lag > 30 min | WARNING |
| Job failures in last hour | WARNING |
| Expired channel tokens | WARNING |
| Revoked channel tokens | WARNING |
| YouTube quota > 95% | CRITICAL |
| YouTube quota > 80% | WARNING |
| Database unreachable | CRITICAL |
| Database latency > 1000ms | WARNING |
| Redis unreachable | CRITICAL |
| Redis latency > 500ms | WARNING |

### `getJobHistory(days)`

Returns up to 500 `JobRun` records from the last N days with type, status, timing, and error information.

---

## Fraud Detection (`src/services/fraudDetection.ts`)

The real-time fraud detection system uses a **trust score** model (0-100) rather than binary allow/deny.

### Trust Score Calculation

| Factor | Impact | Cap |
|--------|--------|-----|
| Account age | +0.5 per day | +15 max |
| Streams attended | +2 per stream | +20 max |
| Messages sent | +0.01 per message | +5 max |
| YouTube member | +10 | - |
| YouTube moderator | +10 | - |
| Prior fraud events | -5 each | - |
| Recent fraud events (7 days) | -10 each | - |
| Redemption latency < 500ms | -20 (bot-like) | - |
| Redemption latency < 1000ms | -10 | - |

**Base score: 50.** Score is clamped to 0-100.

### Fraud Event Types

| Type | Trigger | Severity |
|------|---------|----------|
| INSTANT_RESPONSE | Redemption latency < 500ms | HIGH |
| RAPID_REDEMPTION | Too many redemptions in short window | MEDIUM |
| IDENTICAL_TIMING | Multiple viewers redeem at exact same time | HIGH |
| PATTERN_DETECTION | Correlated suspicious behavior across events | MEDIUM-HIGH |
| NEW_ACCOUNT | New account with suspicious behavior | LOW |
| MESSAGE_SPAM | Repeated duplicate messages (similarity hash) | LOW-MEDIUM |

### Review Workflow

Events start as `PENDING` and can be moved to:
- **CONFIRMED** - Fraud confirmed, penalties applied
- **FALSE_POSITIVE** - Not fraud, trust restored
- **ESCALATED** - Needs deeper investigation

The `fraud-scan` cron auto-confirms events based on: trust score < 20, CRITICAL severity, or 3+ HIGH severity events per viewer. Auto-confirmed events trigger point reversals and potential bans.

---

## Bonus Calculator (`src/services/bonusCalculator.ts`)

Calculates all point bonuses applied on top of base code values.

### Bonus Types

| Bonus | Value | Condition |
|-------|-------|-----------|
| Streak bonus | +10% per consecutive stream (max +50%) | Must attend consecutive streams |
| Rank bonus | 0% to +50% based on rank | See rank table |
| Early bird | +25 points | Join within first 5 minutes |
| Full stream | +100 points | Attend from start to end |
| Member bonus | Configurable per code | YouTube channel member |
| Moderator bonus | Configurable per code | Channel moderator |

---

## Watch Time Tracker (`src/services/watchTimeTracker.ts`)

Estimates viewer watch time from chat message frequency since YouTube doesn't provide direct watch time data.

### Algorithm
- Tracks time between first and last message in a stream
- Applies activity-based heuristics to estimate actual viewing time
- Awards points proportional to estimated minutes watched

---

## Streak Manager (`src/services/streakManager.ts`)

Tracks consecutive stream attendance.

### Rules
- Attending a stream increments `currentStreak`
- Missing a stream resets `currentStreak` to 0
- `longestStreak` records the all-time best
- Streak milestones (e.g., 5, 10, 25, 50) award bonus points via `STREAK_MILESTONE` transactions
- Viewers can purchase **streak pauses** to protect their streak

---

## Message Processor (`src/services/messageProcessor.ts`)

Processes incoming YouTube Live Chat messages.

### Pipeline
1. Receives batch of messages from YouTube API poll
2. Deduplicates by `youtubeMessageId`
3. Identifies message type (text, SuperChat, membership, etc.)
4. Detects loyalty codes in message text (via ChatCommandParser)
5. Computes similarity hash for spam detection
6. Creates `ChatMessage` records
7. Updates viewer stats (message count, last seen)

---

## Chat Command Parser (`src/services/chatCommandParser.ts`)

Extracts loyalty codes from chat messages.

### Detection
- Matches against known active codes (stored in Redis)
- Handles common typos and case variations
- Validates code format before processing
- Returns matched code or null

---

## Segmentation (`src/services/segmentation.ts`)

Assigns viewers to segments for analytics and A/B testing.

### Segmentation Criteria
- Based on engagement metrics (points, streams attended, messages)
- Updated periodically via cron job (every 6 hours)
- Used for targeted analytics and feature experimentation

---

## Webhook Dispatcher (`src/services/webhookDispatcher.ts`)

Sends events to configured external webhooks.

### Features
- Dispatches events (code redeemed, reward purchased, stream started, etc.)
- Signs payloads with webhook secret for verification
- Retries failed deliveries with exponential backoff
- Tracks delivery status and failure count
- Automatically disables webhooks after repeated failures

---

## Redis Operations (`src/lib/redis.ts`)

Redis is used extensively for hot data that needs fast access.

### Leaderboards
- `updateStreamLeaderboard(streamId, viewerId, points)` - sorted set, 7-day TTL
- `updateChannelLeaderboard(channelId, viewerId, points)` - sorted set, 30-day TTL
- `getStreamLeaderboard(streamId, limit)` - top N for a stream
- `getChannelLeaderboard(channelId, limit)` - top N for a channel
- `getViewerRank(channelId, viewerId)` - viewer's position

### Distributed Locks
- `acquireLock(key, ttlSeconds)` - SET NX EX, returns lock ID or null
- `releaseLock(key, lockId)` - Lua atomic compare-and-delete
- `isLocked(key)` - check if lock exists

### Active Codes
- `setActiveCode(streamId, code)` - store currently active code
- `getActiveCode(streamId)` - retrieve active code
- `clearActiveCode(streamId)` - remove active code

### Stream State
- `setStreamState(streamId, state)` - store polling state (next page token, etc.)
- `getStreamState(streamId)` - retrieve state
- `updateStreamState(streamId, partial)` - partial update
- `clearStreamState(streamId)` - cleanup after stream ends

### Fraud Tracking
- `trackRedemption(viewerId, timestamp)` - record redemption time
- `getRecentRedemptionCount(viewerId, windowMs)` - count recent redemptions
- `checkIdenticalTiming(viewerId, codeId, timestamp)` - detect synchronized bots

### Quota Management
- `incrementQuota(channelId, type)` - track API usage per channel
- `getQuotaUsage(channelId)` - current usage
- `incrementGlobalQuota()` - global API counter

---

## YouTube API (`src/lib/youtube.ts`)

Wrapper around the Google YouTube Data API v3.

### Functions

| Function | Quota Cost | Cache |
|----------|-----------|-------|
| `getLiveChatId(videoId)` | 1 unit | 1 hour |
| `pollLiveChatMessages(chatId, pageToken)` | 1 unit | None |
| `postLiveChatMessage(chatId, message)` | 50 units | None |
| `getChannelInfo()` | 1 unit | None |
| `getVideoInfo(videoId)` | 1 unit | 5 minutes |
| `searchChannelVideos(channelId, creds, since)` | 100 units | None |
| `getVideoComments(videoId, creds, pageToken)` | 1 unit | None |
| `checkQuotaAvailable(channelId)` | 0 | None |
| `extractVideoId(url)` | 0 | None |

### Quota Budget
- Default daily limit: 10,000 units (configurable via `YOUTUBE_DAILY_QUOTA_LIMIT`)
- Most polling uses 1 unit per call
- Code announcements cost 50 units each
- Video search costs 100 units per call
- Quota resets daily at midnight Pacific Time

---

## Environment Validation (`src/lib/env.ts`)

Uses Zod to validate all environment variables at startup. The app will not start with missing or invalid configuration.

### Validated Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_URL` - App URL
- `NEXTAUTH_SECRET` - Session encryption key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth credentials
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - Redis credentials
- `CRON_SECRET` - Cron job authentication
- `ADMIN_EMAILS` - Comma-separated admin email list

**Optional:**
- `DIRECT_URL` - Direct DB connection for migrations
- `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`
- `YOUTUBE_DAILY_QUOTA_LIMIT` - Override default 10,000
