import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

const REFRESH_BUFFER_MS = 5 * 60 * 1000

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
