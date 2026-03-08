import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { generateAlerts } from '@/services/opsMonitor'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.authorized) return auth.response

  try {
    const alerts = await generateAlerts()

    return NextResponse.json({
      alerts,
      count: alerts.length,
      hasCritical: alerts.some(a => a.severity === 'CRITICAL'),
      hasWarning: alerts.some(a => a.severity === 'WARNING'),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate alerts', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
