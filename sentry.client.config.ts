import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Set environment based on NODE_ENV
  environment: process.env.NODE_ENV || 'development',

  // Adjust the sample rate for production to reduce quota usage
  // 1.0 = 100% of errors sent to Sentry
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Capture 10% of sessions for performance monitoring in production
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Capture 100% of sessions with errors for replay
  replaysOnErrorSampleRate: 1.0,

  // Enable session replay for debugging
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out sensitive information
  beforeSend(event) {
    // Remove sensitive query parameters
    if (event.request?.url) {
      const url = new URL(event.request.url)
      const sensitiveParams = ['token', 'api_key', 'access_token', 'refresh_token']
      sensitiveParams.forEach((param) => url.searchParams.delete(param))
      event.request.url = url.toString()
    }

    // Remove sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['Authorization']
      delete event.request.headers['Cookie']
      delete event.request.headers['Set-Cookie']
    }

    return event
  },

  // Don't send events in development unless explicitly enabled
  enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true',
})
