'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CommitmentCard as VisualCommitmentCard } from '@/components/cards/commitment-card'
import {
  Check,
  Calendar,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { Commitment, Task } from '@/lib/types'
import Link from 'next/link'

export default function CommitmentsPage() {
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    setLoading(true)
    try {
      const [commitmentsRes, tasksRes] = await Promise.all([
        fetch('/api/commitments'),
        fetch('/api/tasks'),
      ])
      const commitmentsData = await commitmentsRes.json()
      const tasksData = await tasksRes.json()
      setCommitments(commitmentsData.commitments || [])
      setTasks(tasksData.tasks || [])
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  async function updateCommitmentStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/commitments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      fetchData()
      toast.success('Promise updated')
    } catch {
      toast.error('Failed to update promise')
    }
  }

  async function updateTaskStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      fetchData()
      toast.success('Task updated')
    } catch {
      toast.error('Failed to update task')
    }
  }

  const activeCommitments = commitments.filter(c => c.status === 'active' && !(c.due_date && new Date(c.due_date) < new Date()))
  const overdueCommitments = commitments.filter(c => c.status === 'overdue' || (c.status === 'active' && c.due_date && new Date(c.due_date) < new Date()))
  const completedCommitments = commitments.filter(c => c.status === 'completed')

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
  const sortedTasks = [...pendingTasks].sort((a, b) =>
    (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
  )

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-blue-50 text-blue-700 border-blue-200',
    low: 'bg-slate-50 text-slate-600 border-slate-200',
  }

  const priorityBorder: Record<string, string> = {
    urgent: 'border-l-red-400',
    high: 'border-l-orange-400',
    medium: 'border-l-blue-300',
    low: 'border-l-slate-200',
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-7 bg-slate-100/60 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-50/60 rounded-xl animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-50/60 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Promises & Tasks</h1>
        <p className="text-sm text-slate-500 mt-1">
          Things you said you&apos;d do, and things to get done
        </p>
      </div>

      {/* Overview stat cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <div className="rounded-xl bg-blue-50 p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-bold text-blue-700">{activeCommitments.length + pendingTasks.length}</p>
            <p className="text-[10px] sm:text-xs text-blue-500">Active</p>
          </div>
        </div>
        <div className="rounded-xl bg-red-50 p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-bold text-red-700">{overdueCommitments.length}</p>
            <p className="text-[10px] sm:text-xs text-red-500">Overdue</p>
          </div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-bold text-emerald-700">{completedCommitments.length + completedTasks.length}</p>
            <p className="text-[10px] sm:text-xs text-emerald-500">Done</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="commitments">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="commitments">
            Promises ({activeCommitments.length + overdueCommitments.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks ({pendingTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="commitments" className="mt-4 space-y-6">
          {overdueCommitments.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                May need attention ({overdueCommitments.length})
              </h3>
              <div className="space-y-2">
                {overdueCommitments.map(c => (
                  <VisualCommitmentCard
                    key={c.id}
                    commitment={c}
                    onComplete={() => updateCommitmentStatus(c.id, 'completed')}
                    onCancel={() => updateCommitmentStatus(c.id, 'cancelled')}
                    overdue
                  />
                ))}
              </div>
            </div>
          )}

          {activeCommitments.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 mb-2">
                Active ({activeCommitments.length})
              </h3>
              <div className="space-y-2">
                {activeCommitments.map(c => (
                  <VisualCommitmentCard
                    key={c.id}
                    commitment={c}
                    onComplete={() => updateCommitmentStatus(c.id, 'completed')}
                    onCancel={() => updateCommitmentStatus(c.id, 'cancelled')}
                  />
                ))}
              </div>
            </div>
          )}

          {completedCommitments.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">
                Completed ({completedCommitments.length})
              </h3>
              <div className="space-y-2">
                {completedCommitments.slice(0, 5).map(c => (
                  <div key={c.id} className="rounded-xl bg-white/60 px-4 py-3 opacity-60">
                    <p className="text-sm text-slate-500 line-through">{c.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {commitments.length === 0 && (
            <div className="text-center py-16">
              <p className="text-slate-400">No promises tracked yet.</p>
              <p className="text-sm text-slate-300 mt-1">
                Capture conversations and we&apos;ll spot promises automatically.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          {sortedTasks.length > 0 ? (
            <div className="space-y-2">
              {sortedTasks.map(task => (
                <div key={task.id} className={`rounded-xl bg-white/90 border-l-[3px] ${priorityBorder[task.priority] || 'border-l-slate-200'} px-4 py-3`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => updateTaskStatus(task.id, 'completed')}
                        className="flex-shrink-0 h-5 w-5 rounded border border-slate-300 hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center"
                      >
                        {task.status === 'completed' && <Check className="h-3 w-3 text-blue-600" />}
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{task.title}</p>
                        {task.due_date && (
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(task.due_date), 'MMM d')}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs ${priorityColors[task.priority] || ''}`}>
                      {task.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-slate-400">No pending tasks.</p>
              <p className="text-sm text-slate-300 mt-1">
                <Link href="/capture" className="text-blue-500 hover:underline">
                  Capture a task
                </Link>
                {' '}or let us extract them from your notes.
              </p>
            </div>
          )}

          {completedTasks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">
                Completed ({completedTasks.length})
              </h3>
              <div className="space-y-2">
                {completedTasks.slice(0, 5).map(task => (
                  <div key={task.id} className="rounded-xl bg-white/60 px-4 py-3 opacity-60">
                    <p className="text-sm text-slate-500 line-through">{task.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
