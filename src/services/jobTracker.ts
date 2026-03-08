import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { JobType, JobStatus } from '@prisma/client'

export interface JobContext {
  jobRunId: string
  eventsProcessed: number
  errorsCount: number
}

export async function startJob(
  jobType: JobType,
  channelId?: string,
  metadata?: Record<string, unknown>
): Promise<JobContext> {
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType,
      status: 'RUNNING',
      channelId: channelId ?? null,
      startedAt: new Date(),
      metadata: metadata ?? null,
    },
  })

  logger.info('Job started', { jobRunId: jobRun.id, jobType, channelId })

  return {
    jobRunId: jobRun.id,
    eventsProcessed: 0,
    errorsCount: 0,
  }
}

export async function completeJob(ctx: JobContext): Promise<void> {
  await prisma.jobRun.update({
    where: { id: ctx.jobRunId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      eventsProcessed: ctx.eventsProcessed,
      errorsCount: ctx.errorsCount,
    },
  })

  logger.info('Job completed', {
    jobRunId: ctx.jobRunId,
    eventsProcessed: ctx.eventsProcessed,
    errorsCount: ctx.errorsCount,
  })
}

export async function failJob(ctx: JobContext, error: string): Promise<void> {
  await prisma.jobRun.update({
    where: { id: ctx.jobRunId },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      eventsProcessed: ctx.eventsProcessed,
      errorsCount: ctx.errorsCount,
      errorMessage: error,
    },
  })

  logger.error('Job failed', {
    jobRunId: ctx.jobRunId,
    error,
    eventsProcessed: ctx.eventsProcessed,
    errorsCount: ctx.errorsCount,
  })
}
