'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Mic,
  Brain,
  MessageCircle,
  Handshake,
  Users,
  Sparkles,
  GitBranch,
  Clock,
  CalendarClock,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// 4 core surfaces + essential supporting pages
const primaryNav = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/continuity/threads', label: 'Threads', icon: GitBranch },
  { href: '/recall', label: 'Recall', icon: MessageCircle },
  { href: '/people', label: 'Relationships', icon: Users },
]

const secondaryNav = [
  { href: '/capture', label: 'Capture', icon: Mic },
  { href: '/companion', label: 'Companion', icon: Sparkles },
  { href: '/timeline', label: 'Timeline', icon: CalendarClock },
  { href: '/commitments', label: 'Commitments', icon: Handshake },
  { href: '/follow-ups', label: 'Follow-ups', icon: Clock },
  { href: '/memories', label: 'Memories', icon: Brain },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [unresolvedCount, setUnresolvedCount] = useState(0)

  useEffect(() => {
    async function fetchUnresolved() {
      try {
        const res = await fetch('/api/threads?status=unresolved,forgotten_risk,time_sensitive')
        if (res.ok) {
          const data = await res.json()
          setUnresolvedCount((data.threads || []).length)
        }
      } catch {
        // Silently fail
      }
    }
    fetchUnresolved()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="hidden md:flex flex-col w-56 border-r border-slate-100 bg-white/80 h-screen sticky top-0">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-lg font-semibold text-slate-800 tracking-tight">
          Continuum
        </h1>
        <p className="text-[11px] text-slate-300 mt-0.5">Cognitive preservation</p>
      </div>

      {/* Primary navigation — 4 core surfaces */}
      <nav className="flex-1 px-3">
        <div className="space-y-0.5">
          {primaryNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-slate-50 text-slate-800 font-medium'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
                {item.href === '/continuity/threads' && unresolvedCount > 0 && (
                  <span className="text-[10px] font-medium text-amber-500 bg-amber-50 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {unresolvedCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Secondary — less prominent */}
        <div className="mt-6 pt-4 border-t border-slate-100 space-y-0.5">
          {secondaryNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-1.5 rounded-lg text-[13px] transition-colors',
                  isActive
                    ? 'text-slate-700 font-medium'
                    : 'text-slate-400 hover:text-slate-500'
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Settings */}
        <div className="mt-6 pt-4 border-t border-slate-100">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-3 px-3 py-1.5 rounded-lg text-[13px] transition-colors',
              pathname === '/settings'
                ? 'text-slate-700 font-medium'
                : 'text-slate-400 hover:text-slate-500'
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Link>
        </div>
      </nav>

      <div className="p-3 border-t border-slate-100">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-slate-400 hover:text-slate-500 transition-colors w-full"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
