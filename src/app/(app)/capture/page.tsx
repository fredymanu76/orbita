'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { TextInput } from '@/components/capture/text-input'
import { VoiceRecorder } from '@/components/capture/voice-recorder'
import { ImageUpload } from '@/components/capture/image-upload'
import { TaskInput } from '@/components/capture/task-input'
import { Mic, Type, ImagePlus, ListTodo } from 'lucide-react'

export default function CapturePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Capture</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record a thought, conversation, or task. We&apos;ll take care of the rest.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="voice">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="voice" className="flex items-center gap-1.5">
                <Mic className="h-4 w-4" />
                <span className="hidden sm:inline">Voice</span>
              </TabsTrigger>
              <TabsTrigger value="text" className="flex items-center gap-1.5">
                <Type className="h-4 w-4" />
                <span className="hidden sm:inline">Text</span>
              </TabsTrigger>
              <TabsTrigger value="image" className="flex items-center gap-1.5">
                <ImagePlus className="h-4 w-4" />
                <span className="hidden sm:inline">Image</span>
              </TabsTrigger>
              <TabsTrigger value="task" className="flex items-center gap-1.5">
                <ListTodo className="h-4 w-4" />
                <span className="hidden sm:inline">Task</span>
              </TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="voice">
                <VoiceRecorder />
              </TabsContent>
              <TabsContent value="text">
                <TextInput />
              </TabsContent>
              <TabsContent value="image">
                <ImageUpload />
              </TabsContent>
              <TabsContent value="task">
                <TaskInput />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
