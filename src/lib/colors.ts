import type { ThreadType, ThreadStatus, ContinuityState } from './types'

export const THREAD_TYPE_COLORS: Record<ThreadType, { border: string; bg: string; text: string; fill: string }> = {
  relationship: { border: 'border-l-blue-400', bg: 'bg-blue-50', text: 'text-blue-600', fill: '#60a5fa' },
  project: { border: 'border-l-purple-400', bg: 'bg-purple-50', text: 'text-purple-600', fill: '#a78bfa' },
  obligation: { border: 'border-l-amber-400', bg: 'bg-amber-50', text: 'text-amber-600', fill: '#fbbf24' },
  concern: { border: 'border-l-rose-400', bg: 'bg-rose-50', text: 'text-rose-600', fill: '#fb7185' },
  planning: { border: 'border-l-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-600', fill: '#818cf8' },
  idea: { border: 'border-l-cyan-400', bg: 'bg-cyan-50', text: 'text-cyan-600', fill: '#22d3ee' },
  emotional: { border: 'border-l-pink-400', bg: 'bg-pink-50', text: 'text-pink-600', fill: '#f472b6' },
  admin: { border: 'border-l-slate-400', bg: 'bg-slate-50', text: 'text-slate-600', fill: '#94a3b8' },
  recurring: { border: 'border-l-teal-400', bg: 'bg-teal-50', text: 'text-teal-600', fill: '#2dd4bf' },
  general: { border: 'border-l-gray-300', bg: 'bg-gray-50', text: 'text-gray-500', fill: '#9ca3af' },
}

export const THREAD_TYPE_LABELS: Record<string, string> = {
  relationship: 'Relationship',
  project: 'Project',
  obligation: 'Responsibility',
  concern: 'Worry',
  planning: 'Planning',
  idea: 'Idea',
  emotional: 'Feelings',
  admin: 'Life admin',
  recurring: 'Routine',
  general: 'General',
}

export const THREAD_STATUS_COLORS: Record<ThreadStatus, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: '#10b981' },
  unresolved: { bg: 'bg-orange-50', text: 'text-orange-600', dot: '#f97316' },
  paused: { bg: 'bg-blue-50', text: 'text-blue-600', dot: '#3b82f6' },
  completed: { bg: 'bg-slate-50', text: 'text-slate-400', dot: '#94a3b8' },
  cooling: { bg: 'bg-sky-50', text: 'text-sky-500', dot: '#0ea5e9' },
  forgotten_risk: { bg: 'bg-red-50', text: 'text-red-500', dot: '#ef4444' },
  emotionally_sensitive: { bg: 'bg-pink-50', text: 'text-pink-600', dot: '#ec4899' },
  time_sensitive: { bg: 'bg-amber-50', text: 'text-amber-600', dot: '#d97706' },
}

export const THREAD_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  unresolved: 'Needs closure',
  paused: 'On hold',
  completed: 'Done',
  cooling: 'Wrapping up',
  forgotten_risk: 'Slipping',
  emotionally_sensitive: 'Sensitive',
  time_sensitive: 'Time-sensitive',
}

export const CONTINUITY_STATE_META: Record<ContinuityState, {
  label: string
  description: string
  color: string
  bg: string
  fill: string
  ringColor: string
}> = {
  stable: {
    label: 'Balanced',
    description: 'You\'re on track — everything is in good shape',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    fill: '#10b981',
    ringColor: '#34d399',
  },
  mild_fragmentation: {
    label: 'Slightly scattered',
    description: 'A few things could use your attention',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    fill: '#3b82f6',
    ringColor: '#60a5fa',
  },
  overload_emerging: {
    label: 'Getting full',
    description: 'Your plate is filling up — maybe pick one thing to close',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    fill: '#f59e0b',
    ringColor: '#fbbf24',
  },
  high_discontinuity: {
    label: 'Drifting',
    description: 'Some things are slipping — worth checking in',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    fill: '#f97316',
    ringColor: '#fb923c',
  },
  critical: {
    label: 'Overwhelmed',
    description: 'There\'s a lot going on — consider simplifying',
    color: 'text-red-600',
    bg: 'bg-red-50',
    fill: '#ef4444',
    ringColor: '#f87171',
  },
}
