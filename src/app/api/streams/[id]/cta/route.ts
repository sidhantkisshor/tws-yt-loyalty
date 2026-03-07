import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

// POST /api/streams/[id]/cta - Trigger CTA point award (admin auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: streamId } = await params

    // Get stream with channel ownership check
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        channel: {
          select: { ownerId: true },
        },
      },
    })

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }

    if (stream.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (stream.status !== 'LIVE') {
      return NextResponse.json(
        { error: 'Stream must be live to trigger CTA' },
        { status: 400 }
      )
    }

    if (stream.ctaPointsAwarded) {
      return NextResponse.json(
        { error: 'CTA points have already been awarded for this stream' },
        { status: 400 }
      )
    }

    const pointsPerViewer = 30
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    // Find viewers active in last 5 minutes
    const activeAttendances = await prisma.streamAttendance.findMany({
      where: {
        streamId,
        lastMessageAt: { gte: fiveMinutesAgo },
      },
      select: {
        viewerId: true,
        viewer: {
          select: { availablePoints: true },
        },
      },
    })

    if (activeAttendances.length === 0) {
      return NextResponse.json(
        { error: 'No active viewers found in the last 5 minutes' },
        { status: 400 }
      )
    }

    // Award points to all active viewers atomically
    await prisma.$transaction(async (tx) => {
      // Update stream CTA fields
      await tx.stream.update({
        where: { id: streamId },
        data: {
          ctaTimestamp: new Date(),
          ctaPointsAwarded: true,
        },
      })

      // Award points to each active viewer
      for (const attendance of activeAttendances) {
        await tx.viewer.update({
          where: { id: attendance.viewerId },
          data: {
            totalPoints: { increment: pointsPerViewer },
            availablePoints: { increment: pointsPerViewer },
            lifetimePoints: { increment: pointsPerViewer },
          },
        })

        await tx.pointTransaction.create({
          data: {
            viewerId: attendance.viewerId,
            streamId,
            type: 'CTA_BONUS',
            amount: pointsPerViewer,
            balanceBefore: attendance.viewer.availablePoints,
            balanceAfter: attendance.viewer.availablePoints + pointsPerViewer,
            referenceType: 'cta_bonus',
            referenceId: streamId,
            description: 'CTA bonus for active participation',
          },
        })
      }
    })

    return NextResponse.json({
      success: true,
      viewersAwarded: activeAttendances.length,
      pointsPerViewer,
    })
  } catch (error) {
    logger.error('CTA trigger error', error)
    return NextResponse.json(
      { error: 'Failed to trigger CTA' },
      { status: 500 }
    )
  }
}
