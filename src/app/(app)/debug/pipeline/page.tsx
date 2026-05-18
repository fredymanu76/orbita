'use client'

import { useEffect, useState } from 'react'

interface PipelineData {
  schema: Record<string, boolean>
  stats: {
    total_memories: number
    processed: number
    pending: number
    failed: number
    threads: number
    people: number
    commitments: number
    follow_ups: number
  }
  memories: {
    id: string
    type: string
    content_preview: string
    summary: string | null
    processed: boolean
    processing_error: string | null
    extraction_confidence: number | null
    has_thread: boolean
    created_at: string
    updated_at: string
  }[]
}

export default function DebugPipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/debug/pipeline')
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const reprocess = async (force: boolean = false) => {
    setReprocessing(true)
    setReprocessResult(null)
    try {
      const res = await fetch('/api/memories/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const json = await res.json()
      setReprocessResult(json.message || JSON.stringify(json))
      await fetchData()
    } catch (err) {
      setReprocessResult(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setReprocessing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Pipeline Debug</h1>
        <p className="text-slate-500">Loading pipeline status...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Pipeline Debug</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">Error loading pipeline status</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const allSchemaOk = Object.values(data.schema).every(v => v)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pipeline Debug</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => reprocess(false)}
            disabled={reprocessing}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md disabled:opacity-50 transition-colors"
          >
            {reprocessing ? 'Reprocessing...' : 'Reprocess Pending'}
          </button>
          <button
            onClick={() => reprocess(true)}
            disabled={reprocessing}
            className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded-md disabled:opacity-50 transition-colors"
          >
            Force Reprocess All
          </button>
        </div>
      </div>

      {reprocessResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-blue-700 text-sm">{reprocessResult}</p>
        </div>
      )}

      {/* Schema Status */}
      <div className={`rounded-lg border p-4 ${allSchemaOk ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <h2 className="font-semibold mb-3">
          {allSchemaOk ? 'Schema: All migrations applied' : 'Schema: MIGRATIONS MISSING'}
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(data.schema).map(([key, ok]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={ok ? 'text-green-600' : 'text-red-600'}>
                {ok ? '\u2713' : '\u2717'}
              </span>
              <span className={ok ? 'text-green-800' : 'text-red-800'}>
                {key.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
        {!allSchemaOk && (
          <p className="mt-3 text-sm text-red-700">
            Apply migrations 013-017 in the Supabase SQL Editor before reprocessing.
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Memories" value={data.stats.total_memories} />
        <StatCard label="Processed" value={data.stats.processed} color={data.stats.processed > 0 ? 'green' : 'slate'} />
        <StatCard label="Pending" value={data.stats.pending} color={data.stats.pending > 0 ? 'amber' : 'slate'} />
        <StatCard label="Failed" value={data.stats.failed} color={data.stats.failed > 0 ? 'red' : 'slate'} />
        <StatCard label="Threads" value={data.stats.threads} />
        <StatCard label="People" value={data.stats.people} />
        <StatCard label="Commitments" value={data.stats.commitments} />
        <StatCard label="Follow-ups" value={data.stats.follow_ups} />
      </div>

      {/* Per-Memory Status */}
      <div>
        <h2 className="font-semibold mb-3">Memory Processing Status</h2>
        <div className="space-y-2">
          {data.memories.map(m => (
            <div
              key={m.id}
              className={`rounded-lg border p-3 text-sm ${
                m.processed
                  ? 'bg-green-50 border-green-200'
                  : m.processing_error
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      m.processed
                        ? 'bg-green-100 text-green-700'
                        : m.processing_error
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}>
                      {m.processed ? 'PROCESSED' : m.processing_error ? 'FAILED' : 'PENDING'}
                    </span>
                    <span className="text-xs text-slate-500">{m.type}</span>
                    {m.extraction_confidence !== null && (
                      <span className="text-xs text-slate-500">
                        conf: {(m.extraction_confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {m.has_thread && (
                      <span className="text-xs text-blue-600">threaded</span>
                    )}
                  </div>
                  <p className="text-slate-700 truncate">{m.content_preview}</p>
                  {m.summary && (
                    <p className="text-slate-500 text-xs mt-1 truncate">Summary: {m.summary}</p>
                  )}
                  {m.processing_error && m.processing_error.startsWith('TRACE:') ? (
                    <PipelineTrace trace={m.processing_error.slice(6)} />
                  ) : m.processing_error ? (
                    <p className="text-red-600 text-xs mt-1 break-all">Error: {m.processing_error}</p>
                  ) : null}
                </div>
                <div className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(m.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PipelineTrace({ trace }: { trace: string }) {
  try {
    const steps = JSON.parse(trace) as { step: string; status: string; detail?: string }[]
    return (
      <div className="mt-2 space-y-1">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={`font-mono ${s.status === 'ok' ? 'text-green-600' : s.status === 'skipped' ? 'text-amber-600' : 'text-red-600'}`}>
              {s.status === 'ok' ? 'OK' : s.status === 'skipped' ? 'SKIP' : 'ERR'}
            </span>
            <span className="font-medium text-slate-600 min-w-[120px]">{s.step}</span>
            {s.detail && <span className="text-slate-500 break-all">{s.detail}</span>}
          </div>
        ))}
      </div>
    )
  } catch {
    return <p className="text-slate-500 text-xs mt-1">{trace}</p>
  }
}

function StatCard({ label, value, color = 'slate' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    slate: 'bg-white border-slate-200',
    green: 'bg-green-50 border-green-200',
    amber: 'bg-amber-50 border-amber-200',
    red: 'bg-red-50 border-red-200',
  }

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color] || colorMap.slate}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}
