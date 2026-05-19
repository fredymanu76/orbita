'use client'

import { useEffect, useState, useCallback } from 'react'
import { QuickCaptureBar } from '@/components/capture/quick-capture-bar'
import { ThreadCard } from '@/components/cards/thread-card'
import { InsightCard } from '@/components/cards/insight-card'
import { AttentionCard } from '@/components/cards/attention-card'
import { RelationshipCard } from '@/components/cards/relationship-card'
import { MorningGreeting } from '@/components/morning/morning-greeting'
import { MorningSection } from '@/components/morning/morning-section'
import { MorningSummaryBar } from '@/components/morning/morning-summary-bar'
import { QuestionCard } from '@/components/self-model/question-card'
import {
  CheckCircle2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { Commitment, ContinuityState, CognitiveLoadReading, Person, Thread, UserSupportNeed, OrbitaQuestion, UserState } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

export default function DashboardPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [continuityState, setContinuityState] = useState<ContinuityState>('stable')
  const [continuityScore, setContinuityScore] = useState(0)
  const [cognitiveLoadReading, setCognitiveLoadReading] = useState<CognitiveLoadReading | null>(null)
  const [peopleNeedingFollowUp, setPeopleNeedingFollowUp] = useState<(Person & { days_since: number })[]>([])
  const [loading, setLoading] = useState(true)

  // Self-model morning data
  const [morningGreeting, setMorningGreeting] = useState<string>('')
  const [morningSections, setMorningSections] = useState<{
    people_relying: UserSupportNeed[]
    may_slip: UserSupportNeed[]
    one_to_close: UserSupportNeed | null
    pattern_noticed: UserSupportNeed | null
    question: OrbitaQuestion | null
  }>({ people_relying: [], may_slip: [], one_to_close: null, pattern_noticed: null, question: null })
  const [userState, setUserState] = useState<UserState>('stable')
  const [showDetails, setShowDetails] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const [threadsRes, commitmentsRes, continuityRes, loadRes, peopleRes, morningRes] = await Promise.all([
        fetch('/api/threads?include_people=true'),
        fetch('/api/commitments?status=active'),
        fetch('/api/continuity'),
        fetch('/api/cognitive-load'),
        fetch('/api/people'),
        fetch('/api/self-model/morning'),
      ])

      if (threadsRes.ok) {
        const data = await threadsRes.json()
        setThreads((data.threads || []).slice(0, 8))
      }
      if (commitmentsRes.ok) {
        const data = await commitmentsRes.json()
        setCommitments(data.commitments || [])
      }
      if (continuityRes.ok) {
        const data = await continuityRes.json()
        setContinuityState(data.state)
        setContinuityScore(data.score ?? 0)
      }
      if (loadRes.ok) {
        const data = await loadRes.json()
        setCognitiveLoadReading(data.reading ?? null)
      }
      if (peopleRes.ok) {
        const data = await peopleRes.json()
        const now = new Date()
        const sorted = (data.people || [])
          .filter((p: Person) => p.last_mentioned_at)
          .map((p: Person) => ({
            ...p,
            days_since: Math.floor((now.getTime() - new Date(p.last_mentioned_at!).getTime()) / (1000 * 60 * 60 * 24)),
          }))
          .filter((p: Person & { days_since: number }) => p.days_since > 5)
          .sort((a: { days_since: number }, b: { days_since: number }) => b.days_since - a.days_since)
          .slice(0, 4)
        setPeopleNeedingFollowUp(sorted)
      }
      if (morningRes.ok) {
        const data = await morningRes.json()
        setMorningGreeting(data.greeting || '')
        setMorningSections(data.sections || { people_relying: [], may_slip: [], one_to_close: null, pattern_noticed: null, question: null })
        setUserState(data.state || 'stable')
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  async function handleInsightAction(id: string, action: 'accepted' | 'dismissed' | 'corrected', correction?: string) {
    await fetch(`/api/self-model/support-needs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, correction }),
    })
    // Remove from UI
    setMorningSections(prev => ({
      ...prev,
      people_relying: prev.people_relying.filter(n => n.id !== id),
      may_slip: prev.may_slip.filter(n => n.id !== id),
      one_to_close: prev.one_to_close?.id === id ? null : prev.one_to_close,
      pattern_noticed: prev.pattern_noticed?.id === id ? null : prev.pattern_noticed,
    }))
  }

  async function handleQuestionAnswer(id: string, answer: string) {
    await fetch(`/api/self-model/questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'answered', answer }),
    })
    setMorningSections(prev => ({ ...prev, question: null }))
  }

  async function handleQuestionDismiss(id: string) {
    await fetch(`/api/self-model/questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismissed' }),
    })
    setMorningSections(prev => ({ ...prev, question: null }))
  }

  // Build legacy surfaced items
  interface SurfacedItem {
    id: string
    type: string
    title: string
    reasons: string[]
    link: string
    severity: 'high' | 'medium' | 'low'
  }

  const surfacedItems: SurfacedItem[] = []

  for (const c of commitments) {
    if (c.due_date && c.due_date < todayStr) {
      const daysOverdue = Math.floor((Date.now() - new Date(c.due_date).getTime()) / 86400000)
      surfacedItems.push({
        id: `commitment-${c.id}`,
        type: 'commitment_overdue',
        title: c.description,
        reasons: [
          `Due date was ${format(new Date(c.due_date), 'MMM d')} (${daysOverdue}d overdue)`,
          `Status: active, not yet resolved`,
          c.person ? `Involves ${(c.person as { name: string }).name}` : 'No person linked',
        ],
        link: c.source_memory_id ? `/continuity/threads/${c.source_memory_id}` : '#',
        severity: daysOverdue > 7 ? 'high' : 'medium',
      })
    } else if (c.due_date === todayStr) {
      surfacedItems.push({
        id: `commitment-today-${c.id}`,
        type: 'commitment_due_today',
        title: c.description,
        reasons: [
          `Due today (${format(new Date(), 'MMM d')})`,
          c.person ? `Involves ${(c.person as { name: string }).name}` : 'No person linked',
        ],
        link: '#',
        severity: 'medium',
      })
    }
  }

  for (const t of threads) {
    if (t.status === 'time_sensitive') {
      surfacedItems.push({
        id: `thread-ts-${t.id}`,
        type: 'thread_time_sensitive',
        title: t.title,
        reasons: [
          'Has a promise due within 48 hours',
          `${t.commitment_count} open promise${t.commitment_count === 1 ? '' : 's'}`,
          `Last activity: ${formatDistanceToNow(new Date(t.last_activity_at), { addSuffix: true })}`,
          `Flagged as time-sensitive`,
        ],
        link: `/continuity/threads/${t.id}`,
        severity: 'high',
      })
    }
    if (t.status === 'forgotten_risk') {
      surfacedItems.push({
        id: `thread-fr-${t.id}`,
        type: 'thread_forgotten_risk',
        title: t.title,
        reasons: [
          `Freshness: ${Math.round(t.continuity_retention * 100)}% — this is slipping from memory`,
          `Last activity: ${formatDistanceToNow(new Date(t.last_activity_at), { addSuffix: true })}`,
          `Flagged as slipping because it hasn't been touched recently`,
        ],
        link: `/continuity/threads/${t.id}`,
        severity: 'medium',
      })
    }
  }

  const activeThreads = threads.filter(t => !['completed', 'paused'].includes(t.status))
  const unresolvedCount = threads.filter(t => ['unresolved', 'forgotten_risk', 'time_sensitive'].includes(t.status)).length

  const hasMorningContent = morningSections.people_relying.length > 0 ||
    morningSections.may_slip.length > 0 ||
    morningSections.one_to_close ||
    morningSections.pattern_noticed ||
    morningSections.question

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 px-1">
        <div className="space-y-1">
          <div className="h-7 bg-slate-100/60 rounded w-64 animate-pulse" />
          <div className="h-4 bg-slate-50 rounded w-28 animate-pulse" />
        </div>
        <div className="h-12 bg-slate-50 rounded-xl animate-pulse" />
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
      {/* State-aware greeting */}
      <MorningGreeting greeting={morningGreeting || `Good ${getTimeOfDay()}`} />

      {/* Quick capture */}
      <QuickCaptureBar />

      {/* Compact summary bar (replaces ContinuityStateHero) */}
      <MorningSummaryBar
        activeThreads={activeThreads.length}
        unresolvedCount={unresolvedCount}
        continuityScore={continuityScore}
      />

      {/* Morning sections — InsightCards */}
      {hasMorningContent && (
        <div className="space-y-4">
          {morningSections.people_relying.length > 0 && (
            <MorningSection label="People counting on you">
              {morningSections.people_relying.map(need => (
                <InsightCard
                  key={need.id}
                  id={need.id}
                  title={need.title}
                  whyItMatters={need.why_it_matters}
                  confidence={need.confidence}
                  suggestedAction={need.suggested_action || undefined}
                  category={need.category}
                  evidenceRefs={need.evidence_refs}
                  onAccept={(id) => handleInsightAction(id, 'accepted')}
                  onDismiss={(id) => handleInsightAction(id, 'dismissed')}
                  onCorrect={(id, correction) => handleInsightAction(id, 'corrected', correction)}
                />
              ))}
            </MorningSection>
          )}

          {morningSections.may_slip.length > 0 && (
            <MorningSection label="Might slip">
              {morningSections.may_slip.map(need => (
                <InsightCard
                  key={need.id}
                  id={need.id}
                  title={need.title}
                  whyItMatters={need.why_it_matters}
                  confidence={need.confidence}
                  suggestedAction={need.suggested_action || undefined}
                  category={need.category}
                  evidenceRefs={need.evidence_refs}
                  onAccept={(id) => handleInsightAction(id, 'accepted')}
                  onDismiss={(id) => handleInsightAction(id, 'dismissed')}
                  onCorrect={(id, correction) => handleInsightAction(id, 'corrected', correction)}
                />
              ))}
            </MorningSection>
          )}

          {morningSections.one_to_close && (
            <MorningSection label="One thing to close">
              <InsightCard
                id={morningSections.one_to_close.id}
                title={morningSections.one_to_close.title}
                whyItMatters={morningSections.one_to_close.why_it_matters}
                confidence={morningSections.one_to_close.confidence}
                suggestedAction={morningSections.one_to_close.suggested_action || undefined}
                category={morningSections.one_to_close.category}
                evidenceRefs={morningSections.one_to_close.evidence_refs}
                onAccept={(id) => handleInsightAction(id, 'accepted')}
                onDismiss={(id) => handleInsightAction(id, 'dismissed')}
                onCorrect={(id, correction) => handleInsightAction(id, 'corrected', correction)}
              />
            </MorningSection>
          )}

          {morningSections.pattern_noticed && (
            <MorningSection label="Something Orbita noticed">
              <InsightCard
                id={morningSections.pattern_noticed.id}
                title={morningSections.pattern_noticed.title}
                whyItMatters={morningSections.pattern_noticed.why_it_matters}
                confidence={morningSections.pattern_noticed.confidence}
                suggestedAction={morningSections.pattern_noticed.suggested_action || undefined}
                category={morningSections.pattern_noticed.category}
                evidenceRefs={morningSections.pattern_noticed.evidence_refs}
                onAccept={(id) => handleInsightAction(id, 'accepted')}
                onDismiss={(id) => handleInsightAction(id, 'dismissed')}
                onCorrect={(id, correction) => handleInsightAction(id, 'corrected', correction)}
              />
            </MorningSection>
          )}

          {morningSections.question && (
            <QuestionCard
              id={morningSections.question.id}
              question={morningSections.question.question}
              reason={morningSections.question.reason}
              onAnswer={handleQuestionAnswer}
              onDismiss={handleQuestionDismiss}
            />
          )}
        </div>
      )}

      {/* Attention Strip (legacy — commitment overdue / time-sensitive) */}
      {surfacedItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Needs your attention</p>
          {surfacedItems.map(item => (
            <AttentionCard
              key={item.id}
              id={item.id}
              title={item.title}
              type={item.type}
              reasons={item.reasons}
              link={item.link}
              severity={item.severity}
            />
          ))}
        </div>
      )}

      {/* Active Threads */}
      {activeThreads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Open loops</p>
            <Link href="/continuity/threads">
              <span className="text-xs text-slate-400 hover:text-slate-500 cursor-pointer flex items-center gap-1">
                See all <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
          <div className="space-y-2">
            {activeThreads.slice(0, 5).map(thread => (
              <ThreadCard
                key={thread.id}
                id={thread.id}
                title={thread.title}
                threadType={thread.thread_type}
                status={thread.status}
                captureCount={thread.capture_count}
                commitmentCount={thread.commitment_count}
                lastActivityAt={thread.last_activity_at}
                continuityRetention={thread.continuity_retention}
                people={thread.people as { name: string }[] | undefined}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {/* People */}
      {peopleNeedingFollowUp.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">People</p>
          <div className="flex gap-3 mobile-scroll-x pb-1 -mx-1 px-1">
            {peopleNeedingFollowUp.map(person => (
              <RelationshipCard
                key={person.id}
                person={person}
                daysSince={person.days_since}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {/* Detailed metrics — collapsed by default */}
      <div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-500 transition-colors"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
        {showDetails && (
          <div className="mt-3 space-y-4">
            <p className="text-xs text-slate-400">
              Continuity: {Math.round(continuityScore)}% | State: {continuityState} | Cognitive load: {cognitiveLoadReading?.load_score ? Math.round(cognitiveLoadReading.load_score * 100) + '%' : 'N/A'}
            </p>
          </div>
        )}
      </div>

      {/* Clear state */}
      {activeThreads.length === 0 && surfacedItems.length === 0 && !hasMorningContent && (
        <div className="text-center py-12">
          <CheckCircle2 className="h-6 w-6 text-emerald-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">All clear. Nothing needs your attention right now.</p>
          <Link href="/capture">
            <Button variant="ghost" size="sm" className="mt-3 text-xs text-slate-400">
              Capture a thought
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function getTimeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
