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
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/capture', label: 'Capture', icon: Mic },
  { href: '/memories', label: 'Memories', icon: Brain },
  { href: '/recall', label: 'Recall', icon: MessageCircle },
  { href: '/commitments', label: 'Commitments', icon: Handshake },
  { href: '/people', label: 'People', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/capture': 'Capture',
  '/memories': 'Memories',
  '/recall': 'Recall',
  '/commitments': 'Commitments',
  '/people': 'People',
  '/settings': 'Settings',
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
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-sm border-b border-slate-200">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              }
            />
            <SheetContent side="left" className="w-64 p-0">
              <div className="p-6">
                <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
                  Continuum
                </h1>
              </div>
              <nav className="px-3 space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href
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
            </SheetContent>
          </Sheet>
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="rounded-full p-1 hover:bg-slate-100 transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-slate-200 text-slate-600 text-xs">
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
