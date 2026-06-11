/**
 * Расширенный QA через API (дополняет e2e-game-flow.mjs).
 * Запуск: node scripts/qa-extended.mjs
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
const admin = serviceKey ? createClient(url, serviceKey) : supabase

const results = []
const ok = (id, msg) => {
  console.log('✓', id, msg)
  results.push({ id, status: 'pass', msg })
}
const fail = (id, msg, err) => {
  const e = err?.message || String(err || '')
  console.log('✗', id, msg, e)
  results.push({ id, status: 'fail', msg, err: e })
}

const code = ('Q' + Date.now().toString(36).slice(-5)).toUpperCase().slice(0, 6)
let gameId
let gameJoinToken
let teamId

// Создание игры с lobby + hide scoreboard
{
  const { data, error } = await admin
    .from('games')
    .insert({
      title: 'QA Extended',
      code,
      theme: 'default',
      mask_board: false,
      total_time_sec: 600,
      per_question_time_sec: 60,
      scoring: { p_base: 100, k_diff: 1, k_time: 0.5, k_fast: 1.2, k_skip: 0.8, combo_bonus: 10 },
      finish_page_type: 'scoreboard',
      settings: { hide_scoreboard_until_finish: true },
    })
    .select()
    .single()
  if (error) fail('IMP-UX-005-setup', 'Создание игры hide_scoreboard', error)
  else {
    gameId = data.id
    gameJoinToken = data.join_token
    ok('IMP-UX-005-setup', `Игра ${code} hide_scoreboard=true`)
  }
}

if (gameId) {
  await admin.from('questions').delete().eq('game_id', gameId)
  const { error } = await admin.from('questions').insert([
    {
      game_id: gameId,
      question_number: 1,
      question_type: 'text',
      type: 'text',
      question_text: 'Столица России?',
      answer: ['москва'],
      options: [],
      answer_count: 1,
      difficulty: 'Средний',
      points: 100,
      per_question_time_sec: 60,
      hint_levels: [],
      hint_penalties: [],
      order_index: 1,
    },
    {
      game_id: gameId,
      question_number: 2,
      question_type: 'text',
      type: 'text',
      question_text: '2+2?',
      answer: ['4'],
      options: [],
      answer_count: 1,
      difficulty: 'Легкий',
      points: 50,
      per_question_time_sec: 30,
      hint_levels: [],
      hint_penalties: [],
      order_index: 2,
    },
  ])
  if (error) fail('editor-questions', 'Вопросы', error)
  else ok('editor-questions', '2 вопроса')
}

// Lobby waiting
if (gameId) {
  const { error } = await admin.from('game_state').upsert({
    game_id: gameId,
    current_state: 'waiting',
    is_paused: false,
  })
  if (error) fail('IMP-UX-001', 'Lobby waiting', error)
  else ok('IMP-UX-001', 'game_state=waiting')
}

// Регистрация команды (register_team — session token, IMP-SEC-007)
let teamSessionToken = null
if (gameId) {
  const { data, error } = await supabase.rpc('register_team', {
    p_game_id: gameId,
    p_team_name: 'QA Команда',
    p_captain_name: 'Автотест',
    p_join_token: gameJoinToken,
  })
  if (error) fail('register', 'Регистрация команды (register_team)', error)
  else {
    const row = data?.team ?? data
    teamId = row?.id ?? null
    teamSessionToken = data?.session_token ?? data?.sessionToken ?? null
    if (!teamId || !teamSessionToken) fail('register', 'нет team id или session_token', '')
    else ok('register', `Команда ${teamId.slice(0, 8)}`)
  }
}

// Старт игры
if (gameId) {
  const { error } = await admin
    .from('game_state')
    .update({ current_state: 'playing', is_paused: false })
    .eq('game_id', gameId)
  if (error) fail('IMP-UX-001-start', 'Старт игры', error)
  else ok('IMP-UX-001-start', 'waiting → playing')
}

// Ответы + scoring
if (gameId && teamId && teamSessionToken) {
  const { data: d1, error: e1 } = await supabase.rpc('submit_auto_answer', {
    p_game_id: gameId,
    p_team_id: teamId,
    p_question_number: 1,
    p_answer: ['Москва'],
    p_media_urls: [],
    p_time_spent: 8,
    p_hints_used: 0,
    p_session_token: teamSessionToken,
  })
  if (e1) fail('IMP-LOG-001', 'submit_auto_answer Q1', e1)
  else ok('IMP-LOG-001', `Q1 очки: ${d1?.points_earned ?? '?'}`)

  const { data: d2, error: e2 } = await supabase.rpc('submit_auto_answer', {
    p_game_id: gameId,
    p_team_id: teamId,
    p_question_number: 2,
    p_answer: ['4'],
    p_media_urls: [],
    p_time_spent: 5,
    p_hints_used: 0,
    p_session_token: teamSessionToken,
  })
  if (e2) fail('IMP-LOG-001-q2', 'submit_auto_answer Q2', e2)
  else ok('IMP-LOG-001-q2', `Q2 очки: ${d2?.points_earned ?? '?'}`)
}

// Пауза
if (gameId) {
  const { error } = await admin.from('game_state').update({ is_paused: true }).eq('game_id', gameId)
  if (error) fail('pause', 'Пауза', error)
  else ok('pause', 'is_paused=true')
  await admin.from('game_state').update({ is_paused: false }).eq('game_id', gameId)
}

// Счёт команды
if (teamId) {
  const { data, error } = await supabase.from('teams').select('total_score').eq('id', teamId).single()
  if (error) fail('score', 'Чтение счёта', error)
  else if ((data?.total_score ?? 0) > 0) ok('IMP-RT-001', `total_score=${data.total_score}`)
  else fail('IMP-RT-001', 'Счёт не обновился', 'total_score=0')
}

// Финиш + архив (если есть event_archive)
if (gameId) {
  const { error } = await admin.from('game_state').update({ current_state: 'finished' }).eq('game_id', gameId)
  if (error) fail('finish', 'Финиш', error)
  else ok('finish', 'current_state=finished')
}

// Cleanup
if (gameId) {
  await admin.from('games').delete().eq('id', gameId)
  ok('cleanup', 'Игра удалена')
}

const passed = results.filter((r) => r.status === 'pass').length
const failed = results.filter((r) => r.status === 'fail')
console.log('\n--- QA Extended ---')
console.log(`Пройдено: ${passed}/${results.length}`)
if (failed.length) {
  failed.forEach((f) => console.log(' FAIL:', f.id, f.msg, f.err || ''))
  process.exit(1)
}
console.log('code used:', code)
process.exit(0)
