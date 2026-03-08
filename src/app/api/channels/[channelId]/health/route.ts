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
