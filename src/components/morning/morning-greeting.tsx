'use client'

import { format } from 'date-fns'

interface MorningGreetingProps {
  greeting: string
}

export function MorningGreeting({ greeting }: MorningGreetingProps) {
  const today = format(new Date(), 'EEEE, MMMM d')

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">{greeting}</h1>
      <p className="text-sm text-slate-400 mt-0.5">{today}</p>
    </div>
  )
}
