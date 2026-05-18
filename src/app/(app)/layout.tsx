import { Sidebar } from '@/components/app/sidebar'
import { Header } from '@/components/app/header'
import { MobileNav } from '@/components/app/mobile-nav'
import { RemindersNotification } from '@/components/app/reminders-notification'
import { CapacitorInit } from '@/components/capacitor-init'
import { OfflineBanner } from '@/components/offline-banner'
import { Toaster } from 'sonner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'oklch(0.985 0.005 80)' }}>
      <CapacitorInit />
      <OfflineBanner />
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 px-4 pt-3 pb-28 md:px-6 md:pt-6 md:pb-6">
          {children}
        </main>
        <MobileNav />
      </div>
      <RemindersNotification />
      <Toaster position="top-right" richColors />
    </div>
  )
}
