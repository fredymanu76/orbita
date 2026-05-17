import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Wearable integrations coming soon' },
    { status: 501 }
  )
}
