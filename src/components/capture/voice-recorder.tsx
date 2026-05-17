'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Square, Pause, Play, RotateCcw, Send } from 'lucide-react'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
import { toast } from 'sonner'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function VoiceRecorder() {
  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    analyserNode,
  } = useVoiceRecorder()

  const [uploading, setUploading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  const drawWaveform = useCallback(() => {
    if (!analyserNode || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bufferLength = analyserNode.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyserNode.getByteTimeDomainData(dataArray)

      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.lineWidth = 2
      ctx.strokeStyle = '#6366f1'
      ctx.beginPath()

      const sliceWidth = canvas.width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0
        const y = (v * canvas.height) / 2

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
        x += sliceWidth
      }

      ctx.lineTo(canvas.width, canvas.height / 2)
      ctx.stroke()
    }

    draw()
  }, [analyserNode])

  useEffect(() => {
    if (isRecording && analyserNode) {
      drawWaveform()
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isRecording, analyserNode, drawWaveform])

  async function handleUpload() {
    if (!audioBlob) return
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const res = await fetch('/api/capture/voice', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      toast.success('Voice memory captured', {
        description: 'Your recording has been transcribed and saved.',
      })
      resetRecording()
    } catch (err) {
      toast.error('Failed to capture', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4">
        {/* Waveform */}
        <div className="w-full h-24 bg-slate-50 rounded-lg overflow-hidden">
          {isRecording ? (
            <canvas ref={canvasRef} className="w-full h-full" width={600} height={96} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              {audioBlob ? (
                <p className="text-sm text-slate-500">Recording ready to send</p>
              ) : (
                <p className="text-sm">Tap the microphone to start</p>
              )}
            </div>
          )}
        </div>

        {/* Timer */}
        <p className="text-2xl font-mono text-slate-700 tabular-nums">
          {formatTime(duration)}
        </p>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {!isRecording && !audioBlob && (
            <Button
              onClick={startRecording}
              size="lg"
              className="rounded-full h-16 w-16 bg-red-500 hover:bg-red-600"
            >
              <Mic className="h-6 w-6" />
            </Button>
          )}

          {isRecording && (
            <>
              <Button
                onClick={isPaused ? resumeRecording : pauseRecording}
                variant="outline"
                size="icon"
                className="rounded-full h-12 w-12"
              >
                {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </Button>
              <Button
                onClick={stopRecording}
                size="lg"
                className="rounded-full h-16 w-16 bg-red-500 hover:bg-red-600"
              >
                <Square className="h-6 w-6" />
              </Button>
            </>
          )}

          {audioBlob && !isRecording && (
            <>
              <Button
                onClick={resetRecording}
                variant="outline"
                size="icon"
                className="rounded-full h-12 w-12"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading}
                size="lg"
                className="rounded-full h-16 w-16"
              >
                <Send className="h-6 w-6" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
