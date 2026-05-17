import { NextResponse } from 'next/server'
import { processMemory } from '@/lib/pipeline/process-memory'

export async function POST(request: Request) {
  const body = await request.json()
  const { memoryId } = body

  if (!memoryId) {
    return NextResponse.json({ error: 'memoryId is required' }, { status: 400 })
  }

  try {
    await processMemory(memoryId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Processing error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
