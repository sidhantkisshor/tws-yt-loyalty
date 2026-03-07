'use client'

import { useEffect, useState, useCallback } from 'react'
import { logger } from '@/lib/logger'

interface Webhook {
  id: string
  url: string
  events: string[]
  isActive: boolean
  failureCount: number
  lastTriggeredAt: string | null
  createdAt: string
}

const AVAILABLE_EVENTS = [
  { value: 'viewer.tier_changed', label: 'Tier Changed' },
  { value: 'viewer.reward_redeemed', label: 'Reward Redeemed' },
  { value: 'viewer.segment_changed', label: 'Segment Changed' },
  { value: 'viewer.referral_converted', label: 'Referral Converted' },
  { value: 'viewer.milestone_reached', label: 'Milestone Reached' },
  { value: 'stream.ended', label: 'Stream Ended' },
]

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [channelId, setChannelId] = useState<string | null>(null)
  const [channels, setChannels] = useState<{ id: string; title: string }[]>([])
  const [newSecret, setNewSecret] = useState<string | null>(null)

  // Create form state
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels')
      if (res.ok) {
        const data = await res.json()
        setChannels(data.channels || [])
        if (data.channels?.length > 0 && !channelId) {
          setChannelId(data.channels[0].id)
        }
      }
    } catch (error) {
      logger.error('Error fetching channels', error)
    }
  }, [channelId])

  useEffect(() => { fetchChannels() }, [fetchChannels])

  const fetchWebhooks = useCallback(async () => {
    if (!channelId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/webhooks?channelId=${channelId}`)
      if (res.ok) {
        const data = await res.json()
        setWebhooks(data.webhooks || [])
      }
    } catch (error) {
      logger.error('Error fetching webhooks', error)
    } finally {
      setLoading(false)
    }
  }, [channelId])

  useEffect(() => { fetchWebhooks() }, [fetchWebhooks])

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  async function handleCreate() {
    if (!channelId || !url || selectedEvents.length === 0) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, url, events: selectedEvents }),
      })
      if (res.ok) {
        const data = await res.json()
        setNewSecret(data.webhook.secret)
        setWebhooks((prev) => [data.webhook, ...prev])
        setUrl('')
        setSelectedEvents([])
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to create webhook')
      }
    } catch (error) {
      logger.error('Error creating webhook', error)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Webhooks</h1>
        <div className="flex items-center gap-3">
          {channels.length > 1 && (
            <select
              value={channelId || ''}
              onChange={(e) => setChannelId(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => { setShowCreate(!showCreate); setNewSecret(null) }}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
          >
            {showCreate ? 'Cancel' : '+ New Webhook'}
          </button>
        </div>
      </div>

      {/* Secret Display */}
      {newSecret && (
        <div className="bg-yellow-900/50 border border-yellow-600 rounded-lg p-4 mb-6">
          <p className="text-yellow-200 text-sm font-semibold mb-1">Webhook Secret (shown only once):</p>
          <code className="text-yellow-100 bg-yellow-900 px-3 py-1 rounded text-sm font-mono">{newSecret}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(newSecret); setNewSecret(null) }}
            className="ml-3 text-yellow-300 text-sm underline hover:text-yellow-100"
          >
            Copy & Dismiss
          </button>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create Webhook</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Endpoint URL (HTTPS only)</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-server.com/webhook"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Events</label>
              <div className="grid gap-2 md:grid-cols-3">
                {AVAILABLE_EVENTS.map((event) => (
                  <label key={event.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(event.value)}
                      onChange={() => toggleEvent(event.value)}
                      className="rounded border-gray-600 bg-gray-700 text-red-600"
                    />
                    <span className="text-sm text-gray-300">{event.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !url || selectedEvents.length === 0}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Webhook'}
            </button>
          </div>
        </div>
      )}

      {/* Webhooks List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-6 animate-pulse h-24" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No webhooks configured. Create one to receive event notifications.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => (
            <div key={wh.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <code className="text-sm text-white font-mono">{wh.url}</code>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${wh.isActive ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
                      {wh.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {wh.events.map((event) => (
                      <span key={event} className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">
                        {event}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Created {new Date(wh.createdAt).toLocaleDateString()}
                    {wh.lastTriggeredAt && ` • Last triggered ${new Date(wh.lastTriggeredAt).toLocaleString()}`}
                    {wh.failureCount > 0 && (
                      <span className="text-red-400 ml-2">• {wh.failureCount} failures</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
