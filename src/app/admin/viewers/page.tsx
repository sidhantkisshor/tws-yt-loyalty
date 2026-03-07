'use client'

import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/logger'

interface Channel {
  id: string
  title: string
}

interface Viewer {
  id: string
  displayName: string
  profileImageUrl: string | null
  totalPoints: number
  availablePoints: number
  rank: string
  trustScore: number
  currentStreak: number
  totalStreamsAttended: number
  isMember: boolean
  isModerator: boolean
  firstSeenAt: string
  lastSeenAt: string
}

const RANK_COLORS: Record<string, string> = {
  PAPER_TRADER: 'bg-gray-500',
  RETAIL_TRADER: 'bg-green-600',
  SWING_TRADER: 'bg-blue-500',
  FUND_MANAGER: 'bg-orange-600',
  MARKET_MAKER: 'bg-cyan-500',
  HEDGE_FUND: 'bg-yellow-600',
  WHALE: 'bg-purple-500',
}

export default function AdminViewersPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelId, setChannelId] = useState('')
  const [viewers, setViewers] = useState<Viewer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  useEffect(() => {
    async function loadChannels() {
      try {
        const res = await fetch('/api/channels')
        const data = await res.json()
        if (data.channels?.length > 0) {
          setChannels(data.channels)
          setChannelId(data.channels[0].id)
        }
      } catch (error) {
        logger.error('Failed to fetch channels', error)
      }
    }
    loadChannels()
  }, [])

  const fetchViewers = useCallback(async () => {
    if (!channelId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        channelId,
        limit: String(limit),
        offset: String(page * limit),
      })
      if (search.trim()) params.set('search', search.trim())

      const res = await fetch(`/api/viewers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setViewers(data.viewers || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      logger.error('Failed to fetch viewers', error)
    } finally {
      setLoading(false)
    }
  }, [channelId, page, search, limit])

  useEffect(() => { fetchViewers() }, [fetchViewers])

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Viewers</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {channels.length > 1 && (
          <select
            value={channelId}
            onChange={e => { setChannelId(e.target.value); setPage(0) }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.title}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search by name..."
          className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Stats */}
      <p className="text-sm text-gray-400 mb-4">{total} viewers found</p>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : viewers.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No viewers found</p>
        </div>
      ) : (
        <>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Viewer</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Rank</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Points</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Trust</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Streak</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Streams</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {viewers.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-750">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {v.profileImageUrl ? (
                          <img src={v.profileImageUrl} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm">
                            {v.displayName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="text-white text-sm font-medium">{v.displayName}</p>
                          <div className="flex gap-1">
                            {v.isMember && <span className="text-[10px] px-1.5 py-0.5 bg-green-600 rounded">Member</span>}
                            {v.isModerator && <span className="text-[10px] px-1.5 py-0.5 bg-blue-600 rounded">Mod</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${RANK_COLORS[v.rank] || 'bg-gray-600'}`}>
                        {v.rank.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-white">{v.availablePoints.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-400">{v.trustScore}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-400">{v.currentStreak}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-400">{v.totalStreamsAttended}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">
                      {new Date(v.lastSeenAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-400">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
