# Phase 2: Multi-Login Channel Connection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable connecting multiple YouTube channels (each with different Google accounts) under one workspace, with per-channel token management, health monitoring, and auto-refresh.

**Architecture:** Channel-specific OAuth flow using Google OAuth2 directly (bypassing NextAuth for channel connections). Each channel stores its own credentials in ChannelCredential. A TokenManager service handles refresh/validation. A cron endpoint monitors token health across all channels.

**Tech Stack:** Next.js 15 App Router, NextAuth (admin auth only), Google OAuth2 API, Prisma 7, Vitest

---

### Task 1: Token Manager Service

**Files:**
- Create: `src/services/tokenManager.ts`
- Create: `src/__tests__/tokenManager.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ default: {} }))
vi.mock('@/lib/redis', () => ({
  getRecentRedemptionCount: vi.fn(),
  checkIdenticalTiming: vi.fn(),
  trackRedemption: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import {
  isTokenExpired,
  shouldRefreshToken,
  parseTokenExpiry,
} from '@/services/tokenManager'

describe('isTokenExpired', () => {
  it('returns true when tokenExpiresAt is in the past', () => {
    const pastDate = new Date(Date.now() - 60000)
    expect(isTokenExpired(pastDate)).toBe(true)
  })

  it('returns false when tokenExpiresAt is in the future', () => {
    const futureDate = new Date(Date.now() + 60000)
    expect(isTokenExpired(futureDate)).toBe(false)
  })

  it('returns true when tokenExpiresAt is null', () => {
    expect(isTokenExpired(null)).toBe(true)
  })
})

describe('shouldRefreshToken', () => {
  it('returns true when token expires within buffer (5 min)', () => {
    const soonDate = new Date(Date.now() + 2 * 60 * 1000) // 2 min from now
    expect(shouldRefreshToken(soonDate)).toBe(true)
  })

  it('returns false when token has plenty of time left', () => {
    const laterDate = new Date(Date.now() + 30 * 60 * 1000) // 30 min
    expect(shouldRefreshToken(laterDate)).toBe(false)
  })
})

describe('parseTokenExpiry', () => {
  it('parses expires_in seconds to Date', () => {
    const now = Date.now()
    const result = parseTokenExpiry(3600)
    expect(result.getTime()).toBeGreaterThanOrEqual(now + 3599000)
    expect(result.getTime()).toBeLessThanOrEqual(now + 3601000)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/tokenManager.test.ts`
Expected: FAIL — module not found

**Step 3: Implement TokenManager**

```typescript
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

const REFRESH_BUFFER_MS = 5 * 60 * 1000 // Refresh 5 min before expiry

export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true
  return Date.now() >= expiresAt.getTime()
}

export function shouldRefreshToken(expiresAt: Date | null): boolean {
  if (!expiresAt) return true
  return Date.now() >= expiresAt.getTime() - REFRESH_BUFFER_MS
}

export function parseTokenExpiry(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000)
}

export interface TokenRefreshResult {
  success: boolean
  accessToken?: string
  expiresAt?: Date
  error?: string
}

export async function refreshChannelToken(channelId: string): Promise<TokenRefreshResult> {
  const credential = await prisma.channelCredential.findUnique({
    where: { channelId },
  })

  if (!credential) {
    return { success: false, error: 'No credentials found for channel' }
  }

  if (!credential.refreshToken) {
    await prisma.channelCredential.update({
      where: { channelId },
      data: { tokenStatus: 'REVOKED' },
    })
    return { success: false, error: 'No refresh token available' }
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: credential.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorDesc = errorData.error_description || errorData.error || 'Unknown error'

      if (errorData.error === 'invalid_grant') {
        await prisma.channelCredential.update({
          where: { channelId },
          data: { tokenStatus: 'REVOKED' },
        })
        logger.warn('Channel token revoked', { channelId, error: errorDesc })
        return { success: false, error: `Token revoked: ${errorDesc}` }
      }

      logger.error('Token refresh failed', { channelId, status: response.status, error: errorDesc })
      return { success: false, error: errorDesc }
    }

    const tokens = await response.json()
    const expiresAt = parseTokenExpiry(tokens.expires_in)

    await prisma.channelCredential.update({
      where: { channelId },
      data: {
        accessToken: tokens.access_token,
        tokenExpiresAt: expiresAt,
        tokenStatus: 'VALID',
        lastRefreshedAt: new Date(),
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      },
    })

    logger.info('Channel token refreshed', { channelId })
    return { success: true, accessToken: tokens.access_token, expiresAt }
  } catch (error) {
    logger.error('Token refresh error', { channelId, error })
    return { success: false, error: 'Network error during refresh' }
  }
}

export async function getValidCredentials(channelId: string) {
  const credential = await prisma.channelCredential.findUnique({
    where: { channelId },
  })

  if (!credential) return null

  if (credential.tokenStatus === 'REVOKED') return null

  if (shouldRefreshToken(credential.tokenExpiresAt)) {
    const result = await refreshChannelToken(channelId)
    if (!result.success) return null

    return {
      accessToken: result.accessToken!,
      refreshToken: credential.refreshToken,
      expiresAt: result.expiresAt,
    }
  }

  return {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    expiresAt: credential.tokenExpiresAt ?? undefined,
  }
}

export async function checkAllChannelHealth(): Promise<{
  healthy: number
  expired: number
  revoked: number
  errors: { channelId: string; error: string }[]
}> {
  const credentials = await prisma.channelCredential.findMany({
    include: { channel: { select: { id: true, title: true } } },
  })

  let healthy = 0
  let expired = 0
  let revoked = 0
  const errors: { channelId: string; error: string }[] = []

  for (const cred of credentials) {
    if (cred.tokenStatus === 'REVOKED') {
      revoked++
      errors.push({ channelId: cred.channelId, error: 'Token revoked' })
      continue
    }

    if (shouldRefreshToken(cred.tokenExpiresAt)) {
      const result = await refreshChannelToken(cred.channelId)
      if (result.success) {
        healthy++
      } else {
        expired++
        errors.push({ channelId: cred.channelId, error: result.error || 'Refresh failed' })
      }
    } else {
      healthy++
    }
  }

  return { healthy, expired, revoked, errors }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/tokenManager.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/services/tokenManager.ts src/__tests__/tokenManager.test.ts
git commit -m "feat: add TokenManager service with per-channel refresh"
```

---

### Task 2: Channel Connect OAuth Flow (API)

**Files:**
- Create: `src/app/api/channels/connect/route.ts`
- Create: `src/app/api/channels/oauth/callback/route.ts`
- Create: `src/app/api/channels/[channelId]/reconnect/route.ts`
- Create: `src/app/api/channels/[channelId]/disconnect/route.ts`
- Create: `src/app/api/channels/[channelId]/health/route.ts`

**Step 1: Create the OAuth initiation endpoint**

`src/app/api/channels/connect/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { env } from '@/lib/env'

// Initiates OAuth flow to connect a new YouTube channel
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelId = request.nextUrl.searchParams.get('channelId') // For reconnect
  const redirectUri = `${env.NEXTAUTH_URL}/api/channels/oauth/callback`

  const state = JSON.stringify({
    userId: session.user.id,
    channelId: channelId || null,
    action: channelId ? 'reconnect' : 'connect',
  })

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: Buffer.from(state).toString('base64'),
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return NextResponse.redirect(authUrl)
}
```

**Step 2: Create the OAuth callback handler**

`src/app/api/channels/oauth/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { env } from '@/lib/env'
import { getChannelInfo } from '@/lib/youtube'
import { logger } from '@/lib/logger'
import { parseTokenExpiry } from '@/services/tokenManager'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin?error=unauthorized`)
  }

  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    logger.warn('OAuth error', { error })
    return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=${error}`)
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=missing_params`)
  }

  let state: { userId: string; channelId: string | null; action: string }
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64').toString())
  } catch {
    return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=invalid_state`)
  }

  if (state.userId !== session.user.id) {
    return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=state_mismatch`)
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${env.NEXTAUTH_URL}/api/channels/oauth/callback`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({}))
      logger.error('Token exchange failed', err)
      return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=token_exchange_failed`)
    }

    const tokens = await tokenResponse.json()
    const credentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: parseTokenExpiry(tokens.expires_in),
    }

    // Get the Google user's email
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userInfoResponse.json()
    const googleEmail = userInfo.email || ''

    // Get the YouTube channel for this Google account
    const channelInfo = await getChannelInfo(credentials)
    if (!channelInfo) {
      return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=no_youtube_channel`)
    }

    if (state.action === 'reconnect' && state.channelId) {
      // Reconnect existing channel
      const channel = await prisma.channel.findUnique({
        where: { id: state.channelId },
      })

      if (!channel || channel.ownerId !== session.user.id) {
        return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=unauthorized`)
      }

      await prisma.channelCredential.upsert({
        where: { channelId: state.channelId },
        create: {
          channelId: state.channelId,
          googleAccountEmail: googleEmail,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: credentials.expiresAt,
          tokenStatus: 'VALID',
        },
        update: {
          googleAccountEmail: googleEmail,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: credentials.expiresAt,
          tokenStatus: 'VALID',
          lastRefreshedAt: new Date(),
        },
      })

      return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?success=reconnected`)
    }

    // Connect new channel
    const existingChannel = await prisma.channel.findUnique({
      where: { youtubeChannelId: channelInfo.id },
    })

    if (existingChannel) {
      return NextResponse.redirect(
        `${env.NEXTAUTH_URL}/admin/channels?error=channel_exists`
      )
    }

    // Find or create workspace
    let workspace = await prisma.workspace.findFirst({
      where: { ownerId: session.user.id },
    })

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: 'My Loyalty Program',
          slug: `ws-${session.user.id.slice(0, 8)}`,
          ownerId: session.user.id,
          settings: { timezone: 'UTC' },
        },
      })
    }

    await prisma.channel.create({
      data: {
        youtubeChannelId: channelInfo.id,
        title: channelInfo.title,
        thumbnailUrl: channelInfo.thumbnailUrl,
        ownerId: session.user.id,
        workspaceId: workspace.id,
        channelCredential: {
          create: {
            googleAccountEmail: googleEmail,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiresAt: credentials.expiresAt,
            tokenStatus: 'VALID',
          },
        },
      },
    })

    return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?success=connected`)
  } catch (error) {
    logger.error('Channel OAuth callback error', error)
    return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=internal`)
  }
}
```

**Step 3: Create channel disconnect endpoint**

`src/app/api/channels/[channelId]/disconnect/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channelId } = await params

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  })

  if (!channel || channel.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  await prisma.channel.update({
    where: { id: channelId },
    data: { isActive: false },
  })

  logger.info('Channel disconnected', { channelId, userId: session.user.id })
  return NextResponse.json({ success: true })
}
```

**Step 4: Create channel health endpoint**

`src/app/api/channels/[channelId]/health/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { isTokenExpired, shouldRefreshToken, refreshChannelToken } from '@/services/tokenManager'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channelId } = await params

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { channelCredential: true },
  })

  if (!channel || channel.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  if (!channel.channelCredential) {
    return NextResponse.json({
      status: 'disconnected',
      message: 'No credentials configured',
    })
  }

  const cred = channel.channelCredential
  const expired = isTokenExpired(cred.tokenExpiresAt)
  const needsRefresh = shouldRefreshToken(cred.tokenExpiresAt)

  let status = cred.tokenStatus
  if (cred.tokenStatus === 'VALID' && needsRefresh) {
    const result = await refreshChannelToken(channelId)
    status = result.success ? 'VALID' : 'EXPIRED'
  }

  return NextResponse.json({
    status,
    googleAccountEmail: cred.googleAccountEmail,
    tokenExpiresAt: cred.tokenExpiresAt,
    lastRefreshedAt: cred.lastRefreshedAt,
    expired,
    needsRefresh,
  })
}
```

**Step 5: Commit**

```bash
git add src/app/api/channels/connect/ src/app/api/channels/oauth/ src/app/api/channels/[channelId]/
git commit -m "feat: add channel OAuth connect/reconnect/disconnect/health endpoints"
```

---

### Task 3: Token Health Cron Endpoint

**Files:**
- Create: `src/app/api/cron/token-health/route.ts`

**Step 1: Create the cron endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { checkAllChannelHealth } from '@/services/tokenManager'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await checkAllChannelHealth()

    if (result.errors.length > 0) {
      logger.warn('Channel token health issues', {
        healthy: result.healthy,
        expired: result.expired,
        revoked: result.revoked,
        errors: result.errors,
      })
    } else {
      logger.info('All channel tokens healthy', {
        healthy: result.healthy,
      })
    }

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Token health check failed', error)
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    )
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/cron/token-health/route.ts
git commit -m "feat: add token health cron endpoint"
```

---

### Task 4: Update Poll-Streams Cron to Use TokenManager

**Files:**
- Modify: `src/app/api/cron/poll-streams/route.ts`

**Step 1: Update the cron to use getValidCredentials**

Replace the manual credential reading with `getValidCredentials()`:

In the stream polling loop, change from:
```typescript
const credential = stream.channel.channelCredential
if (!credential?.accessToken || !credential?.refreshToken) { ... }
```

To:
```typescript
import { getValidCredentials } from '@/services/tokenManager'

const credentials = await getValidCredentials(stream.channel.id)
if (!credentials) {
  // Log and skip this stream
  continue
}
```

This ensures tokens are auto-refreshed before use.

**Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/app/api/cron/poll-streams/route.ts
git commit -m "refactor: use TokenManager for credential retrieval in poll-streams cron"
```

---

### Task 5: Update Other API Routes to Use TokenManager

**Files:**
- Modify: `src/app/api/streams/[id]/polling/route.ts`
- Modify: `src/app/api/streams/[id]/poll/route.ts`
- Modify: `src/app/api/streams/[id]/codes/route.ts`
- Modify: `src/app/api/streams/route.ts`

**Step 1: Update each route**

For each file that reads from `channelCredential` directly, replace with `getValidCredentials(channelId)`.

Pattern:
```typescript
// Before:
const credential = await prisma.channelCredential.findUnique(...)
if (!credential?.accessToken) { return error }
const creds = { accessToken: credential.accessToken, ... }

// After:
import { getValidCredentials } from '@/services/tokenManager'
const creds = await getValidCredentials(channelId)
if (!creds) {
  return NextResponse.json({ error: 'Channel credentials expired or missing' }, { status: 401 })
}
```

**Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/app/api/streams/
git commit -m "refactor: use TokenManager across all stream API routes"
```

---

### Task 6: Admin Channels Management Page

**Files:**
- Create: `src/app/admin/channels/page.tsx`

**Step 1: Create the channels management page**

Build an admin page that shows:
- All connected channels with their credential status
- "Connect New Channel" button (links to `/api/channels/connect`)
- Per-channel: reconnect button, disconnect button, token health indicator
- Google account email shown per channel
- Token expiry countdown

Use the existing admin layout and styling patterns from `src/app/admin/page.tsx`.

The page should:
1. Fetch channels from `GET /api/channels` (add credential info to response)
2. Show status badge per channel (VALID/EXPIRED/REVOKED)
3. "Connect Channel" button → `GET /api/channels/connect`
4. "Reconnect" button per channel → `GET /api/channels/connect?channelId={id}`
5. "Disconnect" button → `POST /api/channels/{id}/disconnect`
6. Show success/error messages from URL params

**Step 2: Update GET /api/channels to include credential info**

In `src/app/api/channels/route.ts`, update the GET handler to include `channelCredential` data:

```typescript
const channels = await prisma.channel.findMany({
  where: { ownerId: session.user.id },
  include: {
    _count: { select: { streams: true, viewers: true } },
    channelCredential: {
      select: {
        googleAccountEmail: true,
        tokenStatus: true,
        tokenExpiresAt: true,
        lastRefreshedAt: true,
      },
    },
  },
  orderBy: { createdAt: 'desc' },
})
```

**Step 3: Commit**

```bash
git add src/app/admin/channels/ src/app/api/channels/route.ts
git commit -m "feat: add admin channels management page with health indicators"
```

---

### Task 7: Fix Auth Callbacks for Multi-Channel

**Files:**
- Modify: `src/lib/auth.ts`

**Step 1: Update signIn event to sync ALL channel credentials**

Change the `signIn` event handler to update credentials for ALL channels owned by the user, not just the first one:

```typescript
events: {
  async signIn({ user, account }) {
    if (account?.provider === 'google' && account.access_token) {
      // Update credentials for ALL channels owned by this user
      const channels = await prisma.channel.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      })

      for (const channel of channels) {
        await prisma.channelCredential.upsert({
          where: { channelId: channel.id },
          create: {
            channelId: channel.id,
            googleAccountEmail: user.email || '',
            accessToken: account.access_token,
            refreshToken: account.refresh_token || '',
            tokenExpiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            tokenStatus: 'VALID',
          },
          update: {
            accessToken: account.access_token,
            ...(account.refresh_token ? { refreshToken: account.refresh_token } : {}),
            tokenExpiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            tokenStatus: 'VALID',
            lastRefreshedAt: new Date(),
          },
        })
      }
    }
  },
},
```

**Important note:** This only updates channels that share the same Google account as the admin login. Channels connected via different Google accounts keep their own independent credentials (set via the channel connect OAuth flow). This is correct — admin login refreshes their own channels, while other channels use per-channel OAuth.

**Step 2: Update refreshAccessToken to refresh ALL user's channels**

Change `refreshAccessToken` to update all channels owned by the user (same logic as signIn).

**Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "fix: sync credentials for all owned channels on sign-in and refresh"
```

---

### Task 8: Run Full Test Suite, TypeScript Check, Final Verification

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (250+ tests)

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 2 Multi-Login Channel Connection

- TokenManager service with per-channel refresh and health monitoring
- Channel-specific OAuth connect/reconnect/disconnect flows
- Token health cron endpoint for proactive monitoring
- Admin channels management page with credential status
- All API routes use TokenManager for auto-refresh
- Auth callbacks updated for multi-channel credential sync"
```
