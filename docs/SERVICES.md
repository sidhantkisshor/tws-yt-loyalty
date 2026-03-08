# Services & Business Logic

Core business logic lives in `src/services/` and `src/lib/`. This document explains each service's purpose, algorithms, and configuration.

## Fraud Detection (`src/services/fraudDetection.ts`)

The fraud detection system uses a **trust score** model (0-100) rather than binary allow/deny.

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

---

## Bonus Calculator (`src/services/bonusCalculator.ts`)

Calculates all point bonuses applied on top of base code values.

### Bonus Types

| Bonus | Value | Condition |
|-------|-------|-----------|
| Streak bonus | +10% per consecutive stream (max +50%) | Must attend consecutive streams |
| Rank bonus | 0% to +50% based on rank | See rank table below |
| Early bird | +25 points | Join within first 5 minutes |
| Full stream | +100 points | Attend from start to end |
| Member bonus | Configurable per code | YouTube channel member |
| Moderator bonus | Configurable per code | Channel moderator |

### Rank Earning Boosts

| Rank | Boost |
|------|-------|
| Paper Trader | 0% |
| Retail Trader | +10% |
| Swing Trader | +20% |
| Fund Manager | +35% |
| Market Maker | +50% |
| Hedge Fund | +50% |
| Whale | +50% |

The calculator returns a detailed breakdown object showing each bonus applied and the final total.

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
- Viewers can purchase **streak pauses** to protect their streak when they can't attend

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
- Updated daily via cron job
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
| `checkQuotaAvailable(channelId)` | 0 | None |
| `extractVideoId(url)` | 0 | None |

### Quota Budget
- Default daily limit: 10,000 units (configurable via `YOUTUBE_DAILY_QUOTA_LIMIT`)
- Most polling uses 1 unit per call
- Code announcements cost 50 units each
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
