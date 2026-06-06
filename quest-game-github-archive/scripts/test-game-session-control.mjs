/**
 * Тест цикла управления игрой: start → pause → resume → finish → restart
 * Запуск: node scripts/test-game-session-control.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#][^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Нужны VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (или anon)')
  process.exit(1)
}

const supabase = createClient(url, key)
const code = 'S' + Date.now().toString(36).slice(-5).toUpperCase()
const bugs = []
const ok = (msg) => console.log('✓', msg)
const fail = (msg, err) => {
  console.log('✗', msg, err?.message || err || '')
  bugs.push(msg)
}

async function upsertState(gameId, patch) {
  const { data, error } = await supabase
    .from('game_state')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .select('id')
  if (error) throw error
  if (!data?.length) {
    const { error: insErr } = await supabase.from('game_state').insert({ game_id: gameId, ...patch })
    if (insErr) throw insErr
  }
}

async function fetchState(gameId) {
  const { data, error } = await supabase
    .from('game_state')
    .select('current_state, is_paused, paused_at, paused_by')
    .eq('game_id', gameId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

let gameId

try {
  const { data, error } = await supabase
    .from('games')
    .insert({
      title: 'Session control test',
      code,
      theme: 'default',
      mask_board: false,
      total_time_sec: 600,
      per_question_time_sec: 60,
      scoring: { p_base: 100, k_diff: 1, k_time: 0.5, k_fast: 1.2, k_skip: 0.8, combo_bonus: 10 },
      finish_page_type: 'scoreboard',
    })
    .select('id')
    .single()
  if (error) throw error
  gameId = data.id
  ok(`Игра ${code}`)

  await upsertState(gameId, { current_state: 'waiting', is_paused: false })
  ok('waiting')

  await upsertState(gameId, {
    current_state: 'playing',
    is_paused: false,
    paused_at: null,
    paused_by: null,
    player_data: { startedAt: new Date().toISOString() },
  })
  ok('start → playing')

  await upsertState(gameId, {
    current_state: 'playing',
    is_paused: true,
    paused_at: new Date().toISOString(),
    paused_by: 'e2e',
  })
  let st = await fetchState(gameId)
  if (!st?.is_paused) fail('pause', 'is_paused=false')
  else ok('pause')

  await upsertState(gameId, {
    current_state: 'playing',
    is_paused: false,
    paused_at: null,
    paused_by: null,
  })
  st = await fetchState(gameId)
  if (st?.is_paused) fail('resume', 'still paused')
  else ok('resume')

  await upsertState(gameId, {
    current_state: 'finished',
    is_paused: false,
    paused_at: null,
    paused_by: null,
  })
  st = await fetchState(gameId)
  if (st?.current_state !== 'finished') fail('finish', st?.current_state)
  else ok('finish')

  await upsertState(gameId, {
    current_state: 'waiting',
    is_paused: false,
    paused_at: null,
    paused_by: null,
    player_data: {},
  })
  st = await fetchState(gameId)
  if (st?.current_state !== 'waiting') fail('restart lobby', st?.current_state)
  else ok('restart → waiting')
} catch (e) {
  fail('exception', e)
}

if (gameId) {
  await supabase.from('games').delete().eq('id', gameId)
  ok('cleanup')
}

console.log('\n--- Итог ---')
if (bugs.length === 0) {
  console.log('Все шаги session control OK')
  process.exit(0)
}
console.log('Ошибки:', bugs.length)
process.exit(1)
