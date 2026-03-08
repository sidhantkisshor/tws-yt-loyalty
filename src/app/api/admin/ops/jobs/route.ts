import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getJobHistory } from '@/services/opsMonitor'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.authorized) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7', 10)
    const safeDays = Math.min(Math.max(days, 1), 90)

    const jobs = await getJobHistory(safeDays)

    // Group jobs by type for summary stats
    const byType: Record<string, { total: number; completed: number; failed: number; avgDurationMs: number }> = {}
    for (const job of jobs) {
      if (!byType[job.jobType]) {
        byType[job.jobType] = { total: 0, completed: 0, failed: 0, avgDurationMs: 0 }
      }
      const entry = byType[job.jobType]
      entry.total++
      if (job.status === 'COMPLETED') entry.completed++
      if (job.status === 'FAILED') entry.failed++
    }

    // Calculate avg duration per type
    for (const jobType of Object.keys(byType)) {
      const typeJobs = jobs.filter(
        j => j.jobType === jobType && j.status === 'COMPLETED' && j.startedAt && j.completedAt
      )
      if (typeJobs.length > 0) {
        const totalDuration = typeJobs.reduce((sum, j) => {
          return sum + (new Date(j.completedAt!).getTime() - new Date(j.startedAt!).getTime())
        }, 0)
        byType[jobType].avgDurationMs = Math.round(totalDuration / typeJobs.length)
      }
    }

    return NextResponse.json({
      jobs,
      summary: byType,
      period: { days: safeDays },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch job history', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
