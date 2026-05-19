'use client'

import { useEffect, useState, useCallback } from 'react'
import { LifeMap } from '@/components/self-model/life-map'
import { PeopleOrbit } from '@/components/self-model/people-orbit'
import { LearningCardsSection } from '@/components/self-model/learning-cards-section'
import { ReflectionsSection } from '@/components/self-model/reflections-section'
import { QuestionCard } from '@/components/self-model/question-card'
import { SupportSettings } from '@/components/self-model/support-settings'
import { PersonaSelector } from '@/components/self-model/persona-selector'
import type { UserLifeProfile, UserPattern, UserState, ReflectionMemory, OrbitaQuestion, PersonaMode } from '@/lib/types'

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

export default function MePage() {
  const [profile, setProfile] = useState<UserLifeProfile | null>(null)
  const [patterns, setPatterns] = useState<UserPattern[]>([])
  const [state, setState] = useState<UserState>('stable')
  const [reflections, setReflections] = useState<ReflectionMemory[]>([])
  const [questions, setQuestions] = useState<OrbitaQuestion[]>([])
  const [orbit, setOrbit] = useState<OrbitPerson[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, patternsRes, stateRes, reflectionsRes, questionsRes, orbitRes] = await Promise.all([
        fetch('/api/self-model/profile'),
        fetch('/api/self-model/patterns'),
        fetch('/api/self-model/state'),
        fetch('/api/self-model/reflections'),
        fetch('/api/self-model/questions'),
        fetch('/api/self-model/people-orbit'),
      ])

      if (profileRes.ok) {
        const data = await profileRes.json()
        setProfile(data.profile)
      }
      if (patternsRes.ok) {
        const data = await patternsRes.json()
        setPatterns(data.patterns || [])
      }
      if (stateRes.ok) {
        const data = await stateRes.json()
        setState(data.state || 'stable')
      }
      if (reflectionsRes.ok) {
        const data = await reflectionsRes.json()
        setReflections(data.reflections || [])
      }
      if (questionsRes.ok) {
        const data = await questionsRes.json()
        setQuestions(data.questions || [])
      }
      if (orbitRes.ok) {
        const data = await orbitRes.json()
        setOrbit(data.orbit || [])
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handlePatternAction(id: string, action: 'accepted' | 'dismissed' | 'corrected', correction?: string) {
    await fetch(`/api/self-model/patterns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, correction }),
    })
    setPatterns(prev => prev.map(p => {
      if (p.id === id) {
        if (action === 'dismissed') return { ...p, status: 'dismissed' as const, user_response: 'dismissed' as const }
        if (action === 'accepted') return { ...p, status: 'confirmed' as const, user_response: 'accepted' as const }
        if (action === 'corrected') return { ...p, status: 'corrected' as const, user_response: 'corrected' as const, user_correction: correction || null }
      }
      return p
    }))
  }

  async function handleReflectionRemove(id: string) {
    // Deactivate the reflection by updating via a pattern PATCH (reuse support-needs endpoint shape)
    // For now, just remove from UI — in production would need a dedicated endpoint
    setReflections(prev => prev.filter(r => r.id !== id))
  }

  async function handleQuestionAnswer(id: string, answer: string) {
    await fetch(`/api/self-model/questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'answered', answer }),
    })
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  async function handleQuestionDismiss(id: string) {
    await fetch(`/api/self-model/questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismissed' }),
    })
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  async function handlePersonaSelect(persona: PersonaMode) {
    await fetch('/api/self-model/persona', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona }),
    })
    setProfile(prev => prev ? { ...prev, active_persona: persona, persona_source: 'user_confirmed' } : prev)
  }

  async function handleSupportStyleSave(style: Record<string, unknown>) {
    // Would update via a dedicated endpoint; for now, just local state
    setProfile(prev => prev ? { ...prev, support_style: style as UserLifeProfile['support_style'] } : prev)
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 px-1">
        <div className="h-6 bg-slate-100/60 rounded w-16 animate-pulse" />
        <div className="h-32 bg-slate-50/60 rounded-xl animate-pulse" />
        <div className="h-48 bg-slate-50/60 rounded-xl animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-50/60 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-1">
      <h1 className="text-2xl font-semibold text-slate-800">Me</h1>

      {/* Your Life Map */}
      <LifeMap profile={profile} state={state} />

      {/* People Orbit */}
      <PeopleOrbit orbit={orbit} />

      {/* Your Patterns */}
      <LearningCardsSection
        patterns={patterns}
        onAccept={(id) => handlePatternAction(id, 'accepted')}
        onDismiss={(id) => handlePatternAction(id, 'dismissed')}
        onCorrect={(id, correction) => handlePatternAction(id, 'corrected', correction)}
      />

      {/* What You've Shared */}
      <ReflectionsSection
        reflections={reflections}
        onRemove={handleReflectionRemove}
      />

      {/* Questions for You */}
      {questions.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-3">Questions for You</h2>
          <div className="space-y-2">
            {questions.map(q => (
              <QuestionCard
                key={q.id}
                id={q.id}
                question={q.question}
                reason={q.reason}
                onAnswer={handleQuestionAnswer}
                onDismiss={handleQuestionDismiss}
              />
            ))}
          </div>
        </div>
      )}

      {/* Persona selector */}
      <PersonaSelector
        current={profile?.active_persona || null}
        onSelect={handlePersonaSelect}
      />

      {/* How Orbita Supports You */}
      <SupportSettings
        profile={profile}
        onSave={handleSupportStyleSave}
      />
    </div>
  )
}
