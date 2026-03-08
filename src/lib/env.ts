import { z } from 'zod'

/**
 * Environment Variable Validation Schema
 *
 * This ensures all required environment variables are present and valid
 * before the application starts. Prevents runtime errors from missing/invalid config.
 */

const envSchema = z.object({
  // Database Configuration
  DATABASE_URL: z
    .string()
    .url()
    .startsWith('postgresql://', 'DATABASE_URL must be a PostgreSQL connection string'),

  DIRECT_URL: z
    .string()
    .url()
    .startsWith('postgresql://', 'DIRECT_URL must be a PostgreSQL connection string for migrations'),

  // NextAuth Configuration
  NEXTAUTH_URL: z
    .string()
    .url('NEXTAUTH_URL must be a valid URL'),

  NEXTAUTH_SECRET: z
    .string()
    .min(32, 'NEXTAUTH_SECRET must be at least 32 characters')
    .refine(
      (val) => val !== 'generate-with-openssl-rand-base64-32',
      'NEXTAUTH_SECRET must be a real secret, not the placeholder. Run: openssl rand -base64 32'
    ),

  // Admin Access Control
  ADMIN_EMAILS: z
    .string()
    .min(1, 'ADMIN_EMAILS must contain at least one email address')
    .transform((val) => val.split(',').map((e) => e.trim().toLowerCase()))
    .refine(
      (emails) => emails.every((email) => email.includes('@')),
      'All ADMIN_EMAILS must be valid email addresses'
    ),

  // Google OAuth Credentials
  GOOGLE_CLIENT_ID: z
    .string()
    .min(1, 'GOOGLE_CLIENT_ID is required for OAuth authentication'),

  GOOGLE_CLIENT_SECRET: z
    .string()
    .min(1, 'GOOGLE_CLIENT_SECRET is required for OAuth authentication'),

  // Upstash Redis Configuration
  UPSTASH_REDIS_REST_URL: z
    .string()
    .url('UPSTASH_REDIS_REST_URL must be a valid URL'),

  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1, 'UPSTASH_REDIS_REST_TOKEN is required for Redis authentication'),

  // Cron Job Security
  CRON_SECRET: z
    .string()
    .min(32, 'CRON_SECRET must be at least 32 characters for security')
    .refine(
      (val) => val !== 'generate-with-openssl-rand-base64-32',
      'CRON_SECRET must be a real secret. Run: openssl rand -base64 32'
    ),

  // Sentry Configuration (optional in development)
  SENTRY_DSN: z
    .string()
    .url('SENTRY_DSN must be a valid URL')
    .optional(),

  SENTRY_AUTH_TOKEN: z
    .string()
    .optional(),

  SENTRY_ORG: z
    .string()
    .optional(),

  SENTRY_PROJECT: z
    .string()
    .optional(),

  // Environment Mode
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // YouTube API Quota Management (optional)
  YOUTUBE_DAILY_QUOTA_LIMIT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive())
    .default(10000)
    .optional(),
})

/**
 * Validated environment variables
 *
 * Import this instead of using process.env directly to ensure type safety
 * and runtime validation.
 *
 * @example
 * import { env } from '@/lib/env'
 *
 * // TypeScript knows this is a string and it's definitely set
 * const clientId = env.GOOGLE_CLIENT_ID
 *
 * // TypeScript knows this is an array of strings
 * const adminEmails = env.ADMIN_EMAILS
 */
export const env = envSchema.parse(process.env)

/**
 * Type-safe environment variable access
 */
export type Env = z.infer<typeof envSchema>
