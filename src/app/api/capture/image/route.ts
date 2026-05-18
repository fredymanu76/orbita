import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processMemory } from '@/lib/pipeline/process-memory'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Client uploads image directly to Supabase Storage, then sends JSON here
  const { imageUrl, caption } = await request.json()

  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('memory_items')
    .insert({
      user_id: user.id,
      type: 'image',
      raw_content: caption || 'Image capture',
      image_url: imageUrl,
      processed: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Process memory after response is sent (always process, even images without captions)
  after(async () => {
    try {
      await processMemory(data.id)
    } catch (err) {
      console.error('Background processing failed for memory:', data.id, err)
    }
  })

  return NextResponse.json({ memory: data }, { status: 201 })
}
