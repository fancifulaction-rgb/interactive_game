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
import { ALL_MIGRATION_FILES } from './lib/migration-manifest.mjs'
import { reconcileMigrationJournal } from './lib/migration-fingerprints.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = loadEnv()
const migrationsDir = path.join(root, 'docs', 'sql-migrations')

const ALL_FILES = ALL_MIGRATION_FILES

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
  const { marked } = await reconcileMigrationJournal(client)
  if (marked.length) {
    console.log(
      `Журнал синхронизирован с БД: ${marked.length} миграций отмечены без SQL (${marked.join(', ')})`
    )
  }
}

try {
  await ensureLedger(client)
  if (!filterArg) {
    await bootstrapLedgerIfNeeded(client)
  }
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
