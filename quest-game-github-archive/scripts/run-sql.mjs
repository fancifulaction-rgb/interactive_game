/**
 * Выполнить один .sql файл на удалённой БД.
 * Пример: node scripts/run-sql.mjs docs/sql-migrations/006_storage_buckets.sql
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnv } from './lib/load-env.mjs'
import { connectPostgres } from './lib/db-connect.mjs'

const sqlArg = process.argv[2]
if (!sqlArg) {
  console.error('Укажите путь к .sql: node scripts/run-sql.mjs docs/sql-migrations/006_storage_buckets.sql')
  process.exit(1)
}

loadEnv()
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sqlPath = path.isAbsolute(sqlArg) ? sqlArg : path.join(root, sqlArg)
const sql = fs.readFileSync(sqlPath, 'utf8')

const { client, label } = await connectPostgres()
console.log(`Подключение: ${label}`)
console.log(`Файл: ${sqlArg}`)

try {
  await client.query({ text: sql, query_timeout: 120000 })
  console.log('OK')
} catch (err) {
  console.error('Ошибка:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
