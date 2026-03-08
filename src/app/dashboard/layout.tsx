import Link from 'next/link'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link
              href="/dashboard"
              className="text-xl font-bold text-white hover:text-blue-400"
            >
              Loyalty Points
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-gray-300 hover:text-white text-sm"
              >
                My Stats
              </Link>
              <Link
                href="/dashboard/leaderboard"
                className="text-gray-300 hover:text-white text-sm"
              >
                Leaderboard
              </Link>
              <Link
                href="/dashboard/rewards"
                className="text-gray-300 hover:text-white text-sm"
              >
                Rewards
              </Link>
            </div>
          </div>
        </div>
      </nav>
      {children}
    </div>
  )
}
