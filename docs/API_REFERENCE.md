# API Reference

All API routes are under `/api/`. Admin endpoints require a valid NextAuth session. Viewer endpoints require viewer auth. Cron endpoints require the `CRON_SECRET` header.

## Authentication

### Admin Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/auth/[...nextauth]` | NextAuth OAuth handler (Google) |

### Viewer Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/viewer-auth/[...nextauth]` | Viewer portal OAuth (Google) |

---

## Channel Management

Admin auth required.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/channels/connect` | Initiate per-channel OAuth flow. Builds HMAC-signed state and redirects to Google OAuth. Query: `?channelId=xxx` for reconnect. |
| GET | `/api/channels/oauth/callback` | OAuth callback. Exchanges code for tokens, verifies HMAC state signature, creates Channel + ChannelCredential + Workspace. Redirects to admin UI. |
| POST | `/api/channels/[channelId]/disconnect` | Deactivates a channel (`isActive=false`). Requires channel ownership. |
| GET | `/api/channels/[channelId]/health` | Returns token health: status, expiry, last refresh. Auto-refreshes if expiring within 5 minutes. |

---

## Streams

All stream endpoints require admin auth.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/streams` | List all streams (with pagination) |
| POST | `/api/streams` | Create a new stream (provide YouTube video URL/ID) |
| GET | `/api/streams/[id]` | Get stream details |
| DELETE | `/api/streams/[id]` | Delete a stream |
| POST | `/api/streams/[id]/end` | End a stream (calculates final bonuses) |
| GET | `/api/streams/[id]/polling` | Get current polling status |
| POST | `/api/streams/[id]/poll` | Trigger manual chat poll |
| POST | `/api/streams/[id]/codes` | Generate a loyalty code for this stream |
| POST | `/api/streams/[id]/cta` | Award CTA (call-to-action) points |
| GET | `/api/streams/[id]/leaderboard` | Stream-specific leaderboard |
| GET | `/api/streams/[id]/polls` | List polls for this stream |
| POST | `/api/streams/[id]/polls` | Create a poll |
| POST | `/api/streams/[id]/polls/[pollId]/vote` | Vote on a poll (viewer) |

---

## Rewards

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/rewards` | Admin | List all reward configs |
| POST | `/api/rewards` | Admin | Create a reward |
| GET | `/api/rewards/[id]` | Admin | Get reward details |
| PUT | `/api/rewards/[id]` | Admin | Update a reward |
| DELETE | `/api/rewards/[id]` | Admin | Delete a reward |

---

## Viewer Endpoints

All require viewer auth.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/viewer/me` | Current viewer profile (points, rank, stats) |
| GET | `/api/viewer/channels` | Channels the viewer participates in |
| GET | `/api/viewer/channel-breakdown` | Per-channel point contributions with global wallet totals |
| GET | `/api/viewer/transactions` | Point transaction history (paginated) |
| POST | `/api/viewer/redeem` | Redeem a reward |
| GET | `/api/viewer/redemptions` | Viewer's reward redemption history |
| GET | `/api/viewer/referral` | Get viewer's referral code |
| POST | `/api/viewer/referral` | Generate a referral code |
| POST | `/api/viewer/referral/convert` | Convert referral (track new viewer) |
| GET | `/api/viewer/streak/pause` | Get streak pause status |
| POST | `/api/viewer/streak/pause` | Purchase a streak pause |
| POST | `/api/viewer/homework` | Submit homework |

---

## Admin Endpoints

All require admin auth.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/analytics/overview` | Dashboard metrics (viewers, points, streams) |
| GET | `/api/admin/analytics/funnel` | Conversion funnel data |
| GET | `/api/admin/redemptions` | All reward redemptions (for fulfillment) |
| PUT | `/api/admin/redemptions` | Update redemption status (ship, deliver, cancel) |
| POST | `/api/admin/redemptions/[id]/fulfill` | Manually trigger digital fulfillment for a specific redemption |
| GET | `/api/admin/rewards/[id]` | Admin reward details |
| PUT | `/api/admin/rewards/[id]` | Update reward |
| DELETE | `/api/admin/rewards/[id]` | Delete reward |
| GET | `/api/admin/homework` | List homework submissions |
| PUT | `/api/admin/homework/[id]` | Grade homework (approve/reject) |
| GET | `/api/admin/webhooks` | List webhook configs |
| POST | `/api/admin/webhooks` | Create webhook config |

### Operations Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/ops/health` | System health: DB/Redis latency, channel token status, job stats, ingestion lag, quota usage |
| GET | `/api/admin/ops/jobs` | Job run history with per-type summaries. Query: `?days=7` (1-90) |
| GET | `/api/admin/ops/alerts` | Active alerts with severity (WARNING/CRITICAL) and category |

---

## Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leaderboard` | Global or channel leaderboard. Query: `?channelId=xxx` |
| GET | `/api/channels` | List channels for authenticated user |
| GET | `/api/viewers` | Search/list viewers. Query: `?search=name&channelId=xxx` |
| GET | `/api/viewers/[id]` | Viewer profile details |
| GET | `/api/viewers/lookup` | Find viewer by YouTube channel ID |

---

## Cron Jobs

Protected by `Authorization: Bearer <CRON_SECRET>` header. Most use distributed locks (returns 409 if already running).

| Method | Endpoint | Schedule | Lock TTL | Description |
|--------|----------|----------|----------|-------------|
| GET | `/api/cron/poll-streams` | `*/3 * * * *` | - | Polls YouTube Live Chat for all active streams |
| GET | `/api/cron/ingest-comments` | `*/15 * * * *` | 300s | Fetches video comments for recent streams, creates EngagementEvents |
| GET | `/api/cron/discover-videos` | `0 */4 * * *` | 120s | Discovers new videos per channel (last 24h), creates Stream records |
| GET | `/api/cron/daily-scoring` | `0 2 * * *` | 600s | Processes EngagementEvents, runs anti-cheat, creates PointLedger entries |
| GET | `/api/cron/fraud-scan` | `0 3 * * *` | 300s | Auto-confirms fraud events, creates point reversals, auto-bans |
| GET | `/api/cron/fulfill-rewards` | `*/5 * * * *` | 300s | Delivers pending digital rewards, retries failed |
| GET | `/api/cron/token-health` | `0 */1 * * *` | - | Checks and refreshes expiring channel OAuth tokens |
| GET | `/api/cron/tier-decay` | `0 0 * * *` | - | Decays inactive viewer ranks |
| GET | `/api/cron/update-segments` | `0 */6 * * *` | - | Recalculates viewer segments |

---

## Health Checks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Basic health check (returns `{ status: "ok" }`) |
| GET | `/api/health/db` | Database connectivity check |
| GET | `/api/health/redis` | Redis connectivity check |
| GET | `/api/health/full` | Full system health (DB + Redis + YouTube quota) |

---

## Rate Limits

| Category | Limit | Window |
|----------|-------|--------|
| Auth attempts | 5 | 15 minutes |
| Stream polling | 20 | 1 minute |
| Admin writes | 30 | 1 minute |
| Admin reads | 100 | 1 minute |
| Viewer requests | 30 | 1 minute |
| Code redemptions | 10 | 1 minute |
| Reward redemptions | 3 | 1 minute |

Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

---

## Common Response Patterns

### Success
```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

### Error
```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

### Paginated List
```json
{
  "data": [ ... ],
  "total": 150,
  "page": 1,
  "pageSize": 20
}
```
