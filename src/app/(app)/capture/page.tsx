'use client'

import { useState } from 'react'
import { TextInput } from '@/components/capture/text-input'
import { VoiceRecorder } from '@/components/capture/voice-recorder'
import { ImageUpload } from '@/components/capture/image-upload'
import { TaskInput } from '@/components/capture/task-input'
import { Mic, Type, ImagePlus, ListTodo, Sparkles } from 'lucide-react'

const modes = [
  { key: 'voice', label: 'Voice', icon: Mic, color: 'text-violet-500', bg: 'bg-violet-50', activeBg: 'bg-violet-500', description: 'Record a conversation or thought' },
  { key: 'text', label: 'Text', icon: Type, color: 'text-slate-500', bg: 'bg-slate-100', activeBg: 'bg-slate-700', description: 'Write down a thought or note' },
  { key: 'image', label: 'Image', icon: ImagePlus, color: 'text-amber-500', bg: 'bg-amber-50', activeBg: 'bg-amber-500', description: 'Upload an image with context' },
  { key: 'task', label: 'Task', icon: ListTodo, color: 'text-emerald-500', bg: 'bg-emerald-50', activeBg: 'bg-emerald-500', description: 'Create an actionable task' },
]

export default function CapturePage() {
  const [activeMode, setActiveMode] = useState('voice')
  const active = modes.find(m => m.key === activeMode)!

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Capture</h1>
        <p className="text-sm text-slate-400 mt-1">
          Record a thought, conversation, or task. We&apos;ll organise it for you.
        </p>
      </div>

      {/* Mode selector — visual cards instead of plain tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {modes.map((mode) => {
          const Icon = mode.icon
          const isActive = activeMode === mode.key
          return (
            <button
              key={mode.key}
              onClick={() => setActiveMode(mode.key)}
              className={`rounded-xl p-3 text-center transition-all ${
                isActive
                  ? `${mode.activeBg} text-white shadow-lg shadow-slate-200/50 scale-[1.02]`
                  : `${mode.bg} ${mode.color} hover:scale-[1.01]`
              }`}
            >
              <Icon className={`h-5 w-5 mx-auto mb-1.5 ${isActive ? 'text-white' : ''}`} />
              <span className="text-xs font-medium">{mode.label}</span>
            </button>
          )
        })}
      </div>

      {/* Active mode description */}
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-3.5 w-3.5 text-slate-300" />
        <p className="text-xs text-slate-400">{active.description}</p>
      </div>

      {/* Capture area */}
      <div className="rounded-2xl bg-white/90 border border-slate-100 p-4 sm:p-6 shadow-sm">
        {activeMode === 'voice' && <VoiceRecorder />}
        {activeMode === 'text' && <TextInput />}
        {activeMode === 'image' && <ImageUpload />}
        {activeMode === 'task' && <TaskInput />}
      </div>

      {/* Helpful hint */}
      <p className="text-center text-[11px] text-slate-300 mt-4">
        Continuum will automatically spot people, promises, and context from what you capture
      </p>
    </div>
  )
}
