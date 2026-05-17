'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

export function TextInput() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!content.trim()) return
    setLoading(true)

    try {
      const res = await fetch('/api/capture/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      setContent('')
      toast.success('Memory captured', {
        description: 'Your thought has been saved and is being processed.',
      })
    } catch (err) {
      toast.error('Failed to capture', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      })
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        placeholder="What's on your mind? A conversation, a commitment, a thought..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={6}
        className="resize-none text-base"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Press Cmd+Enter to save
        </p>
        <Button
          onClick={handleSubmit}
          disabled={!content.trim() || loading}
          size="sm"
        >
          <Send className="h-4 w-4 mr-1.5" />
          {loading ? 'Saving...' : 'Save memory'}
        </Button>
      </div>
    </div>
  )
}
