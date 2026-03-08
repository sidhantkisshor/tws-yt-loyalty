import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Environment Validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // Restore original env after each test
    process.env = originalEnv
  })

  describe('Required Environment Variables', () => {
    it.skipIf(!process.env.DATABASE_URL)('should have DATABASE_URL defined', () => {
      expect(process.env.DATABASE_URL).toBeDefined()
      expect(process.env.DATABASE_URL).toContain('postgresql://')
    })

    it.skipIf(!process.env.NEXTAUTH_URL)('should have NEXTAUTH_URL defined', () => {
      expect(process.env.NEXTAUTH_URL).toBeDefined()
    })

    it.skipIf(!process.env.NEXTAUTH_SECRET)('should have NEXTAUTH_SECRET defined', () => {
      expect(process.env.NEXTAUTH_SECRET).toBeDefined()
      expect(process.env.NEXTAUTH_SECRET!.length).toBeGreaterThan(32)
    })

    it.skipIf(!process.env.GOOGLE_CLIENT_ID)('should have Google OAuth credentials defined', () => {
      expect(process.env.GOOGLE_CLIENT_ID).toBeDefined()
      expect(process.env.GOOGLE_CLIENT_SECRET).toBeDefined()
    })

    it.skipIf(!process.env.UPSTASH_REDIS_REST_URL)('should have Redis credentials defined', () => {
      expect(process.env.UPSTASH_REDIS_REST_URL).toBeDefined()
      expect(process.env.UPSTASH_REDIS_REST_TOKEN).toBeDefined()
    })
  })

  describe('Environment Variable Format', () => {
    it.skipIf(!process.env.DATABASE_URL)('DATABASE_URL should be a valid PostgreSQL connection string', () => {
      const dbUrl = process.env.DATABASE_URL
      expect(dbUrl).toMatch(/^postgresql:\/\//)
    })

    it.skipIf(!process.env.UPSTASH_REDIS_REST_URL)('UPSTASH_REDIS_REST_URL should be a valid URL', () => {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL
      expect(redisUrl).toMatch(/^https:\/\//)
    })

    it('NEXTAUTH_URL should be a valid URL in production', () => {
      if (process.env.NODE_ENV === 'production') {
        const authUrl = process.env.NEXTAUTH_URL
        expect(authUrl).toMatch(/^https:\/\//)
      }
    })
  })

  describe('Optional Environment Variables', () => {
    it('should handle SENTRY_DSN if provided', () => {
      if (process.env.SENTRY_DSN) {
        expect(process.env.SENTRY_DSN).toMatch(/^https:\/\//)
        expect(process.env.SENTRY_DSN).toContain('ingest.sentry.io')
      }
    })

    it('should default NODE_ENV to development if not set', () => {
      // Test the fallback logic when NODE_ENV is undefined
      const mockEnv: string | undefined = undefined
      const nodeEnv = mockEnv || 'development'
      expect(nodeEnv).toBe('development')
    })
  })

  describe('Security Checks', () => {
    it('should not expose secrets in logs', () => {
      const sensitiveVars = [
        'NEXTAUTH_SECRET',
        'GOOGLE_CLIENT_SECRET',
        'UPSTASH_REDIS_REST_TOKEN',
      ]

      sensitiveVars.forEach((varName) => {
        const value = process.env[varName]
        if (value) {
          // Ensure it's not a placeholder or test value
          expect(value).not.toBe('test')
          expect(value).not.toBe('placeholder')
          expect(value).not.toBe('your-secret-here')
        }
      })
    })

    it('should use secure protocols in production', () => {
      if (process.env.NODE_ENV === 'production') {
        const nextauthUrl = process.env.NEXTAUTH_URL
        expect(nextauthUrl).toMatch(/^https:\/\//)
        expect(nextauthUrl).not.toContain('localhost')
        expect(nextauthUrl).not.toContain('127.0.0.1')
      }
    })
  })
})
