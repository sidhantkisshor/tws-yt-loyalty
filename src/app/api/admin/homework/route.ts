import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { adminReadLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// GET: List homework submissions for a channel (admin auth)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(session.user.id, ip)
    const rateLimit = await checkRateLimit(adminReadLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers,
      })
    }

    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    const status = searchParams.get('status')

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
    }

    // Verify channel ownership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    })

    if (!channel || channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    const submissions = await prisma.homeworkSubmission.findMany({
      where: {
        channelId,
        ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
      },
      include: {
        viewer: {
          select: {
            displayName: true,
            rank: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({
      submissions: submissions.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        imageUrl: s.imageUrl,
        status: s.status,
        submittedAt: s.createdAt.toISOString(),
        reviewedAt: s.reviewedAt?.toISOString() || null,
        viewer: s.viewer,
      })),
    })
  } catch (error) {
    logger.error('List homework error', error)
    return NextResponse.json(
      { error: 'Failed to list homework' },
      { status: 500 }
    )
  }
}
