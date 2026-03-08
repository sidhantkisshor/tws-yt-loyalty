import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getSystemHealth } from '@/services/opsMonitor'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.authorized) return auth.response

  try {
    const health = await getSystemHealth()

    return NextResponse.json({
      ...health,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch system health', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
