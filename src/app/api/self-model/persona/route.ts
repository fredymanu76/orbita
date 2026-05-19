import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PersonaMode } from '@/lib/types'

const VALID_PERSONAS: PersonaMode[] = ['carer', 'worker', 'parent', 'founder', 'faith_community', 'student', 'general']

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { persona } = body as { persona: PersonaMode }

  if (!VALID_PERSONAS.includes(persona)) {
    return NextResponse.json({ error: 'Invalid persona' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('user_life_profile')
    .upsert({
      user_id: user.id,
      active_persona: persona,
      persona_confidence: 1.0,
      persona_source: 'user_confirmed',
      completeness_score: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, persona })
}
