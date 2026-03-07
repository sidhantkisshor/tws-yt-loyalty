'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useViewer } from '@/components/ViewerProvider'
import { RANK_THRESHOLDS, RANK_BADGE_COLORS, ViewerRankName } from '@/lib/ranks'

interface ViewerProfile {
  id: string
  displayName: string
  profileImageUrl: string | null
  totalPoints: number
  availablePoints: number
  lifetimePoints: number
  rank: string
  trustScore: number
  totalStreamsAttended: number
  totalMessagesCount: number
  totalCodesRedeemed: number
  currentStreak: number
  longestStreak: number
  totalWatchTimeMinutes: number
  tokens: number
  channel: {
    id: string
    title: string
    thumbnailUrl: string | null
  }
}

interface Transaction {
  id: string
  type: string
  amount: number
  description: string | null
  createdAt: string
}

const RANK_CONFIG: Record<string, { color: string; glow: string; badge: string; icon: string }> = {
  PAPER_TRADER: {
    color: 'text-gray-400',
    glow: '',
    badge: `rank-${RANK_BADGE_COLORS.PAPER_TRADER}`,
    icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
  },
  RETAIL_TRADER: {
    color: 'text-[var(--rank-retail-trader)]',
    glow: 'text-glow-green',
    badge: `rank-${RANK_BADGE_COLORS.RETAIL_TRADER}`,
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
  },
  SWING_TRADER: {
    color: 'text-[var(--rank-swing-trader)]',
    glow: '',
    badge: `rank-${RANK_BADGE_COLORS.SWING_TRADER}`,
    icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z'
  },
  FUND_MANAGER: {
    color: 'text-[var(--rank-fund-manager)]',
    glow: 'text-glow-purple',
    badge: `rank-${RANK_BADGE_COLORS.FUND_MANAGER}`,
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z'
  },
  MARKET_MAKER: {
    color: 'text-[var(--rank-market-maker)]',
    glow: 'text-glow-gold',
    badge: `rank-${RANK_BADGE_COLORS.MARKET_MAKER}`,
    icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z'
  },
  HEDGE_FUND: {
    color: 'text-[var(--rank-hedge-fund)]',
    glow: 'text-glow-platinum',
    badge: `rank-${RANK_BADGE_COLORS.HEDGE_FUND}`,
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
  },
  WHALE: {
    color: 'text-[var(--rank-whale)]',
    glow: 'text-glow-animated',
    badge: `rank-${RANK_BADGE_COLORS.WHALE}`,
    icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z'
  },
}

/** Rank labels for display, derived from RANK_THRESHOLDS */
function formatRankLabel(rank: string): string {
  return rank
    .split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

const RANK_DISPLAY_LIST: { rank: string; min: number; label: string }[] = (
  Object.keys(RANK_THRESHOLDS) as ViewerRankName[]
).map((rank) => ({
  rank,
  min: RANK_THRESHOLDS[rank],
  label: formatRankLabel(rank),
}))

function formatWatchTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days}d ${remainingHours}h`
}

export default function ViewerDashboard() {
  const { activeChannelId } = useViewer()
  const [profile, setProfile] = useState<ViewerProfile | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!activeChannelId) return

    try {
      setLoading(true)
      const query = `?channelId=${activeChannelId}`
      const [profileRes, transactionsRes] = await Promise.all([
        fetch(`/api/viewer/me${query}`),
        fetch(`/api/viewer/transactions${query}&limit=5`),
      ])

      if (profileRes.ok) {
        const data = await profileRes.json()
        setProfile(data.viewer)
      }

      if (transactionsRes.ok) {
        const data = await transactionsRes.json()
        setRecentTransactions(data.transactions)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    }
    setLoading(false)
  }, [activeChannelId])

  useEffect(() => {
    if (activeChannelId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: async data fetch
      fetchData()
    }
  }, [activeChannelId, fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Skeleton loader */}
        <div className="h-8 w-64 skeleton rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="cyber-card rounded-xl p-6 h-40 skeleton" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="cyber-card rounded-xl p-4 h-24 skeleton" />
          ))}
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="cyber-card cyber-card-pink rounded-xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neon-pink)]/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--neon-pink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="font-[Orbitron] text-xl text-white mb-2">Connection Failed</h2>
        <p className="text-gray-400">Unable to load your profile. Please try again.</p>
      </div>
    )
  }

  const rankConfig = RANK_CONFIG[profile.rank] || RANK_CONFIG.PAPER_TRADER
  const currentRankIndex = RANK_DISPLAY_LIST.findIndex(r => r.rank === profile.rank)
  const currentRankData = RANK_DISPLAY_LIST[currentRankIndex]
  const nextRank = RANK_DISPLAY_LIST[currentRankIndex + 1]
  const progressPercent = nextRank
    ? Math.min(100, ((profile.totalPoints - currentRankData.min) / (nextRank.min - currentRankData.min)) * 100)
    : 100
  const pointsToNextRank = nextRank ? nextRank.min - profile.totalPoints : 0

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-gray-500 text-sm font-[Orbitron] tracking-widest uppercase mb-1">Welcome back</p>
          <h1 className="text-3xl md:text-4xl font-[Orbitron] font-bold text-white">
            {profile.displayName}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-2 h-2 bg-[var(--neon-green)] rounded-full animate-pulse" />
          Earning on <span className="text-white font-medium">{profile.channel.title}</span>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Points Card */}
        <div className="cyber-card rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--neon-cyan)]/5 rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[var(--neon-cyan)]/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--neon-cyan)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-gray-400 text-sm uppercase tracking-wider">Available</span>
            </div>
            <p className="stat-value text-4xl md:text-5xl mb-2">
              {profile.availablePoints.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[var(--neon-purple)] font-[Orbitron] font-bold">{profile.tokens}</span>
              <span className="text-gray-500 text-sm">tokens to spend</span>
            </div>
          </div>
        </div>

        {/* Total Points Card */}
        <div className="cyber-card cyber-card-pink rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--neon-pink)]/5 rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[var(--neon-pink)]/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--neon-pink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-gray-400 text-sm uppercase tracking-wider">Total Earned</span>
            </div>
            <p className="font-[Orbitron] font-bold text-4xl md:text-5xl text-white mb-2">
              {profile.totalPoints.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">Lifetime:</span>
              <span className="text-gray-400 font-medium">{profile.lifetimePoints.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Rank Card */}
        <div className="cyber-card cyber-card-purple rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--neon-purple)]/5 rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-[var(--neon-purple)]/20 flex items-center justify-center">
                  <svg className={`w-5 h-5 ${rankConfig.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={rankConfig.icon} />
                  </svg>
                </div>
                <span className="text-gray-400 text-sm uppercase tracking-wider">Rank</span>
              </div>
              <span className={`rank-badge ${rankConfig.badge} text-xs`}>
                {currentRankData.label}
              </span>
            </div>

            {nextRank ? (
              <>
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-500 text-xs">Progress to {nextRank.label}</span>
                    <span className="text-white text-xs font-medium">{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="cyber-progress h-3 rounded-full">
                    <div
                      className="cyber-progress-bar h-full rounded-full transition-all duration-1000"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm">
                  <span className="text-[var(--neon-cyan)] font-[Orbitron] font-bold">{pointsToNextRank.toLocaleString()}</span>
                  <span className="text-gray-500"> points to go</span>
                </p>
              </>
            ) : (
              <div className="text-center py-2">
                <p className="text-[var(--neon-yellow)] font-[Orbitron] text-sm">MAX RANK ACHIEVED</p>
                <p className="text-gray-500 text-xs mt-1">You&apos;ve reached the top rank</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="cyber-card rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--neon-cyan)]/20 to-[var(--neon-blue)]/20 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-[var(--neon-cyan)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-[Orbitron] font-bold text-2xl text-white">{profile.totalStreamsAttended}</p>
            <p className="text-gray-500 text-xs uppercase tracking-wider">Streams</p>
          </div>
        </div>

        <div className="cyber-card rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--neon-pink)]/20 to-[var(--neon-purple)]/20 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-[var(--neon-pink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <div>
            <p className="font-[Orbitron] font-bold text-2xl text-white">{profile.totalCodesRedeemed}</p>
            <p className="text-gray-500 text-xs uppercase tracking-wider">Codes</p>
          </div>
        </div>

        <div className="cyber-card rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-pink)]/20 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-[var(--neon-purple)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-[Orbitron] font-bold text-2xl text-white">{formatWatchTime(profile.totalWatchTimeMinutes)}</p>
            <p className="text-gray-500 text-xs uppercase tracking-wider">Watch Time</p>
          </div>
        </div>

        <div className="cyber-card rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--neon-orange)]/20 to-[var(--neon-yellow)]/20 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-[var(--neon-orange)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
            </svg>
          </div>
          <div>
            <p className="font-[Orbitron] font-bold text-2xl text-white">{profile.currentStreak}</p>
            <p className="text-gray-500 text-xs uppercase tracking-wider">Streak</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
        <Link
          href="/viewer/rewards"
          className="cyber-button px-6 py-3 rounded-lg text-[var(--cyber-black)] font-semibold flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Browse Rewards
        </Link>
        <Link
          href="/viewer/redemptions"
          className="cyber-button cyber-button-pink px-6 py-3 rounded-lg text-white font-semibold flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
          My Redemptions
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="cyber-card rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[var(--cyber-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--neon-green)]/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--neon-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="font-[Orbitron] font-bold text-white text-lg tracking-wide">Recent Activity</h2>
              <p className="text-gray-500 text-xs">Your latest transactions</p>
            </div>
          </div>
          <Link
            href="/viewer/history"
            className="text-[var(--neon-cyan)] hover:text-white text-sm font-[Orbitron] tracking-wider uppercase transition-colors flex items-center gap-1"
          >
            View All
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="divide-y divide-[var(--cyber-border)]">
          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cyber-surface)] flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-gray-400 mb-2">No activity yet</p>
              <p className="text-gray-600 text-sm">Start watching streams to earn points!</p>
            </div>
          ) : (
            recentTransactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    tx.amount >= 0
                      ? 'bg-[var(--neon-green)]/20'
                      : 'bg-[var(--neon-pink)]/20'
                  }`}>
                    <svg className={`w-5 h-5 ${tx.amount >= 0 ? 'text-[var(--neon-green)]' : 'text-[var(--neon-pink)]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {tx.amount >= 0 ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      )}
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">{tx.description || tx.type.replace('_', ' ')}</p>
                    <p className="text-gray-500 text-xs">
                      {new Date(tx.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <span className={`font-[Orbitron] font-bold text-lg ${
                  tx.amount >= 0 ? 'text-[var(--neon-green)]' : 'text-[var(--neon-pink)]'
                }`}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Rank Progression */}
      <div className="cyber-card rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--neon-purple)]/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--neon-purple)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="font-[Orbitron] font-bold text-white text-lg tracking-wide">Rank Progression</h2>
            <p className="text-gray-500 text-xs">Your journey through the ranks</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
          {RANK_DISPLAY_LIST.map((rank, index) => {
            const isCurrentRank = profile.rank === rank.rank
            const isPastRank = currentRankIndex > index
            const config = RANK_CONFIG[rank.rank]

            return (
              <div key={rank.rank} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    isCurrentRank
                      ? `${config.badge} scale-110`
                      : isPastRank
                        ? 'bg-[var(--cyber-surface)] border border-[var(--neon-cyan)]/50'
                        : 'bg-[var(--cyber-surface)] border border-[var(--cyber-border)]'
                  }`}>
                    <svg className={`w-5 h-5 ${
                      isCurrentRank ? '' : isPastRank ? 'text-[var(--neon-cyan)]' : 'text-gray-600'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                    </svg>
                  </div>
                  <p className={`text-xs mt-2 font-[Orbitron] tracking-wider ${
                    isCurrentRank ? config.color : isPastRank ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {rank.label.toUpperCase()}
                  </p>
                  <p className={`text-[10px] ${isPastRank || isCurrentRank ? 'text-gray-500' : 'text-gray-700'}`}>
                    {rank.min.toLocaleString()}
                  </p>
                </div>
                {index < RANK_DISPLAY_LIST.length - 1 && (
                  <div className={`flex-1 h-[2px] mx-2 ${
                    isPastRank ? 'bg-[var(--neon-cyan)]' : 'bg-[var(--cyber-border)]'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
