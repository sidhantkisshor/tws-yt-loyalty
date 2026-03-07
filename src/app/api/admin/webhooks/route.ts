import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { nanoid } from 'nanoid'
import { adminReadLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// GET: List webhooks for a channel (admin auth, channelId query param)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
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

    const webhooks = await prisma.webhookConfig.findMany({
      where: { channelId },
      select: {
        id: true,
        channelId: true,
        url: true,
        events: true,
        isActive: true,
        lastTriggeredAt: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
        // Note: secret is NOT returned in list view
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ webhooks })
  } catch (error) {
    logger.error('List webhooks error', error)
    return NextResponse.json(
      { error: 'Failed to list webhooks' },
      { status: 500 }
    )
  }
}

// POST: Create webhook (admin auth)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(session.user.id, ip)
    const rateLimit = await checkRateLimit(adminWriteLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers,
      })
    }

    const body = await request.json()
    const { channelId, url, events } = body as {
      channelId?: string
      url?: string
      events?: string[]
    }

    // Validate required fields
    if (!channelId || !url || !events) {
      return NextResponse.json(
        { error: 'channelId, url, and events are required' },
        { status: 400 }
      )
    }

    // Validate URL
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400 }
      )
    }

    // Validate events is a non-empty array of strings
    if (!Array.isArray(events) || events.length === 0 || !events.every((e) => typeof e === 'string')) {
      return NextResponse.json(
        { error: 'events must be a non-empty array of strings' },
        { status: 400 }
      )
    }

    // Verify channel ownership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    })

    if (!channel || channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    // Generate secret
    const secret = nanoid(32)

    const webhook = await prisma.webhookConfig.create({
      data: {
        channelId,
        url,
        events,
        secret,
      },
    })

    // Return webhook WITH secret (only shown on creation)
    return NextResponse.json({ webhook }, { status: 201 })
  } catch (error) {
    logger.error('Create webhook error', error)
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    )
  }
}
