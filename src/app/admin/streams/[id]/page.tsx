'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { logger } from '@/lib/logger'

interface Stream {
  id: string
  title: string
  thumbnailUrl: string | null
  status: string
  youtubeVideoId: string
  youtubeLiveChatId: string | null
  isPollingActive: boolean
  actualStartAt: string | null
  endedAt: string | null
  totalPointsAwarded: number
  totalCodesGenerated: number
  totalUniqueChatters: number
  channel: {
    id: string
    title: string
    thumbnailUrl: string | null
    ownerId: string
  }
  loyaltyCodes: LoyaltyCode[]
}

interface LoyaltyCode {
  id: string
  code: string
  codeType: string
  basePoints: number
  validFrom: string
  validUntil: string
  isActive: boolean
  currentRedemptions: number
  maxRedemptions: number | null
}

interface LeaderboardEntry {
  rank: number
  viewerId: string
  displayName: string
  viewerRank: string
  points: number
}

interface Poll {
  id: string
  question: string
  options: string[]
  isActive: boolean
  createdAt: string
  _count?: { responses: number }
}

export default function StreamManagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [stream, setStream] = useState<Stream | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [triggeringCta, setTriggeringCta] = useState(false)
  const [ctaTriggered, setCtaTriggered] = useState(false)
  const [showPollForm, setShowPollForm] = useState(false)
  const [creatingPoll, setCreatingPoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])

  // Code creation form state
  const [codeForm, setCodeForm] = useState({
    code: '',
    codeType: 'STANDARD',
    basePoints: 100,
    durationSeconds: 120,
    announceInChat: true,
  })

  const fetchStream = useCallback(async () => {
    try {
      const [streamRes, pollsRes] = await Promise.all([
        fetch(`/api/streams/${id}`),
        fetch(`/api/streams/${id}/polls`),
      ])
      if (streamRes.ok) {
        const data = await streamRes.json()
        setStream(data.stream)
        setLeaderboard(data.leaderboard || [])
      } else if (streamRes.status === 404) {
        router.push('/admin/streams')
      }
      if (pollsRes.ok) {
        const pollData = await pollsRes.json()
        setPolls(pollData.polls || [])
      }
    } catch (error) {
      logger.error('Error fetching stream', error)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchStream()
    const interval = setInterval(fetchStream, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [fetchStream])

  async function updateStreamStatus(status: string) {
    try {
      const res = await fetch(`/api/streams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (res.ok) {
        fetchStream()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to update stream')
      }
    } catch (error) {
      logger.error('Error updating stream', error)
    }
  }

  async function createCode() {
    setCreating(true)
    try {
      const res = await fetch(`/api/streams/${id}/codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(codeForm),
      })

      if (res.ok) {
        setShowCodeModal(false)
        setCodeForm({
          code: '',
          codeType: 'STANDARD',
          basePoints: 100,
          durationSeconds: 120,
          announceInChat: true,
        })
        fetchStream()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to create code')
      }
    } catch (error) {
      logger.error('Error creating code', error)
    } finally {
      setCreating(false)
    }
  }

  function isCodeActive(code: LoyaltyCode): boolean {
    if (!code.isActive) return false
    const now = new Date()
    return new Date(code.validUntil) > now
  }

  async function triggerCta() {
    setTriggeringCta(true)
    try {
      const res = await fetch(`/api/streams/${id}/cta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setCtaTriggered(true)
        alert(`CTA triggered! ${data.viewersAwarded || 0} viewers awarded 30 points each.`)
        setTimeout(() => setCtaTriggered(false), 5000)
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to trigger CTA')
      }
    } catch (error) {
      logger.error('Error triggering CTA', error)
    } finally {
      setTriggeringCta(false)
    }
  }

  async function createPoll() {
    const validOptions = pollOptions.filter((o) => o.trim())
    if (!pollQuestion.trim() || validOptions.length < 2) {
      alert('Poll needs a question and at least 2 options')
      return
    }
    setCreatingPoll(true)
    try {
      const res = await fetch(`/api/streams/${id}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: pollQuestion, options: validOptions }),
      })
      if (res.ok) {
        setShowPollForm(false)
        setPollQuestion('')
        setPollOptions(['', ''])
        fetchStream()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to create poll')
      }
    } catch (error) {
      logger.error('Error creating poll', error)
    } finally {
      setCreatingPoll(false)
    }
  }

  function getRankBadgeColor(rank: string): string {
    switch (rank) {
      case 'WHALE':
        return 'bg-purple-600'
      case 'HEDGE_FUND':
        return 'bg-yellow-600'
      case 'MARKET_MAKER':
        return 'bg-cyan-500'
      case 'FUND_MANAGER':
        return 'bg-orange-600'
      case 'SWING_TRADER':
        return 'bg-blue-500'
      case 'RETAIL_TRADER':
        return 'bg-green-600'
      case 'PAPER_TRADER':
        return 'bg-gray-600'
      default:
        return 'bg-gray-600'
    }
  }

  if (loading) {
    return <div className="text-white">Loading...</div>
  }

  if (!stream) {
    return <div className="text-white">Stream not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/streams" className="text-gray-400 hover:text-white">
            ← Back
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{stream.title}</h1>
            <p className="text-gray-400">{stream.channel.title}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {stream.status === 'SCHEDULED' && (
            <button
              onClick={() => updateStreamStatus('LIVE')}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Start Stream
            </button>
          )}
          {stream.status === 'LIVE' && (
            <button
              onClick={() => updateStreamStatus('ENDED')}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              End Stream
            </button>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              stream.status === 'LIVE'
                ? 'bg-green-600 text-white'
                : stream.status === 'ENDED'
                ? 'bg-gray-600 text-white'
                : 'bg-yellow-600 text-white'
            }`}
          >
            {stream.status}
          </span>
          {stream.isPollingActive && (
            <span className="text-green-400 text-sm flex items-center">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
              Polling Active
            </span>
          )}
        </div>
        <a
          href={`https://youtube.com/watch?v=${stream.youtubeVideoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-red-500 hover:text-red-400 text-sm"
        >
          View on YouTube →
        </a>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Points Awarded</p>
          <p className="text-2xl font-bold text-white">
            {stream.totalPointsAwarded.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Codes Created</p>
          <p className="text-2xl font-bold text-white">
            {stream.totalCodesGenerated}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Unique Chatters</p>
          <p className="text-2xl font-bold text-white">
            {stream.totalUniqueChatters}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Chat ID</p>
          <p className="text-sm text-gray-300 truncate">
            {stream.youtubeLiveChatId || 'Not available'}
          </p>
        </div>
      </div>

      {/* Live Stream Controls */}
      {stream.status === 'LIVE' && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* CTA Trigger */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Call to Action</h3>
            <button
              onClick={triggerCta}
              disabled={triggeringCta || ctaTriggered}
              className={`w-full px-4 py-3 text-white text-sm rounded-md font-semibold ${
                ctaTriggered
                  ? 'bg-green-700 cursor-default'
                  : 'bg-orange-600 hover:bg-orange-700 disabled:opacity-50'
              }`}
            >
              {ctaTriggered ? '✓ CTA Triggered' : triggeringCta ? 'Triggering...' : '🎯 Trigger CTA (+30 pts)'}
            </button>
            <p className="text-xs text-gray-500 mt-2">Awards 30 points to all active viewers</p>
          </div>

          {/* Poll Control */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Polls</h3>
            {polls.find((p) => p.isActive) ? (
              <div>
                <p className="text-green-400 text-sm flex items-center">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
                  Active: {polls.find((p) => p.isActive)?.question}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {polls.find((p) => p.isActive)?._count?.responses || 0} responses
                </p>
              </div>
            ) : (
              <button
                onClick={() => setShowPollForm(!showPollForm)}
                className="w-full px-4 py-3 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 font-semibold"
              >
                📊 Create Poll (+15 pts)
              </button>
            )}
          </div>

          {/* Overlay Link */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">OBS Overlay</h3>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/overlay/leaderboard/${id}`}
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-xs font-mono truncate"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/overlay/leaderboard/${id}`)
                  alert('Overlay URL copied!')
                }}
                className="px-3 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-500"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Add as Browser Source in OBS</p>
          </div>
        </div>
      )}

      {/* Poll Creation Form */}
      {showPollForm && (
        <div className="bg-gray-800 rounded-lg p-6 border border-blue-700">
          <h3 className="text-lg font-semibold text-white mb-4">Create Poll</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Poll question..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...pollOptions]
                    newOpts[i] = e.target.value
                    setPollOptions(newOpts)
                  }}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
                />
                {pollOptions.length > 2 && (
                  <button
                    onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3">
              {pollOptions.length < 6 && (
                <button
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  className="text-blue-400 text-sm hover:text-blue-300"
                >
                  + Add Option
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => { setShowPollForm(false); setPollQuestion(''); setPollOptions(['', '']) }}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={createPoll}
                disabled={creatingPoll}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingPoll ? 'Creating...' : 'Launch Poll'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Loyalty Codes */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Loyalty Codes</h2>
            {stream.status === 'LIVE' && (
              <button
                onClick={() => setShowCodeModal(true)}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Create Code
              </button>
            )}
          </div>

          {stream.loyaltyCodes.length === 0 ? (
            <p className="text-gray-400">No codes created yet.</p>
          ) : (
            <div className="space-y-3">
              {stream.loyaltyCodes.map((code) => (
                <div
                  key={code.id}
                  className={`p-3 rounded-lg ${
                    isCodeActive(code) ? 'bg-green-900/30' : 'bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-mono font-bold">
                        {code.code}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {code.basePoints} pts • {code.codeType}
                      </p>
                    </div>
                    <div className="text-right">
                      {isCodeActive(code) ? (
                        <span className="text-green-400 text-sm">Active</span>
                      ) : (
                        <span className="text-gray-500 text-sm">Expired</span>
                      )}
                      <p className="text-gray-400 text-sm">
                        {code.currentRedemptions}
                        {code.maxRedemptions ? `/${code.maxRedemptions}` : ''} redeemed
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Leaderboard</h2>

          {leaderboard.length === 0 ? (
            <p className="text-gray-400">No participants yet.</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div
                  key={entry.viewerId}
                  className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                        entry.rank === 1
                          ? 'bg-yellow-500 text-black'
                          : entry.rank === 2
                          ? 'bg-gray-300 text-black'
                          : entry.rank === 3
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-600 text-white'
                      }`}
                    >
                      {entry.rank}
                    </span>
                    <div>
                      <p className="text-white font-medium">
                        {entry.displayName}
                      </p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${getRankBadgeColor(
                          entry.viewerRank
                        )}`}
                      >
                        {entry.viewerRank.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <p className="text-white font-bold">
                    {entry.points.toLocaleString()} pts
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Code Modal */}
      {showCodeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">Create Code</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Code (leave empty to auto-generate)
                </label>
                <input
                  type="text"
                  value={codeForm.code}
                  onChange={(e) =>
                    setCodeForm({ ...codeForm, code: e.target.value.toUpperCase() })
                  }
                  placeholder="AUTO"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Type
                </label>
                <select
                  value={codeForm.codeType}
                  onChange={(e) =>
                    setCodeForm({ ...codeForm, codeType: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  <option value="STANDARD">Standard (100 pts, 2 min)</option>
                  <option value="FLASH">Flash (200 pts, 1 min)</option>
                  <option value="BONUS">Bonus</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Base Points
                  </label>
                  <input
                    type="number"
                    value={codeForm.basePoints}
                    onChange={(e) =>
                      setCodeForm({
                        ...codeForm,
                        basePoints: parseInt(e.target.value) || 100,
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Duration (seconds)
                  </label>
                  <input
                    type="number"
                    value={codeForm.durationSeconds}
                    onChange={(e) =>
                      setCodeForm({
                        ...codeForm,
                        durationSeconds: parseInt(e.target.value) || 120,
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="announceInChat"
                  checked={codeForm.announceInChat}
                  onChange={(e) =>
                    setCodeForm({
                      ...codeForm,
                      announceInChat: e.target.checked,
                    })
                  }
                  className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-600 rounded bg-gray-700"
                />
                <label
                  htmlFor="announceInChat"
                  className="ml-2 text-sm text-gray-300"
                >
                  Announce in YouTube chat
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCodeModal(false)}
                className="px-4 py-2 text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={createCode}
                disabled={creating}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
