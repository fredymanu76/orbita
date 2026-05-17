/**
 * Migration runner for Continuum
 *
 * Usage:
 *   1. Run: supabase login
 *   2. Then: npx tsx scripts/apply-migrations.ts
 *
 * Or if you have the database URL:
 *   DATABASE_URL=postgresql://... npx tsx scripts/apply-migrations.ts
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gveeqjasymjjsgjqjtqe.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')

async function executeSql(sql: string, description: string): Promise<boolean> {
  // Use Supabase's PostgREST rpc endpoint if a function exists,
  // or fall back to the management API
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (response.ok) {
    console.log(`  ✓ ${description}`)
    return true
  }

  // If rpc function doesn't exist, we need to create it first
  const error = await response.text()
  if (error.includes('exec_sql') && error.includes('not found')) {
    return false
  }

  console.error(`  ✗ ${description}: ${error}`)
  return false
}

async function createExecFunction(): Promise<boolean> {
  // First try to create the exec_sql function via a direct approach
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: 'SELECT 1' }),
  })

  if (response.ok) return true

  console.log('\n⚠ The exec_sql function does not exist on your database.')
  console.log('  You need to run the following SQL in the Supabase Dashboard SQL Editor:')
  console.log('')
  console.log('  CREATE OR REPLACE FUNCTION exec_sql(query text)')
  console.log('  RETURNS void AS $$')
  console.log('  BEGIN')
  console.log('    EXECUTE query;')
  console.log('  END;')
  console.log('  $$ LANGUAGE plpgsql SECURITY DEFINER;')
  console.log('')
  console.log('  Then re-run this script.')
  console.log('')
  console.log('  Alternatively, run: supabase login && supabase db push')
  return false
}

async function main() {
  if (!SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Run with:')
    console.error('  source .env.local && npx tsx scripts/apply-migrations.ts')
    process.exit(1)
  }

  console.log('Continuum Migration Runner')
  console.log(`Target: ${SUPABASE_URL}`)
  console.log('')

  // Check if exec_sql function exists
  const hasExec = await createExecFunction()

  if (!hasExec) {
    // Fallback: print instructions for manual application
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('MANUAL MIGRATION INSTRUCTIONS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('Option A: Use Supabase CLI')
    console.log('  1. supabase login')
    console.log('  2. supabase link --project-ref gveeqjasymjjsgjqjtqe')
    console.log('  3. supabase db push')
    console.log('')
    console.log('Option B: Use Supabase Dashboard')
    console.log('  1. Go to: https://supabase.com/dashboard/project/gveeqjasymjjsgjqjtqe/sql')
    console.log('  2. Run each migration file in order (005 through 011)')
    console.log('')
    console.log('Migration files to apply:')

    const files = readdirSync(MIGRATIONS_DIR).sort()
    for (const file of files) {
      console.log(`  - supabase/migrations/${file}`)
    }
    process.exit(0)
  }

  // Apply migrations in order
  const files = readdirSync(MIGRATIONS_DIR).sort()
  console.log(`Found ${files.length} migration files`)
  console.log('')

  let applied = 0
  let failed = 0

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
    const success = await executeSql(sql, file)
    if (success) applied++
    else failed++
  }

  console.log('')
  console.log(`Done. Applied: ${applied}, Failed: ${failed}`)
}

main().catch(console.error)
