'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface ChannelCredentialInfo {
  googleAccountEmail: string
  tokenStatus: 'VALID' | 'EXPIRED' | 'REVOKED'
  tokenExpiresAt: string | null
  lastRefreshedAt: string | null
}

interface Channel {
  id: string
  title: string
  youtubeChannelId: string
  thumbnailUrl: string | null
  isActive: boolean
  createdAt: string
  _count: { streams: number; viewers: number }
  channelCredential: ChannelCredentialInfo | null
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success) {
      setMessage({ type: 'success', text: success === 'connected' ? 'Channel connected successfully!' : 'Channel reconnected successfully!' })
    } else if (error) {
      const errorMessages: Record<string, string> = {
        channel_exists: 'This channel is already connected.',
        no_youtube_channel: 'No YouTube channel found for this Google account.',
        token_exchange_failed: 'Failed to authenticate with Google. Please try again.',
        unauthorized: 'You are not authorized to perform this action.',
        state_mismatch: 'Authentication state mismatch. Please try again.',
        internal: 'An unexpected error occurred. Please try again.',
      }
      setMessage({ type: 'error', text: errorMessages[error] || `Error: ${error}` })
    }
  }, [searchParams])

  useEffect(() => {
    fetchChannels()
  }, [])

  async function fetchChannels() {
    try {
      const res = await fetch('/api/channels')
      if (res.ok) {
        const data = await res.json()
        setChannels(data.channels || [])
      }
    } catch (err) {
      console.error('Failed to fetch channels', err)
    } finally {
      setLoading(false)
    }
  }

  async function disconnectChannel(channelId: string) {
    if (!confirm('Are you sure you want to disconnect this channel?')) return
    try {
      const res = await fetch(`/api/channels/${channelId}/disconnect`, { method: 'POST' })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Channel disconnected.' })
        fetchChannels()
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect channel.' })
    }
  }

  const statusColors = {
    VALID: 'bg-green-500/20 text-green-400 border-green-500/30',
    EXPIRED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    REVOKED: 'bg-red-500/20 text-red-400 border-red-500/30',
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-gray-400">Loading channels...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Channel Management</h1>
        <a
          href="/api/channels/connect"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Connect New Channel
        </a>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-2 opacity-60 hover:opacity-100">x</button>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">No channels connected yet</p>
          <p className="text-sm">Connect your first YouTube channel to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {channels.map((channel) => (
            <div key={channel.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-start gap-4">
                {channel.thumbnailUrl && (
                  <img
                    src={channel.thumbnailUrl}
                    alt={channel.title}
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-medium truncate">{channel.title}</h3>
                    {!channel.isActive && (
                      <span className="text-xs px-2 py-0.5 bg-gray-600 text-gray-300 rounded">Inactive</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400 mb-2">
                    {channel.channelCredential?.googleAccountEmail || 'No account linked'}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{channel._count.streams} streams</span>
                    <span>{channel._count.viewers} viewers</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {channel.channelCredential && (
                    <span className={`text-xs px-2 py-1 rounded border ${statusColors[channel.channelCredential.tokenStatus]}`}>
                      {channel.channelCredential.tokenStatus}
                    </span>
                  )}
                  <a
                    href={`/api/channels/connect?channelId=${channel.id}`}
                    className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                  >
                    Reconnect
                  </a>
                  {channel.isActive && (
                    <button
                      onClick={() => disconnectChannel(channel.id)}
                      className="px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-400 rounded transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
