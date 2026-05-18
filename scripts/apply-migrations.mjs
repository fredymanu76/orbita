/**
 * Apply pending migrations via Supabase REST API using the service role key.
 * This bypasses the need for direct psql connection.
 *
 * Usage: node scripts/apply-migrations.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gveeqjasymjjsgjqjtqe.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
  // Read from .env.local
  const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8')
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)
  if (!match) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not found')
    process.exit(1)
  }
  process.env.SUPABASE_SERVICE_ROLE_KEY = match[1].trim()
}

const supabase = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || SERVICE_KEY,
  { db: { schema: 'public' } }
)

const migrations = [
  '013_processing_error.sql',
  '014_threads.sql',
  '015_threads_rls.sql',
  '016_text_search.sql',
  '017_graph_provisional_nodes.sql',
]

async function applyMigration(filename) {
  const filePath = join(__dirname, '..', 'supabase', 'migrations', filename)
  const sql = readFileSync(filePath, 'utf-8')

  console.log(`\n=== Applying ${filename} ===`)

  // Split by semicolons but handle dollar-quoted blocks
  const statements = splitSQL(sql)

  for (const stmt of statements) {
    const trimmed = stmt.trim()
    if (!trimmed || trimmed === '') continue

    try {
      const { error } = await supabase.rpc('exec_sql', { query: trimmed })
      if (error) {
        // If exec_sql doesn't exist, we'll need to use a different approach
        console.log(`  RPC failed, trying alternate: ${error.message}`)
        throw error
      }
      console.log(`  OK: ${trimmed.substring(0, 80)}...`)
    } catch {
      // Fallback: use fetch directly against the SQL endpoint
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
          method: 'POST',
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: trimmed }),
        })
        if (!response.ok) {
          const text = await response.text()
          console.log(`  WARN: ${text.substring(0, 200)}`)
        } else {
          console.log(`  OK (fallback): ${trimmed.substring(0, 80)}...`)
        }
      } catch (fetchErr) {
        console.log(`  ERROR: ${fetchErr.message}`)
      }
    }
  }
}

function splitSQL(sql) {
  // Simple SQL splitter that handles dollar-quoted strings
  const statements = []
  let current = ''
  let inDollarQuote = false
  let dollarTag = ''

  const lines = sql.split('\n')
  for (const line of lines) {
    // Skip comment-only lines
    if (line.trim().startsWith('--') && !inDollarQuote) {
      continue
    }
    current += line + '\n'

    // Check for dollar-quote boundaries
    const dollarMatches = line.match(/\$\$|\$[a-zA-Z_]+\$/g)
    if (dollarMatches) {
      for (const m of dollarMatches) {
        if (!inDollarQuote) {
          inDollarQuote = true
          dollarTag = m
        } else if (m === dollarTag) {
          inDollarQuote = false
          dollarTag = ''
        }
      }
    }

    if (!inDollarQuote && line.trim().endsWith(';')) {
      statements.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

// Since we can't use RPC to execute raw SQL via PostgREST,
// let's output the combined SQL for manual execution
async function main() {
  console.log('Checking if migrations are needed...\n')

  // Check if threads table exists
  const { data, error } = await supabase.from('threads').select('id').limit(1)
  if (!error) {
    console.log('threads table already exists')
  } else {
    console.log('threads table does NOT exist — migrations needed')
  }

  // Check if extraction_confidence column exists
  const { data: memData, error: memErr } = await supabase
    .from('memory_items')
    .select('extraction_confidence')
    .limit(1)

  if (!memErr) {
    console.log('extraction_confidence column already exists')
  } else {
    console.log('extraction_confidence column does NOT exist — migrations needed')
  }

  console.log('\n========================================')
  console.log('MIGRATIONS MUST BE APPLIED MANUALLY')
  console.log('========================================')
  console.log('\nThe Supabase REST API cannot execute DDL statements.')
  console.log('Please apply the following SQL in the Supabase SQL Editor:')
  console.log('Dashboard: https://supabase.com/dashboard/project/gveeqjasymjjsgjqjtqe/sql')
  console.log('\n--- COPY EVERYTHING BELOW THIS LINE ---\n')

  // Output combined SQL
  for (const filename of migrations) {
    const filePath = join(__dirname, '..', 'supabase', 'migrations', filename)
    const sql = readFileSync(filePath, 'utf-8')
    console.log(`-- =========================================`)
    console.log(`-- ${filename}`)
    console.log(`-- =========================================`)
    console.log(sql)
    console.log('')
  }
}

main().catch(console.error)
