'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Menu, LogOut, Settings, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import Link from 'next/link'
import {
  LayoutDashboard,
  Mic,
  Brain,
  MessageCircle,
  Handshake,
  Users,
  Sparkles,
  CalendarClock,
  Clock,
  GitBranch,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const primaryDrawerNav = [
  { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { href: '/continuity/threads', label: 'Open Loops', icon: GitBranch },
  { href: '/recall', label: 'Ask', icon: MessageCircle },
  { href: '/people', label: 'People', icon: Users },
]

const secondaryDrawerNav = [
  { href: '/capture', label: 'Capture', icon: Mic },
  { href: '/companion', label: 'Insights', icon: Sparkles },
  { href: '/timeline', label: 'Activity', icon: CalendarClock },
  { href: '/commitments', label: 'Promises', icon: Handshake },
  { href: '/follow-ups', label: 'Waiting On', icon: Clock },
  { href: '/memories', label: 'Memories', icon: Brain },
]

const pageTitles: Record<string, string> = {
  '/dashboard': 'Today',
  '/capture': 'Capture',
  '/memories': 'Memories',
  '/recall': 'Ask',
  '/commitments': 'Promises',
  '/people': 'People',
  '/settings': 'Settings',
  '/continuity/threads': 'Open Loops',
  '/companion': 'Insights',
  '/timeline': 'Activity',
  '/follow-ups': 'Waiting On',
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const title = pageTitles[pathname] || 'Continuum'

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-slate-100/60 safe-top" style={{ backgroundColor: 'oklch(0.985 0.005 80 / 0.85)' }}>
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="md:hidden -ml-1.5 h-9 w-9">
                  <Menu className="h-5 w-5 text-slate-600" />
                </Button>
              }
            />
            <SheetContent side="left" className="w-72 p-0" style={{ backgroundColor: 'oklch(0.985 0.005 80)' }}>
              <div className="px-5 pt-8 pb-6">
                <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
                  Continuum
                </h1>
                <p className="text-[11px] text-slate-400 mt-0.5">Your day, remembered</p>
              </div>

              <nav className="px-3">
                <div className="space-y-0.5">
                  {primaryDrawerNav.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
                          isActive
                            ? 'bg-white/90 text-slate-800 font-medium shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100/60 space-y-0.5">
                  <p className="text-[10px] font-medium text-slate-300 uppercase tracking-wider px-3 mb-2">More</p>
                  {secondaryDrawerNav.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-all',
                          isActive
                            ? 'text-slate-700 font-medium bg-white/50'
                            : 'text-slate-400 hover:text-slate-500 hover:bg-white/30'
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100/60">
                  <Link
                    href="/settings"
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-all',
                      pathname === '/settings'
                        ? 'text-slate-700 font-medium bg-white/50'
                        : 'text-slate-400 hover:text-slate-500 hover:bg-white/30'
                    )}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </Link>
                </div>
              </nav>

              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-100/60">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] text-slate-400 hover:text-slate-500 hover:bg-white/30 transition-all w-full"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="rounded-full p-0.5 hover:bg-white/60 transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gradient-to-br from-slate-200 to-slate-300 text-slate-600 text-xs">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => router.push('/settings')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
