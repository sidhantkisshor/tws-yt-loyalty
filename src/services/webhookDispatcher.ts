import crypto from 'crypto'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

// ============================================
// TYPES
// ============================================

export type WebhookEvent =
  | 'viewer.tier_changed'
  | 'viewer.reward_redeemed'
  | 'viewer.segment_changed'
  | 'viewer.referral_converted'
  | 'viewer.milestone_reached'
  | 'stream.ended'

export interface WebhookPayload {
  event: WebhookEvent
  data: unknown
  timestamp: string
}

// ============================================
// PURE FUNCTIONS
// ============================================

/**
 * Builds a webhook payload object with event, data, and ISO timestamp.
 */
export function buildWebhookPayload(
  event: WebhookEvent,
  data: unknown
): WebhookPayload {
  return {
    event,
    data,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Signs a JSON payload string using HMAC SHA-256.
 * Returns the signature as a hex string.
 */
export function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
}

// ============================================
// DISPATCH
// ============================================

/**
 * Dispatches webhook events to all active webhook configs for a channel.
 *
 * - Fetches active WebhookConfig rows matching the channelId
 * - Filters by event subscription (stored in the `events` JSON array)
 * - Sends signed POST requests with `X-Webhook-Signature` header
 * - Creates WebhookDelivery records for each attempt
 * - Handles failures gracefully (logs errors, increments failureCount)
 */
export async function dispatchWebhooks(
  channelId: string,
  event: WebhookEvent,
  data: unknown
): Promise<void> {
  let configs
  try {
    configs = await prisma.webhookConfig.findMany({
      where: {
        channelId,
        isActive: true,
      },
    })
  } catch (err) {
    logger.error('Failed to fetch webhook configs', err as Error, { channelId, event })
    return
  }

  // Filter configs that are subscribed to this event
  const matchingConfigs = configs.filter((config) => {
    const events = config.events as string[]
    return Array.isArray(events) && events.includes(event)
  })

  if (matchingConfigs.length === 0) return

  const payload = buildWebhookPayload(event, data)
  const payloadString = JSON.stringify(payload)

  const deliveryPromises = matchingConfigs.map(async (config) => {
    const signature = signPayload(payloadString, config.secret)

    let statusCode: number | null = null
    let responseBody: string | null = null
    let deliveredAt: Date | null = null

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body: payloadString,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })

      statusCode = response.status
      responseBody = await response.text().catch(() => null)

      if (response.ok) {
        deliveredAt = new Date()
        // Reset failure count and update last triggered
        await prisma.webhookConfig.update({
          where: { id: config.id },
          data: {
            failureCount: 0,
            lastTriggeredAt: deliveredAt,
          },
        })
      } else {
        // Non-2xx response — increment failure count
        await prisma.webhookConfig.update({
          where: { id: config.id },
          data: {
            failureCount: { increment: 1 },
            lastTriggeredAt: new Date(),
          },
        })
        logger.warn('Webhook delivery received non-OK status', {
          webhookId: config.id,
          url: config.url,
          event,
          statusCode,
        })
      }
    } catch (err) {
      // Network error, timeout, etc.
      await prisma.webhookConfig.update({
        where: { id: config.id },
        data: {
          failureCount: { increment: 1 },
          lastTriggeredAt: new Date(),
        },
      }).catch((updateErr) => {
        logger.error('Failed to update webhook failure count', updateErr as Error, {
          webhookId: config.id,
        })
      })

      logger.error('Webhook delivery failed', err as Error, {
        webhookId: config.id,
        url: config.url,
        event,
      })
    }

    // Store delivery record
    try {
      await prisma.webhookDelivery.create({
        data: {
          webhookId: config.id,
          event,
          payload: payload as object,
          statusCode,
          response: responseBody,
          deliveredAt,
        },
      })
    } catch (err) {
      logger.error('Failed to create webhook delivery record', err as Error, {
        webhookId: config.id,
        event,
      })
    }
  })

  await Promise.allSettled(deliveryPromises)
}

const webhookDispatcherService = {
  buildWebhookPayload,
  signPayload,
  dispatchWebhooks,
}

export default webhookDispatcherService
