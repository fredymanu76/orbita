import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const imageFile = formData.get('image') as File | null
  const caption = formData.get('caption') as string | null

  if (!imageFile) {
    return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
  }

  // Upload to Supabase Storage
  const ext = imageFile.name?.split('.').pop() || 'jpg'
  const fileName = `${user.id}/${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('image-uploads')
    .upload(fileName, imageFile, {
      contentType: imageFile.type || 'image/jpeg',
    })

  if (uploadError) {
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }

  const { data: urlData } = supabase.storage
    .from('image-uploads')
    .getPublicUrl(fileName)

  const { data, error } = await supabase
    .from('memory_items')
    .insert({
      user_id: user.id,
      type: 'image',
      raw_content: caption || 'Image capture',
      image_url: urlData.publicUrl,
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
