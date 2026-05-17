'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Watch, Smartphone, Activity } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const WEARABLE_PROVIDERS = [
  { id: 'apple_health', name: 'Apple Health', icon: Smartphone },
  { id: 'fitbit', name: 'Fitbit', icon: Watch },
  { id: 'garmin', name: 'Garmin', icon: Activity },
  { id: 'whoop', name: 'WHOOP', icon: Activity },
]

export default function SettingsPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
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
}
