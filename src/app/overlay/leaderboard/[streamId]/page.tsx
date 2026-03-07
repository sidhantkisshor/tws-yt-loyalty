'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface LeaderboardEntry {
  rank: number
  displayName: string
  pointsEarned: number
  tier: string
}

const BADGE_COLORS: Record<string, string> = {
  PAPER_TRADER: '#9CA3AF',
  RETAIL_TRADER: '#22C55E',
  SWING_TRADER: '#3B82F6',
  FUND_MANAGER: '#A855F7',
  MARKET_MAKER: '#EAB308',
  HEDGE_FUND: '#E5E7EB',
  WHALE: '#F59E0B',
}

const BADGE_LABELS: Record<string, string> = {
  PAPER_TRADER: 'PT',
  RETAIL_TRADER: 'RT',
  SWING_TRADER: 'ST',
  FUND_MANAGER: 'FM',
  MARKET_MAKER: 'MM',
  HEDGE_FUND: 'HF',
  WHALE: 'W',
}

const GOLD_COLOR = '#FFD700'

export default function LeaderboardOverlay() {
  const params = useParams()
  const streamId = params.streamId as string
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/streams/${streamId}/leaderboard`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data)
      }
    } catch {
      // Silently fail for overlay - no user-facing error needed
    }
  }, [streamId])

  useEffect(() => {
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 12000)
    return () => clearInterval(interval)
  }, [fetchLeaderboard])

  return (
    <div
      style={{
        width: 280,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        borderRadius: 8,
        padding: '12px 16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#fff',
      }}
    >
      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 8,
          color: '#E5E7EB',
          textAlign: 'center',
        }}
      >
        Leaderboard
      </h2>
      {entries.map((entry) => (
        <div
          key={entry.rank}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 0',
            fontSize: 13,
          }}
        >
          {/* Rank number */}
          <span
            style={{
              width: 20,
              textAlign: 'right',
              fontWeight: 700,
              color: entry.rank <= 3 ? GOLD_COLOR : '#9CA3AF',
              flexShrink: 0,
            }}
          >
            {entry.rank}
          </span>

          {/* Tier badge */}
          <span
            className={entry.tier === 'WHALE' ? 'whale-glow' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 18,
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 700,
              backgroundColor: BADGE_COLORS[entry.tier] ?? '#9CA3AF',
              color: entry.tier === 'HEDGE_FUND' || entry.tier === 'MARKET_MAKER' ? '#000' : '#fff',
              flexShrink: 0,
            }}
          >
            {BADGE_LABELS[entry.tier] ?? '?'}
          </span>

          {/* Display name */}
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.displayName}
          </span>

          {/* Points */}
          <span
            style={{
              fontWeight: 600,
              color: '#FDE68A',
              flexShrink: 0,
            }}
          >
            {entry.pointsEarned.toLocaleString()}
          </span>
        </div>
      ))}
      {entries.length === 0 && (
        <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 12 }}>
          No data yet
        </p>
      )}
      <style>{`
        @keyframes whaleGlow {
          0%, 100% { box-shadow: 0 0 4px #F59E0B, 0 0 8px #F59E0B40; }
          50% { box-shadow: 0 0 8px #F59E0B, 0 0 16px #F59E0B80; }
        }
        .whale-glow {
          animation: whaleGlow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
