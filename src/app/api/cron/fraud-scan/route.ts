import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { acquireLock, releaseLock } from '@/lib/redis'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { startJob, completeJob, failJob } from '@/services/jobTracker'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // SECURITY: Fail closed
  if (!env.CRON_SECRET) {
    logger.error('CRON_SECRET environment variable is not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Acquire distributed lock (TTL 300s = 5 minutes)
  const lockId = await acquireLock('cron:fraud-scan', 300)
  if (!lockId) {
    return NextResponse.json({ error: 'Already running' }, { status: 409 })
  }

  const ctx = await startJob('FRAUD_SCAN')

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    // Find all PENDING FraudEvents older than 1 hour
    const pendingEvents = await prisma.fraudEvent.findMany({
      where: {
        reviewStatus: 'PENDING',
        createdAt: { lte: oneHourAgo },
      },
      include: {
        viewer: {
          select: {
            id: true,
            trustScore: true,
            isBanned: true,
            fanProfileId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    let autoConfirmed = 0
    let reversalsCreated = 0
    let viewersBanned = 0

    // Group events by viewerId for threshold checks
    const eventsByViewer = new Map<string, typeof pendingEvents>()
    for (const event of pendingEvents) {
      if (!eventsByViewer.has(event.viewerId)) {
        eventsByViewer.set(event.viewerId, [])
      }
      eventsByViewer.get(event.viewerId)!.push(event)
    }

    for (const [viewerId, viewerEvents] of eventsByViewer.entries()) {
      const viewer = viewerEvents[0].viewer
      const eventsToConfirm: string[] = []

      for (const event of viewerEvents) {
        let shouldConfirm = false

        // Rule: if trust score < 20, auto-confirm and ban
        if (viewer.trustScore < 20) {
          shouldConfirm = true
        }

        // Rule: CRITICAL severity auto-confirmed
        if (event.severity === 'CRITICAL') {
          shouldConfirm = true
        }

        // Rule: HIGH severity with 3+ events auto-confirmed
        if (event.severity === 'HIGH') {
          const highSeverityCount = viewerEvents.filter(
            (e) => e.severity === 'HIGH'
          ).length
          if (highSeverityCount >= 3) {
            shouldConfirm = true
          }
        }

        if (shouldConfirm) {
          eventsToConfirm.push(event.id)
        }
      }

      if (eventsToConfirm.length === 0) continue

      // Auto-confirm the events
      await prisma.fraudEvent.updateMany({
        where: { id: { in: eventsToConfirm } },
        data: {
          reviewStatus: 'CONFIRMED',
          reviewedAt: new Date(),
          reviewNotes: 'Auto-confirmed by fraud scan',
        },
      })
      autoConfirmed += eventsToConfirm.length

      // Find associated PointLedger entries to reverse
      // Look for recent non-reversed entries for this fan
      if (viewer.fanProfileId) {
        const recentLedgerEntries = await prisma.pointLedger.findMany({
          where: {
            fanProfileId: viewer.fanProfileId,
            isReversed: false,
            createdAt: {
              gte: new Date(Date.now() - 48 * 60 * 60 * 1000), // Last 48 hours
            },
            type: {
              in: ['CHAT_ACTIVITY', 'SUPER_CHAT_BONUS', 'ATTENDANCE_BONUS'],
            },
          },
        })

        if (recentLedgerEntries.length > 0) {
          // Get current fan profile for balance
          const fanProfile = await prisma.fanProfile.findUnique({
            where: { id: viewer.fanProfileId },
          })

          if (fanProfile) {
            let runningBalance = fanProfile.totalPoints

            for (const entry of recentLedgerEntries) {
              const balanceBefore = runningBalance
              runningBalance -= entry.amount

              // Create FRAUD_REVERSAL entry
              await prisma.pointLedger.create({
                data: {
                  fanProfileId: viewer.fanProfileId,
                  type: 'FRAUD_REVERSAL',
                  amount: -entry.amount,
                  balanceBefore,
                  balanceAfter: runningBalance,
                  description: `Fraud reversal for ${entry.type} (auto-confirmed)`,
                  referenceType: 'FRAUD_SCAN',
                  referenceId: entry.id,
                },
              })

              // Mark original entry as reversed
              await prisma.pointLedger.update({
                where: { id: entry.id },
                data: {
                  isReversed: true,
                  reversedAt: new Date(),
                  reversedBy: 'fraud-scan-cron',
                },
              })

              reversalsCreated++
            }

            // Update fan profile totals
            const totalReversed = recentLedgerEntries.reduce((sum, e) => sum + e.amount, 0)
            await prisma.fanProfile.update({
              where: { id: viewer.fanProfileId },
              data: {
                totalPoints: Math.max(0, runningBalance),
                availablePoints: { decrement: totalReversed },
                lifetimePoints: { decrement: totalReversed },
              },
            })
          }
        }
      }

      // Ban viewer if trust score is too low
      if (viewer.trustScore < 20 && !viewer.isBanned) {
        await prisma.viewer.update({
          where: { id: viewerId },
          data: {
            isBanned: true,
            banReason: 'Auto-banned by fraud scan: trust score below threshold',
            bannedAt: new Date(),
            trustScore: 0,
          },
        })

        // Also ban the fan profile if linked
        if (viewer.fanProfileId) {
          await prisma.fanProfile.update({
            where: { id: viewer.fanProfileId },
            data: {
              isBanned: true,
              banReason: 'Auto-banned by fraud scan: trust score below threshold',
              bannedAt: new Date(),
            },
          })
        }

        viewersBanned++
      }

      ctx.eventsProcessed += eventsToConfirm.length
    }

    await completeJob(ctx)

    return NextResponse.json({
      message: 'Fraud scan completed',
      pendingEventsReviewed: pendingEvents.length,
      autoConfirmed,
      reversalsCreated,
      viewersBanned,
      jobRunId: ctx.jobRunId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    await failJob(ctx, error instanceof Error ? error.message : 'Unknown error')
    logger.error('Fraud scan cron error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fraud scan failed' },
      { status: 500 }
    )
  } finally {
    await releaseLock('cron:fraud-scan', lockId)
  }
}
