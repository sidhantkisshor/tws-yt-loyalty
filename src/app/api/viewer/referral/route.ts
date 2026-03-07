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

    const viewer = await prisma.viewer.findUnique({
      where: { id: session.viewerId },
      select: { id: true, referralCode: true },
    })

    if (!viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    // If referral code already exists, return it
    if (viewer.referralCode) {
      return NextResponse.json({ referralCode: viewer.referralCode })
    }

    // Generate a new referral code and save it
    const referralCode = nanoid(10)

    await prisma.viewer.update({
      where: { id: viewer.id },
      data: { referralCode },
    })

    return NextResponse.json({ referralCode })
  } catch (error) {
    logger.error('Get referral code error', error)
    return NextResponse.json(
      { error: 'Failed to get referral code' },
      { status: 500 }
    )
  }
}
