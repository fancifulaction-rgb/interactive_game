/**
 * Применяет SQL-миграции 001–005 (идемпотентно, IF NOT EXISTS).
 * Подключение: scripts/lib/db-connect.mjs (пробует DATABASE_URL, pooler, direct).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnv } from './lib/load-env.mjs'
import { connectPostgres } from './lib/db-connect.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = loadEnv()

const files = [
  '001_initial_schema.sql',
  '002_add_cascade_delete_rules.sql',
  '003_settings_and_themes.sql',
  '004_production_schema.sql',
  '005_seed_from_backup.sql',
]

const { client, label } = await connectPostgres()
console.log(`Подключение: ${label}`)

try {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(root, 'docs', 'sql-migrations', file), 'utf8')
    console.log(`→ ${file}`)
    await client.query(sql)
    console.log(`  ✓ ${file}`)
  }

  const { rows } = await client.query('SELECT code, title FROM public.games LIMIT 5')
  console.log('games:', rows)
} catch (err) {
  console.error('Ошибка:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
