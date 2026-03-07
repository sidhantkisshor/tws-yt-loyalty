import { z } from 'zod'

/**
 * Input Validation Schemas for YT Loyalty API
 *
 * All request body validation using Zod for type-safe input validation
 * Prevents injection attacks and ensures data integrity
 */

// ============================================
// REWARD CONFIGURATION
// ============================================

export const rewardConfigSchema = z.object({
  channelId: z.string().min(1, { message: 'Channel ID is required' }),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or less')
    .trim(),
  imageUrl: z
    .string()
    .url('Invalid image URL')
    .optional()
    .nullable(),
  rewardType: z.enum(['DIGITAL', 'PHYSICAL']),
  requiresShipping: z.boolean().default(false),
  tokenCost: z
    .number()
    .int('Token cost must be an integer')
    .positive('Token cost must be positive')
    .max(1000000, 'Token cost too high'),
  pointsCost: z
    .number()
    .int('Points cost must be an integer')
    .min(0, 'Points cost cannot be negative')
    .optional(),
  category: z
    .enum(['GATEWAY', 'ENGAGEMENT', 'COMMITMENT', 'PREMIUM', 'PRESTIGE', 'ROTATING'])
    .optional(),
  funnelPosition: z
    .number()
    .int('Funnel position must be an integer')
    .optional(),
  externalCourseId: z
    .string()
    .optional(),
  externalModuleId: z
    .string()
    .optional(),
  isLimitedTime: z
    .boolean()
    .optional(),
  limitedTimeEndsAt: z
    .string()
    .datetime()
    .optional(),
  isActive: z.boolean().default(true),
  stockQuantity: z
    .number()
    .int('Stock quantity must be an integer')
    .nonnegative('Stock quantity cannot be negative')
    .optional()
    .nullable(),
})

// ============================================
// STREAM CONFIGURATION
// ============================================

export const createStreamSchema = z.object({
  channelId: z.string().min(1, { message: 'Channel ID is required' }),
  youtubeVideoId: z
    .string()
    .min(1, 'YouTube video ID is required')
    .max(20, 'Invalid YouTube video ID')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid YouTube video ID format'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .trim(),
  scheduledStartAt: z
    .string()
    .datetime({ message: 'Invalid datetime format' })
    .optional()
    .nullable(),
})

export const updateStreamSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .trim()
    .optional(),
  actualStartAt: z
    .string()
    .datetime({ message: 'Invalid datetime format' })
    .optional()
    .nullable(),
  actualEndAt: z
    .string()
    .datetime({ message: 'Invalid datetime format' })
    .optional()
    .nullable(),
})

// ============================================
// LOYALTY CODE
// ============================================

export const loyaltyCodeSchema = z.object({
  code: z
    .string()
    .min(4, 'Code must be at least 4 characters')
    .max(20, 'Code must be 20 characters or less')
    .regex(/^[A-Z0-9]+$/, 'Code must contain only uppercase letters and numbers')
    .trim(),
  codeType: z.enum(['ATTENDANCE', 'BONUS', 'MILESTONE']),
  basePoints: z
    .number()
    .int('Base points must be an integer')
    .positive('Base points must be positive')
    .max(100000, 'Base points too high'),
  bonusMultiplier: z
    .number()
    .min(1, 'Bonus multiplier must be at least 1')
    .max(10, 'Bonus multiplier too high')
    .default(1),
  maxRedemptions: z
    .number()
    .int('Max redemptions must be an integer')
    .positive('Max redemptions must be positive')
    .max(1000000, 'Max redemptions too high')
    .optional()
    .nullable(),
  expiresAt: z
    .string()
    .datetime({ message: 'Invalid datetime format' })
    .optional()
    .nullable(),
})

// ============================================
// REWARD REDEMPTION
// ============================================

export const redeemRewardSchema = z.object({
  rewardId: z.string().min(1, { message: 'Reward ID is required' }),
  shippingAddress: z
    .object({
      fullName: z
        .string()
        .min(1, 'Full name is required')
        .max(100, 'Full name too long')
        .trim(),
      addressLine1: z
        .string()
        .min(1, 'Address line 1 is required')
        .max(200, 'Address line 1 too long')
        .trim(),
      addressLine2: z
        .string()
        .max(200, 'Address line 2 too long')
        .trim()
        .optional()
        .nullable(),
      city: z
        .string()
        .min(1, 'City is required')
        .max(100, 'City name too long')
        .trim(),
      state: z
        .string()
        .min(1, 'State is required')
        .max(100, 'State name too long')
        .trim(),
      postalCode: z
        .string()
        .min(1, 'Postal code is required')
        .max(20, 'Postal code too long')
        .trim(),
      country: z
        .string()
        .min(2, 'Country is required')
        .max(2, 'Country must be 2-letter ISO code')
        .toUpperCase()
        .trim(),
    })
    .optional()
    .nullable(),
})

// ============================================
// CODE REDEMPTION
// ============================================

export const redeemCodeSchema = z.object({
  code: z
    .string()
    .min(4, 'Code must be at least 4 characters')
    .max(20, 'Code must be 20 characters or less')
    .toUpperCase()
    .trim(),
  channelId: z.string().min(1, { message: 'Channel ID is required' }),
})

// ============================================
// POINT ADJUSTMENT (Admin)
// ============================================

export const pointAdjustmentSchema = z.object({
  viewerId: z.string().min(1, { message: 'Viewer ID is required' }),
  amount: z
    .number()
    .int('Point amount must be an integer')
    .refine((val) => val !== 0, 'Point amount cannot be zero'),
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(200, 'Reason must be 200 characters or less')
    .trim(),
})

// ============================================
// STREAM POLLING CONTROL
// ============================================

export const pollingActionSchema = z.object({
  action: z.enum(['start', 'stop']),
})

// ============================================
// REFERRAL CONVERSION
// ============================================

export const referralConvertSchema = z.object({
  referralCode: z.string().min(6).max(20),
  channelId: z.string().min(1),
})

// ============================================
// REDEMPTION STATUS UPDATE (Admin)
// ============================================

export const updateRedemptionSchema = z.object({
  deliveryStatus: z
    .enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'FAILED'])
    .optional(),
  trackingNumber: z
    .string()
    .max(100, 'Tracking number too long')
    .trim()
    .optional()
    .nullable(),
  adminNotes: z
    .string()
    .max(500, 'Notes must be 500 characters or less')
    .trim()
    .optional()
    .nullable(),
})

// ============================================
// HELPER TYPES
// ============================================

export type RewardConfigInput = z.infer<typeof rewardConfigSchema>
export type CreateStreamInput = z.infer<typeof createStreamSchema>
export type UpdateStreamInput = z.infer<typeof updateStreamSchema>
export type LoyaltyCodeInput = z.infer<typeof loyaltyCodeSchema>
export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>
export type RedeemCodeInput = z.infer<typeof redeemCodeSchema>
export type PointAdjustmentInput = z.infer<typeof pointAdjustmentSchema>
export type UpdateRedemptionInput = z.infer<typeof updateRedemptionSchema>
export type PollingActionInput = z.infer<typeof pollingActionSchema>
export type ReferralConvertInput = z.infer<typeof referralConvertSchema>
