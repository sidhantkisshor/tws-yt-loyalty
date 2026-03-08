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
    logger.warn('Channel OAuth error', { error })
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
      logger.error('Channel token exchange failed', err)
      return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=token_exchange_failed`)
    }

    const tokens = await tokenResponse.json()
    const expiresAt = parseTokenExpiry(tokens.expires_in)

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userInfoResponse.json()
    const googleEmail = userInfo.email || ''

    const credentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    }

    const channelInfo = await getChannelInfo(credentials)
    if (!channelInfo) {
      return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=no_youtube_channel`)
    }

    if (state.action === 'reconnect' && state.channelId) {
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
          tokenExpiresAt: expiresAt,
          tokenStatus: 'VALID',
        },
        update: {
          googleAccountEmail: googleEmail,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          tokenStatus: 'VALID',
          lastRefreshedAt: new Date(),
        },
      })

      return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?success=reconnected`)
    }

    const existingChannel = await prisma.channel.findUnique({
      where: { youtubeChannelId: channelInfo.id },
    })

    if (existingChannel) {
      return NextResponse.redirect(`${env.NEXTAUTH_URL}/admin/channels?error=channel_exists`)
    }

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
            tokenExpiresAt: expiresAt,
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
