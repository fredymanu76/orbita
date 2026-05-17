'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ImagePlus, X, Send } from 'lucide-react'
import { toast } from 'sonner'

export function ImageUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    if (!f.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  function handleClear() {
    setFile(null)
    setPreview(null)
    setCaption('')
    if (preview) URL.revokeObjectURL(preview)
  }

  async function handleSubmit() {
    if (!file) return
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('image', file)
      if (caption.trim()) formData.append('caption', caption.trim())

      const res = await fetch('/api/capture/image', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to upload')
      }

      toast.success('Image captured', {
        description: 'Your image has been saved.',
      })
      handleClear()
    } catch (err) {
      toast.error('Failed to capture', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <ImagePlus className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            Drag and drop an image, or click to browse
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview!}
              alt="Preview"
              className="w-full max-h-64 object-contain rounded-lg bg-slate-100"
            />
            <Button
              onClick={handleClear}
              variant="outline"
              size="icon"
              className="absolute top-2 right-2 rounded-full h-8 w-8 bg-white/80"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <Textarea
            placeholder="Add a note about this image (optional)..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="resize-none"
          />

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={loading} size="sm">
              <Send className="h-4 w-4 mr-1.5" />
              {loading ? 'Uploading...' : 'Save memory'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
