import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const reviewHomeworkSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
})

// PATCH /api/admin/homework/[id] - Approve or reject homework
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const data = reviewHomeworkSchema.parse(body)

    // Fetch the submission
    const submission = await prisma.homeworkSubmission.findUnique({
      where: { id },
      include: {
        channel: {
          select: { ownerId: true },
        },
        viewer: {
          select: { id: true, availablePoints: true, totalPoints: true, lifetimePoints: true, homeworkSubmissions: true },
        },
      },
    })

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Verify channel ownership
    if (submission.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (submission.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Submission has already been reviewed' },
        { status: 400 }
      )
    }

    const pointsToAward = 30

    if (data.status === 'APPROVED') {
      // Approve: award points and update counts atomically
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.homeworkSubmission.update({
          where: { id },
          data: {
            status: 'APPROVED',
            reviewedBy: session.user.id,
            reviewedAt: new Date(),
            pointsAwarded: pointsToAward,
          },
        })

        // Award points to the viewer
        await tx.viewer.update({
          where: { id: submission.viewer.id },
          data: {
            totalPoints: { increment: pointsToAward },
            availablePoints: { increment: pointsToAward },
            lifetimePoints: { increment: pointsToAward },
            homeworkSubmissions: { increment: 1 },
          },
        })

        // Create point transaction
        await tx.pointTransaction.create({
          data: {
            viewerId: submission.viewer.id,
            type: 'HOMEWORK_SUBMISSION',
            amount: pointsToAward,
            balanceBefore: submission.viewer.availablePoints,
            balanceAfter: submission.viewer.availablePoints + pointsToAward,
            referenceType: 'homework_submission',
            referenceId: id,
            description: `Homework approved: ${submission.title}`,
          },
        })

        return updated
      })

      return NextResponse.json({ submission: result, pointsAwarded: pointsToAward })
    } else {
      // Reject: just update status
      const result = await prisma.homeworkSubmission.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
        },
      })

      return NextResponse.json({ submission: result, pointsAwarded: 0 })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Review homework error', error)
    return NextResponse.json(
      { error: 'Failed to review homework' },
      { status: 500 }
    )
  }
}
