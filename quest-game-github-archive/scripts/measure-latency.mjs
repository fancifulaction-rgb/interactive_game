/**
 * Замер RTT к Supabase REST из Node (без браузера).
 * Запуск: node scripts/measure-latency.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([^#][^=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function timed(label, fn) {
  const t0 = Date.now()
  await fn()
  const ms = Date.now() - t0
  console.log(`${label}: ${ms} ms`)
  return ms
}

const code = process.argv[2] || '26D4A6'
const samples = 5
const gameTimes = []
const teamTimes = []

console.log('Supabase latency test, game code:', code)

for (let i = 0; i < samples; i++) {
  gameTimes.push(
    await timed(`games[${i + 1}]`, async () => {
      const { error } = await supabase
        .from('games')
        .select('id, code, title')
        .eq('code', code)
        .maybeSingle()
      if (error) throw error
    })
  )
}

const { data: game } = await supabase
  .from('games')
  .select('id')
  .eq('code', code)
  .maybeSingle()

if (game?.id) {
  for (let i = 0; i < samples; i++) {
    teamTimes.push(
      await timed(`teams[${i + 1}]`, async () => {
        const { error } = await supabase
          .from('teams')
          .select('id, team_name, total_score')
          .eq('game_id', game.id)
          .limit(20)
        if (error) throw error
      })
    )
  }
}

const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
console.log('\nAverage games:', avg(gameTimes), 'ms')
if (teamTimes.length) console.log('Average teams:', avg(teamTimes), 'ms')
console.log('\nЕсли Node < 500 ms, а браузер > 5 s — проблема в параллельных запросах UI, не в Supabase.')
