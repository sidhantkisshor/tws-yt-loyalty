'use client'

import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/logger'

// ============================================
// TYPES
// ============================================

interface SystemHealth {
  database: { status: string; latencyMs: number }
  redis: { status: string; latencyMs: number }
  channels: { total: number; healthy: number; expired: number; revoked: number }
  jobs: {
    recentFailures: number
    avgDurationMs: number
    lastRun: Record<string, { status: string; completedAt: string | null; eventsProcessed: number }>
  }
  ingestion: {
    lagMinutes: number
    eventsLast24h: number
    eventsLastHour: number
  }
  quota: {
    dailyUsed: number
    dailyLimit: number
    percentUsed: number
  }
  timestamp: string
}

interface Alert {
  severity: 'WARNING' | 'CRITICAL'
  message: string
  timestamp: string
  category: string
}

interface JobRun {
  id: string
  jobType: string
  status: string
  channelId: string | null
  startedAt: string | null
  completedAt: string | null
  eventsProcessed: number
  errorsCount: number
  errorMessage: string | null
  createdAt: string
}

// ============================================
// HELPER COMPONENTS
// ============================================

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'healthy' || status === 'COMPLETED'
      ? 'bg-green-500'
      : status === 'degraded' || status === 'WARNING' || status === 'RUNNING'
        ? 'bg-yellow-500'
        : 'bg-red-500'

  return (
    <span className={`inline-block w-3 h-3 rounded-full ${color}`} />
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function OpsPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [jobs, setJobs] = useState<JobRun[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [healthRes, alertsRes, jobsRes] = await Promise.all([
        fetch('/api/admin/ops/health'),
        fetch('/api/admin/ops/alerts'),
        fetch('/api/admin/ops/jobs?days=3'),
      ])

      if (healthRes.ok) {
        const data = await healthRes.json()
        setHealth(data)
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json()
        setAlerts(data.alerts || [])
      }
      if (jobsRes.ok) {
        const data = await jobsRes.json()
        setJobs(data.jobs || [])
      }

      setLastRefresh(new Date())
    } catch (error) {
      logger.error('Failed to fetch ops data', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchAll])

  if (loading) {
    return <div className="text-gray-400">Loading operations dashboard...</div>
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Operations</h1>
          <p className="text-gray-400 text-sm mt-1">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-gray-700 border-gray-600"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={fetchAll}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`rounded-lg px-4 py-3 flex items-center gap-3 ${
                alert.severity === 'CRITICAL'
                  ? 'bg-red-900/50 border border-red-700'
                  : 'bg-yellow-900/50 border border-yellow-700'
              }`}
            >
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                alert.severity === 'CRITICAL'
                  ? 'bg-red-700 text-red-100'
                  : 'bg-yellow-700 text-yellow-100'
              }`}>
                {alert.severity}
              </span>
              <span className={`text-sm ${
                alert.severity === 'CRITICAL' ? 'text-red-200' : 'text-yellow-200'
              }`}>
                {alert.message}
              </span>
              <span className="text-xs text-gray-500 ml-auto">{alert.category}</span>
            </div>
          ))}
        </div>
      )}

      {/* System Health Panel */}
      {health && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Database */}
            <div className="bg-gray-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <StatusDot status={health.database.status} />
                <h3 className="text-white font-medium">Database</h3>
              </div>
              <div className="space-y-1">
                <p className="text-gray-400 text-sm">
                  Status: <span className="text-white capitalize">{health.database.status}</span>
                </p>
                <p className="text-gray-400 text-sm">
                  Latency: <span className="text-white">{health.database.latencyMs}ms</span>
                </p>
              </div>
            </div>

            {/* Redis */}
            <div className="bg-gray-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <StatusDot status={health.redis.status} />
                <h3 className="text-white font-medium">Redis</h3>
              </div>
              <div className="space-y-1">
                <p className="text-gray-400 text-sm">
                  Status: <span className="text-white capitalize">{health.redis.status}</span>
                </p>
                <p className="text-gray-400 text-sm">
                  Latency: <span className="text-white">{health.redis.latencyMs}ms</span>
                </p>
              </div>
            </div>

            {/* Channels */}
            <div className="bg-gray-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <StatusDot status={health.channels.expired > 0 || health.channels.revoked > 0 ? 'degraded' : 'healthy'} />
                <h3 className="text-white font-medium">Channel Tokens</h3>
              </div>
              <div className="space-y-1">
                <p className="text-gray-400 text-sm">
                  Total: <span className="text-white">{health.channels.total}</span>
                  {' / '}Healthy: <span className="text-green-400">{health.channels.healthy}</span>
                </p>
                {health.channels.expired > 0 && (
                  <p className="text-yellow-400 text-sm">
                    Expired: {health.channels.expired}
                  </p>
                )}
                {health.channels.revoked > 0 && (
                  <p className="text-red-400 text-sm">
                    Revoked: {health.channels.revoked}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Ingestion Status & Quota */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Ingestion */}
            <div className="bg-gray-800 rounded-lg p-5">
              <h3 className="text-white font-medium mb-3">Ingestion Status</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-gray-400 text-xs">Lag</p>
                  <p className={`text-xl font-bold ${
                    health.ingestion.lagMinutes < 0
                      ? 'text-gray-500'
                      : health.ingestion.lagMinutes > 120
                        ? 'text-red-400'
                        : health.ingestion.lagMinutes > 30
                          ? 'text-yellow-400'
                          : 'text-green-400'
                  }`}>
                    {health.ingestion.lagMinutes < 0 ? 'N/A' : `${health.ingestion.lagMinutes}m`}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Last 24h</p>
                  <p className="text-xl font-bold text-white">
                    {health.ingestion.eventsLast24h.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Last Hour</p>
                  <p className="text-xl font-bold text-white">
                    {health.ingestion.eventsLastHour.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Quota */}
            <div className="bg-gray-800 rounded-lg p-5">
              <h3 className="text-white font-medium mb-3">YouTube API Quota</h3>
              <div className="mb-2">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">
                    {health.quota.dailyUsed.toLocaleString()} / {health.quota.dailyLimit.toLocaleString()}
                  </span>
                  <span className={`font-medium ${
                    health.quota.percentUsed > 95
                      ? 'text-red-400'
                      : health.quota.percentUsed > 80
                        ? 'text-yellow-400'
                        : 'text-green-400'
                  }`}>
                    {health.quota.percentUsed}%
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      health.quota.percentUsed > 95
                        ? 'bg-red-500'
                        : health.quota.percentUsed > 80
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(health.quota.percentUsed, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Job Status Summary */}
          <div className="bg-gray-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium">Job Status (Last Run)</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-400">
                  24h Failures: <span className={`font-medium ${
                    health.jobs.recentFailures > 0 ? 'text-red-400' : 'text-green-400'
                  }`}>{health.jobs.recentFailures}</span>
                </span>
                <span className="text-gray-400">
                  Avg Duration: <span className="text-white">{formatDuration(health.jobs.avgDurationMs)}</span>
                </span>
              </div>
            </div>
            {Object.keys(health.jobs.lastRun).length === 0 ? (
              <p className="text-gray-500 text-sm">No job runs recorded yet.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(health.jobs.lastRun).map(([jobType, run]) => (
                  <div key={jobType} className="bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-sm font-medium">
                        {jobType.replace(/_/g, ' ')}
                      </span>
                      <StatusDot status={run.status} />
                    </div>
                    <div className="text-xs text-gray-400 space-y-0.5">
                      <p>Status: <span className={`${
                        run.status === 'COMPLETED' ? 'text-green-400' :
                        run.status === 'FAILED' ? 'text-red-400' :
                        run.status === 'RUNNING' ? 'text-yellow-400' : 'text-gray-300'
                      }`}>{run.status}</span></p>
                      <p>Last: {formatTimeAgo(run.completedAt)}</p>
                      <p>Events: {run.eventsProcessed}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Job History Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-medium">Recent Job Runs</h3>
        </div>
        {jobs.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500">
            No job runs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Duration</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Events</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Errors</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Started</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Error Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {jobs.slice(0, 50).map((job) => {
                  const duration = job.startedAt && job.completedAt
                    ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
                    : null

                  return (
                    <tr key={job.id} className="hover:bg-gray-750">
                      <td className="px-4 py-2.5 text-sm text-white">
                        {job.jobType.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          job.status === 'COMPLETED' ? 'bg-green-900 text-green-300' :
                          job.status === 'FAILED' ? 'bg-red-900 text-red-300' :
                          job.status === 'RUNNING' ? 'bg-yellow-900 text-yellow-300' :
                          'bg-gray-700 text-gray-300'
                        }`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-400">
                        {duration !== null ? formatDuration(duration) : '--'}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-400">
                        {job.eventsProcessed}
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        <span className={job.errorsCount > 0 ? 'text-red-400' : 'text-gray-400'}>
                          {job.errorsCount}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-400">
                        {formatTimeAgo(job.startedAt || job.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-red-400 max-w-xs truncate">
                        {job.errorMessage || '--'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
