'use client'

import { useMemo } from 'react'

/** Parse markdown text into well-formatted React elements */
export function FormattedMessage({ content, isUser = false }: { content: string; isUser?: boolean }) {
  const elements = useMemo(() => {
    const lines = content.split('\n')
    const result: React.ReactNode[] = []
    let listItems: React.ReactNode[] = []
    let listKey = 0

    function flushList() {
      if (listItems.length > 0) {
        result.push(
          <ul key={`list-${listKey++}`} className="space-y-1.5 my-2">
            {listItems}
          </ul>
        )
        listItems = []
      }
    }

    function parseInline(text: string): React.ReactNode {
      const parts: React.ReactNode[] = []
      let remaining = text
      let key = 0

      while (remaining.length > 0) {
        const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
        const codeMatch = remaining.match(/`(.+?)`/)

        let earliest: { type: 'bold' | 'code'; match: RegExpMatchArray } | null = null
        if (boldMatch && boldMatch.index !== undefined) {
          earliest = { type: 'bold', match: boldMatch }
        }
        if (codeMatch && codeMatch.index !== undefined) {
          if (!earliest || (codeMatch.index < (earliest.match.index ?? Infinity))) {
            earliest = { type: 'code', match: codeMatch }
          }
        }

        if (!earliest || earliest.match.index === undefined) {
          parts.push(remaining)
          break
        }

        if (earliest.match.index > 0) {
          parts.push(remaining.substring(0, earliest.match.index))
        }

        if (earliest.type === 'bold') {
          parts.push(
            <strong key={`b-${key++}`} className={isUser ? 'font-semibold' : 'font-semibold text-slate-800'}>
              {earliest.match[1]}
            </strong>
          )
        } else {
          parts.push(
            <code key={`c-${key++}`} className="px-1 py-0.5 rounded bg-slate-200/50 text-[12px] font-mono">
              {earliest.match[1]}
            </code>
          )
        }

        remaining = remaining.substring((earliest.match.index ?? 0) + earliest.match[0].length)
      }

      return parts.length === 1 ? parts[0] : <>{parts}</>
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // --- Markdown headings: # / ## / ### ---
      // Numbered heading: ### 1. Title or ## 1. Title
      const numberedHeadingMatch = trimmed.match(/^#{1,3}\s+(\d+)\.\s+(.+)/)
      if (numberedHeadingMatch) {
        flushList()
        result.push(
          <div key={`nh-${i}`} className="flex items-center gap-2.5 mt-3 mb-1.5 first:mt-0">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
              {numberedHeadingMatch[1]}
            </span>
            <span className="font-semibold text-sm text-slate-800">
              {parseInline(numberedHeadingMatch[2])}
            </span>
          </div>
        )
        continue
      }

      // Plain heading: ### Title or ## Title or # Title
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/)
      if (headingMatch) {
        flushList()
        const level = headingMatch[1].length
        const sizes = { 1: 'text-base font-bold', 2: 'text-sm font-bold', 3: 'text-sm font-semibold' }
        result.push(
          <p key={`h-${i}`} className={`${sizes[level as 1 | 2 | 3] || sizes[3]} text-slate-800 mt-3 mb-1 first:mt-0`}>
            {parseInline(headingMatch[2])}
          </p>
        )
        continue
      }

      // Numbered list: "1. text" or "2. text" (not preceded by #)
      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/)
      if (numberedMatch) {
        listItems.push(
          <li key={`li-${i}`} className="flex gap-2.5 text-sm">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-50 text-indigo-500 text-xs font-semibold flex items-center justify-center mt-0.5">
              {numberedMatch[1]}
            </span>
            <span className="leading-relaxed">{parseInline(numberedMatch[2])}</span>
          </li>
        )
        continue
      }

      // Bullet list (including indented)
      const bulletMatch = trimmed.match(/^[-•]\s+(.+)/)
      if (bulletMatch) {
        const isIndented = line.startsWith('  ') || line.startsWith('\t')
        listItems.push(
          <li key={`li-${i}`} className={`flex gap-2 text-sm ${isIndented ? 'ml-4' : ''}`}>
            <span className={`flex-shrink-0 mt-2 w-1.5 h-1.5 rounded-full ${isUser ? 'bg-slate-300' : 'bg-indigo-300'}`} />
            <span className="leading-relaxed">{parseInline(bulletMatch[1])}</span>
          </li>
        )
        continue
      }

      flushList()

      // Empty line
      if (trimmed === '') {
        result.push(<div key={`br-${i}`} className="h-1.5" />)
        continue
      }

      // Whole line bold (heading-like)
      if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.slice(2, -2).includes('**')) {
        result.push(
          <p key={`bh-${i}`} className="font-semibold text-sm text-slate-800 mt-2 mb-1 first:mt-0">
            {trimmed.slice(2, -2)}
          </p>
        )
        continue
      }

      // Regular paragraph
      result.push(
        <p key={`p-${i}`} className="text-sm mb-1 leading-relaxed">
          {parseInline(trimmed)}
        </p>
      )
    }

    flushList()
    return result
  }, [content, isUser])

  return <div className="space-y-0.5">{elements}</div>
}
