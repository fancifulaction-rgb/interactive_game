/**
 * API smoke: join_token, is_hidden, grading (IMP-UX-009, IMP-ADM-004, IMP-LOG-022).
 * node scripts/api-feature-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#][^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const url = process.env.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !serviceKey) {
  console.error('Нужны VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, anon)
const admin = createClient(url, serviceKey)

const bugs = []
const ok = (msg) => console.log('✓', msg)
const fail = (msg, detail = '') => {
  console.log('✗', msg, detail)
  bugs.push(msg)
}

const code = 'F' + Date.now().toString(36).slice(-5).toUpperCase()
let gameId
let teamId
let token
let joinToken

const gradingSettings = {
  answer_grading_preset: 'custom',
  answer_grading: {
    normalize: {
      ignore_case: true,
      ignore_punctuation: true,
      collapse_whitespace: true,
      yo_to_e: true,
    },
    text_match: 'regex',
    regex: { pattern: '^да$', flags: 'i' },
  },
}

{
  const { data: game, error } = await admin
    .from('games')
    .insert({
      title: 'API feature smoke',
      code,
      theme: 'default',
      mask_board: false,
      total_time_sec: 600,
      per_question_time_sec: 60,
      scoring: { p_base: 100, k_diff: 1, k_time: 0.5, k_fast: 1.2, k_skip: 0.8, combo_bonus: 10 },
      finish_page_type: 'scoreboard',
      settings: gradingSettings,
    })
    .select('id, code, join_token')
    .single()

  if (error || !game) {
    console.error('setup game failed', error?.message)
    process.exit(1)
  }
  gameId = game.id
  joinToken = game.join_token
  ok(`game ${code} join_token=${joinToken?.slice(0, 8)}…`)
}

{
  const { error } = await admin.from('questions').insert([
    {
      game_id: gameId,
      question_number: 1,
      question_type: 'text',
      type: 'text',
      question_text: 'Видимый вопрос?',
      answer: ['да'],
      options: [],
      answer_count: 1,
      difficulty: 'Легкий',
      points: 50,
      per_question_time_sec: 60,
      hint_levels: [],
      hint_penalties: [],
      order_index: 1,
      is_hidden: false,
    },
    {
      game_id: gameId,
      question_number: 2,
      question_type: 'text',
      type: 'text',
      question_text: 'Скрытый вопрос',
      answer: ['секрет'],
      options: [],
      answer_count: 1,
      difficulty: 'Легкий',
      points: 50,
      per_question_time_sec: 60,
      hint_levels: [],
      hint_penalties: [],
      order_index: 2,
      is_hidden: true,
    },
  ])
  if (error) fail('insert questions', error.message)
  else ok('questions: 1 visible + 1 hidden')
}

{
  const { data, error } = await supabase
    .from('games')
    .select('id, code')
    .eq('join_token', joinToken)
    .maybeSingle()
  if (error) fail('join_token lookup', error.message)
  else if (!data?.id || data.code !== code) fail('join_token lookup', 'game not found')
  else ok('IMP-UX-009: anon lookup by join_token')
}

{
  const { data, error } = await supabase
    .from('questions_player')
    .select('question_number, question_text')
    .eq('game_id', gameId)
    .order('question_number')
  if (error) fail('questions_player', error.message)
  else if (!data || data.length !== 1) fail('IMP-ADM-004: hidden filter', `rows=${data?.length}`)
  else if (data[0].question_number !== 1) fail('IMP-ADM-004: visible question_number')
  else ok('IMP-ADM-004: questions_player only visible question')
}

{
  const { data: reg, error } = await supabase.rpc('register_team', {
    p_game_id: gameId,
    p_team_name: `Feat ${Date.now().toString(36).slice(-4)}`,
    p_captain_name: 'Bot',
    p_join_token: joinToken,
  })
  if (error) fail('register_team', error.message)
  else {
    teamId = reg?.team?.id ?? reg?.id
    token = reg?.session_token ?? reg?.sessionToken
    ok('register_team session')
  }
}

{
  const { data, error } = await supabase.rpc('submit_auto_answer', {
    p_game_id: gameId,
    p_team_id: teamId,
    p_question_number: 1,
    p_answer: ['Да!'],
    p_media_urls: [],
    p_time_spent: 2,
    p_hints_used: 0,
    p_session_token: token,
  })
  if (error) fail('IMP-LOG-022 regex submit', error.message)
  else if (!data?.is_correct) fail('IMP-LOG-022 regex submit', 'expected correct')
  else ok(`IMP-LOG-022: regex grading OK (points ${data.points_earned})`)
}

{
  const { data, error } = await supabase.rpc('get_team_progress', { p_game_id: gameId })
  if (error) fail('get_team_progress', error.message)
  else {
    const row = (data ?? []).find((r) => r.team_id === teamId)
    const total = row?.total_questions
    if (total !== 1) fail('progress counts visible only', `total=${total}`)
    else ok('get_team_progress: total_questions=1 (hidden excluded)')
  }
}

await admin.from('games').delete().eq('id', gameId)
ok('cleanup')

console.log('\n--- API feature smoke ---')
if (bugs.length) {
  console.log('Провалено:', bugs.length)
  process.exit(1)
}
console.log('Все проверки пройдены')
process.exit(0)
