import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import * as Sentry from '@sentry/nextjs'

/**
 * Test endpoint for Sentry error reporting
 *
 * IMPORTANT: Remove this endpoint before deploying to production
 * or add authentication to prevent abuse
 */
export async function GET() {
  // Only allow in development or if explicitly enabled
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_TEST_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Test endpoint disabled in production' },
      { status: 403 }
    )
  }

  try {
    // Test 1: Logger error (will be captured by Sentry)
    logger.error('Test error from logger', new Error('This is a test error from logger'), {
      testType: 'logger-integration',
      timestamp: new Date().toISOString(),
    })

    // Test 2: Direct Sentry capture
    Sentry.captureMessage('Test message from Sentry', {
      level: 'warning',
      tags: {
        testType: 'direct-sentry',
      },
      extra: {
        timestamp: new Date().toISOString(),
      },
    })

    // Test 3: Exception with context
    try {
      throw new Error('Test exception with context')
    } catch (error) {
      logger.error('Caught test exception', error, {
        testType: 'exception-with-context',
        userId: 'test-user-123',
        action: 'sentry-test',
      })
    }

    // Test 4: Breadcrumb trail
    logger.info('Step 1: Starting test operation', {
      testType: 'breadcrumb-trail',
    })
    logger.warn('Step 2: Warning during operation', {
      testType: 'breadcrumb-trail',
    })
    logger.error('Step 3: Error occurred', new Error('Final error in breadcrumb trail'), {
      testType: 'breadcrumb-trail',
    })

    return NextResponse.json({
      message: 'Test errors sent to Sentry',
      tests: [
        'Logger error integration',
        'Direct Sentry message',
        'Exception with context',
        'Breadcrumb trail',
      ],
      note: 'Check your Sentry dashboard for the test events',
      dashboardUrl: 'https://sentry.io',
    })
  } catch (error) {
    logger.error('Error in Sentry test endpoint', error)
    return NextResponse.json(
      { error: 'Failed to send test errors' },
      { status: 500 }
    )
  }
}
