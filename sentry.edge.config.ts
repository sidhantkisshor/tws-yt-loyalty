import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Set environment
  environment: process.env.NODE_ENV || 'development',

  // Lower sample rate for edge runtime
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  // Edge-specific error filtering
  beforeSend(event) {
    // Remove sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['authorization']
      delete event.request.headers['cookie']
      delete event.request.headers['set-cookie']
    }

    return event
  },

  // Don't send events in development unless explicitly enabled
  enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true',
})
