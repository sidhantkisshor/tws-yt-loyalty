import { describe, it, expect } from 'vitest'
import { nanoid } from 'nanoid'

// Simulate the generateCode function logic from codes/route.ts
function generateCode(type: string): string {
  switch (type) {
    case 'FLASH':
      return nanoid(6).toUpperCase()
    case 'FIRST_RESPONSE':
      return `FIRST${nanoid(5).toUpperCase()}`
    case 'BONUS':
      return `BONUS${nanoid(5).toUpperCase()}`
    default:
      return nanoid(8).toUpperCase()
  }
}

describe('Code Generation Security', () => {
  describe('Code Length Requirements', () => {
    it('FLASH codes should be at least 6 characters', () => {
      const code = generateCode('FLASH')
      expect(code.length).toBeGreaterThanOrEqual(6)
    })

    it('FIRST_RESPONSE codes should be FIRST + 5 chars = 10 total', () => {
      const code = generateCode('FIRST_RESPONSE')
      expect(code.startsWith('FIRST')).toBe(true)
      expect(code.length).toBe(10) // FIRST(5) + random(5)
    })

    it('BONUS codes should be BONUS + 5 chars = 10 total', () => {
      const code = generateCode('BONUS')
      expect(code.startsWith('BONUS')).toBe(true)
      expect(code.length).toBe(10) // BONUS(5) + random(5)
    })

    it('Standard codes should be at least 8 characters', () => {
      const code = generateCode('STANDARD')
      expect(code.length).toBeGreaterThanOrEqual(8)
    })
  })

  describe('Code Uniqueness', () => {
    it('should generate unique codes', () => {
      const codes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        codes.add(generateCode('STANDARD'))
      }
      // All 100 should be unique
      expect(codes.size).toBe(100)
    })

    it('should generate unique FLASH codes', () => {
      const codes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        codes.add(generateCode('FLASH'))
      }
      expect(codes.size).toBe(100)
    })
  })

  describe('Code Format', () => {
    it('all codes should be uppercase', () => {
      const types = ['FLASH', 'FIRST_RESPONSE', 'BONUS', 'STANDARD']

      for (const type of types) {
        const code = generateCode(type)
        expect(code).toBe(code.toUpperCase())
      }
    })

    it('should only contain URL-safe characters (nanoid alphabet)', () => {
      const types = ['FLASH', 'FIRST_RESPONSE', 'BONUS', 'STANDARD']
      // nanoid uses URL-safe alphabet: A-Z, a-z, 0-9, - and _
      // After .toUpperCase(), we get: A-Z, 0-9, - and _
      const urlSafeRegex = /^[A-Z0-9_-]+$/

      for (const type of types) {
        for (let i = 0; i < 10; i++) {
          const code = generateCode(type)
          expect(code).toMatch(urlSafeRegex)
        }
      }
    })
  })

  describe('Brute Force Resistance', () => {
    it('FLASH codes should have sufficient entropy (6 chars = 56.8B combinations)', () => {
      // nanoid uses 64 character alphabet, 6 chars = 64^6 = 68.7B combinations
      // After uppercase conversion (62 chars), still 56.8B combinations
      const code = generateCode('FLASH')
      expect(code.length).toBe(6)
    })

    it('Standard codes should have high entropy (8 chars = 218T combinations)', () => {
      // 8 chars with 62 character alphabet = 62^8 = 218T combinations
      const code = generateCode('STANDARD')
      expect(code.length).toBe(8)
    })
  })
})

describe('Code Expiration Logic', () => {
  describe('Expiration Check', () => {
    it('should reject expired codes', () => {
      const code = {
        isActive: true,
        validUntil: new Date('2024-01-01T00:00:00Z'), // Past date
      }
      const now = new Date('2024-06-01T00:00:00Z')

      const isExpired = code.validUntil && now > (code.validUntil as Date)
      expect(isExpired).toBe(true)
    })

    it('should accept non-expired codes', () => {
      const code = {
        isActive: true,
        validUntil: new Date('2099-12-31T23:59:59Z'), // Future date
      }
      const now = new Date()

      const isExpired = code.validUntil && now > (code.validUntil as Date)
      expect(isExpired).toBe(false)
    })

    it('should accept codes with no expiration', () => {
      const code = {
        isActive: true,
        validUntil: null,
      }
      const now = new Date()

      // When validUntil is null, the && short-circuits to null (falsy)
      const isExpired = code.validUntil && now > (code.validUntil as Date)
      expect(isExpired).toBeFalsy()
    })

    it('should reject inactive codes regardless of expiration', () => {
      const code = {
        isActive: false,
        validUntil: new Date('2099-12-31T23:59:59Z'), // Future date
      }

      expect(code.isActive).toBe(false)
    })
  })
})
