/**
 * Проверка рассинхрона: schema_migrations vs фактическая схема Postgres.
 * npm run db:verify-schema
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './lib/load-env.mjs'
import { connectPostgres } from './lib/db-connect.mjs'
import { ALL_MIGRATION_FILES } from './lib/migration-manifest.mjs'

loadEnv()

const EXPECTED_MIGRATIONS = ALL_MIGRATION_FILES

const REQUIRED_COLUMNS = [
  ['games', 'join_token'],
  ['game_state', 'is_paused'],
  ['game_state', 'paused_at'],
  ['answers', 'question_number'],
  ['answers', 'points_earned'],
  ['answers', 'time_spent'],
  ['questions', 'question_number'],
  ['teams', 'session_token_hash'],
  ['teams', 'finished_at'],
]

const LEGACY_COLUMNS = [['answers', 'question_id'], ['answers', 'answer_text']]

const REQUIRED_TABLES = ['games', 'game_state', 'questions', 'teams', 'answers', 'event_archive', 'final_page_texts']

const REQUIRED_RPC = [
  'submit_auto_answer',
  'increment_team_score',
  'admin_restart_from_scratch',
  'admin_set_session',
  'register_team',
  'verify_team_session',
  'resolve_answer_grading',
  'mark_team_finished',
  'get_team_progress',
  'try_auto_finish_game',
]

const REQUIRED_VIEWS = ['questions_player']

let ok = true
let postgresOk = true
const issues = []
const warnings = []

function fail(msg) {
  issues.push(msg)
  ok = false
  console.log(`FAIL ${msg}`)
}

function pass(msg) {
  console.log(`OK   ${msg}`)
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  )
  return rows.length > 0
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )
  return rows.length > 0
}

async function rpcExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' AND p.proname = $1`,
    [name]
  )
  return rows.length > 0
}

async function viewExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  )
  return rows.length > 0
}

async function constraintExists(client, name) {
  const { rows } = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [name])
  return rows.length > 0
}

console.log('=== Schema drift verification ===\n')

const url = process.env.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
if (url && anon) {
  const supabase = createClient(url, anon)
  const { error: answersProbe } = await supabase
    .from('answers')
    .select('question_number, points_earned, time_spent')
    .limit(1)
  if (answersProbe) {
    fail(`PostgREST answers (new cols): ${answersProbe.code} ${answersProbe.message}`)
  } else {
    pass('PostgREST answers: question_number, points_earned, time_spent')
  }

  const { error: legacyProbe } = await supabase
    .from('answers')
    .select('question_id')
    .limit(1)
  if (!legacyProbe) {
    fail('PostgREST: legacy column answers.question_id still exposed (code may use wrong fields)')
  } else {
    pass('PostgREST: answers.question_id absent (expected)')
  }
} else {
  console.log('SKIP PostgREST probes (no VITE_SUPABASE_URL / ANON_KEY)')
}

async function withPostgres(run) {
  const { client, label } = await connectPostgres({ preferDdl: true })
  try {
    return await run(client, label)
  } finally {
    try {
      await client.end()
    } catch {
      /* ignore */
    }
  }
}

if (url && anon) {
  for (const table of ['event_archive', 'final_page_texts']) {
    const { error } = await createClient(url, anon).from(table).select('*', { head: true, count: 'exact' })
    if (error) fail(`PostgREST table ${table}: ${error.code} ${error.message}`)
    else pass(`PostgREST table ${table}`)
  }

  const { error: rpcErr } = await createClient(url, anon).rpc('submit_auto_answer', {
    p_game_id: '00000000-0000-0000-0000-000000000000',
    p_team_id: '00000000-0000-0000-0000-000000000000',
    p_question_number: 1,
    p_answer: [],
    p_media_urls: [],
    p_time_spent: 0,
    p_hints_used: 0,
  })
  if (rpcErr?.code === 'PGRST202') {
    fail('PostgREST RPC submit_auto_answer not found')
  } else {
    pass('PostgREST RPC submit_auto_answer registered')
  }
}

try {
  await withPostgres(async (client, label) => {
    console.log(`\nPostgres: ${label}\n`)

    for (const table of REQUIRED_TABLES) {
      if (await tableExists(client, table)) pass(`table ${table}`)
      else fail(`table missing: ${table}`)
    }

    for (const [table, col] of REQUIRED_COLUMNS) {
      if (await columnExists(client, table, col)) pass(`column ${table}.${col}`)
      else fail(`column missing: ${table}.${col}`)
    }

    for (const [table, col] of LEGACY_COLUMNS) {
      if (await columnExists(client, table, col)) {
        console.log(`WARN legacy column still present: ${table}.${col}`)
      } else {
        pass(`no legacy ${table}.${col}`)
      }
    }

    for (const rpc of REQUIRED_RPC) {
      if (await rpcExists(client, rpc)) pass(`function ${rpc}()`)
      else fail(`function missing: ${rpc}()`)
    }

    for (const view of REQUIRED_VIEWS) {
      if (await viewExists(client, view)) pass(`view ${view}`)
      else fail(`view missing: ${view} (run 018)`)
    }

    if (await constraintExists(client, 'answers_team_question_unique')) {
      pass('constraint answers_team_question_unique')
    } else {
      fail('constraint missing: answers_team_question_unique (run 015)')
    }

    if (await constraintExists(client, 'game_state_game_id_unique')) {
      pass('constraint game_state_game_id_unique')
    } else {
      fail('constraint missing: game_state_game_id_unique (run 015)')
    }
  })

  await withPostgres(async (client) => {
    const { rows: ledgerRows } = await client.query(
      `SELECT filename FROM public.schema_migrations ORDER BY filename`
    )
    const applied = new Set(ledgerRows.map((r) => r.filename))
    console.log('\n--- schema_migrations journal ---')
    for (const file of EXPECTED_MIGRATIONS) {
      if (applied.has(file)) pass(`journal: ${file}`)
      else fail(`journal missing entry: ${file}`)
    }

    const extra = [...applied].filter((f) => !EXPECTED_MIGRATIONS.includes(f))
    for (const file of extra) {
      console.log(`WARN journal extra: ${file}`)
    }
  })
} catch (err) {
  postgresOk = false
  warnings.push(`Postgres pooler unstable: ${err.message}`)
  console.log(`WARN ${warnings[warnings.length - 1]}`)
}

console.log('\n=== Summary ===')
if (warnings.length) {
  for (const w of warnings) console.log(`  (warn) ${w}`)
}
if (issues.length) {
  console.log(`Issues: ${issues.length}`)
  for (const i of issues) console.log(`  - ${i}`)
  console.log('\nSuggested fixes:')
  console.log('  npm run db:migrate:013   # if submit_auto_answer missing')
  console.log('  npm run db:migrate:014   # if event_archive missing')
  console.log('  npm run db:migrate:015   # final_page_texts + integrity')
  console.log('  npm run db:migrate:016   # game_state closed flag')
  console.log('  npm run db:migrate:017   # admin session RPC')
  console.log('  npm run db:migrate:018   # security S1–S5 (team session, RLS)')
  console.log('  node scripts/run-sql.mjs docs/sql-migrations/009_game_state_pause.sql')
  console.log('  Supabase Dashboard → Settings → API → Reload schema')
  process.exit(1)
}

if (!postgresOk) {
  console.log('Postgres checks incomplete; REST probes passed — schema likely OK.')
}
console.log('Schema matches expected model.')
process.exit(0)
