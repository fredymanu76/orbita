'use client'

import { useMemo } from 'react'

/** Parse simple markdown-like text into formatted React elements */
export function FormattedMessage({ content, isUser = false }: { content: string; isUser?: boolean }) {
  const elements = useMemo(() => {
    const lines = content.split('\n')
    const result: React.ReactNode[] = []
    let listItems: React.ReactNode[] = []
    let listKey = 0

    function flushList() {
      if (listItems.length > 0) {
        result.push(
          <ul key={`list-${listKey++}`} className="space-y-1 my-2 ml-1">
            {listItems}
          </ul>
        )
        listItems = []
      }
    }

    function parseInline(text: string): React.ReactNode {
      // Replace **bold** and inline `code`
      const parts: React.ReactNode[] = []
      let remaining = text
      let key = 0

      while (remaining.length > 0) {
        // Bold
        const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
        // Inline code
        const codeMatch = remaining.match(/`(.+?)`/)

        // Find the earliest match
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

        // Text before the match
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

      // Numbered list: "1. text" or "2. text"
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)/)
      if (numberedMatch) {
        flushList()
        listItems.push(
          <li key={`li-${i}`} className="flex gap-2 text-sm">
            <span className={`font-medium flex-shrink-0 w-5 text-right ${isUser ? 'text-slate-300' : 'text-indigo-400'}`}>{numberedMatch[1]}.</span>
            <span>{parseInline(numberedMatch[2])}</span>
          </li>
        )
        continue
      }

      // Bullet list
      if (line.startsWith('- ') || line.startsWith('• ')) {
        const text = line.replace(/^[-•]\s+/, '')
        listItems.push(
          <li key={`li-${i}`} className="flex gap-2 text-sm">
            <span className={`flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${isUser ? 'bg-slate-300' : 'bg-indigo-300'}`} />
            <span>{parseInline(text)}</span>
          </li>
        )
        continue
      }

      flushList()

      // Empty line
      if (line.trim() === '') {
        result.push(<div key={`br-${i}`} className="h-2" />)
        continue
      }

      // Heading-like: whole line is bold
      if (line.startsWith('**') && line.endsWith('**')) {
        result.push(
          <p key={`h-${i}`} className={`font-semibold mb-1 ${isUser ? '' : 'text-slate-800'}`}>
            {line.slice(2, -2)}
          </p>
        )
        continue
      }

      // Regular paragraph
      result.push(
        <p key={`p-${i}`} className="text-sm mb-1 leading-relaxed">
          {parseInline(line)}
        </p>
      )
    }

    flushList()
    return result
  }, [content, isUser])

  return <div>{elements}</div>
}
