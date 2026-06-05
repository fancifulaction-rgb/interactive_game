/**
 * Проверка CORS для origin (LAN-тест с телефона).
 * Запуск: node scripts/verify-cors-origin.mjs [origin]
 * По умолчанию: http://192.168.3.65:5173
 */
import { readFileSync, existsSync } from 'fs'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#][^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}

const origin = process.argv[2] || 'http://192.168.3.65:5173'
const base = process.env.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
if (!base || !anon) {
  console.error('Нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

async function check(path) {
  const res = await fetch(`${base}${path}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      apikey: anon,
    },
  })
  const acao = res.headers.get('access-control-allow-origin')
  return { path, status: res.status, acao }
}

const rest = await check('/rest/v1/')
const storage = await check('/storage/v1/object/public/test')

console.log(`Origin: ${origin}`)
for (const r of [rest, storage]) {
  const ok = r.acao === '*' || r.acao === origin
  console.log(`${ok ? '✓' : '✗'} ${r.path} → ACAO: ${r.acao ?? '(нет)'}`)
  if (!ok) process.exit(1)
}
console.log('CORS OK для LAN-теста с телефона')
