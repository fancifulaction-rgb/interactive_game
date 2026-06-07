/**
 * Headless stress: admin RPC open/close/scratch on a test game.
 * Usage: node scripts/admin-stress.mjs [game_id] [iterations]
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './lib/load-env.mjs'

loadEnv()

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const gameId = process.argv[2]
const iterations = Number(process.argv[3] || 5)

if (!url || !key) {
  console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon) in .env')
  process.exit(1)
}
if (!gameId) {
  console.error('Usage: node scripts/admin-stress.mjs <game_id> [iterations]')
  process.exit(1)
}

const supabase = createClient(url, key)

async function timed(label, fn) {
  const t0 = Date.now()
  const result = await fn()
  const ms = Date.now() - t0
  console.log(`${label}: ${ms}ms`, result?.error ? result.error.message : 'ok')
  if (result?.error) throw result.error
  return { ms, data: result?.data }
}

const report = { gameId, iterations, runs: [] }

for (let i = 0; i < iterations; i++) {
  const run = { i }
  try {
    run.open = (await timed(`[${i}] open_lobby`, () =>
      supabase.rpc('admin_set_session', { p_game_id: gameId, p_action: 'open_lobby' })
    )).ms
    run.close = (await timed(`[${i}] close_game`, () =>
      supabase.rpc('admin_set_session', { p_game_id: gameId, p_action: 'close_game' })
    )).ms
    run.scratch = (await timed(`[${i}] restart_from_scratch`, () =>
      supabase.rpc('admin_restart_from_scratch', { p_game_id: gameId })
    )).ms
    run.ok = true
  } catch (e) {
    run.ok = false
    run.error = e.message
  }
  report.runs.push(run)
}

const fs = await import('fs')
const path = await import('path')
const outDir = path.join(process.cwd(), 'diagnostic')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `admin-stress-${Date.now()}.json`)
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log('Wrote', outPath)
