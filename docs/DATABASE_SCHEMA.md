# Database Schema

PostgreSQL database managed via Prisma ORM. The schema contains models organized into 7 domains.

## Entity Relationship Overview

```
User (admin) ──< Channel ──< Stream ──< StreamAttendance >── Viewer
    │               │            │                              │
    │               │            ├──< LoyaltyCode              ├──< PointLedger
    │               │            │       └──< CodeRedemption    ├──< RewardRedemption
    │               │            ├──< ChatMessage               ├──< FraudEvent
    │               │            ├──< StreamPoll ──< PollResponse├──< HomeworkSubmission
    │               │            ├──< EngagementEvent           ├──< ViewerAccount
    │               │            └──< HelpfulUpvote             └──< Referral
    │               │
    │               ├──< ChannelCredential (1:1)
    │               ├──< EngagementEvent
    │               └──< JobRun
    │
    └──< Workspace ──< Channel
              │
              ├──< WorkspaceMember
              └──< FanProfile ──< Viewer (1:many)
                       │
                       ├──< PointLedger
                       └──< EngagementEvent
```

## Models by Domain

### Authentication & Users

#### User
Admin/streamer accounts that manage channels.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| name | String? | Display name |
| email | String (unique) | Login email |
| role | UserRole | ADMIN or STREAMER |

Relations: `accounts`, `sessions`, `channels`, `workspaces`, `workspaceMembers`

#### Account, Session, VerificationToken
Standard NextAuth models for OAuth state management.

---

### Workspace & Identity

#### Workspace
Groups channels and fan profiles under a single admin.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| name | String | Workspace display name |
| slug | String (unique) | URL-safe identifier |
| ownerId | String | User who owns this workspace |
| settings | Json | Workspace configuration (timezone, etc.) |

Relations: `owner`, `members`, `channels`, `fanProfiles`

#### WorkspaceMember
Associates users with workspaces with a role.

| Field | Type | Description |
|-------|------|-------------|
| workspaceId | String | Workspace |
| userId | String | User |
| role | WorkspaceMemberRole | OWNER, ADMIN, or MODERATOR |

Unique constraint: `(workspaceId, userId)`

#### FanProfile
Global identity and point wallet. Keyed by Google ID, aggregates points across all channels a fan participates in.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| googleId | String (unique) | Google account identifier |
| email | String | Fan's email |
| displayName | String | Display name |
| profileImageUrl | String? | Profile image |
| totalPoints | Int (default 0) | Current total points |
| availablePoints | Int (default 0) | Spendable points |
| lifetimePoints | Int (default 0) | All-time points earned |
| rank | ViewerRank | Current rank tier |
| trustScore | Float (default 50) | Anti-fraud trust score (0-100) |
| currentStreak | Int (default 0) | Consecutive streams attended |
| longestStreak | Int (default 0) | Best streak ever |
| isBanned | Boolean | Banned from earning points |
| banReason | String? | Reason for ban |
| workspaceId | String? | Workspace scope |

Relations: `workspace`, `viewers`, `pointLedger`, `engagementEvents`

Key indexes: `googleId`, `email`, `workspaceId`, `totalPoints`, `rank`

#### ChannelCredential
Per-channel OAuth tokens for YouTube API access. One-to-one with Channel.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| channelId | String (unique) | Channel this credential belongs to |
| googleAccountEmail | String | Google account used to authenticate |
| accessToken | String | YouTube API access token |
| refreshToken | String | YouTube API refresh token |
| tokenExpiresAt | DateTime? | Token expiration |
| tokenStatus | TokenStatus | VALID, EXPIRED, or REVOKED |
| lastRefreshedAt | DateTime? | Last successful refresh |

Relations: `channel`

---

### Core Entities

#### Channel
YouTube channels connected to the platform.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| youtubeChannelId | String (unique) | YouTube channel ID |
| title | String | Channel display name |
| thumbnailUrl | String? | Channel thumbnail |
| ownerId | String | User who owns this channel |
| isActive | Boolean | Whether the channel is active |
| workspaceId | String? | Workspace this channel belongs to |
| dailyQuotaUsed | Int | YouTube API quota consumed today |
| dailyQuotaResetAt | DateTime | When quota resets |
| quotaLimit | Int (default 10000) | Daily quota limit |

Relations: `owner`, `workspace`, `streams`, `viewers`, `channelCredential`, `engagementEvents`, `jobRuns`, `rewardConfigs`

#### Viewer
A chat participant tracked per channel. Multiple Viewer records can link to a single FanProfile.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| youtubeChannelId | String | Viewer's YouTube channel ID |
| displayName | String | Current display name |
| channelId | String | Which Channel they belong to |
| fanProfileId | String? | Link to global FanProfile |
| totalPoints | Int (default 0) | Per-channel total points |
| availablePoints | Int (default 0) | Per-channel spendable points |
| lifetimePoints | Int (default 0) | Per-channel lifetime points |
| rank | ViewerRank | Current rank tier |
| trustScore | Float (default 50) | Anti-fraud trust score (0-100) |
| currentStreak | Int (default 0) | Consecutive streams attended |
| longestStreak | Int (default 0) | Best streak ever |
| totalStreamsAttended | Int (default 0) | Total streams attended |
| totalMessagesCount | Int (default 0) | Total chat messages |
| totalCodesRedeemed | Int (default 0) | Total codes redeemed |
| totalWatchTimeMinutes | Int (default 0) | Estimated total watch time |
| isBanned | Boolean | Banned from earning points |
| referralCode | String? (unique) | Viewer's referral code |

Unique constraint: `(youtubeChannelId, channelId)`
Key indexes: `fanProfileId`, `(channelId, trustScore)`, `(channelId, totalPoints)`

#### Stream
A YouTube livestream or video.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| youtubeVideoId | String (unique) | YouTube video ID |
| title | String | Stream title |
| channelId | String | Channel this stream belongs to |
| status | StreamStatus | SCHEDULED, LIVE, ENDED, CANCELLED |
| isPollingActive | Boolean | Currently polling chat |
| nextPageToken | String? | YouTube API pagination token |
| youtubeLiveChatId | String? | YouTube live chat ID |
| actualStartAt | DateTime? | When stream went live |
| endedAt | DateTime? | When stream ended |
| peakConcurrentChatters | Int | Peak concurrent viewers |
| totalUniqueChatters | Int | Total unique viewers |
| totalMessagesProcessed | Int | Total chat messages |
| totalPointsAwarded | Int | Total points given out |

Relations: `channel`, `loyaltyCodes`, `chatMessages`, `streamAttendances`, `engagementEvents`, `polls`

#### StreamAttendance
Per-viewer participation record for each stream.

| Field | Type | Description |
|-------|------|-------------|
| viewerId | String | Viewer |
| streamId | String | Stream |
| firstMessageAt | DateTime | First message timestamp |
| lastMessageAt | DateTime | Last message timestamp |
| messageCount | Int | Messages sent |
| codesRedeemed | Int | Codes redeemed |
| estimatedWatchTimeMinutes | Int | Estimated watch time |
| pointsEarned | Int | Points earned this stream |
| earlyBirdBonus | Boolean | Arrived in first 5 minutes |
| fullStreamBonus | Boolean | Attended entire stream |
| wasSponsor | Boolean | YouTube member at time |
| wasModerator | Boolean | Moderator at time |

Unique constraint: `(streamId, viewerId)`

---

### Points & Rewards

#### PointLedger
Immutable ledger of all point changes. Replaces the earlier PointTransaction model.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| fanProfileId | String? | Global wallet (FanProfile) |
| viewerId | String? | Per-channel viewer (legacy) |
| streamId | String? | Associated stream |
| type | TransactionType | See enum below |
| amount | Int | Amount (+/-) |
| balanceBefore | Int | Balance before this entry |
| balanceAfter | Int | Balance after this entry |
| referenceType | String? | Source system (e.g., DAILY_SCORING, FRAUD_SCAN) |
| referenceId | String? | Source record ID |
| description | String? | Human-readable description |
| isReversed | Boolean | Whether this entry has been reversed |
| reversedBy | String? | Who/what reversed it |
| reversedAt | DateTime? | When it was reversed |

Key indexes: `fanProfileId`, `viewerId`, `streamId`, `createdAt`, `type`

**TransactionType enum**: CODE_REDEMPTION, CHAT_ACTIVITY, ATTENDANCE_BONUS, STREAK_BONUS, RANK_BONUS, WATCH_TIME, MANUAL_CREDIT, MANUAL_DEBIT, REWARD_REDEMPTION, FRAUD_REVERSAL, REFERRAL_BONUS, HOMEWORK_SUBMISSION, POLL_PARTICIPATION, CTA_BONUS, QUALITY_QUESTION, HELPFUL_UPVOTE, STREAK_MILESTONE, COURSE_COMPLETION, MODULE_COMPLETION, STREAK_PAUSE_COST, SUPER_CHAT_BONUS

#### LoyaltyCode
Codes displayed during livestreams for viewers to redeem.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| code | String | The code string |
| streamId | String | Stream it belongs to |
| codeType | CodeType | STANDARD, FLASH, BONUS, FIRST_RESPONSE |
| basePoints | Int | Base point value |
| memberBonus | Int | Extra points for members |
| modBonus | Int | Extra points for moderators |
| firstResponseBonus | Int | Extra for first redeemers |
| firstResponseLimit | Int | How many get the first response bonus |
| validFrom | DateTime | When code becomes active |
| validUntil | DateTime | When code expires |
| maxRedemptions | Int? | Max total redemptions |
| currentRedemptions | Int | Current redemption count |

Unique constraint: `(streamId, code)`

#### CodeRedemption
Record of a viewer redeeming a code.

| Field | Type | Description |
|-------|------|-------------|
| viewerId | String | Who redeemed |
| codeId | String | Which code |
| pointsAwarded | Int | Points given |
| bonusType | String? | Type of bonus applied |
| redemptionLatencyMs | Int | Time from code announcement to redemption |
| trustScoreAtTime | Float | Viewer's trust score at redemption |
| flaggedForReview | Boolean | Suspicious redemption |

Unique constraint: `(codeId, viewerId)` - one redemption per code per viewer

#### RewardConfig
Available rewards viewers can purchase with tokens.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| channelId | String | Channel this reward belongs to |
| name | String | Reward name |
| description | String? | Reward description |
| rewardType | RewardType | DIGITAL or PHYSICAL |
| tokenCost | Int | Cost in tokens (1 token = 1000 points) |
| category | RewardCategory | GATEWAY, ENGAGEMENT, COMMITMENT, PREMIUM, PRESTIGE, ROTATING |
| minTrustScore | Float | Minimum trust score required (default 30) |
| minAccountAgeDays | Int | Minimum account age (default 7) |
| minRank | ViewerRank? | Minimum rank required |
| stockQuantity | Int? | Available stock (null = unlimited) |
| isActive | Boolean | Currently available |

#### RewardRedemption
A viewer's reward purchase.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| viewerId | String | Buyer |
| rewardId | String | Reward purchased |
| tokensSpent | Int | Tokens spent |
| pointsSpent | Int | Points spent (tokensSpent * 1000) |
| deliveryStatus | DeliveryStatus | PENDING, PROCESSING, SHIPPED, DELIVERED, FAILED, CANCELLED |
| rewardCode | String? | Generated code (for digital, set by fulfillment) |
| deliveredAt | DateTime? | When delivered |
| shippingAddress | String? | For physical rewards |
| trackingNumber | String? | Shipping tracking |
| adminNotes | String? | Internal notes |

---

### Engagement Events

#### EngagementEvent
Immutable raw event log. All ingested activity lands here before scoring.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| fanProfileId | String? | Link to FanProfile (null if not yet matched) |
| channelId | String | Channel the event occurred on |
| streamId | String? | Stream (if applicable) |
| externalId | String (unique) | Dedup key (YouTube message ID, comment ID, etc.) |
| eventType | EngagementEventType | CHAT_MESSAGE, SUPER_CHAT, MEMBERSHIP, CODE_REDEMPTION, ATTENDANCE, VIDEO_COMMENT |
| payload | Json | Event-specific data |
| occurredAt | DateTime | When the event happened |
| ingestedAt | DateTime | When it was ingested |

Key indexes: `(channelId, occurredAt)`, `fanProfileId`, `eventType`, `externalId`

#### JobRun
Tracks background job execution lifecycle.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| jobType | JobType | INGEST_CHAT, INGEST_COMMENTS, DISCOVER_VIDEOS, DAILY_SCORING, FRAUD_SCAN, BACKFILL |
| status | JobStatus | PENDING, RUNNING, COMPLETED, FAILED |
| channelId | String? | Channel (if job is channel-scoped) |
| startedAt | DateTime? | When job started |
| completedAt | DateTime? | When job finished |
| eventsProcessed | Int | Items processed |
| errorsCount | Int | Errors encountered |
| errorMessage | String? | Error details (on failure) |
| metadata | Json? | Additional context |

Key indexes: `(jobType, status)`, `channelId`, `createdAt`

---

### Chat & Community

#### ChatMessage
Messages from YouTube livestream chat.

| Field | Type | Description |
|-------|------|-------------|
| youtubeMessageId | String (unique) | YouTube message ID |
| streamId | String | Stream |
| viewerId | String | Sender |
| messageText | String | Message text |
| messageType | String | textMessageEvent, superChatEvent, etc. |
| isSuperChat | Boolean | Is a super chat |
| superChatAmount | Float? | SuperChat amount |
| containsCode | Boolean | Contains a loyalty code |
| similarityHash | String? | For spam detection |
| flaggedAsSuspicious | Boolean | Flagged as suspicious |

#### StreamPoll, PollResponse
In-stream polls with viewer responses and point rewards.

#### HelpfulUpvote
Community voting system where viewers upvote quality contributors.

#### HomeworkSubmission
Viewer-submitted homework with admin review (PENDING, APPROVED, REJECTED).

---

### Anti-Fraud & Monitoring

#### FraudEvent
Detected fraud incidents.

| Field | Type | Description |
|-------|------|-------------|
| viewerId | String | Suspect viewer |
| streamId | String? | Associated stream |
| eventType | FraudEventType | Type of fraud detected |
| severity | FraudSeverity | LOW, MEDIUM, HIGH, CRITICAL |
| description | String | Human-readable description |
| evidence | Json? | Supporting data |
| trustPenaltyApplied | Float | Trust score reduction |
| wasAutoBanned | Boolean | Whether auto-ban was triggered |
| reviewStatus | ReviewStatus | PENDING, CONFIRMED, FALSE_POSITIVE, ESCALATED |
| reviewedAt | DateTime? | When reviewed |
| reviewedBy | String? | Who reviewed |
| reviewNotes | String? | Review notes |

#### AuditLog
Complete audit trail for admin actions (entity type, action, before/after values).

#### QuotaUsageLog
Daily YouTube API quota tracking per channel.

#### WebhookConfig & WebhookDelivery
Outgoing webhook subscriptions and delivery tracking.

#### StreakPause
Records of viewers purchasing streak pauses to protect their streaks.

---

## Enums

| Enum | Values |
|------|--------|
| UserRole | ADMIN, STREAMER |
| ViewerRank | PAPER_TRADER, RETAIL_TRADER, SWING_TRADER, FUND_MANAGER, MARKET_MAKER, HEDGE_FUND, WHALE |
| StreamStatus | SCHEDULED, LIVE, ENDED, CANCELLED |
| CodeType | STANDARD, FLASH, BONUS, FIRST_RESPONSE |
| RewardType | DIGITAL, PHYSICAL |
| RewardCategory | GATEWAY, ENGAGEMENT, COMMITMENT, PREMIUM, PRESTIGE, ROTATING |
| DeliveryStatus | PENDING, PROCESSING, SHIPPED, DELIVERED, FAILED, CANCELLED |
| FraudEventType | INSTANT_RESPONSE, RAPID_REDEMPTION, IDENTICAL_TIMING, PATTERN_DETECTION, NEW_ACCOUNT, MESSAGE_SPAM |
| FraudSeverity | LOW, MEDIUM, HIGH, CRITICAL |
| ReviewStatus | PENDING, CONFIRMED, FALSE_POSITIVE, ESCALATED |
| HomeworkStatus | PENDING, APPROVED, REJECTED |
| TokenStatus | VALID, EXPIRED, REVOKED |
| EngagementEventType | CHAT_MESSAGE, SUPER_CHAT, MEMBERSHIP, CODE_REDEMPTION, ATTENDANCE, VIDEO_COMMENT |
| JobType | INGEST_CHAT, INGEST_COMMENTS, DISCOVER_VIDEOS, DAILY_SCORING, FRAUD_SCAN, BACKFILL |
| JobStatus | PENDING, RUNNING, COMPLETED, FAILED |
| WorkspaceMemberRole | OWNER, ADMIN, MODERATOR |

## Indexing Strategy

Key composite indexes for query performance:

- **Viewer by channel + points** (descending) - leaderboard queries
- **Viewer by channel + trust score** - fraud review queries
- **Viewer by fanProfileId** - fan profile lookups
- **PointLedger by fanProfileId** - wallet history
- **PointLedger by viewerId** - legacy per-channel history
- **PointLedger by createdAt** - time-range queries
- **FraudEvent by viewer + timestamp** - fraud timeline
- **FraudEvent by viewer + eventType + timestamp** - fraud rule threshold checks
- **CodeRedemption by viewer + code** - unique constraint + lookups
- **ChatMessage by stream + timestamp** - message timeline
- **StreamAttendance by viewer + stream** - unique constraint
- **EngagementEvent by channel + occurredAt** - daily scoring window queries
- **EngagementEvent by fanProfileId** - per-fan event lookup
- **JobRun by jobType + status** - ops monitoring queries
- **JobRun by createdAt** - job history timeline
