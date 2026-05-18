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
  { href: '/capture', label: 'Capture', icon: Mic },
  { href: '/memories', label: 'Memories', icon: Brain },
  { href: '/recall', label: 'Ask', icon: MessageCircle },
  { href: '/commitments', label: 'Promises', icon: Handshake },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 safe-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-w-[60px]',
                isActive
                  ? 'text-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <item.icon className={cn('h-5 w-5', isActive && 'text-blue-600')} />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
