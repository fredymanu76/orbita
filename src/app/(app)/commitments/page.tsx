'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Check, X, ArrowUpRight, ArrowDownLeft, Calendar } from 'lucide-react'
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
      toast.success('Commitment updated')
    } catch {
      toast.error('Failed to update commitment')
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

  const activeCommitments = commitments.filter(c => c.status === 'active')
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Commitments & Tasks</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track your promises and action items
        </p>
      </div>

      <Tabs defaultValue="commitments">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="commitments">
            Commitments ({activeCommitments.length + overdueCommitments.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks ({pendingTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="commitments" className="mt-4 space-y-6">
          {overdueCommitments.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-600 mb-2">
                May need attention ({overdueCommitments.length})
              </h3>
              <div className="space-y-2">
                {overdueCommitments.map(c => (
                  <CommitmentCard
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
                  <CommitmentCard
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
                  <Card key={c.id} className="opacity-60">
                    <CardContent className="py-3">
                      <p className="text-sm text-slate-500 line-through">{c.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {commitments.length === 0 && (
            <div className="text-center py-16">
              <p className="text-slate-400">No commitments tracked yet.</p>
              <p className="text-sm text-slate-300 mt-1">
                Capture conversations and we&apos;ll detect promises automatically.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          {sortedTasks.length > 0 ? (
            <div className="space-y-2">
              {sortedTasks.map(task => (
                <Card key={task.id}>
                  <CardContent className="py-3">
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
                  </CardContent>
                </Card>
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
                  <Card key={task.id} className="opacity-60">
                    <CardContent className="py-3">
                      <p className="text-sm text-slate-500 line-through">{task.title}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CommitmentCard({
  commitment,
  onComplete,
  onCancel,
  overdue = false,
}: {
  commitment: Commitment
  onComplete: () => void
  onCancel: () => void
  overdue?: boolean
}) {
  return (
    <Card className={overdue ? 'border-red-200 bg-red-50/30' : ''}>
      <CardContent className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {commitment.direction === 'outgoing' ? (
                <ArrowUpRight className="h-4 w-4 text-blue-500 flex-shrink-0" />
              ) : (
                <ArrowDownLeft className="h-4 w-4 text-green-500 flex-shrink-0" />
              )}
              <p className="text-sm text-slate-800">{commitment.description}</p>
            </div>
            <div className="flex items-center gap-2 ml-6">
              {commitment.person && (
                <Badge variant="outline" className="text-xs">
                  {(commitment.person as { name: string }).name}
                </Badge>
              )}
              {commitment.due_date && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(commitment.due_date), 'MMM d')}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onComplete}>
              <Check className="h-3.5 w-3.5 text-green-600" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
              <X className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
