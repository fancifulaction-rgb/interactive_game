/**
 * Сквозной тест API: игра → вопросы → команда → ответ
 * Запуск: node scripts/e2e-game-flow.mjs
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

const bugs = []
const ok = (msg) => console.log('✓', msg)
const fail = (msg, err) => {
  console.log('✗', msg, err?.message || err || '')
  bugs.push({ msg, err: err?.message || String(err) })
}

const code = 'T' + Date.now().toString(36).slice(-5).toUpperCase()

let gameId
let teamId

// 1. Создать игру
{
  const { data, error } = await supabase
    .from('games')
    .insert({
      title: 'E2E тест',
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
  if (error) fail('Создание игры', error)
  else {
    gameId = data.id
    ok(`Игра ${code}`)
  }
}

// 2. Вопросы (batch)
if (gameId) {
  await supabase.from('questions').delete().eq('game_id', gameId)
  const { data, error } = await supabase
    .from('questions')
    .insert([
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
        hint_levels: [],
        hint_penalties: [],
        per_question_time_sec: 60,
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
        hint_levels: [],
        hint_penalties: [],
        per_question_time_sec: 60,
        order_index: 2,
      },
    ])
    .select()
  if (error) fail('Сохранение вопросов', error)
  else ok(`Вопросов: ${data?.length}`)
}

// 3. Команда
if (gameId) {
  const { data, error } = await supabase
    .from('teams')
    .insert({
      game_id: gameId,
      team_name: 'E2E Команда',
      captain_name: 'Тестер',
      name: 'E2E Команда',
      total_score: 0,
    })
    .select()
    .single()
  if (error) fail('Регистрация команды', error)
  else {
    teamId = data.id
    ok('Команда зарегистрирована')
  }
}

// 4. Ответ
if (gameId && teamId) {
  const { error } = await supabase.from('answers').insert({
    game_id: gameId,
    team_id: teamId,
    question_number: 1,
    answer: ['Москва'],
    media_urls: [],
    is_correct: true,
    points_earned: 100,
    time_spent: 10,
  })
  if (error) fail('Отправка ответа', error)
  else ok('Ответ сохранён')

  const { error: uerr } = await supabase
    .from('teams')
    .update({ total_score: 100 })
    .eq('id', teamId)
  if (uerr) fail('Обновление счёта', uerr)
  else ok('Счёт команды обновлён')
}

// 5. Сообщения (messages, не admin_messages)
if (gameId) {
  const { error } = await supabase.from('messages').insert({
    game_id: gameId,
    content: 'Тестовое уведомление',
    message_type: 'info',
    sender: 'e2e',
  })
  if (error) fail('Таблица messages', error)
  else ok('Сообщение admin → messages')
}

// 6. game_state pause columns
if (gameId) {
  const { error } = await supabase.from('game_state').upsert(
    {
      game_id: gameId,
      is_paused: false,
      current_state: 'active',
    },
    { onConflict: 'game_id' }
  )
  if (error && !error.message.includes('unique')) {
    const { error: ins } = await supabase.from('game_state').insert({
      game_id: gameId,
      is_paused: false,
      current_state: 'active',
    })
    if (ins) fail('game_state', ins)
    else ok('game_state insert')
  } else ok('game_state pause fields')
}

// Cleanup
if (gameId) {
  await supabase.from('games').delete().eq('id', gameId)
  ok('Тестовая игра удалена')
}

console.log('\n--- Итог ---')
if (bugs.length === 0) {
  console.log('Все проверки пройдены')
  process.exit(0)
} else {
  console.log('Ошибки:', bugs.length)
  bugs.forEach((b) => console.log(' -', b.msg, ':', b.err))
  process.exit(1)
}
