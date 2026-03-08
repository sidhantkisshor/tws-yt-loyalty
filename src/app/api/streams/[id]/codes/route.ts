import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { setActiveCode } from '@/lib/redis'
import { postLiveChatMessage } from '@/lib/youtube'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { adminReadLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'
import { getValidCredentials } from '@/services/tokenManager'

const createCodeSchema = z
  .object({
    code: z.string().min(2).max(20).optional(), // Auto-generate if not provided
    codeType: z.enum(['STANDARD', 'FLASH', 'BONUS', 'FIRST_RESPONSE']).default('STANDARD'),
    basePoints: z.number().min(1).max(1000).default(100),
    memberBonus: z.number().min(0).max(500).default(50),
    modBonus: z.number().min(0).max(500).default(25),
    firstResponseBonus: z.number().min(0).max(500).default(50),
    firstResponseLimit: z.number().min(1).max(100).default(10),
    durationSeconds: z.number().min(30).max(600).default(120),
    maxRedemptions: z.number().min(1).optional(),
    announceInChat: z.boolean().default(true),
  })
  // #15: Validate that total bonuses don't exceed basePoints
  .refine(
    (data) => {
      const maxBonus = Math.max(data.memberBonus, data.modBonus, data.firstResponseBonus)
      return maxBonus <= data.basePoints
    },
    {
      message: 'Bonus amounts cannot exceed basePoints',
      path: ['memberBonus'],
    }
  )

// GET /api/streams/[id]/codes - List codes for a stream
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        headers: rateLimit.headers
      })
    }

    const { id: streamId } = await params

    // Verify stream ownership
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

    const codes = await prisma.loyaltyCode.findMany({
      where: { streamId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { redemptions: true },
        },
      },
    })

    return NextResponse.json({ codes })
  } catch (error) {
    logger.error('Error fetching codes', error)
    return NextResponse.json(
      { error: 'Failed to fetch codes' },
      { status: 500 }
    )
  }
}

// POST /api/streams/[id]/codes - Create a new code
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        headers: rateLimit.headers
      })
    }

    const { id: streamId } = await params
    const body = await request.json()
    const data = createCodeSchema.parse(body)

    // Verify stream ownership and get details
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        channel: {
          select: {
            id: true,
            ownerId: true,
            youtubeChannelId: true,
          },
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
        { error: 'Can only create codes for live streams' },
        { status: 400 }
      )
    }

    // Generate code if not provided
    const code = data.code ?? generateCode(data.codeType)

    // Check for duplicate code in this stream
    const existingCode = await prisma.loyaltyCode.findFirst({
      where: {
        streamId,
        code,
        isActive: true,
      },
    })

    if (existingCode) {
      return NextResponse.json(
        { error: 'Code already exists and is active' },
        { status: 409 }
      )
    }

    // Calculate validity window
    const now = new Date()
    const validUntil = new Date(now.getTime() + data.durationSeconds * 1000)

    // Create the code
    const loyaltyCode = await prisma.loyaltyCode.create({
      data: {
        streamId,
        code,
        codeType: data.codeType,
        basePoints: data.basePoints,
        memberBonus: data.memberBonus,
        modBonus: data.modBonus,
        firstResponseBonus: data.firstResponseBonus,
        firstResponseLimit: data.firstResponseLimit,
        validFrom: now,
        validUntil,
        durationSeconds: data.durationSeconds,
        maxRedemptions: data.maxRedemptions,
        announcedAt: now,
        announcedInChat: data.announceInChat,
      },
    })

    // Update stream stats
    await prisma.stream.update({
      where: { id: streamId },
      data: {
        totalCodesGenerated: { increment: 1 },
      },
    })

    // Set active code in Redis for fast lookup
    await setActiveCode(
      streamId,
      loyaltyCode.id,
      code,
      data.basePoints,
      data.durationSeconds
    )

    // Announce in chat if enabled
    if (data.announceInChat && stream.youtubeLiveChatId) {
      const credentials = await getValidCredentials(stream.channel.id)

      if (credentials) {
        const message = formatCodeAnnouncement(code, data.basePoints, data.durationSeconds)
        await postLiveChatMessage(
          stream.youtubeLiveChatId,
          message,
          stream.channel.id,
          credentials
        )
      }
    }

    return NextResponse.json({ code: loyaltyCode }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Error creating code', error)
    return NextResponse.json(
      { error: 'Failed to create code' },
      { status: 500 }
    )
  }
}

// Helper: Generate a random code
// Increased lengths to prevent brute-force guessing
function generateCode(type: string): string {
  switch (type) {
    case 'FLASH':
      // 6 chars = 56.8B combinations (was 4 = 14.7M)
      return nanoid(6).toUpperCase()
    case 'FIRST_RESPONSE':
      // FIRST + 5 chars = 916M combinations (was 3 = 238K)
      return `FIRST${nanoid(5).toUpperCase()}`
    case 'BONUS':
      // BONUS + 5 chars = 916M combinations (was 4 = 14.7M)
      return `BONUS${nanoid(5).toUpperCase()}`
    default:
      // 8 chars = 218T combinations (was 6 = 56.8B)
      return nanoid(8).toUpperCase()
  }
}

// Helper: Format chat announcement
function formatCodeAnnouncement(
  code: string,
  points: number,
  durationSeconds: number
): string {
  const minutes = Math.floor(durationSeconds / 60)
  const timeStr = minutes > 0 ? `${minutes} min` : `${durationSeconds} sec`

  return `🎯 LOYALTY CODE: ${code} | ${points} points | Type it now! (${timeStr})`
}
