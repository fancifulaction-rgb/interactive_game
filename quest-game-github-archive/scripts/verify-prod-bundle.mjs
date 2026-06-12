/**
 * IMP-SEC-003 / Sprint 5.4: dist не должен содержать service role.
 * Запуск после `npm run build`: node scripts/verify-prod-bundle.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const distDir = path.resolve('dist')
const forbidden = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'service_role',
  'VITE_SUPABASE_SERVICE',
]

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, files)
    else if (/\.(js|css|html|json|map)$/i.test(name)) files.push(p)
  }
  return files
}

let serviceKey = ''
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*SUPABASE_SERVICE_ROLE_KEY=(.*)$/)
    if (m) serviceKey = m[1].trim()
  }
} catch {
  /* no .env */
}

if (!serviceKey) {
  console.log('ℹ SUPABASE_SERVICE_ROLE_KEY не в .env — проверка только по маркерам')
}

let ok = true
const hits = []

for (const file of walk(distDir)) {
  const text = readFileSync(file, 'utf8')
  for (const marker of forbidden) {
    if (text.includes(marker)) {
      hits.push({ file: path.relative(process.cwd(), file), marker })
      ok = false
    }
  }
  if (serviceKey.length > 20 && text.includes(serviceKey)) {
    hits.push({ file: path.relative(process.cwd(), file), marker: 'SUPABASE_SERVICE_ROLE_KEY value' })
    ok = false
  }
}

if (hits.length) {
  console.error('✗ Prod bundle: найдены запрещённые строки:')
  for (const h of hits) console.error(' ', h.marker, '→', h.file)
  process.exit(1)
}

console.log('✓ Prod bundle: service role не найден в dist/')
process.exit(0)
