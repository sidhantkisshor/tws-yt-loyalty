'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import ViewerProvider, { useViewer } from '@/components/ViewerProvider'

const navigation = [
  { name: 'HQ', href: '/viewer', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { name: 'Rewards', href: '/viewer/rewards', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { name: 'Streak', href: '/viewer/streak', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  { name: 'Homework', href: '/viewer/homework', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { name: 'Referral', href: '/viewer/referral', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' },
  { name: 'Claimed', href: '/viewer/redemptions', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
  { name: 'History', href: '/viewer/history', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
]

function ViewerLayoutContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Move useViewer to top level - hooks must be called unconditionally
  const { activeChannelId, setActiveChannelId, availableChannels, currentViewerProfile } = useViewer()
  const viewer = currentViewerProfile

  useEffect(() => {
    if (status !== 'loading' && !session && pathname !== '/viewer/signin') {
      router.push('/viewer/signin')
    }
  }, [session, status, pathname, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg hex-pattern">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 relative">
            <div className="absolute inset-0 border-4 border-[var(--neon-cyan)] border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-2 border-4 border-[var(--neon-pink)] border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
          </div>
          <p className="text-[var(--neon-cyan)] font-[Orbitron] text-sm tracking-widest uppercase">Initializing</p>
        </div>
      </div>
    )
  }

  if (pathname === '/viewer/signin') {
    return <>{children}</>
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg hex-pattern">
        <p className="text-[var(--neon-cyan)] font-[Orbitron] text-sm tracking-widest uppercase animate-pulse">Redirecting</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-bg hex-pattern relative">
      {/* Decorative corner accents */}
      <div className="fixed top-0 left-0 w-32 h-32 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[var(--neon-cyan)] to-transparent" />
        <div className="absolute top-0 left-0 h-full w-[2px] bg-gradient-to-b from-[var(--neon-cyan)] to-transparent" />
      </div>
      <div className="fixed top-0 right-0 w-32 h-32 pointer-events-none">
        <div className="absolute top-0 right-0 w-full h-[2px] bg-gradient-to-l from-[var(--neon-pink)] to-transparent" />
        <div className="absolute top-0 right-0 h-full w-[2px] bg-gradient-to-b from-[var(--neon-pink)] to-transparent" />
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-[var(--cyber-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/viewer" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-purple)] flex items-center justify-center transform group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-[var(--cyber-black)]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </div>
                <div className="absolute -inset-1 bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-purple)] rounded-lg blur opacity-40 group-hover:opacity-70 transition-opacity" />
              </div>
              <div>
                <span className="font-[Orbitron] font-bold text-white text-lg tracking-wider">
                  YT<span className="text-[var(--neon-cyan)]">LOYALTY</span>
                </span>
                <p className="text-[10px] text-gray-500 tracking-[0.2em] uppercase -mt-1">Viewer Portal</p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/viewer' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`relative px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 group ${
                      isActive
                        ? 'text-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <svg className={`w-4 h-4 ${isActive ? 'text-[var(--neon-cyan)]' : 'text-gray-500 group-hover:text-[var(--neon-cyan)]'} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    <span className="font-[Orbitron] text-xs tracking-wider uppercase">{item.name}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-[var(--neon-cyan)] shadow-[0_0_10px_var(--neon-cyan)]" />
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* User Info & Actions */}
            <div className="flex items-center gap-4">
              {/* Channel Switcher */}
              {availableChannels && availableChannels.length > 1 && (
                <div className="hidden md:block relative">
                   <select 
                     value={activeChannelId || ''} 
                     onChange={(e) => setActiveChannelId(e.target.value)}
                     className="bg-[var(--cyber-dark)] border border-[var(--cyber-border)] text-white text-xs rounded-md py-1.5 pl-3 pr-8 focus:outline-none focus:border-[var(--neon-cyan)] appearance-none cursor-pointer font-[Orbitron] tracking-wider"
                   >
                     {availableChannels.map(c => (
                       <option key={c.channelId} value={c.channelId}>{c.channelTitle}</option>
                     ))}
                   </select>
                   <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                     <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                   </div>
                </div>
              )}

              {viewer && (
                <div className="hidden sm:flex items-center gap-4">
                  {/* Token Display */}
                  <div className="cyber-card rounded-lg px-4 py-2 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-pink)] flex items-center justify-center">
                      <span className="text-xs font-bold text-white">T</span>
                    </div>
                    <div>
                      <p className="font-[Orbitron] font-bold text-white text-sm">
                        {Math.floor(viewer.availablePoints / 1000)}
                      </p>
                      <p className="text-[8px] text-gray-500 uppercase tracking-wider -mt-0.5">Tokens</p>
                    </div>
                  </div>

                  {/* User Avatar */}
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden lg:block">
                      <p className="text-sm font-medium text-white">{viewer.displayName}</p>
                      <p className="text-xs text-[var(--neon-purple)]">{viewer.rank?.replace(/_/g, ' ') || 'Paper Trader'}</p>
                    </div>
                    {viewer.profileImageUrl ? (
                      <div className="relative">
                        <img
                          src={viewer.profileImageUrl}
                          alt=""
                          className="w-9 h-9 rounded-full ring-2 ring-[var(--cyber-border)]"
                        />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--neon-green)] rounded-full border-2 border-[var(--cyber-dark)]" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-purple)] flex items-center justify-center">
                        <span className="text-sm font-bold text-white">{viewer.displayName?.[0]?.toUpperCase() || '?'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sign Out */}
              <button
                onClick={() => signOut({ callbackUrl: '/viewer/signin' })}
                className="text-gray-500 hover:text-[var(--neon-pink)] text-sm font-[Orbitron] tracking-wider uppercase transition-colors hidden sm:block"
              >
                Exit
              </button>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--cyber-border)] bg-[var(--cyber-dark)]/95 backdrop-blur-lg">
            <div className="px-4 py-4 space-y-2">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/viewer' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)]'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    <span className="font-[Orbitron] text-sm tracking-wider uppercase">{item.name}</span>
                  </Link>
                )
              })}
              <div className="pt-4 border-t border-[var(--cyber-border)]">
                {viewer && (
                  <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-3">
                      {viewer.profileImageUrl ? (
                        <img src={viewer.profileImageUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-purple)]" />
                      )}
                      <div>
                        <p className="text-sm text-white">{viewer.displayName}</p>
                        <p className="text-xs text-[var(--neon-purple)]">{Math.floor(viewer.availablePoints / 1000)} tokens</p>
                      </div>
                    </div>
                    <button
                      onClick={() => signOut({ callbackUrl: '/viewer/signin' })}
                      className="text-[var(--neon-pink)] text-sm font-[Orbitron] tracking-wider uppercase"
                    >
                      Exit
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Footer Accent */}
      <div className="fixed bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--neon-cyan)] to-transparent opacity-30 pointer-events-none" />
    </div>
  )
}

export default function ViewerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ViewerProvider>
      <ViewerLayoutContent>{children}</ViewerLayoutContent>
    </ViewerProvider>
  )
}
