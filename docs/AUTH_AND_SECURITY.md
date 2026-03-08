# Authentication & Security

## Authentication Architecture

YT Loyalty uses **three auth flows**: admin auth, viewer auth, and per-channel OAuth.

### Admin Auth (NextAuth.js)

**Flow:** Google OAuth -> JWT session -> Admin dashboard access

```
Admin clicks "Sign In"
    -> Redirected to Google OAuth
    -> Grants YouTube API scopes:
        - youtube.readonly (read chat, video info)
        - youtube.force-ssl (post chat messages)
    -> Google tokens stored in User model
    -> JWT session created (stateless)
    -> Admin dashboard accessible
```

**Configuration** (`src/lib/auth.ts`):
- Provider: Google OAuth 2.0
- Strategy: JWT (no database sessions)
- Token refresh: Automatic when expired
- Admin check: Email must be in `ADMIN_EMAILS` env var
- Adapter: `@auth/prisma-adapter` for User/Account storage

**Key behaviors:**
- Access tokens are stored on the User model for YouTube API calls
- Refresh tokens are used to get new access tokens automatically
- Session includes `userId`, `email`, `role`, and `accessToken`

### Viewer Auth (Separate NextAuth instance)

**Flow:** Google OAuth -> Session -> Viewer portal access

```
Viewer clicks "Sign In"
    -> Redirected to Google OAuth (basic scopes)
    -> Matched to existing Viewer by YouTube channel ID
    -> ViewerAccount record created/linked
    -> Session created
    -> Viewer portal accessible
```

**Key differences from admin auth:**
- Does NOT request YouTube API scopes
- Links to `Viewer` model (not `User`)
- Separate session namespace (no cross-contamination)
- No admin privileges regardless of email

### Per-Channel OAuth Flow

**Flow:** Admin initiates channel connect -> Google OAuth with YouTube scopes -> Credentials stored in ChannelCredential

```
Admin clicks "Connect Channel"
    -> GET /api/channels/connect
    -> Builds HMAC-signed state parameter
    -> Redirects to Google OAuth (youtube.readonly + youtube.force-ssl)
    -> User authenticates with channel's Google account
    -> Callback: GET /api/channels/oauth/callback
    -> Verifies HMAC signature on state parameter
    -> Verifies session user matches state.userId
    -> Exchanges authorization code for tokens
    -> Fetches YouTube channel info
    -> Creates/updates ChannelCredential
    -> Auto-creates Workspace if needed
    -> Redirects to admin UI
```

This flow supports both **connect** (new channel) and **reconnect** (refresh tokens for existing channel). Each channel has independent credentials, allowing multiple channels to be connected under different Google accounts.

### HMAC-Signed State Parameter

The OAuth state parameter prevents CSRF and state tampering:

```
stateData = { userId, channelId, action, timestamp }
hmac = HMAC-SHA256(NEXTAUTH_SECRET, JSON(stateData))
state = base64url({ data: stateData, sig: hmac })
```

On callback:
1. Decode base64url state
2. Recompute HMAC over `data` using `NEXTAUTH_SECRET`
3. Compare with `sig` -- reject if mismatch
4. Verify `data.userId` matches current session

---

## Security Headers

### Content Security Policy (Middleware)

Applied via `src/middleware.ts` with per-request nonce:

```
default-src 'self'
script-src  'self' 'nonce-{random}' 'strict-dynamic' https:
style-src   'self' 'unsafe-inline'
img-src     'self' *.youtube.com *.googleusercontent.com *.ggpht.com data:
connect-src 'self' accounts.google.com *.sentry.io *.upstash.io
font-src    'self'
object-src  'none'
frame-ancestors 'none'
upgrade-insecure-requests
```

### HTTP Security Headers (next.config.ts)

| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-XSS-Protection | 1; mode=block | Legacy XSS protection |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer leaks |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Disable unused browser APIs |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | HSTS (production only) |
| X-Powered-By | (removed) | Hide tech stack |

---

## Rate Limiting

Implemented via Upstash Rate Limit (distributed, Redis-backed).

| Limiter | Limit | Window | Purpose |
|---------|-------|--------|---------|
| `authLimiter` | 5 | 15 min | Brute force prevention |
| `streamPollLimiter` | 20 | 1 min | Prevent polling abuse |
| `adminWriteLimiter` | 30 | 1 min | Admin mutation throttle |
| `adminReadLimiter` | 100 | 1 min | Admin read throttle |
| `viewerLimiter` | 30 | 1 min | Viewer request throttle |
| Code redemption | 10 | 1 min | Anti-bot redemption |
| Reward redemption | 3 | 1 min | Prevent reward spam |

Rate-limited responses return HTTP `429` with appropriate error message.

---

## Input Validation

All API inputs validated with **Zod** schemas (`src/lib/validators.ts`).

- Request bodies parsed and validated before any business logic
- Invalid inputs return `400` with structured error messages
- Zod errors are simplified for client consumption (no internal leaks)

---

## Error Handling

Centralized in `src/lib/errorHandler.ts`:

| Function | Purpose |
|----------|---------|
| `sanitizeErrorMessage()` | Hides internal errors in production, shows details in dev |
| `simplifyZodErrors()` | Converts Zod validation errors to client-friendly format |
| `handlePrismaError()` | Maps Prisma errors to appropriate HTTP status codes |
| `handleApiError()` | Catch-all API error handler |
| `logError()` | Safe error logging (never throws) |

**Production behavior:** Internal errors return generic "Something went wrong" messages. Stack traces and database details are never exposed.

---

## Logging

Structured logging via `src/lib/logger.ts` with Sentry integration.

### Sensitive Data Redaction
The logger automatically redacts values for keys containing:
- `password`, `secret`, `token`, `credential`, `authorization`
- `cookie`, `api_key`, `apikey`, `access_token`, `refresh_token`

### Sentry Integration
- Errors -> Sentry error capture with context
- Warnings -> Sentry breadcrumbs
- User context attached to error reports
- Release tracking for deployment correlation

---

## Cron Job Security

Background jobs at `/api/cron/*` are protected by `CRON_SECRET` authorization:

```typescript
// Every cron endpoint validates:
if (!env.CRON_SECRET) {
  return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
}
const authHeader = request.headers.get('authorization')
if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

The pattern is **fail-closed**: if `CRON_SECRET` is not configured, the endpoint returns 500 rather than allowing unauthenticated access.

The `CRON_SECRET` must be a 32+ character random string, shared between Vercel Cron config and the env var.

---

## Distributed Lock Pattern

Cron workers that must not run concurrently use Redis-based distributed locks:

### Acquire

```typescript
const lockId = await acquireLock('cron:daily-scoring', 600)
if (!lockId) {
  return NextResponse.json({ error: 'Already running' }, { status: 409 })
}
```

Implementation: `SET lock:{key} {lockId} NX EX {ttl}` -- only succeeds if the key doesn't exist.

### Release (Atomic Lua Script)

```typescript
// In finally block:
await releaseLock('cron:daily-scoring', lockId)
```

Implementation: Lua script ensures only the lock holder can release:

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

This atomic compare-and-delete prevents a worker from accidentally releasing a lock that was re-acquired by another instance after TTL expiry.

### Lock TTLs

| Cron | Lock Key | TTL |
|------|----------|-----|
| daily-scoring | `cron:daily-scoring` | 600s |
| fraud-scan | `cron:fraud-scan` | 300s |
| ingest-comments | `cron:ingest-comments` | 300s |
| discover-videos | `cron:discover-videos` | 120s |
| fulfill-rewards | `cron:fulfill-rewards` | 300s |

---

## Database Security

- **Connection pooling**: Max 3 connections via PgBouncer (prevents connection exhaustion)
- **Parameterized queries**: Prisma prevents SQL injection by design
- **Cascade deletes**: Configured for referential integrity
- **Unique constraints**: Prevent duplicate data (e.g., one redemption per code per viewer)
- **Audit logging**: `AuditLog` model tracks admin actions with before/after values
- **Transaction isolation**: Daily scoring uses `ReadCommitted` isolation for consistent balance updates

---

## Anti-Fraud Measures

See [Services - Fraud Detection](./SERVICES.md#fraud-detection-srcservicesfrauddetectionts) for the full fraud detection system.

Summary of protections:

**Real-time (code redemption):**
1. Trust score system (0-100) evaluates viewer reliability
2. Redemption latency tracking identifies bots (<500ms = suspicious)
3. Identical timing detection finds synchronized bot networks
4. Rate limiting prevents rapid-fire redemptions
5. Message similarity hashing detects spam
6. Manual review queue for flagged events
7. Fraud reversals can claw back points with full audit trail

**Batch (daily scoring):**
1. Velocity anomaly detection (>100 msgs/hour)
2. Duplicate text analysis (>60% identical messages)
3. Timing pattern analysis (message interval stddev < 500ms)
4. Rapid account behavior (new accounts with high activity)
5. Auto-confirmation of fraud events based on severity thresholds
6. Auto-banning of viewers with trust score < 20
