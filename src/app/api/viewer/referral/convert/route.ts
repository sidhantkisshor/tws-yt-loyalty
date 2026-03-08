import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { referralConvertSchema } from '@/lib/validators'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const REFERRAL_WELCOME_BONUS = 25

// POST /api/viewer/referral/convert - Link referred viewer to referrer
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)

    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate input with Zod
    const { referralCode, channelId } = referralConvertSchema.parse(body)

    // Find the referrer by referralCode and channelId
    const referrer = await prisma.viewer.findFirst({
      where: {
        referralCode,
        channelId,
      },
      select: { id: true },
    })

    if (!referrer) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 404 }
      )
    }

    // Prevent self-referral
    if (referrer.id === session.viewerId) {
      return NextResponse.json(
        { error: 'Cannot use your own referral code' },
        { status: 400 }
      )
    }

    // Check for duplicate referral (unique constraint: referrerId + referredId + channelId)
    const existingReferral = await prisma.referral.findUnique({
      where: {
        referrerId_referredId_channelId: {
          referrerId: referrer.id,
          referredId: session.viewerId,
          channelId,
        },
      },
    })

    if (existingReferral) {
      return NextResponse.json(
        { error: 'Referral already exists' },
        { status: 409 }
      )
    }

    // Get the referred viewer's current balance for the transaction record
    const referredViewer = await prisma.viewer.findUnique({
      where: { id: session.viewerId },
      select: { id: true, availablePoints: true, channelId: true },
    })

    if (!referredViewer) {
      return NextResponse.json(
        { error: 'Viewer not found' },
        { status: 404 }
      )
    }

    // Ensure the referred viewer belongs to the same channel
    if (referredViewer.channelId !== channelId) {
      return NextResponse.json(
        { error: 'You are not a member of this channel' },
        { status: 403 }
      )
    }

    // Create referral record, award points, and create transaction in a single transaction
    await prisma.$transaction(async (tx) => {
      // Create the Referral record
      await tx.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: session.viewerId!,
          channelId,
          referredPointsAwarded: REFERRAL_WELCOME_BONUS,
        },
      })

      // Award welcome bonus points to the referred viewer
      await tx.viewer.update({
        where: { id: session.viewerId! },
        data: {
          totalPoints: { increment: REFERRAL_WELCOME_BONUS },
          availablePoints: { increment: REFERRAL_WELCOME_BONUS },
          lifetimePoints: { increment: REFERRAL_WELCOME_BONUS },
        },
      })

      // Create PointLedger record
      await tx.pointLedger.create({
        data: {
          viewerId: session.viewerId!,
          type: 'REFERRAL_BONUS',
          amount: REFERRAL_WELCOME_BONUS,
          balanceBefore: referredViewer.availablePoints,
          balanceAfter: referredViewer.availablePoints + REFERRAL_WELCOME_BONUS,
          referenceType: 'referral',
          referenceId: referrer.id,
          description: 'Referral welcome bonus',
        },
      })
    })

    return NextResponse.json({
      success: true,
      bonusPoints: REFERRAL_WELCOME_BONUS,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    // Handle unique constraint violation (race condition on duplicate referral)
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Referral already exists' },
        { status: 409 }
      )
    }

    logger.error('Referral convert error', error)
    return NextResponse.json(
      { error: 'Failed to process referral' },
      { status: 500 }
    )
  }
}
