import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'Wearable callback not yet implemented' },
    { status: 501 }
  )
}
