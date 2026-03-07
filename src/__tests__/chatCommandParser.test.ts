import { describe, it, expect } from 'vitest'
import { parseChatCommand } from '@/services/chatCommandParser'

describe('parseChatCommand', () => {
  describe('targeted commands', () => {
    it('should parse !helpful @TraderJoe', () => {
      expect(parseChatCommand('!helpful @TraderJoe')).toEqual({
        type: 'helpful',
        targetUsername: 'TraderJoe',
      })
    })

    it('should parse !goodq @TraderJoe', () => {
      expect(parseChatCommand('!goodq @TraderJoe')).toEqual({
        type: 'goodq',
        targetUsername: 'TraderJoe',
      })
    })

    it('should return null when @ is missing for targeted commands', () => {
      expect(parseChatCommand('!helpful Joe')).toBeNull()
    })

    it('should return null when username is missing after @', () => {
      expect(parseChatCommand('!helpful @')).toBeNull()
    })

    it('should return null when target is missing entirely', () => {
      expect(parseChatCommand('!helpful')).toBeNull()
    })

    it('should extract username even with extra text after it', () => {
      expect(parseChatCommand('!helpful @Joe extra text')).toEqual({
        type: 'helpful',
        targetUsername: 'Joe',
      })
    })
  })

  describe('simple commands', () => {
    it('should parse !points', () => {
      expect(parseChatCommand('!points')).toEqual({ type: 'points' })
    })

    it('should parse !streak', () => {
      expect(parseChatCommand('!streak')).toEqual({ type: 'streak' })
    })

    it('should parse !leaderboard', () => {
      expect(parseChatCommand('!leaderboard')).toEqual({ type: 'leaderboard' })
    })

    it('should parse !refer', () => {
      expect(parseChatCommand('!refer')).toEqual({ type: 'refer' })
    })
  })

  describe('case insensitivity', () => {
    it('should parse !HELPFUL @TraderJoe', () => {
      expect(parseChatCommand('!HELPFUL @TraderJoe')).toEqual({
        type: 'helpful',
        targetUsername: 'TraderJoe',
      })
    })

    it('should parse !Goodq @User', () => {
      expect(parseChatCommand('!Goodq @User')).toEqual({
        type: 'goodq',
        targetUsername: 'User',
      })
    })

    it('should parse !POINTS', () => {
      expect(parseChatCommand('!POINTS')).toEqual({ type: 'points' })
    })
  })

  describe('non-commands and unknown commands', () => {
    it('should return null for regular messages', () => {
      expect(parseChatCommand('hello world')).toBeNull()
    })

    it('should return null for unknown commands', () => {
      expect(parseChatCommand('!unknown')).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(parseChatCommand('')).toBeNull()
    })

    it('should return null for whitespace only', () => {
      expect(parseChatCommand('   ')).toBeNull()
    })
  })

  describe('whitespace handling', () => {
    it('should trim leading and trailing whitespace', () => {
      expect(parseChatCommand('  !points  ')).toEqual({ type: 'points' })
    })

    it('should handle extra whitespace between command and target', () => {
      expect(parseChatCommand('!helpful   @TraderJoe')).toEqual({
        type: 'helpful',
        targetUsername: 'TraderJoe',
      })
    })
  })
})
