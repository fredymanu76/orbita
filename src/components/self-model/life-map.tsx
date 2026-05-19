'use client'

import type { UserLifeProfile, UserState } from '@/lib/types'

interface LifeMapProps {
  profile: UserLifeProfile | null
  state: UserState
}

const STATE_LABELS: Record<UserState, string> = {
  stable: 'Things feel steady',
  overwhelmed: 'A lot on your plate right now',
  isolated: 'Quieter than usual',
  drifting: 'Some things may be slipping',
  in_flow: 'In a good rhythm',
  recovering: 'Things are getting better',
  stretched: 'You seem stretched right now',
}

const ROLE_COLORS: Record<string, string> = {
  parent: 'bg-blue-100 text-blue-700 border-blue-200',
  carer: 'bg-purple-100 text-purple-700 border-purple-200',
  worker: 'bg-slate-100 text-slate-700 border-slate-200',
  founder: 'bg-amber-100 text-amber-700 border-amber-200',
  faith_community: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  student: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

export function LifeMap({ profile, state }: LifeMapProps) {
  const roles = profile?.roles || []
  const areas = profile?.life_areas || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">Your Life Map</h2>
        <p className="text-xs text-slate-400 italic">{STATE_LABELS[state]}</p>
      </div>

      {/* Role bubbles */}
      {roles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {roles.map(role => (
            <div
              key={role.role}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${ROLE_COLORS[role.role] || 'bg-slate-100 text-slate-600 border-slate-200'}`}
            >
              {role.role.charAt(0).toUpperCase() + role.role.slice(1).replace('_', ' ')}
              {role.confidence >= 0.7 && (
                <span className="ml-1 text-[10px] opacity-60">{Math.round(role.confidence * 100)}%</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Life areas grid */}
      {areas.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {areas.map(area => (
            <div
              key={area.area}
              className="rounded-xl bg-white/80 border border-slate-100 px-3 py-2"
            >
              <p className="text-xs font-medium text-slate-600">{area.label}</p>
              {area.people.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {area.people.slice(0, 3).join(', ')}
                  {area.people.length > 3 && ` +${area.people.length - 3}`}
                </p>
              )}
              <div className="flex items-center gap-1 mt-1">
                <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-300 rounded-full"
                    style={{ width: `${Math.min(area.confidence * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {roles.length === 0 && areas.length === 0 && (
        <p className="text-xs text-slate-400 py-4 text-center">
          Orbita is still learning about your life. Keep capturing.
        </p>
      )}
    </div>
  )
}
