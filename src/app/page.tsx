'use client';

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] overflow-x-hidden">
      {/* Animated gradient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 animate-gradient"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow delay-1000"></div>
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled ? 'bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/50' : 'bg-transparent border-b border-white/5'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg transition-transform group-hover:scale-110"></div>
            <span className="text-xl font-bold text-white">YT Loyalty</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors relative group">
              Features
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 transition-all group-hover:w-full"></span>
            </a>
            <a href="#how-it-works" className="text-gray-300 hover:text-white transition-colors relative group">
              How It Works
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 transition-all group-hover:w-full"></span>
            </a>
            <a href="#testimonials" className="text-gray-300 hover:text-white transition-colors relative group">
              Testimonials
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 transition-all group-hover:w-full"></span>
            </a>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all hover:scale-105 active:scale-95"
            >
              Get Started
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white p-2"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0a0a0a]/98 backdrop-blur-xl border-t border-white/10 animate-fade-in">
            <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-4">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-gray-300 hover:text-white transition-colors py-2">Features</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-gray-300 hover:text-white transition-colors py-2">How It Works</a>
              <a href="#testimonials" onClick={() => setMobileMenuOpen(false)} className="text-gray-300 hover:text-white transition-colors py-2">Testimonials</a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            {/* Trust Badge */}
            <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all duration-300 animate-fade-in">
              <div className="flex -space-x-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-600 animate-pulse-slow"></div>
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 animate-pulse-slow delay-200"></div>
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 animate-pulse-slow delay-400"></div>
              </div>
              <span className="text-sm text-gray-400">Trusted by YouTube creators worldwide</span>
            </div>

            <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 leading-tight animate-fade-in-up">
              Build Loyalty.<br />
              <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                Grow Your Community.
              </span>
            </h1>

            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
              Transform your YouTube Live streams with a powerful cross-stream loyalty system.
              Reward viewers for watching and engaging—build a dedicated community that keeps coming back.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in-up delay-400">
              <Link
                href="/admin"
                className="group w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg hover:shadow-xl hover:shadow-cyan-500/30 transition-all transform hover:-translate-y-1 hover:scale-105 active:scale-95 relative overflow-hidden"
              >
                <span className="relative z-10">Start Your Loyalty Program</span>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </Link>
              <a
                href="#how-it-works"
                className="w-full sm:w-auto px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-lg hover:bg-white/10 hover:border-white/20 transition-all hover:-translate-y-1"
              >
                See How It Works
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-8 border-t border-white/10 animate-fade-in-up delay-600">
              <div className="group cursor-default">
                <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-1 group-hover:scale-110 transition-transform">10K+</div>
                <div className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors">Active Viewers</div>
              </div>
              <div className="group cursor-default">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent mb-1 group-hover:scale-110 transition-transform">500+</div>
                <div className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors">Creators</div>
              </div>
              <div className="group cursor-default">
                <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent mb-1 group-hover:scale-110 transition-transform">99.9%</div>
                <div className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors">Uptime</div>
              </div>
            </div>
          </div>

          {/* Scroll Indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-down">
            <a href="#features" className="flex flex-col items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors">
              <span className="text-xs uppercase tracking-wider">Scroll to explore</span>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-gradient-to-b from-transparent to-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Everything You Need to Build Loyalty
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Powerful features designed to engage your community and reward your most dedicated viewers
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group p-8 bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-2xl hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10">
              <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Chat-Based Points
              </h3>
              <p className="text-gray-400 leading-relaxed">
                Viewers earn points by typing loyalty codes shown during your stream. Simple, engaging, and fun for everyone.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-2xl hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Anti-Fraud Protection
              </h3>
              <p className="text-gray-400 leading-relaxed">
                Advanced detection for bots, multi-accounts, and suspicious patterns. Keep your loyalty program fair and authentic.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-2xl hover:border-yellow-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-yellow-500/10">
              <div className="w-14 h-14 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Ranks & Rewards
              </h3>
              <p className="text-gray-400 leading-relaxed">
                5 rank tiers with exclusive badges. Let viewers redeem points for discounts, perks, and special rewards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Simple Setup, Powerful Results
            </h2>
            <p className="text-gray-400 text-lg">Get started in minutes, grow your community for years</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 relative">
            {/* Step 1 */}
            <div className="text-center relative">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto">
                1
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Connect Your Channel</h3>
              <p className="text-gray-400">Sign in with Google and link your YouTube channel in seconds</p>
            </div>

            {/* Step 2 */}
            <div className="text-center relative">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto">
                2
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Customize Your Program</h3>
              <p className="text-gray-400">Set up ranks, rewards, and point values that fit your community</p>
            </div>

            {/* Step 3 */}
            <div className="text-center relative">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto">
                3
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Go Live & Engage</h3>
              <p className="text-gray-400">Start streaming and watch your community grow with loyalty rewards</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-6 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Loved by Creators
            </h2>
            <p className="text-gray-400 text-lg">See what creators are saying about YT Loyalty</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "YT Loyalty transformed how I engage with my community. My viewers are more active than ever!",
                name: "Alex Chen",
                role: "Gaming Streamer",
              },
              {
                quote: "The anti-fraud features give me peace of mind. I know my loyalty program is fair and authentic.",
                name: "Sarah Johnson",
                role: "Tech Reviewer",
              },
              {
                quote: "Setting up ranks and rewards was so easy. My community loves the gamification aspect!",
                name: "Mike Rodriguez",
                role: "Fitness Coach",
              },
            ].map((testimonial, i) => (
              <div key={i} className="p-8 bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-2xl">
                <div className="text-gray-300 mb-6 leading-relaxed">
                  &quot;{testimonial.quote}&quot;
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-full"></div>
                  <div>
                    <div className="font-semibold text-white">{testimonial.name}</div>
                    <div className="text-sm text-gray-500">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 blur-3xl"></div>
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="p-12 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-white/10 rounded-3xl hover:border-white/20 transition-all duration-500 group overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Ready to Build Your Loyal Community?
              </h2>
              <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
                Join hundreds of creators who are growing their audiences with YT Loyalty
              </p>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg hover:shadow-xl hover:shadow-cyan-500/30 transition-all transform hover:-translate-y-1 hover:scale-105 active:scale-95"
              >
                Get Started Free
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg"></div>
              <span className="text-xl font-bold text-white">YT Loyalty</span>
            </div>
            <div className="text-sm text-gray-500">
              © 2025 YT Loyalty. All rights reserved.
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="#" className="hover:text-white transition">Privacy</a>
              <a href="#" className="hover:text-white transition">Terms</a>
              <a href="#" className="hover:text-white transition">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
