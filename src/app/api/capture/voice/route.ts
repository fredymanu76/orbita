import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio } from '@/lib/ai/transcribe'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const audioFile = formData.get('audio') as File | null

  if (!audioFile) {
    return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
  }

  // Upload to Supabase Storage
  const fileName = `${user.id}/${Date.now()}-${audioFile.name || 'recording.webm'}`
  const { error: uploadError } = await supabase.storage
    .from('audio-recordings')
    .upload(fileName, audioFile, {
      contentType: audioFile.type || 'audio/webm',
    })

  if (uploadError) {
    return NextResponse.json({ error: 'Failed to upload audio' }, { status: 500 })
  }

  const { data: urlData } = supabase.storage
    .from('audio-recordings')
    .getPublicUrl(fileName)

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
      audio_url: urlData.publicUrl,
      processed: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Trigger async processing
  const origin = new URL(request.url).origin
  fetch(`${origin}/api/memories/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memoryId: data.id }),
  }).catch(() => {})

  return NextResponse.json({ memory: data }, { status: 201 })
}
