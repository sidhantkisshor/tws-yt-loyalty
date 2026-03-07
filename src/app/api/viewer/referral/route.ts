import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'

// GET /api/viewer/referral - Get or create referral code for the current viewer
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)

    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Determine target viewer ID based on channel selection
    let targetViewerId = session.viewerId
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    if (channelId && session.availableChannels) {
      const channelData = session.availableChannels.find((c: { channelId: string; viewerId: string }) => c.channelId === channelId)
      if (channelData) {
        targetViewerId = channelData.viewerId
      } else {
        return NextResponse.json({ error: 'Unauthorized for this channel' }, { status: 403 })
      }
    }

    const viewer = await prisma.viewer.findUnique({
      where: { id: targetViewerId },
      select: { id: true, referralCode: true },
    })

    if (!viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    let referralCode = viewer.referralCode

    // Generate a new referral code if none exists
    if (!referralCode) {
      referralCode = nanoid(10)
      await prisma.viewer.update({
        where: { id: viewer.id },
        data: { referralCode },
      })
    }

    // Count referrals (those who attended at least)
    const referralCount = await prisma.referral.count({
      where: { referrerId: targetViewerId, referredAttended: true },
    })

    return NextResponse.json({ referralCode, referralCount })
  } catch (error) {
    logger.error('Get referral code error', error)
    return NextResponse.json(
      { error: 'Failed to get referral code' },
      { status: 500 }
    )
  }
}
