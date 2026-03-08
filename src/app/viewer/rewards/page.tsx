'use client'

import { useState, useEffect, useCallback } from 'react'
import { useViewer } from '@/components/ViewerProvider'
import Link from 'next/link'
import { logger } from '@/lib/logger'

interface Reward {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  rewardType: 'DIGITAL' | 'PHYSICAL'
  tokenCost: number
  isActive: boolean
  maxTotal: number | null
  currentTotal: number
  stockQuantity: number | null
  minRank: string | null
}

const RANK_ORDER = ['PAPER_TRADER', 'RETAIL_TRADER', 'SWING_TRADER', 'FUND_MANAGER', 'MARKET_MAKER', 'HEDGE_FUND', 'WHALE']

const RANK_LABELS: Record<string, string> = {
  PAPER_TRADER: 'Paper Trader',
  RETAIL_TRADER: 'Retail Trader',
  SWING_TRADER: 'Swing Trader',
  FUND_MANAGER: 'Fund Manager',
  MARKET_MAKER: 'Market Maker',
  HEDGE_FUND: 'Hedge Fund',
  WHALE: 'Whale',
}

interface GlobalWallet {
  totalPoints: number
  availablePoints: number
  lifetimePoints: number
  rank: string
  trustScore: number
  currentStreak: number
  longestStreak: number
}

export default function ViewerRewardsPage() {
  const { currentViewerProfile, activeChannelId } = useViewer()
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'DIGITAL' | 'PHYSICAL'>('all')
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [globalWallet, setGlobalWallet] = useState<GlobalWallet | null>(null)

  // Fetch global wallet data from /api/viewer/me
  const fetchGlobalWallet = useCallback(async () => {
    if (!activeChannelId) return
    try {
      const res = await fetch(`/api/viewer/me?channelId=${activeChannelId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.globalWallet) {
          setGlobalWallet(data.globalWallet)
        }
      }
    } catch {
      // Silently fail - will use channel-local fallback
    }
  }, [activeChannelId])

  useEffect(() => {
    fetchGlobalWallet()
  }, [fetchGlobalWallet])

  // Use global wallet for tokens when available, otherwise channel-local
  const globalAvailable = globalWallet?.availablePoints
  const localAvailable = currentViewerProfile?.availablePoints ?? 0
  const viewerTokens = Math.floor((globalAvailable ?? localAvailable) / 1000)

  const viewerRank = globalWallet?.rank ?? currentViewerProfile?.rank ?? 'PAPER_TRADER'
  const viewerRankIndex = RANK_ORDER.indexOf(viewerRank)

  const fetchRewards = useCallback(async () => {
    try {
      const res = await fetch('/api/rewards')
      if (res.ok) {
        const data = await res.json()
        setRewards(data.rewards || [])
      }
    } catch (error) {
      logger.error('Failed to fetch rewards', error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: async data fetch
    fetchRewards()
  }, [fetchRewards])

  const filteredRewards = rewards.filter(r => {
    if (!r.isActive) return false
    if (filter !== 'all' && r.rewardType !== filter) return false
    return true
  })

  function canAfford(reward: Reward): boolean {
    return viewerTokens >= reward.tokenCost
  }

  function meetsRankRequirement(reward: Reward): boolean {
    if (!reward.minRank) return true
    const requiredRankIndex = RANK_ORDER.indexOf(reward.minRank)
    return viewerRankIndex >= requiredRankIndex
  }

  function isSoldOut(reward: Reward): boolean {
    if (reward.maxTotal && reward.currentTotal >= reward.maxTotal) return true
    if (reward.rewardType === 'PHYSICAL' && reward.stockQuantity !== null && reward.stockQuantity <= 0) return true
    return false
  }

  function getStockLabel(reward: Reward): string | null {
    if (reward.rewardType === 'PHYSICAL' && reward.stockQuantity !== null) {
      if (reward.stockQuantity <= 5) return `Only ${reward.stockQuantity} left!`
      if (reward.stockQuantity <= 20) return `${reward.stockQuantity} remaining`
    }
    if (reward.maxTotal) {
      const remaining = reward.maxTotal - reward.currentTotal
      if (remaining <= 10) return `${remaining} of ${reward.maxTotal} left`
    }
    return null
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-gray-500 text-sm font-[Orbitron] tracking-widest uppercase mb-1">Rewards Vault</p>
          <h1 className="text-3xl md:text-4xl font-[Orbitron] font-bold text-white">
            Claim Your <span className="text-[var(--neon-cyan)]">Rewards</span>
          </h1>
        </div>

        {/* Token Balance */}
        <div className="cyber-card rounded-xl px-6 py-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-pink)] flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider">Your Balance</p>
            <p className="font-[Orbitron] font-bold text-2xl text-white">{viewerTokens} <span className="text-[var(--neon-purple)] text-sm">tokens</span></p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        {(['all', 'DIGITAL', 'PHYSICAL'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2.5 rounded-lg font-[Orbitron] text-xs tracking-wider uppercase transition-all ${
              filter === f
                ? f === 'DIGITAL'
                  ? 'bg-[var(--neon-cyan)]/20 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]'
                  : f === 'PHYSICAL'
                    ? 'bg-[var(--neon-orange)]/20 text-[var(--neon-orange)] border border-[var(--neon-orange)]'
                    : 'bg-[var(--neon-purple)]/20 text-[var(--neon-purple)] border border-[var(--neon-purple)]'
                : 'bg-[var(--cyber-surface)] text-gray-400 border border-[var(--cyber-border)] hover:border-gray-500 hover:text-gray-300'
            }`}
          >
            {f === 'all' ? 'All Rewards' : f}
          </button>
        ))}
      </div>

      {/* Rewards Grid */}
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="cyber-card rounded-xl overflow-hidden">
              <div className="h-48 skeleton" />
              <div className="p-5 space-y-3">
                <div className="h-6 w-3/4 skeleton rounded" />
                <div className="h-4 w-full skeleton rounded" />
                <div className="h-10 w-1/2 skeleton rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredRewards.length === 0 ? (
        <div className="cyber-card rounded-xl p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--cyber-surface)] flex items-center justify-center">
            <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 className="font-[Orbitron] text-xl text-white mb-2">No Rewards Available</h3>
          <p className="text-gray-500">Check back later for new rewards to claim!</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredRewards.map((reward) => {
            const soldOut = isSoldOut(reward)
            const affordable = canAfford(reward)
            const meetsRank = meetsRankRequirement(reward)
            const stockLabel = getStockLabel(reward)
            const isHovered = hoveredCard === reward.id
            const canRedeem = affordable && meetsRank && !soldOut

            return (
              <div
                key={reward.id}
                className={`cyber-card reward-card rounded-xl overflow-hidden relative ${
                  soldOut ? 'opacity-60' : ''
                } ${reward.rewardType === 'DIGITAL' ? '' : 'cyber-card-pink'}`}
                onMouseEnter={() => setHoveredCard(reward.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {/* Image */}
                <div className="relative h-48 overflow-hidden">
                  {reward.imageUrl ? (
                    <img
                      src={reward.imageUrl}
                      alt={reward.name}
                      className={`w-full h-full object-cover transition-transform duration-500 ${
                        isHovered ? 'scale-110' : 'scale-100'
                      }`}
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${
                      reward.rewardType === 'DIGITAL'
                        ? 'bg-gradient-to-br from-[var(--neon-cyan)]/20 to-[var(--neon-blue)]/20'
                        : 'bg-gradient-to-br from-[var(--neon-orange)]/20 to-[var(--neon-pink)]/20'
                    }`}>
                      <svg className={`w-16 h-16 ${
                        reward.rewardType === 'DIGITAL' ? 'text-[var(--neon-cyan)]' : 'text-[var(--neon-orange)]'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {reward.rewardType === 'DIGITAL' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        )}
                      </svg>
                    </div>
                  )}

                  {/* Type Badge */}
                  <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-[Orbitron] tracking-wider ${
                    reward.rewardType === 'DIGITAL' ? 'tag-digital' : 'tag-physical'
                  }`}>
                    {reward.rewardType}
                  </div>

                  {/* Sold Out Overlay */}
                  {soldOut && (
                    <div className="absolute inset-0 bg-[var(--cyber-black)]/80 flex items-center justify-center">
                      <span className="font-[Orbitron] text-[var(--neon-pink)] text-lg tracking-widest">SOLD OUT</span>
                    </div>
                  )}

                  {/* Stock Warning */}
                  {!soldOut && stockLabel && (
                    <div className="absolute bottom-3 right-3 px-3 py-1 bg-[var(--cyber-black)]/80 rounded-full">
                      <span className="text-[var(--neon-yellow)] text-xs font-medium">{stockLabel}</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="font-[Orbitron] font-bold text-white text-lg mb-2 line-clamp-1">
                    {reward.name}
                  </h3>

                  {reward.description && (
                    <p className="text-gray-400 text-sm mb-4 line-clamp-2 min-h-[40px]">
                      {reward.description}
                    </p>
                  )}

                  {/* Price & Action */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        affordable ? 'bg-[var(--neon-purple)]/20' : 'bg-[var(--neon-pink)]/20'
                      }`}>
                        <span className="text-xs font-bold text-white">T</span>
                      </div>
                      <div>
                        <span className={`font-[Orbitron] font-bold text-xl ${
                          affordable ? 'text-[var(--neon-purple)]' : 'text-[var(--neon-pink)]'
                        }`}>
                          {reward.tokenCost}
                        </span>
                        <p className="text-gray-600 text-[10px] uppercase tracking-wider">tokens</p>
                      </div>
                    </div>

                    {soldOut ? (
                      <span className="font-[Orbitron] text-gray-500 text-xs tracking-wider">UNAVAILABLE</span>
                    ) : !meetsRank ? (
                      <div className="text-right">
                        <span className="font-[Orbitron] text-[var(--neon-yellow)] text-xs">LOCKED</span>
                        <p className="text-gray-500 text-[10px]">Requires {RANK_LABELS[reward.minRank!]}</p>
                      </div>
                    ) : (
                      <Link
                        href={`/viewer/rewards/${reward.id}`}
                        className={`cyber-button px-5 py-2.5 rounded-lg text-xs ${
                          affordable
                            ? ''
                            : 'opacity-50 cursor-not-allowed pointer-events-none'
                        }`}
                      >
                        {affordable ? 'CLAIM' : 'NEED MORE'}
                      </Link>
                    )}
                  </div>

                  {/* Rank Requirement */}
                  {reward.minRank && (
                    <div className={`mt-4 pt-4 border-t border-[var(--cyber-border)] flex items-center gap-2 ${
                      meetsRank ? 'text-gray-500' : 'text-[var(--neon-yellow)]'
                    }`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {meetsRank ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        )}
                      </svg>
                      <span className="text-xs">
                        {meetsRank ? 'Rank requirement met' : `Requires ${RANK_LABELS[reward.minRank]} rank`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Hover Glow Effect */}
                {isHovered && canRedeem && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className={`absolute inset-0 opacity-20 ${
                      reward.rewardType === 'DIGITAL'
                        ? 'bg-gradient-to-t from-[var(--neon-cyan)] to-transparent'
                        : 'bg-gradient-to-t from-[var(--neon-orange)] to-transparent'
                    }`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Help Text */}
      <div className="cyber-card rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-[var(--neon-blue)]/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[var(--neon-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-[Orbitron] text-white font-bold mb-1">How Tokens Work</h3>
            <p className="text-gray-400 text-sm">
              1 token = 1,000 points. Earn points by redeeming loyalty codes during live streams.
              Some rewards require a minimum rank - keep watching to level up!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
