import { describe, it, expect } from 'vitest'
import { z } from 'zod'

describe('Input Validation Schemas', () => {
  describe('Reward Configuration Schema', () => {
    const rewardConfigSchema = z.object({
      channelId: z.string().uuid(),
      name: z.string().min(1).max(100).trim(),
      description: z.string().min(1).max(500).trim(),
      imageUrl: z.string().url().optional().nullable(),
      rewardType: z.enum(['DIGITAL', 'PHYSICAL']),
      requiresShipping: z.boolean().default(false),
      tokenCost: z.number().int().positive().max(1000000),
      isActive: z.boolean().default(true),
      stockQuantity: z.number().int().nonnegative().optional().nullable(),
    })

    it('should validate correct reward configuration', () => {
      const validReward = {
        channelId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Reward',
        description: 'A test reward',
        rewardType: 'DIGITAL' as const,
        requiresShipping: false,
        tokenCost: 100,
        isActive: true,
      }

      const result = rewardConfigSchema.safeParse(validReward)
      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID for channelId', () => {
      const invalidReward = {
        channelId: 'not-a-uuid',
        name: 'Test Reward',
        description: 'A test reward',
        rewardType: 'DIGITAL' as const,
        tokenCost: 100,
      }

      const result = rewardConfigSchema.safeParse(invalidReward)
      expect(result.success).toBe(false)
    })

    it('should reject name longer than 100 characters', () => {
      const invalidReward = {
        channelId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'a'.repeat(101),
        description: 'A test reward',
        rewardType: 'DIGITAL' as const,
        tokenCost: 100,
      }

      const result = rewardConfigSchema.safeParse(invalidReward)
      expect(result.success).toBe(false)
    })

    it('should reject negative token cost', () => {
      const invalidReward = {
        channelId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Reward',
        description: 'A test reward',
        rewardType: 'DIGITAL' as const,
        tokenCost: -10,
      }

      const result = rewardConfigSchema.safeParse(invalidReward)
      expect(result.success).toBe(false)
    })

    it('should reject token cost exceeding maximum', () => {
      const invalidReward = {
        channelId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Reward',
        description: 'A test reward',
        rewardType: 'DIGITAL' as const,
        tokenCost: 1000001,
      }

      const result = rewardConfigSchema.safeParse(invalidReward)
      expect(result.success).toBe(false)
    })

    it('should trim whitespace from name', () => {
      const rewardWithSpaces = {
        channelId: '123e4567-e89b-12d3-a456-426614174000',
        name: '  Test Reward  ',
        description: 'A test reward',
        rewardType: 'DIGITAL' as const,
        tokenCost: 100,
      }

      const result = rewardConfigSchema.safeParse(rewardWithSpaces)
      if (result.success) {
        expect(result.data.name).toBe('Test Reward')
      }
    })
  })

  describe('Polling Action Schema', () => {
    const pollingActionSchema = z.object({
      action: z.enum(['start', 'stop']),
    })

    it('should validate start action', () => {
      const result = pollingActionSchema.safeParse({ action: 'start' })
      expect(result.success).toBe(true)
    })

    it('should validate stop action', () => {
      const result = pollingActionSchema.safeParse({ action: 'stop' })
      expect(result.success).toBe(true)
    })

    it('should reject invalid action', () => {
      const result = pollingActionSchema.safeParse({ action: 'pause' })
      expect(result.success).toBe(false)
    })
  })

  describe('Redemption Update Schema', () => {
    const updateRedemptionSchema = z.object({
      deliveryStatus: z
        .enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'FAILED'])
        .optional(),
      trackingNumber: z.string().max(100).trim().optional().nullable(),
      adminNotes: z.string().max(500).trim().optional().nullable(),
    })

    it('should validate status update', () => {
      const validUpdate = {
        deliveryStatus: 'SHIPPED' as const,
      }

      const result = updateRedemptionSchema.safeParse(validUpdate)
      expect(result.success).toBe(true)
    })

    it('should validate tracking number', () => {
      const validUpdate = {
        trackingNumber: '1Z999AA10123456784',
      }

      const result = updateRedemptionSchema.safeParse(validUpdate)
      expect(result.success).toBe(true)
    })

    it('should reject tracking number exceeding max length', () => {
      const invalidUpdate = {
        trackingNumber: 'a'.repeat(101),
      }

      const result = updateRedemptionSchema.safeParse(invalidUpdate)
      expect(result.success).toBe(false)
    })

    it('should validate admin notes', () => {
      const validUpdate = {
        adminNotes: 'Customer requested express shipping',
      }

      const result = updateRedemptionSchema.safeParse(validUpdate)
      expect(result.success).toBe(true)
    })
  })

  describe('XSS Prevention', () => {
    const textSchema = z.string().max(500).trim()

    it('should accept normal text', () => {
      const result = textSchema.safeParse('Normal text content')
      expect(result.success).toBe(true)
    })

    it('should accept text with HTML entities (validation only)', () => {
      // Note: Zod validates format, sanitization happens elsewhere
      const textWithHtml = '<script>alert("xss")</script>'
      const result = textSchema.safeParse(textWithHtml)
      // Validation passes (format is correct), but sanitization
      // should happen in the error handler/output encoding
      expect(result.success).toBe(true)
    })

    it('should reject text exceeding max length', () => {
      const longText = 'a'.repeat(501)
      const result = textSchema.safeParse(longText)
      expect(result.success).toBe(false)
    })
  })

  describe('SQL Injection Prevention', () => {
    it('should validate UUIDs prevent SQL injection', () => {
      const uuidSchema = z.string().uuid()

      // Valid UUID passes
      const validResult = uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000')
      expect(validResult.success).toBe(true)

      // SQL injection attempt fails
      const injectionAttempt = "'; DROP TABLE users; --"
      const invalidResult = uuidSchema.safeParse(injectionAttempt)
      expect(invalidResult.success).toBe(false)
    })

    it('should validate enums prevent injection', () => {
      const statusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED'])

      // Valid status passes
      const validResult = statusSchema.safeParse('PENDING')
      expect(validResult.success).toBe(true)

      // Injection attempt fails
      const injectionAttempt = "PENDING' OR '1'='1"
      const invalidResult = statusSchema.safeParse(injectionAttempt)
      expect(invalidResult.success).toBe(false)
    })
  })
})
