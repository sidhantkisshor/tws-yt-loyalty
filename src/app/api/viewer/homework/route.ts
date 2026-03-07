import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const submitHomeworkSchema = z.object({
  channelId: z.string().min(1),
  title: z.string().min(3).max(200),
  content: z.string().min(10).max(2000),
  imageUrl: z.string().url().optional(),
})

// GET /api/viewer/homework - List viewer's homework submissions
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)
    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    // Determine which viewer ID to use
    let targetViewerId = session.viewerId
    if (channelId && session.availableChannels) {
      const channelData = session.availableChannels.find(c => c.channelId === channelId)
      if (channelData) {
        targetViewerId = channelData.viewerId
      } else {
        return NextResponse.json({ error: 'Unauthorized for this channel' }, { status: 403 })
      }
    }

    const submissions = await prisma.homeworkSubmission.findMany({
      where: { viewerId: targetViewerId },
      orderBy: { createdAt: 'desc' },
      include: {
        channel: {
          select: { id: true, title: true },
        },
      },
    })

    return NextResponse.json({ submissions })
  } catch (error) {
    logger.error('List homework submissions error', error)
    return NextResponse.json(
      { error: 'Failed to list homework submissions' },
      { status: 500 }
    )
  }
}

// POST /api/viewer/homework - Submit homework
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)
    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = submitHomeworkSchema.parse(body)

    // Determine which viewer ID to use based on channel
    let targetViewerId = session.viewerId
    if (session.availableChannels) {
      const channelData = session.availableChannels.find(c => c.channelId === data.channelId)
      if (channelData) {
        targetViewerId = channelData.viewerId
      } else {
        return NextResponse.json({ error: 'Unauthorized for this channel' }, { status: 403 })
      }
    }

    // Verify viewer exists and belongs to the channel
    const viewer = await prisma.viewer.findUnique({
      where: { id: targetViewerId },
      select: { id: true, channelId: true },
    })

    if (!viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    if (viewer.channelId !== data.channelId) {
      return NextResponse.json({ error: 'Channel mismatch' }, { status: 400 })
    }

    // Rate limit: max 3 submissions per day
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayCount = await prisma.homeworkSubmission.count({
      where: {
        viewerId: targetViewerId,
        createdAt: { gte: todayStart },
      },
    })

    if (todayCount >= 3) {
      return NextResponse.json(
        { error: 'Maximum 3 homework submissions per day' },
        { status: 429 }
      )
    }

    const submission = await prisma.homeworkSubmission.create({
      data: {
        viewerId: targetViewerId,
        channelId: data.channelId,
        title: data.title,
        content: data.content,
        imageUrl: data.imageUrl,
        status: 'PENDING',
      },
    })

    return NextResponse.json({ submission }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Submit homework error', error)
    return NextResponse.json(
      { error: 'Failed to submit homework' },
      { status: 500 }
    )
  }
}
