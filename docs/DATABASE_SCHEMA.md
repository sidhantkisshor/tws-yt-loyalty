# Database Schema

PostgreSQL database managed via Prisma ORM. The schema contains **26 models** organized into 5 domains.

## Entity Relationship Overview

```
User (admin) ──< Channel ──< Stream ──< StreamAttendance >── Viewer
                    │            │                              │
                    │            ├──< LoyaltyCode              ├──< PointTransaction
                    │            │       └──< CodeRedemption    ├──< RewardRedemption
                    │            ├──< ChatMessage               ├──< FraudEvent
                    │            ├──< StreamPoll ──< PollResponse├──< HomeworkSubmission
                    │            └──< HelpfulUpvote             ├──< ViewerAccount
                    │                                           └──< Referral
                    └──< QuotaUsageLog
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
| googleAccessToken | String? | YouTube API access token |
| googleRefreshToken | String? | YouTube API refresh token |
| googleTokenExpiry | DateTime? | Token expiration |

Relations: `accounts`, `sessions`, `channels`

#### ViewerAccount
Viewer portal OAuth accounts (separate from admin users).

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| viewerId | String | Links to Viewer |
| provider | String | OAuth provider (google) |
| providerAccountId | String | Google account ID |

Unique constraint: `(provider, providerAccountId)`

#### Account, Session, VerificationToken
Standard NextAuth models for OAuth state management.

---

### Core Entities

#### Channel
YouTube channels connected to the platform.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| youtubeChannelId | String (unique) | YouTube channel ID |
| name | String | Channel display name |
| ownerId | String | User who owns this channel |
| dailyQuotaUsed | Int | YouTube API quota consumed today |
| quotaResetAt | DateTime | When quota resets |

Relations: `owner`, `streams`, `viewers`, `quotaLogs`

#### Viewer
A chat participant tracked across streams.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| youtubeChannelId | String | Viewer's YouTube channel ID |
| displayName | String | Current display name |
| channelId | String | Which Channel they belong to |
| points | Int (default 0) | Current point balance |
| lifetimePoints | Int (default 0) | Total points ever earned |
| rank | ViewerRank | Current rank tier |
| trustScore | Float (default 50) | Anti-fraud trust score (0-100) |
| currentStreak | Int (default 0) | Consecutive streams attended |
| longestStreak | Int (default 0) | Best streak ever |
| streamsAttended | Int (default 0) | Total streams attended |
| totalMessages | Int (default 0) | Total chat messages |
| totalCodesRedeemed | Int (default 0) | Total codes redeemed |
| watchTimeMinutes | Int (default 0) | Estimated total watch time |
| isBanned | Boolean | Banned from earning points |
| isFraudFlagged | Boolean | Flagged for fraud review |
| referralCode | String? (unique) | Viewer's referral code |
| referredBy | String? | Referral code that brought them |
| segment | String? | A/B test segment assignment |

Unique constraint: `(youtubeChannelId, channelId)`
Key indexes: `(channelId, trustScore)`, `(channelId, points DESC)`, `(channelId, lifetimePoints DESC)`

#### Stream
A YouTube livestream broadcast.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| youtubeVideoId | String (unique) | YouTube video ID |
| title | String | Stream title |
| channelId | String | Channel this stream belongs to |
| status | StreamStatus | SCHEDULED, LIVE, ENDED, CANCELLED |
| isPolling | Boolean | Currently polling chat |
| nextPageToken | String? | YouTube API pagination token |
| liveChatId | String? | YouTube live chat ID |
| startedAt | DateTime? | When stream went live |
| endedAt | DateTime? | When stream ended |
| peakConcurrent | Int | Peak concurrent viewers |
| totalUnique | Int | Total unique viewers |
| totalMessages | Int | Total chat messages |
| totalPointsAwarded | Int | Total points given out |

Relations: `channel`, `codes`, `attendance`, `messages`, `polls`

#### StreamAttendance
Per-viewer participation record for each stream.

| Field | Type | Description |
|-------|------|-------------|
| viewerId | String | Viewer |
| streamId | String | Stream |
| firstMessageAt | DateTime? | First message timestamp |
| lastMessageAt | DateTime? | Last message timestamp |
| messageCount | Int | Messages sent |
| codesRedeemed | Int | Codes redeemed |
| watchTimeMinutes | Int | Estimated watch time |
| pointsEarned | Int | Points earned this stream |
| earlyBird | Boolean | Arrived in first 5 minutes |
| fullStream | Boolean | Attended entire stream |
| isSponsor | Boolean | YouTube member at time |
| isModerator | Boolean | Moderator at time |

Unique constraint: `(viewerId, streamId)`

---

### Points & Rewards

#### PointTransaction
Immutable ledger of all point changes.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| viewerId | String | Viewer |
| type | TransactionType | See enum below |
| points | Int | Amount (+/-) |
| balanceBefore | Int | Balance before this transaction |
| balanceAfter | Int | Balance after this transaction |
| description | String? | Human-readable description |
| streamId | String? | Associated stream |
| codeId | String? | Associated code |
| rewardId | String? | Associated reward |

**TransactionType enum**: CODE_REDEMPTION, CHAT_ACTIVITY, ATTENDANCE_BONUS, STREAK_BONUS, RANK_BONUS, WATCH_TIME, MANUAL_CREDIT, MANUAL_DEBIT, REWARD_REDEMPTION, FRAUD_REVERSAL, REFERRAL_BONUS, HOMEWORK_SUBMISSION, POLL_PARTICIPATION, CTA_BONUS, QUALITY_QUESTION, HELPFUL_UPVOTE, STREAK_MILESTONE, COURSE_COMPLETION, MODULE_COMPLETION, STREAK_PAUSE_COST

#### LoyaltyCode
Codes displayed during livestreams for viewers to redeem.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| code | String (unique) | The code string |
| streamId | String | Stream it belongs to |
| type | CodeType | STANDARD, FLASH, BONUS, FIRST_RESPONSE |
| points | Int | Base point value |
| memberBonus | Int | Extra points for members |
| modBonus | Int | Extra points for moderators |
| firstResponseBonus | Int | Extra for first redeemer |
| validFrom | DateTime | When code becomes active |
| validUntil | DateTime? | When code expires |
| maxRedemptions | Int? | Max total redemptions |
| currentRedemptions | Int | Current redemption count |

#### CodeRedemption
Record of a viewer redeeming a code.

| Field | Type | Description |
|-------|------|-------------|
| viewerId | String | Who redeemed |
| codeId | String | Which code |
| pointsAwarded | Int | Points given |
| bonusType | String? | Type of bonus applied |
| latencyMs | Int? | Time from code display to redemption |
| trustScoreAtTime | Float? | Viewer's trust score at redemption |
| flaggedForReview | Boolean | Suspicious redemption |

Unique constraint: `(viewerId, codeId)` - one redemption per code per viewer

#### RewardConfig
Available rewards viewers can purchase with tokens.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| name | String | Reward name |
| description | String | Reward description |
| type | RewardType | DIGITAL or PHYSICAL |
| tokenCost | Int | Cost in tokens (1 token = 1000 points) |
| category | RewardCategory | GATEWAY, ENGAGEMENT, COMMITMENT, PREMIUM, PRESTIGE, ROTATING |
| minTrustScore | Float? | Minimum trust score required |
| minAccountAgeDays | Int? | Minimum account age |
| minRank | ViewerRank? | Minimum rank required |
| stock | Int? | Available stock (null = unlimited) |
| isActive | Boolean | Currently available |
| isLimitedTime | Boolean | Time-limited availability |
| availableFrom | DateTime? | Start of availability |
| availableUntil | DateTime? | End of availability |

#### RewardRedemption
A viewer's reward purchase.

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| viewerId | String | Buyer |
| rewardId | String | Reward purchased |
| status | DeliveryStatus | PENDING → PROCESSING → SHIPPED → DELIVERED |
| rewardCode | String? | Generated code (for digital) |
| shippingAddress | String? | For physical rewards |
| trackingNumber | String? | Shipping tracking |
| adminNotes | String? | Internal notes |

---

### Engagement

#### ChatMessage
Messages from YouTube livestream chat.

| Field | Type | Description |
|-------|------|-------------|
| youtubeMessageId | String (unique) | YouTube message ID |
| streamId | String | Stream |
| viewerId | String | Sender |
| content | String | Message text |
| messageType | String | textMessageEvent, superChatEvent, etc. |
| superChatAmount | Float? | SuperChat amount |
| superChatCurrency | String? | SuperChat currency |
| containsCode | Boolean | Contains a loyalty code |
| similarityHash | String? | For spam detection |
| isSuspicious | Boolean | Flagged as suspicious |

#### StreamPoll, PollResponse
In-stream polls with viewer responses and point rewards.

#### HelpfulUpvote
Community voting system where viewers upvote quality contributors.

#### HomeworkSubmission
Viewer-submitted homework with admin review (PENDING → APPROVED/REJECTED).

---

### Anti-Fraud & Monitoring

#### FraudEvent
Detected fraud incidents.

| Field | Type | Description |
|-------|------|-------------|
| viewerId | String | Suspect viewer |
| type | FraudEventType | Type of fraud detected |
| severity | FraudSeverity | LOW, MEDIUM, HIGH, CRITICAL |
| evidence | Json | Supporting data |
| trustPenalty | Float | Trust score reduction |
| reviewStatus | ReviewStatus | PENDING, CONFIRMED, FALSE_POSITIVE, ESCALATED |

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

## Indexing Strategy

Key composite indexes for query performance:

- **Viewer by channel + points** (descending) - leaderboard queries
- **Viewer by channel + lifetime points** (descending) - all-time rankings
- **Viewer by channel + trust score** - fraud review queries
- **PointTransaction by viewer + timestamp** - transaction history
- **FraudEvent by viewer + timestamp** - fraud timeline
- **CodeRedemption by viewer + code** - unique constraint + lookups
- **ChatMessage by stream + timestamp** - message timeline
- **StreamAttendance by viewer + stream** - unique constraint
