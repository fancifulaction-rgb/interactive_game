/**
 * Проверка доступности Edge Functions (IMP-INF-001/002).
 * Запуск: node scripts/verify-edge-functions.mjs
 */
import { readFileSync } from 'fs'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([^#][^=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const base = process.env.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
if (!base || !anon) {
  console.error('Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env')
  process.exit(1)
}

const names = ['player-upload', 'delete-game', 'generate-questions']
let ok = true

for (const name of names) {
  const url = `${base}/functions/v1/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anon}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  const deployed = res.status !== 404
  console.log(deployed ? '✓' : '✗', name, `HTTP ${res.status}`)
  if (!deployed) ok = false
}

process.exit(ok ? 0 : 1)
