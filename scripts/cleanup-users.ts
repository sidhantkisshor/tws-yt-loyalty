import prisma from '../src/lib/prisma'

async function cleanup() {
  // Find users without accounts
  const users = await prisma.user.findMany({
    include: { accounts: true }
  })

  console.log('Found users:', users.length)

  for (const user of users) {
    console.log('User:', user.email, 'Accounts:', user.accounts.length)
    if (user.accounts.length === 0) {
      console.log('Deleting orphan user:', user.email)
      await prisma.user.delete({ where: { id: user.id } })
    }
  }

  console.log('Cleanup done')
}

cleanup().catch(console.error).finally(() => prisma.$disconnect())
