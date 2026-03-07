import { describe, it, expect, vi } from 'vitest'

// Mock Prisma (imported by webhookDispatcher)
vi.mock('@/lib/prisma', () => ({
  default: {},
}))

// Mock logger (imported by webhookDispatcher)
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { buildWebhookPayload, signPayload, WebhookEvent } from '@/services/webhookDispatcher'

describe('buildWebhookPayload', () => {
  it('should build correct structure with event, data, and timestamp', () => {
    const event: WebhookEvent = 'viewer.tier_changed'
    const data = { viewerId: 'v123', oldTier: 'BRONZE', newTier: 'SILVER' }

    const payload = buildWebhookPayload(event, data)

    expect(payload.event).toBe('viewer.tier_changed')
    expect(payload.data).toEqual(data)
    expect(payload.timestamp).toBeDefined()
    // timestamp should be a valid ISO 8601 string
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp)
  })

  it('should include all three required fields', () => {
    const payload = buildWebhookPayload('stream.ended', { streamId: 's1' })

    expect(payload).toHaveProperty('event')
    expect(payload).toHaveProperty('data')
    expect(payload).toHaveProperty('timestamp')
    expect(Object.keys(payload)).toHaveLength(3)
  })

  it('should handle null data', () => {
    const payload = buildWebhookPayload('viewer.reward_redeemed', null)

    expect(payload.event).toBe('viewer.reward_redeemed')
    expect(payload.data).toBeNull()
    expect(payload.timestamp).toBeDefined()
  })

  it('should produce a recent timestamp', () => {
    const before = new Date().toISOString()
    const payload = buildWebhookPayload('viewer.milestone_reached', {})
    const after = new Date().toISOString()

    expect(payload.timestamp >= before).toBe(true)
    expect(payload.timestamp <= after).toBe(true)
  })
})

describe('signPayload', () => {
  it('should produce consistent HMAC for the same input', () => {
    const payload = '{"event":"viewer.tier_changed","data":{},"timestamp":"2026-01-01T00:00:00.000Z"}'
    const secret = 'test-secret-key'

    const sig1 = signPayload(payload, secret)
    const sig2 = signPayload(payload, secret)

    expect(sig1).toBe(sig2)
  })

  it('should produce different HMAC for different secrets', () => {
    const payload = '{"event":"viewer.tier_changed","data":{}}'

    const sig1 = signPayload(payload, 'secret-one')
    const sig2 = signPayload(payload, 'secret-two')

    expect(sig1).not.toBe(sig2)
  })

  it('should produce a sha256-prefixed hex string', () => {
    const sig = signPayload('test-payload', 'test-secret')

    // HMAC SHA-256 hex output is "sha256=" + 64 hex characters (32 bytes)
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('should produce different HMAC for different payloads', () => {
    const secret = 'shared-secret'

    const sig1 = signPayload('payload-one', secret)
    const sig2 = signPayload('payload-two', secret)

    expect(sig1).not.toBe(sig2)
  })
})
