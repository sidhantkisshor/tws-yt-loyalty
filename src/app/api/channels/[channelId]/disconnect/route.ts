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
