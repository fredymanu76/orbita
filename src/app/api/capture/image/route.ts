import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  if (caption && caption.trim().length > 0) {
    const origin = new URL(request.url).origin
    fetch(`${origin}/api/memories/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memoryId: data.id }),
    }).catch(() => {})
  }

  return NextResponse.json({ memory: data }, { status: 201 })
}
