'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { THREAD_TYPE_COLORS, THREAD_STATUS_COLORS, THREAD_TYPE_LABELS, THREAD_STATUS_LABELS } from '@/lib/colors'
import type { Thread } from '@/lib/types'

interface ThreadDistributionChartProps {
  threads: Thread[]
  view: 'type' | 'status'
}

export function ThreadDistributionChart({ threads, view }: ThreadDistributionChartProps) {
  const grouped: Record<string, number> = {}
  for (const t of threads) {
    const key = view === 'type' ? t.thread_type : t.status
    grouped[key] = (grouped[key] || 0) + 1
  }

  const labelMap = view === 'type' ? THREAD_TYPE_LABELS : THREAD_STATUS_LABELS
  const data = Object.entries(grouped).map(([key, value]) => ({
    name: key,
    label: labelMap[key] || key.replace(/_/g, ' '),
    value,
  }))

  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-white/80 border border-slate-100 p-5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
          By {view === 'type' ? 'category' : 'status'}
        </p>
        <div className="h-[200px] flex items-center justify-center text-sm text-slate-300">
          No open loops
        </div>
      </div>
    )
  }

  function getColor(key: string): string {
    if (view === 'type') {
      return THREAD_TYPE_COLORS[key as keyof typeof THREAD_TYPE_COLORS]?.fill || '#9ca3af'
    }
    return THREAD_STATUS_COLORS[key as keyof typeof THREAD_STATUS_COLORS]?.dot || '#9ca3af'
  }

  return (
    <div className="rounded-xl bg-white/80 border border-slate-100 p-5">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
        By {view === 'type' ? 'category' : 'status'}
      </p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={60}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={getColor(entry.name)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(value) => [`${value}`, 'threads']}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1.5">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getColor(entry.name) }}
              />
              <span className="text-slate-500">{entry.label}</span>
              <span className="text-slate-400 ml-auto">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
