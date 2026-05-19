'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Watch, Smartphone, Activity, Bell, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/notifications/register-sw'

const WEARABLE_PROVIDERS = [
  { id: 'apple_health', name: 'Apple Health', icon: Smartphone },
  { id: 'fitbit', name: 'Fitbit', icon: Watch },
  { id: 'garmin', name: 'Garmin', icon: Activity },
  { id: 'whoop', name: 'WHOOP', icon: Activity },
]

interface NotificationPrefs {
  email_daily_brief: boolean
  email_follow_up_alerts: boolean
  push_forgotten_intents: boolean
  push_overdue_follow_ups: boolean
  push_thread_decay_alerts: boolean
}

export default function SettingsPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    email_daily_brief: true,
    email_follow_up_alerts: true,
    push_forgotten_intents: true,
    push_overdue_follow_ups: true,
    push_thread_decay_alerts: false,
  })
  const supabase = createClient()

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email || '')
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        if (profile) {
          setFullName(profile.full_name || '')
        }

        // Load notification preferences
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single()
        if (prefs) {
          setNotifPrefs({
            email_daily_brief: prefs.email_daily_brief,
            email_follow_up_alerts: prefs.email_follow_up_alerts,
            push_forgotten_intents: prefs.push_forgotten_intents,
            push_overdue_follow_ups: prefs.push_overdue_follow_ups,
            push_thread_decay_alerts: prefs.push_thread_decay_alerts,
          })
        }

        // Check push subscription state
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const reg = await navigator.serviceWorker.getRegistration()
          if (reg) {
            const sub = await reg.pushManager.getSubscription()
            setPushEnabled(!!sub)
          }
        }
      }
    }
    loadProfile()
  }, [supabase])

  async function handleSave() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq('id', user.id)

      if (error) throw error
      toast.success('Profile updated')
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled className="bg-slate-50" />
          </div>
          <Button onClick={handleSave} disabled={loading} size="sm">
            {loading ? 'Saving...' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
          <CardDescription>How Orbita resurfaces forgotten context</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" /> Email
            </h4>
            <NotifToggle
              label="Daily continuity brief"
              description="Morning email with your continuity state and brief"
              checked={notifPrefs.email_daily_brief}
              onChange={(v) => handleNotifChange('email_daily_brief', v)}
            />
            <NotifToggle
              label="Follow-up alerts"
              description="Email when follow-ups become overdue"
              checked={notifPrefs.email_follow_up_alerts}
              onChange={(v) => handleNotifChange('email_follow_up_alerts', v)}
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Bell className="h-3.5 w-3.5" /> Push Notifications
            </h4>
            {!pushEnabled ? (
              <div className="p-3 rounded-lg bg-slate-50 text-center">
                <p className="text-xs text-slate-500 mb-2">Enable push notifications to receive real-time alerts</p>
                <Button size="sm" variant="outline" onClick={handleEnablePush}>
                  Enable push notifications
                </Button>
              </div>
            ) : (
              <>
                <NotifToggle
                  label="Forgotten intent alerts"
                  description="When the system predicts you've forgotten something"
                  checked={notifPrefs.push_forgotten_intents}
                  onChange={(v) => handleNotifChange('push_forgotten_intents', v)}
                />
                <NotifToggle
                  label="Overdue follow-ups"
                  description="When follow-ups pass their expected window"
                  checked={notifPrefs.push_overdue_follow_ups}
                  onChange={(v) => handleNotifChange('push_overdue_follow_ups', v)}
                />
                <NotifToggle
                  label="Thread decay alerts"
                  description="When important threads are fading from retention"
                  checked={notifPrefs.push_thread_decay_alerts}
                  onChange={(v) => handleNotifChange('push_thread_decay_alerts', v)}
                />
                <button
                  onClick={handleDisablePush}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  Disable push notifications
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected Devices</CardTitle>
          <CardDescription>Wearable integrations for deeper continuity insights</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {WEARABLE_PROVIDERS.map(provider => (
            <div key={provider.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
              <div className="flex items-center gap-3">
                <provider.icon className="h-5 w-5 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{provider.name}</span>
              </div>
              <Badge variant="outline" className="text-xs bg-slate-50 text-slate-400 border-slate-200">
                Coming Soon
              </Badge>
            </div>
          ))}
          <p className="text-xs text-slate-400 pt-2">
            Wearable data will enable stress detection, sleep-informed briefings, and richer continuity modelling.
          </p>
        </CardContent>
      </Card>
    </div>
  )

  async function handleNotifChange(key: keyof NotificationPrefs, value: boolean) {
    setNotifPrefs(prev => ({ ...prev, [key]: value }))
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        [key]: value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
  }

  async function handleEnablePush() {
    const subscription = await subscribeToPush()
    if (subscription) {
      setPushEnabled(true)
      toast.success('Push notifications enabled')
    } else {
      toast.error('Could not enable push notifications')
    }
  }

  async function handleDisablePush() {
    await unsubscribeFromPush()
    setPushEnabled(false)
    toast.success('Push notifications disabled')
  }
}

function NotifToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
