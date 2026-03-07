/**
 * Migration script: Old rank names -> New rank names
 *
 * Map:
 *   OBSERVER      -> PAPER_TRADER
 *   OPERATOR      -> RETAIL_TRADER
 *   SNIPER        -> SWING_TRADER
 *   ARCHITECT     -> FUND_MANAGER
 *   INNER_CIRCLE  -> MARKET_MAKER
 *
 * Also generates referral codes for viewers without one (using nanoid(10)).
 *
 * Run with: npx tsx scripts/migrate-ranks.ts
 */

import prisma from '../src/lib/prisma'
import { nanoid } from 'nanoid'

const RANK_MAP: Record<string, string> = {
  OBSERVER: 'PAPER_TRADER',
  OPERATOR: 'RETAIL_TRADER',
  SNIPER: 'SWING_TRADER',
  ARCHITECT: 'FUND_MANAGER',
  INNER_CIRCLE: 'MARKET_MAKER',
}

async function migrateRanks() {
  console.log('Starting rank migration...')

  let totalMigrated = 0

  for (const [oldRank, newRank] of Object.entries(RANK_MAP)) {
    try {
      // Use raw SQL to handle the case where old enum values may or may not exist
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "Viewer" SET "rank" = '${newRank}' WHERE "rank" = '${oldRank}'`
      )
      if (result > 0) {
        console.log(`  Migrated ${result} viewers from ${oldRank} -> ${newRank}`)
        totalMigrated += result
      }
    } catch (error) {
      // If the old enum value doesn't exist in the DB, this will fail gracefully
      console.log(`  Skipping ${oldRank} -> ${newRank}: old value not found in DB (already migrated)`)
    }
  }

  if (totalMigrated === 0) {
    console.log('No old rank values found. Database already uses new rank names.')
  } else {
    console.log(`Migrated ${totalMigrated} total viewer ranks.`)
  }

  // Generate referral codes for viewers without one
  console.log('\nGenerating referral codes for viewers without one...')

  const viewersWithoutCode = await prisma.viewer.findMany({
    where: { referralCode: null },
    select: { id: true },
  })

  if (viewersWithoutCode.length === 0) {
    console.log('All viewers already have referral codes.')
  } else {
    let codesGenerated = 0

    for (const viewer of viewersWithoutCode) {
      try {
        await prisma.viewer.update({
          where: { id: viewer.id },
          data: { referralCode: nanoid(10) },
        })
        codesGenerated++
      } catch (error) {
        // Unique constraint collision on referral code — retry with a new one
        try {
          await prisma.viewer.update({
            where: { id: viewer.id },
            data: { referralCode: nanoid(10) },
          })
          codesGenerated++
        } catch {
          console.error(`  Failed to generate referral code for viewer ${viewer.id}`)
        }
      }
    }

    console.log(`Generated referral codes for ${codesGenerated} viewers.`)
  }

  console.log('\nMigration complete.')
}

migrateRanks()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
