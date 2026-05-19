'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import type { UserLifeProfile } from '@/lib/types'

interface SupportSettingsProps {
  profile: UserLifeProfile | null
  onSave: (style: Record<string, unknown>) => void
}

export function SupportSettings({ profile, onSave }: SupportSettingsProps) {
  const style = profile?.support_style || {
    prefers_questions: true,
    prefers_direct: false,
    morning_detail_level: 'normal',
    emotional_sensitivity: 'normal',
  }

  const [settings, setSettings] = useState({
    prefers_direct: style.prefers_direct ?? false,
    prefers_questions: style.prefers_questions ?? true,
    surface_only_urgent: false,
    help_close_loops: true,
  })

  function toggle(key: keyof typeof settings) {
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    onSave(updated)
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-slate-700 mb-3">How Orbita Supports You</h2>
      <div className="space-y-3">
        <SettingRow
          label="Be direct"
          description="Give me clear guidance instead of gentle suggestions"
          checked={settings.prefers_direct}
          onToggle={() => toggle('prefers_direct')}
        />
        <SettingRow
          label="Ask before reminding"
          description="Use questions instead of statements"
          checked={settings.prefers_questions}
          onToggle={() => toggle('prefers_questions')}
        />
        <SettingRow
          label="Surface only urgent"
          description="Only show me things that really need attention"
          checked={settings.surface_only_urgent}
          onToggle={() => toggle('surface_only_urgent')}
        />
        <SettingRow
          label="Help me close loops"
          description="Suggest easy things I can finish today"
          checked={settings.help_close_loops}
          onToggle={() => toggle('help_close_loops')}
        />
      </div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string
  description: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-white/80 border border-slate-100 px-4 py-3">
      <div>
        <p className="text-sm text-slate-700 font-medium">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </div>
  )
}
