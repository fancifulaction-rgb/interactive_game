/**
 * Применяет SQL-миграции с учётом журнала schema_migrations.
 *
 * npm run db:migrate              — только новые файлы
 * npm run db:migrate -- 013       — один файл (по номеру или имени)
 * npm run db:migrate:013          — только 013_submit_auto_answer.sql
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnv } from './lib/load-env.mjs'
import { connectPostgres } from './lib/db-connect.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = loadEnv()
const migrationsDir = path.join(root, 'docs', 'sql-migrations')

const ALL_FILES = [
  '001_initial_schema.sql',
  '002_add_cascade_delete_rules.sql',
  '003_settings_and_themes.sql',
  '004_production_schema.sql',
  '005_seed_from_backup.sql',
  '008_teams_app_columns.sql',
  '009_game_state_pause.sql',
  '010_increment_team_score.sql',
  '011_tighten_rls.sql',
  '012_storage_delete_authenticated.sql',
  '013_submit_auto_answer.sql',
  '014_event_archive.sql',
  '015_final_page_texts_and_integrity.sql',
]

const filterArg = process.argv[2]
let files = ALL_FILES

if (filterArg) {
  const needle = filterArg.replace(/\.sql$/i, '')
  files = ALL_FILES.filter(
    (f) => f.startsWith(needle) || f.includes(needle) || f === filterArg
  )
  if (!files.length) {
    console.error(`Миграция не найдена: ${filterArg}`)
    console.error('Доступные:', ALL_FILES.join(', '))
    process.exit(1)
  }
}

const QUERY_TIMEOUT_MS = 120_000

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `)
}

async function getApplied(client) {
  const { rows } = await client.query('SELECT filename FROM public.schema_migrations')
  return new Set(rows.map((r) => r.filename))
}

console.log('db:migrate — проверка журнала schema_migrations…')
const { client, label } = await connectPostgres({ preferDdl: true })
console.log(`Подключение: ${label}`)

async function bootstrapLedgerIfNeeded(client) {
  const applied = await getApplied(client)
  if (applied.size > 0) return

  const { rows: dbRows } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'games'
    ) AS has_games
  `)
  if (!dbRows[0]?.has_games) return

  const filesToMark = [...ALL_FILES]
  const { rows: fnRows } = await client.query(`
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'submit_auto_answer'
    LIMIT 1
  `)
  if (!fnRows.length) {
    filesToMark.splice(filesToMark.indexOf('013_submit_auto_answer.sql'), 1)
  }

  for (const file of filesToMark) {
    await client.query(
      `INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
      [file]
    )
  }
  console.log(
    `Существующая БД: в журнале отмечено ${filesToMark.length} миграций (без повторного 001…012).`
  )
}

try {
  await ensureLedger(client)
  await bootstrapLedgerIfNeeded(client)
  const applied = await getApplied(client)

  let ran = 0
  for (const file of files) {
    if (!filterArg && applied.has(file)) {
      console.log(`⊘ ${file} (уже применена)`)
      continue
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    console.log(`→ ${file} ...`)
    const started = Date.now()

    await client.query({ text: sql, query_timeout: QUERY_TIMEOUT_MS })

    await client.query(
      `INSERT INTO public.schema_migrations (filename) VALUES ($1)
       ON CONFLICT (filename) DO NOTHING`,
      [file]
    )

    console.log(`  ✓ ${file} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
    ran++
  }

  if (ran === 0) {
    console.log('Новых миграций нет. Для одной: npm run db:migrate:013')
  }

  const { rows } = await client.query('SELECT code, title FROM public.games LIMIT 3')
  console.log('games (sample):', rows)
} catch (err) {
  console.error('Ошибка:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
