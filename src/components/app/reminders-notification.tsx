'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell, X, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { Reminder } from '@/lib/types'

export function RemindersNotification() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [visible, setVisible] = useState(false)

  async function fetchReminders() {
    try {
      const res = await fetch('/api/reminders')
      if (!res.ok) return
      const data = await res.json()
      if (data.reminders && data.reminders.length > 0) {
        setReminders(data.reminders)
        setVisible(true)
      }
    } catch {
      // Silently fail
    }
  }

  useEffect(() => {
    fetchReminders()
    const interval = setInterval(fetchReminders, 60000) // Check every minute
    return () => clearInterval(interval)
  }, [])

  async function handleAction(id: string, action: 'dismiss' | 'snooze') {
    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      setReminders(prev => prev.filter(r => r.id !== id))
      if (action === 'snooze') {
        toast.info('Reminder snoozed for 1 hour')
      }
    } catch {
      toast.error('Failed to update reminder')
    }
  }

  if (!visible || reminders.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-50 w-80 space-y-2">
      {reminders.slice(0, 3).map((reminder) => (
        <Card key={reminder.id} className="shadow-lg border-blue-200 bg-white">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <Bell className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700">{reminder.message}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleAction(reminder.id, 'snooze')}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    Snooze
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleAction(reminder.id, 'dismiss')}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
