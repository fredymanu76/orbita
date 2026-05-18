'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Mic,
  Brain,
  MessageCircle,
  Handshake,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mobileNavItems = [
  { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { href: '/recall', label: 'Ask', icon: MessageCircle },
  { href: '/capture', label: 'Capture', icon: Mic, primary: true },
  { href: '/memories', label: 'Memories', icon: Brain },
  { href: '/commitments', label: 'Promises', icon: Handshake },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      {/* Glassmorphism bar */}
      <div className="mx-3 mb-2 rounded-2xl border border-white/40 shadow-lg shadow-slate-900/8 backdrop-blur-xl" style={{ backgroundColor: 'rgba(255,255,255,0.82)' }}>
        <div className="flex items-end justify-around px-1 pt-1.5 pb-2">
          {mobileNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

            if (item.primary) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center -mt-4"
                >
                  <div className={cn(
                    'w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all',
                    isActive
                      ? 'bg-slate-800 shadow-slate-800/30 scale-105'
                      : 'bg-slate-700 shadow-slate-700/20'
                  )}>
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <span className={cn(
                    'text-[10px] font-semibold mt-1 transition-colors',
                    isActive ? 'text-slate-800' : 'text-slate-400'
                  )}>
                    {item.label}
                  </span>
                </Link>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center min-w-[56px] py-1"
              >
                <div className={cn(
                  'relative flex items-center justify-center w-10 h-8 rounded-xl transition-all',
                  isActive && 'bg-slate-100'
                )}>
                  <item.icon className={cn(
                    'h-[22px] w-[22px] transition-colors',
                    isActive ? 'text-slate-800' : 'text-slate-400'
                  )} />
                </div>
                <span className={cn(
                  'text-[10px] font-medium mt-0.5 transition-colors',
                  isActive ? 'text-slate-800' : 'text-slate-400'
                )}>
                  {item.label}
                </span>
                {/* Active indicator dot */}
                {isActive && (
                  <div className="w-1 h-1 rounded-full bg-slate-800 mt-0.5" />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
