'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send, Mic } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export function QuickCaptureBar() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)

    try {
      const res = await fetch('/api/capture/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) throw new Error('Failed to save')

      setContent('')
      toast.success('Memory captured')
    } catch {
      toast.error('Failed to capture')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        placeholder="Quick capture..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => router.push('/capture')}
      >
        <Mic className="h-4 w-4" />
      </Button>
      <Button type="submit" size="icon" disabled={!content.trim() || loading}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  )
}
