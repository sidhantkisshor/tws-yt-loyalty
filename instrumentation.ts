/**
 * Next.js Instrumentation Hook
 *
 * This file registers instrumentation for monitoring and observability.
 * It's called once when the Next.js server starts.
 */

export async function register() {
  // Only register Sentry in server runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  // Register edge runtime Sentry
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
