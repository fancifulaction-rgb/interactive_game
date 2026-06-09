/**
 * API smoke для IMP-SEC (без браузера).
 * node scripts/security-smoke.mjs
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
const anon = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon) {
  console.error('Нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(url, anon)
const admin = serviceKey ? createClient(url, serviceKey) : null

const bugs = []
const ok = (msg) => console.log('✓', msg)
const expectFail = (msg, error) => {
  if (error) {
    ok(msg)
    return true
  }
  console.log('✗', msg, 'ожидали ошибку, получили success')
  bugs.push(msg)
  return false
}

const code = 'Z' + Date.now().toString(36).slice(-5).toUpperCase()
let gameId, teamId, token

if (!admin) {
  console.error('Нужен SUPABASE_SERVICE_ROLE_KEY для setup')
  process.exit(1)
}

const { data: game, error: gErr } = await admin
  .from('games')
  .insert({
    title: 'SEC smoke',
    code,
    theme: 'default',
    mask_board: false,
    total_time_sec: 600,
    per_question_time_sec: 60,
    scoring: { p_base: 100, k_diff: 1, k_time: 0.5, k_fast: 1.2, k_skip: 0.8, combo_bonus: 10 },
    finish_page_type: 'scoreboard',
  })
  .select()
  .single()
if (gErr) {
  console.error('setup game failed', gErr.message)
  process.exit(1)
}
gameId = game.id

await admin.from('questions').insert({
  game_id: gameId,
  question_number: 1,
  question_type: 'text',
  type: 'text',
  question_text: '1?',
  answer: ['1'],
  options: [],
  answer_count: 1,
  difficulty: 'Легкий',
  points: 10,
  per_question_time_sec: 60,
  hint_levels: [],
  hint_penalties: [],
  order_index: 1,
})

const { data: reg, error: regErr } = await supabase.rpc('register_team', {
  p_game_id: gameId,
  p_team_name: 'SecTest',
  p_captain_name: 'Bot',
})
if (regErr) {
  console.error('register_team failed', regErr.message)
  process.exit(1)
}
teamId = reg?.team?.id ?? reg?.id
token = reg?.session_token ?? reg?.sessionToken
ok('register_team выдаёт session_token')

// S5: submit без token
{
  const { error } = await supabase.rpc('submit_auto_answer', {
    p_game_id: gameId,
    p_team_id: teamId,
    p_question_number: 1,
    p_answer: ['1'],
    p_media_urls: [],
    p_time_spent: 1,
    p_hints_used: 0,
  })
  expectFail('S5: submit_auto_answer без token → отказ', error)
}

// S5: submit с token OK
{
  const { data, error } = await supabase.rpc('submit_auto_answer', {
    p_game_id: gameId,
    p_team_id: teamId,
    p_question_number: 1,
    p_answer: ['1'],
    p_media_urls: [],
    p_time_spent: 1,
    p_hints_used: 0,
    p_session_token: token,
  })
  if (error) {
    console.log('✗', 'S5: submit с валидным token', error.message)
    bugs.push('submit with token')
  } else ok(`S5: submit с token OK (очки ${data?.points_earned ?? '?'})`)
}

// S9: questions_player без answer
{
  const { data, error } = await supabase.from('questions_player').select('*').eq('game_id', gameId).limit(1)
  if (error) {
    console.log('✗', 'questions_player select', error.message)
    bugs.push('questions_player')
  } else if (data?.[0] && 'answer' in data[0]) {
    console.log('✗', 'S9: questions_player содержит поле answer')
    bugs.push('answer leak')
  } else ok('S9: questions_player без поля answer')
}

// S4: increment_team_score anon
{
  const { error } = await supabase.rpc('increment_team_score', {
    p_team_id: teamId,
    p_delta: 999,
  })
  expectFail('S4: anon increment_team_score → отказ', error)
}

// S3: anon UPDATE teams
{
  const { error } = await supabase.from('teams').update({ total_score: 99999 }).eq('id', teamId)
  expectFail('S3: anon UPDATE teams.total_score → отказ RLS', error)
}

// S3: anon INSERT answers
{
  const { error } = await supabase.from('answers').insert({
    game_id: gameId,
    team_id: teamId,
    question_number: 1,
    answer: ['hack'],
    is_correct: true,
    points_earned: 999,
    time_spent: 1,
  })
  expectFail('S3: anon INSERT answers → отказ RLS', error)
}

await admin.from('games').delete().eq('id', gameId)
ok('cleanup')

console.log('\n--- Security smoke ---')
if (bugs.length) {
  console.log('Провалено:', bugs.length)
  process.exit(1)
}
console.log('Все проверки пройдены')
process.exit(0)
