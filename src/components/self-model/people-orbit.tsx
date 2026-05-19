'use client'

interface OrbitPerson {
  name: string
  person_id: string | null
  gravity_score: number
  emotional_weight: number
  dependency_score: number
  interaction_frequency: number
  avoidance_signal: number
  orbit: 'inner' | 'middle' | 'outer'
}

interface PeopleOrbitProps {
  orbit: OrbitPerson[]
}

export function PeopleOrbit({ orbit }: PeopleOrbitProps) {
  const inner = orbit.filter(p => p.orbit === 'inner')
  const middle = orbit.filter(p => p.orbit === 'middle')
  const outer = orbit.filter(p => p.orbit === 'outer')

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-slate-700">People Orbit</h2>

      {orbit.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">
          As you mention people, Orbita will learn who matters most.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Inner orbit */}
          {inner.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Closest</p>
              <div className="flex flex-wrap gap-2">
                {inner.map(person => (
                  <PersonBubble key={person.name} person={person} size="lg" />
                ))}
              </div>
            </div>
          )}

          {/* Middle orbit */}
          {middle.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Regular</p>
              <div className="flex flex-wrap gap-1.5">
                {middle.map(person => (
                  <PersonBubble key={person.name} person={person} size="md" />
                ))}
              </div>
            </div>
          )}

          {/* Outer orbit */}
          {outer.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Wider circle</p>
              <div className="flex flex-wrap gap-1">
                {outer.map(person => (
                  <PersonBubble key={person.name} person={person} size="sm" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PersonBubble({ person, size }: { person: OrbitPerson; size: 'lg' | 'md' | 'sm' }) {
  const sizeClasses = {
    lg: 'px-3 py-1.5 text-xs',
    md: 'px-2.5 py-1 text-[11px]',
    sm: 'px-2 py-0.5 text-[10px]',
  }

  const hasStress = person.emotional_weight > 0.5 && person.avoidance_signal > 0.3
  const hasAvoidance = person.avoidance_signal > 0.5

  const borderColor = hasStress
    ? 'border-red-200 bg-red-50/40'
    : hasAvoidance
      ? 'border-amber-200 bg-amber-50/40'
      : 'border-slate-200 bg-white/80'

  return (
    <div className={`rounded-full border font-medium text-slate-600 ${sizeClasses[size]} ${borderColor}`}>
      {person.name}
      {hasAvoidance && <span className="ml-1 text-amber-400" title="May need attention">*</span>}
    </div>
  )
}
