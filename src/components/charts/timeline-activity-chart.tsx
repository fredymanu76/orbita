'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface TimelineActivityChartProps {
  data: { date: string; count: number }[]
}

export function TimelineActivityChart({ data }: TimelineActivityChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-white/80 border border-slate-100 p-5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Activity</p>
        <div className="h-[120px] flex items-center justify-center text-sm text-slate-300">
          No activity data
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white/80 border border-slate-100 p-5">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
        Captures per day
      </p>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#818cf8"
            fill="url(#activityGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
