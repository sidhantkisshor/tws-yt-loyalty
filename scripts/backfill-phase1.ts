import { PrismaClient, type ViewerRank } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { aggregateViewerPoints, pickHighestRank, averageTrustScore } from '../src/scripts/backfillHelpers'

// Load .env.local for database URL
config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('=== Phase 1 Backfill: Identity + Ledger ===\n')

  // Step 1: Create default workspace
  console.log('Step 1: Creating default workspace...')
  const firstUser = await prisma.user.findFirst()
  if (!firstUser) {
    console.log('  No users found — skipping backfill (empty database)')
    console.log('\n=== Backfill complete (nothing to migrate) ===')
    return
  }
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'default' },
    create: {
      name: 'YT Loyalty Program',
      slug: 'default',
      ownerId: firstUser.id,
      settings: { timezone: 'UTC' },
    },
    update: {},
  })
  console.log(`  Workspace: ${workspace.id} (${workspace.name})\n`)

  // Step 2: Backfill FanProfile wallet fields from Viewer rows
  console.log('Step 2: Backfilling FanProfile wallet fields...')
  const fanProfiles = await prisma.fanProfile.findMany({
    include: {
      viewers: {
        select: {
          totalPoints: true,
          availablePoints: true,
          lifetimePoints: true,
          rank: true,
          trustScore: true,
          currentStreak: true,
          longestStreak: true,
          isBanned: true,
          banReason: true,
          bannedAt: true,
          displayName: true,
          profileImageUrl: true,
        },
      },
    },
  })

  let profilesUpdated = 0
  for (const fp of fanProfiles) {
    if (fp.viewers.length === 0) continue

    const points = aggregateViewerPoints(fp.viewers)
    const rank = pickHighestRank(fp.viewers.map((v) => v.rank))
    const trust = averageTrustScore(fp.viewers.map((v) => v.trustScore))
    const maxStreak = Math.max(...fp.viewers.map((v) => v.currentStreak), 0)
    const maxLongest = Math.max(...fp.viewers.map((v) => v.longestStreak), 0)
    const isBanned = fp.viewers.some((v) => v.isBanned)
    const banReason = fp.viewers.find((v) => v.isBanned)?.banReason ?? null
    const bannedAt = fp.viewers.find((v) => v.isBanned)?.bannedAt ?? null
    const displayName = fp.viewers[0].displayName
    const profileImageUrl = fp.viewers[0].profileImageUrl

    await prisma.fanProfile.update({
      where: { id: fp.id },
      data: {
        ...points,
        rank: rank as ViewerRank,
        trustScore: trust,
        currentStreak: maxStreak,
        longestStreak: maxLongest,
        isBanned,
        banReason,
        bannedAt,
        displayName,
        profileImageUrl,
        workspaceId: workspace.id,
      },
    })
    profilesUpdated++
  }
  console.log(`  Updated ${profilesUpdated} fan profiles\n`)

  // Step 3: Create ChannelCredentials from channel owners
  console.log('Step 3: Creating channel credentials...')
  const channels = await prisma.channel.findMany({
    include: { owner: true },
  })

  let credentialsCreated = 0
  for (const channel of channels) {
    const existing = await prisma.channelCredential.findUnique({
      where: { channelId: channel.id },
    })
    if (existing) continue

    await prisma.channelCredential.create({
      data: {
        channelId: channel.id,
        googleAccountEmail: channel.owner.email,
        accessToken: '',
        refreshToken: '',
        tokenStatus: 'EXPIRED',
      },
    })
    credentialsCreated++

    // Link channel to workspace
    await prisma.channel.update({
      where: { id: channel.id },
      data: { workspaceId: workspace.id },
    })
  }
  console.log(`  Created ${credentialsCreated} channel credentials\n`)

  // Step 4: Link PointLedger entries to FanProfile
  console.log('Step 4: Linking ledger entries to fan profiles...')
  const orphanedEntries = await prisma.pointLedger.findMany({
    where: { fanProfileId: null, viewerId: { not: null } },
    select: { id: true, viewerId: true },
  })

  // Build viewer -> fanProfile lookup
  const viewers = await prisma.viewer.findMany({
    where: { fanProfileId: { not: null } },
    select: { id: true, fanProfileId: true },
  })
  const viewerToFan = new Map(viewers.map((v) => [v.id, v.fanProfileId!]))

  let ledgerLinked = 0
  const batchSize = 500
  for (let i = 0; i < orphanedEntries.length; i += batchSize) {
    const batch = orphanedEntries.slice(i, i + batchSize)
    const updates = batch
      .filter((e) => e.viewerId && viewerToFan.has(e.viewerId))
      .map((e) =>
        prisma.pointLedger.update({
          where: { id: e.id },
          data: { fanProfileId: viewerToFan.get(e.viewerId!)! },
        })
      )
    if (updates.length > 0) {
      await prisma.$transaction(updates)
    }
    ledgerLinked += batch.length
  }
  console.log(`  Linked ${ledgerLinked} ledger entries\n`)

  // Step 5: Reconciliation
  console.log('Step 5: Reconciliation check...')
  const allProfiles = await prisma.fanProfile.findMany({
    select: { id: true, displayName: true, availablePoints: true },
  })

  let mismatches = 0
  for (const profile of allProfiles) {
    const credits = await prisma.pointLedger.aggregate({
      where: { fanProfileId: profile.id, amount: { gt: 0 }, isReversed: false },
      _sum: { amount: true },
    })
    const debits = await prisma.pointLedger.aggregate({
      where: { fanProfileId: profile.id, amount: { lt: 0 }, isReversed: false },
      _sum: { amount: true },
    })

    const ledgerBalance = (credits._sum.amount ?? 0) + (debits._sum.amount ?? 0)
    if (ledgerBalance !== profile.availablePoints) {
      console.log(`  MISMATCH: ${profile.displayName} (${profile.id}): ledger=${ledgerBalance}, wallet=${profile.availablePoints}`)
      mismatches++
    }
  }

  if (mismatches === 0) {
    console.log('  All profiles reconciled successfully!')
  } else {
    console.log(`  ${mismatches} mismatches found - review manually`)
  }

  console.log('\n=== Backfill complete ===')
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
