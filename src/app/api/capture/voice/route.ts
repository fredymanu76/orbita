import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio } from '@/lib/ai/transcribe'
import { processMemory } from '@/lib/pipeline/process-memory'

export const maxDuration = 120 // Allow up to 120s for transcription + processing

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Client uploads audio directly to Supabase Storage, then sends JSON here
  const { audioUrl } = await request.json()

  if (!audioUrl) {
    return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 })
  }

  // Download audio from Storage URL for transcription
  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    return NextResponse.json({ error: 'Failed to fetch audio from storage' }, { status: 500 })
  }

  const audioBlob = await audioResponse.blob()
  const audioFile = new File([audioBlob], 'recording.webm', {
    type: audioBlob.type || 'audio/webm',
  })

  // Transcribe
  const transcription = await transcribeAudio(audioFile)

  if (!transcription) {
    return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 })
  }

  // Create memory item
  const { data, error } = await supabase
    .from('memory_items')
    .insert({
      user_id: user.id,
      type: 'voice',
      raw_content: transcription,
      audio_url: audioUrl,
      processed: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Process synchronously — correctness before speed
  let processingError: string | null = null
  try {
    await processMemory(data.id)
  } catch (err) {
    processingError = err instanceof Error ? err.message : String(err)
    console.error('Processing failed for memory:', data.id, err)
  }

  return NextResponse.json({
    memory: data,
    processing: processingError ? { success: false, error: processingError } : { success: true },
  }, { status: 201 })
}
