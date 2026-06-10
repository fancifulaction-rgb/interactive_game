/**
 * Ручная проверка синхронизации журнала (обычно не нужна — db:migrate делает это сам).
 *
 * npm run db:sync-journal -- --dry-run
 */
import { loadEnv } from './lib/load-env.mjs'
import { connectPostgres } from './lib/db-connect.mjs'
import { reconcileMigrationJournal } from './lib/migration-fingerprints.mjs'

const dryRun = process.argv.includes('--dry-run')

loadEnv()

const { client, label } = await connectPostgres({ preferDdl: true })
console.log(`db:sync-journal — ${label}${dryRun ? ' (dry-run)' : ''}\n`)

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  const { marked, pending } = await reconcileMigrationJournal(client, { dryRun })

  for (const file of marked) {
    console.log(dryRun ? `WOULD MARK ${file}` : `MARKED ${file}`)
  }
  for (const file of pending) {
    console.log(`PENDING ${file} — будет применена через db:migrate`)
  }

  console.log(`\nИтого: ${marked.length} в журнале${dryRun ? ' (dry-run)' : ''}, ${pending.length} ждут SQL`)
  if (pending.length && !dryRun) {
    console.log('Запустите: npm run db:migrate')
  }
} finally {
  await client.end()
}
