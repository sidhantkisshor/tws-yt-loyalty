import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

// Valid delivery status transitions (state machine)
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED', 'FAILED'],
  SHIPPED: ['DELIVERED', 'FAILED'],
  DELIVERED: [], // Terminal state
  FAILED: ['PROCESSING'], // Can retry
  CANCELLED: [], // Terminal state
}

/**
 * Check if a user has admin role
 */
export async function requireAdmin(): Promise<
  | { authorized: true; userId: string; isAdmin: true }
  | { authorized: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })

  if (user?.role !== 'ADMIN') {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden: Admin role required' },
        { status: 403 }
      ),
    }
  }

  return { authorized: true, userId: session.user.id, isAdmin: true }
}

/**
 * Check if user is authenticated (any role)
 */
export async function requireAuth(): Promise<
  | { authorized: true; userId: string }
  | { authorized: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { authorized: true, userId: session.user.id }
}

/**
 * Write an audit log entry
 */
export async function writeAuditLog(params: {
  userId: string | null
  entityType: string
  entityId: string
  action: string
  previousValue?: object | null
  newValue?: object | null
  ipAddress?: string | null
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        previousValue: params.previousValue as object | undefined,
        newValue: params.newValue as object | undefined,
        ipAddress: params.ipAddress,
      },
    })
  } catch (error) {
    // Log but don't fail the main operation
    logger.error('Failed to write audit log', error, {
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
    })
  }
}

/**
 * Validate delivery status transition
 */
export function isValidStatusTransition(
  currentStatus: string,
  newStatus: string
): boolean {
  const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus]
  if (!validTransitions) return false
  return validTransitions.includes(newStatus)
}

/**
 * Get IP address from request headers
 */
export function getClientIP(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip')
}
