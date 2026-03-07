import prisma from '@/lib/prisma'
import {
  getActiveCode,
  updateStreamLeaderboard,
  updateChannelLeaderboard,
} from '@/lib/redis'
import { processFraudCheck } from './fraudDetection'
import { calculateBonuses, isEarlyBirdEligible } from './bonusCalculator'
import { LiveChatMessage } from '@/lib/youtube'
import { getRankForPoints } from '@/lib/ranks'
import { parseChatCommand } from '@/services/chatCommandParser'

// ============================================
// CODE DETECTION
// ============================================

/**
 * Detect if a message contains an active loyalty code
 */
export async function detectCode(
  streamId: string,
  messageText: string
): Promise<{ found: boolean; code?: string; codeId?: string }> {
  const activeCode = await getActiveCode(streamId)
  if (!activeCode) {
    return { found: false }
  }

  // Check if message contains the code (case-insensitive)
  const normalizedMessage = messageText.toUpperCase().trim()
  const normalizedCode = activeCode.code.toUpperCase()

  if (normalizedMessage.includes(normalizedCode)) {
    return {
      found: true,
      code: activeCode.code,
      codeId: activeCode.codeId,
    }
  }

  return { found: false }
}

// ============================================
// MESSAGE PROCESSING
// ============================================

export interface ProcessMessageResult {
  viewerId: string
  isNewViewer: boolean
  codeRedeemed: boolean
  pointsAwarded: number
  fraudDetected: boolean
}

/**
 * Process a single chat message
 */
export async function processMessage(
  streamId: string,
  channelId: string,
  message: LiveChatMessage
): Promise<ProcessMessageResult> {
  // 1. Upsert viewer
  const { viewer, isNew } = await upsertViewer(channelId, message)

  // 2. Detect code early (used for both storage and redemption)
  const codeResult = await detectCode(streamId, message.messageText)

  // Check if viewer is banned
  if (viewer.isBanned) {
    return {
      viewerId: viewer.id,
      isNewViewer: isNew,
      codeRedeemed: false,
      pointsAwarded: 0,
      fraudDetected: false,
    }
  }

  // 3. Store chat message and update attendance in parallel
  await Promise.all([
    storeMessage(streamId, viewer.id, message, codeResult),
    updateAttendance(streamId, viewer.id, message),
  ])

  let pointsAwarded = 0
  let fraudDetected = false

  if (codeResult.found && codeResult.codeId) {
    const redemptionResult = await processCodeRedemption(
      streamId,
      channelId,
      viewer.id,
      codeResult.codeId,
      message
    )
    pointsAwarded = redemptionResult.pointsAwarded
    fraudDetected = redemptionResult.fraudDetected
  }

  // Process chat commands (!helpful, !goodq, etc.)
  const command = parseChatCommand(message.messageText)
  if (command) {
    switch (command.type) {
      case 'helpful': {
        // Find target viewer by display name in same channel
        const target = await prisma.viewer.findFirst({
          where: { displayName: command.targetUsername, channelId },
          select: { id: true, availablePoints: true },
        })
        if (target && target.id !== viewer.id) {
          // Check cap: max 5 upvotes given per viewer per stream
          const givenCount = await prisma.helpfulUpvote.count({
            where: { giverId: viewer.id, streamId },
          })
          if (givenCount < 5) {
            // Check cap: max 5 upvotes received per target per stream (5 * 5pts = 25 cap)
            const receivedCount = await prisma.helpfulUpvote.count({
              where: { receiverId: target.id, streamId },
            })
            if (receivedCount < 5) {
              try {
                await prisma.$transaction([
                  prisma.helpfulUpvote.create({
                    data: { giverId: viewer.id, receiverId: target.id, streamId },
                  }),
                  prisma.viewer.update({
                    where: { id: target.id },
                    data: {
                      helpfulUpvotesReceived: { increment: 1 },
                      availablePoints: { increment: 5 },
                      totalPoints: { increment: 5 },
                      lifetimePoints: { increment: 5 },
                    },
                  }),
                  prisma.viewer.update({
                    where: { id: viewer.id },
                    data: { helpfulUpvotesGiven: { increment: 1 } },
                  }),
                  prisma.pointLedger.create({
                    data: {
                      viewerId: target.id,
                      streamId,
                      type: 'HELPFUL_UPVOTE',
                      amount: 5,
                      balanceBefore: target.availablePoints,
                      balanceAfter: target.availablePoints + 5,
                      description: `Helpful upvote from ${message.authorDisplayName}`,
                    },
                  }),
                ])
              } catch {
                // Unique constraint violation = already upvoted this person in this stream
              }
            }
          }
        }
        break
      }
      case 'goodq': {
        // Only moderators can use !goodq
        if (viewer.isModerator) {
          const target = await prisma.viewer.findFirst({
            where: { displayName: command.targetUsername, channelId },
            select: { id: true, availablePoints: true },
          })
          if (target) {
            await prisma.$transaction([
              prisma.viewer.update({
                where: { id: target.id },
                data: {
                  qualityQuestionsCount: { increment: 1 },
                  availablePoints: { increment: 20 },
                  totalPoints: { increment: 20 },
                  lifetimePoints: { increment: 20 },
                },
              }),
              prisma.pointLedger.create({
                data: {
                  viewerId: target.id,
                  streamId,
                  type: 'QUALITY_QUESTION',
                  amount: 20,
                  balanceBefore: target.availablePoints,
                  balanceAfter: target.availablePoints + 20,
                  description: 'Quality question recognized by moderator',
                },
              }),
            ])
          }
        }
        break
      }
      default:
        break
    }
  }

  return {
    viewerId: viewer.id,
    isNewViewer: isNew,
    codeRedeemed: codeResult.found && pointsAwarded > 0,
    pointsAwarded,
    fraudDetected,
  }
}

// ============================================
// VIEWER MANAGEMENT
// ============================================

async function upsertViewer(
  channelId: string,
  message: LiveChatMessage
): Promise<{ viewer: { id: string; isBanned: boolean; trustScore: number; isMember: boolean; isModerator: boolean }; isNew: boolean }> {
  const existing = await prisma.viewer.findUnique({
    where: {
      youtubeChannelId_channelId: {
        youtubeChannelId: message.authorChannelId,
        channelId,
      },
    },
    select: { id: true, isBanned: true, trustScore: true, isMember: true, isModerator: true },
  })

  if (existing) {
    // Update last seen and status
    await prisma.viewer.update({
      where: { id: existing.id },
      data: {
        displayName: message.authorDisplayName,
        profileImageUrl: message.authorProfileImageUrl,
        lastSeenAt: new Date(),
        totalMessagesCount: { increment: 1 },
        isMember: message.authorIsChatSponsor,
        isModerator: message.authorIsChatModerator,
      },
    })
    return { viewer: existing, isNew: false }
  }

  // Create new viewer
  const newViewer = await prisma.viewer.create({
    data: {
      youtubeChannelId: message.authorChannelId,
      displayName: message.authorDisplayName,
      profileImageUrl: message.authorProfileImageUrl,
      channelId,
      isMember: message.authorIsChatSponsor,
      isModerator: message.authorIsChatModerator,
      totalMessagesCount: 1,
    },
    select: { id: true, isBanned: true, trustScore: true, isMember: true, isModerator: true },
  })

  return { viewer: newViewer, isNew: true }
}

async function storeMessage(
  streamId: string,
  viewerId: string,
  message: LiveChatMessage,
  codeResult: { found: boolean; code?: string; codeId?: string }
): Promise<void> {
  // Use upsert with onConflict to handle duplicates efficiently (avoids separate findUnique)
  await prisma.chatMessage.upsert({
    where: { youtubeMessageId: message.id },
    create: {
      streamId,
      viewerId,
      youtubeMessageId: message.id,
      messageText: message.messageText,
      messageType: message.messageType,
      publishedAt: message.publishedAt,
      isSuperChat: message.superChatAmount !== undefined,
      superChatAmount: message.superChatAmount,
      superChatCurrency: message.superChatCurrency,
      containsCode: codeResult.found,
      detectedCode: codeResult.code,
    },
    update: {}, // No-op on conflict, message already exists
  })
}

async function updateAttendance(
  streamId: string,
  viewerId: string,
  message: LiveChatMessage
): Promise<void> {
  const now = new Date()

  await prisma.streamAttendance.upsert({
    where: {
      streamId_viewerId: { streamId, viewerId },
    },
    create: {
      streamId,
      viewerId,
      firstMessageAt: message.publishedAt,
      lastMessageAt: now,
      messageCount: 1,
      wasSponsor: message.authorIsChatSponsor,
      wasModerator: message.authorIsChatModerator,
    },
    update: {
      lastMessageAt: now,
      messageCount: { increment: 1 },
      wasSponsor: message.authorIsChatSponsor || undefined,
      wasModerator: message.authorIsChatModerator || undefined,
    },
  })
}

// ============================================
// CODE REDEMPTION
// ============================================

interface RedemptionResult {
  success: boolean
  pointsAwarded: number
  fraudDetected: boolean
  reason?: string
}

async function processCodeRedemption(
  streamId: string,
  channelId: string,
  viewerId: string,
  codeId: string,
  message: LiveChatMessage
): Promise<RedemptionResult> {
  // 1. Batch fetch all required data in parallel
  const [code, existingRedemption, viewer, stream] = await Promise.all([
    prisma.loyaltyCode.findUnique({ where: { id: codeId } }),
    prisma.codeRedemption.findUnique({
      where: { codeId_viewerId: { codeId, viewerId } },
      select: { id: true }, // Only need to check existence
    }),
    prisma.viewer.findUnique({ where: { id: viewerId } }),
    prisma.stream.findUnique({
      where: { id: streamId },
      select: { actualStartAt: true },
    }),
  ])

  // 2. Validate code
  if (!code || !code.isActive) {
    return { success: false, pointsAwarded: 0, fraudDetected: false, reason: 'code_inactive' }
  }

  if (code.validUntil && new Date() > code.validUntil) {
    return { success: false, pointsAwarded: 0, fraudDetected: false, reason: 'code_expired' }
  }

  // 3. Check existing redemption
  if (existingRedemption) {
    return { success: false, pointsAwarded: 0, fraudDetected: false, reason: 'already_redeemed' }
  }

  // 4. Check max redemptions
  if (code.maxRedemptions && code.currentRedemptions >= code.maxRedemptions) {
    return { success: false, pointsAwarded: 0, fraudDetected: false, reason: 'max_redemptions' }
  }

  // 5. Validate viewer
  if (!viewer) {
    return { success: false, pointsAwarded: 0, fraudDetected: false, reason: 'viewer_not_found' }
  }

  // 6. Calculate latency
  const latencyMs = message.publishedAt.getTime() - (code.announcedAt?.getTime() || code.validFrom.getTime())

  // 7. Run fraud checks
  const fraudResult = await processFraudCheck(
    viewerId,
    codeId,
    streamId,
    latencyMs,
    code.announcedAt || code.validFrom
  )

  if (!fraudResult.allowed) {
    return {
      success: false,
      pointsAwarded: 0,
      fraudDetected: true,
      reason: 'fraud_detected',
    }
  }

  // 8. Check early bird eligibility
  const isEarlyBird = isEarlyBirdEligible(message.publishedAt, stream?.actualStartAt ?? null)

  // 9. Calculate all bonuses using the bonusCalculator
  const bonusResult = calculateBonuses(
    code.basePoints,
    {
      rank: viewer.rank,
      currentStreak: viewer.currentStreak,
      isMember: viewer.isMember,
      isModerator: viewer.isModerator,
    },
    {
      memberBonus: code.memberBonus,
      modBonus: code.modBonus,
      firstResponseBonus: code.firstResponseBonus,
      currentRedemptions: code.currentRedemptions,
      firstResponseLimit: code.firstResponseLimit,
    },
    isEarlyBird
  )

  // 10. Create redemption and update points in SERIALIZABLE transaction to prevent race conditions
  let totalPoints = bonusResult.totalPoints
  let finalBonusTypes = [...bonusResult.bonusTypes]

  try {
    await prisma.$transaction(async (tx) => {
      // Re-check if already redeemed inside transaction (prevents race condition)
      const existingInTx = await tx.codeRedemption.findUnique({
        where: { codeId_viewerId: { codeId, viewerId } },
      })
      if (existingInTx) {
        throw new Error('ALREADY_REDEEMED')
      }

      // Re-check and get fresh code data inside transaction
      const freshCode = await tx.loyaltyCode.findUnique({
        where: { id: codeId },
      })
      if (!freshCode) {
        throw new Error('CODE_NOT_FOUND')
      }

      // Re-check max redemptions with fresh data
      if (freshCode.maxRedemptions && freshCode.currentRedemptions >= freshCode.maxRedemptions) {
        throw new Error('MAX_REDEMPTIONS')
      }

      // Recalculate first response bonus atomically with fresh data
      // Remove the pre-calculated first bonus if it was included
      if (finalBonusTypes.includes('first')) {
        totalPoints -= code.firstResponseBonus
        finalBonusTypes = finalBonusTypes.filter(t => t !== 'first')
      }

      // Add first response bonus if still eligible with fresh data
      if (freshCode.currentRedemptions < freshCode.firstResponseLimit && freshCode.firstResponseBonus > 0) {
        totalPoints += freshCode.firstResponseBonus
        finalBonusTypes.push('first')
      }

      // Create redemption record
      await tx.codeRedemption.create({
        data: {
          codeId,
          viewerId,
          pointsAwarded: totalPoints,
          bonusType: finalBonusTypes.length > 0 ? finalBonusTypes.join('+') : null,
          bonusPoints: totalPoints - code.basePoints,
          redemptionLatencyMs: latencyMs,
          messageId: message.id,
          trustScoreAtTime: viewer.trustScore,
        },
      })

      // Update code redemption count
      await tx.loyaltyCode.update({
        where: { id: codeId },
        data: { currentRedemptions: { increment: 1 } },
      })

      // Update viewer points
      await tx.viewer.update({
        where: { id: viewerId },
        data: {
          totalPoints: { increment: totalPoints },
          availablePoints: { increment: totalPoints },
          lifetimePoints: { increment: totalPoints },
          totalCodesRedeemed: { increment: 1 },
        },
      })

      // Create transaction record
      await tx.pointLedger.create({
        data: {
          viewerId,
          streamId,
          type: 'CODE_REDEMPTION',
          amount: totalPoints,
          balanceBefore: viewer.availablePoints,
          balanceAfter: viewer.availablePoints + totalPoints,
          referenceType: 'code_redemption',
          referenceId: codeId,
          description: `Redeemed code ${code.code}`,
        },
      })

      // Update stream attendance with early bird flag
      await tx.streamAttendance.update({
        where: { streamId_viewerId: { streamId, viewerId } },
        data: {
          codesRedeemed: { increment: 1 },
          pointsEarned: { increment: totalPoints },
          earlyBirdBonus: isEarlyBird ? true : undefined,
        },
      })

      // Update stream stats
      await tx.stream.update({
        where: { id: streamId },
        data: {
          totalPointsAwarded: { increment: totalPoints },
        },
      })
    }, {
      isolationLevel: 'Serializable', // Prevents race conditions
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'ALREADY_REDEEMED') {
        return { success: false, pointsAwarded: 0, fraudDetected: false, reason: 'already_redeemed' }
      }
      if (error.message === 'MAX_REDEMPTIONS') {
        return { success: false, pointsAwarded: 0, fraudDetected: false, reason: 'max_redemptions' }
      }
      if (error.message === 'CODE_NOT_FOUND') {
        return { success: false, pointsAwarded: 0, fraudDetected: false, reason: 'code_not_found' }
      }
    }
    throw error // Re-throw unexpected errors
  }

  // 11. Update leaderboards in Redis (with cached display name for faster lookups)
  await Promise.all([
    updateStreamLeaderboard(streamId, viewerId, totalPoints, viewer.displayName),
    updateChannelLeaderboard(channelId, viewerId, totalPoints, viewer.displayName),
  ])

  // 12. Update viewer rank if needed
  await updateViewerRank(viewerId)

  return {
    success: true,
    pointsAwarded: totalPoints,
    fraudDetected: false,
  }
}

// ============================================
// RANK MANAGEMENT
// ============================================

async function updateViewerRank(viewerId: string): Promise<void> {
  const viewer = await prisma.viewer.findUnique({
    where: { id: viewerId },
    select: { lifetimePoints: true, rank: true },
  })

  if (!viewer) return

  // Determine new rank using centralized config
  const newRank = getRankForPoints(viewer.lifetimePoints)

  // Update if changed
  if (newRank !== viewer.rank) {
    await prisma.viewer.update({
      where: { id: viewerId },
      data: { rank: newRank },
    })
  }
}

const messageProcessorService = {
  detectCode,
  processMessage,
  updateViewerRank,
}

export default messageProcessorService
