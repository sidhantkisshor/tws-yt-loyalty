'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  { name: 'Dashboard', href: '/admin' },
  { name: 'Streams', href: '/admin/streams' },
  { name: 'Viewers', href: '/admin/viewers' },
  { name: 'Rewards', href: '/admin/rewards' },
  { name: 'Fulfillment', href: '/admin/fulfillment' },
  { name: 'Analytics', href: '/admin/analytics' },
  { name: 'Homework', href: '/admin/homework' },
  { name: 'Webhooks', href: '/admin/webhooks' },
  { name: 'Ops', href: '/admin/ops' },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/auth/signin')
    }
  }, [session, status, router])

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-white">
                YT Loyalty
              </span>
              <nav className="ml-10 flex items-baseline space-x-4">
                {navigation.map((item) => {
                  const isActive = pathname === item.href ||
                    (item.href !== '/admin' && pathname.startsWith(item.href))
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${
                        isActive
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
            </div>
            <div className="flex items-center">
              <div className="flex items-center space-x-4">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-8 w-8 rounded-full"
                  />
                )}
                <span className="text-gray-300 text-sm">
                  {session.user?.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
