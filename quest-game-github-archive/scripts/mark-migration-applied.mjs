/**
 * Отметить миграцию в schema_migrations без повторного SQL.
 * node scripts/mark-migration-applied.mjs 015_final_page_texts_and_integrity.sql
 */
import { loadEnv } from './lib/load-env.mjs'
import { connectPostgres } from './lib/db-connect.mjs'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/mark-migration-applied.mjs <filename.sql>')
  process.exit(1)
}

loadEnv()
const { client, label } = await connectPostgres({ preferDdl: true })
console.log(`Подключение: ${label}`)

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await client.query(
    `INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
    [file]
  )
  console.log(`OK marked: ${file}`)
} catch (err) {
  console.error('Ошибка:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
