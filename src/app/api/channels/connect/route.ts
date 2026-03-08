import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { env } from '@/lib/env'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelId = request.nextUrl.searchParams.get('channelId')
  const redirectUri = `${env.NEXTAUTH_URL}/api/channels/oauth/callback`

  const stateData = {
    userId: session.user.id,
    channelId: channelId || null,
    action: channelId ? 'reconnect' : 'connect',
    ts: Date.now(),
  }
  const stateJson = JSON.stringify(stateData)
  const hmac = crypto.createHmac('sha256', env.NEXTAUTH_SECRET).update(stateJson).digest('hex')
  const state = Buffer.from(JSON.stringify({ data: stateData, sig: hmac })).toString('base64url')

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
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return NextResponse.redirect(authUrl)
}
