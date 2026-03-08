import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sanitizeErrorMessage, simplifyZodErrors } from '@/lib/errorHandler'
import { z } from 'zod'

describe('sanitizeErrorMessage', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv
  })

  it('returns the actual error message in development', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development'
    const error = new Error('Database connection failed at host:5432')
    expect(sanitizeErrorMessage(error, 'Something went wrong')).toBe(
      'Database connection failed at host:5432'
    )
  })

  it('stringifies non-Error values in development', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development'
    expect(sanitizeErrorMessage('raw string error', 'fallback')).toBe('raw string error')
  })

  it('returns the default message in production', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    const error = new Error('Sensitive DB info: password=abc123')
    expect(sanitizeErrorMessage(error, 'Something went wrong')).toBe(
      'Something went wrong'
    )
  })

  it('returns the default message in test mode (non-development)', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test'
    const error = new Error('internal details')
    expect(sanitizeErrorMessage(error, 'Generic error')).toBe('Generic error')
  })
})

describe('simplifyZodErrors', () => {
  it('returns field paths and messages for validation errors', () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().min(18),
    })

    const result = schema.safeParse({ email: 'invalid', age: 10 })

    if (!result.success) {
      const simplified = simplifyZodErrors(result.error)

      expect(simplified).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'age' }),
        ])
      )

      simplified.forEach((item) => {
        expect(item).toHaveProperty('field')
        expect(item).toHaveProperty('message')
        expect(typeof item.field).toBe('string')
        expect(typeof item.message).toBe('string')
      })
    }
  })

  it('handles nested field paths', () => {
    const schema = z.object({
      address: z.object({
        zip: z.string().min(5),
      }),
    })

    const result = schema.safeParse({ address: { zip: '12' } })

    if (!result.success) {
      const simplified = simplifyZodErrors(result.error)
      expect(simplified[0].field).toBe('address.zip')
    }
  })

  it('returns empty array for no issues', () => {
    const error = new z.ZodError([])
    expect(simplifyZodErrors(error)).toEqual([])
  })
})
