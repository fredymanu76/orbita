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
  HeartPulse,
  Sparkles,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/capture', label: 'Capture', icon: Mic },
  { href: '/memories', label: 'Memories', icon: Brain },
  { href: '/recall', label: 'Recall', icon: MessageCircle },
  { href: '/companion', label: 'Companion', icon: Sparkles },
  { href: '/commitments', label: 'Commitments', icon: Handshake },
  { href: '/people', label: 'People', icon: Users },
  { href: '/continuity', label: 'Continuity', icon: HeartPulse },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white h-screen sticky top-0">
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
          Continuum
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Cognitive preservation</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
