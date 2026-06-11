import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function loadEnvFile(): void {
  const envPath = path.join(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#][^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

export type E2EGameFixture = {
  gameId: string
  code: string
  admin: SupabaseClient
  startGame: () => Promise<void>
  destroy: () => Promise<void>
}

export async function createE2EGameFixture(): Promise<E2EGameFixture> {
  loadEnvFile()

  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Для e2e нужны VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в quest-game-github-archive/.env'
    )
  }

  const admin = createClient(url, serviceKey)
  const code = `E${Date.now().toString(36).slice(-5).toUpperCase()}`

  const { data: game, error: gameError } = await admin
    .from('games')
    .insert({
      title: 'E2E Playwright',
      code,
      theme: 'default',
      mask_board: false,
      total_time_sec: 600,
      per_question_time_sec: 120,
      scoring: {
        p_base: 100,
        k_diff: 1,
        k_time: 0.5,
        k_fast: 1.2,
        k_skip: 0.8,
        combo_bonus: 10,
      },
      finish_page_type: 'scoreboard',
    })
    .select('id, code')
    .single()

  if (gameError || !game) {
    throw new Error(`Не удалось создать игру: ${gameError?.message ?? 'empty'}`)
  }

  const gameId = game.id as string

  const { error: questionsError } = await admin.from('questions').insert([
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
      per_question_time_sec: 120,
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
      per_question_time_sec: 120,
      order_index: 2,
    },
  ])

  if (questionsError) {
    await admin.from('games').delete().eq('id', gameId)
    throw new Error(`Не удалось создать вопросы: ${questionsError.message}`)
  }

  const { error: stateError } = await admin.from('game_state').upsert(
    {
      game_id: gameId,
      current_state: 'waiting',
      is_paused: false,
      paused_at: null,
      paused_by: null,
      player_data: {},
    },
    { onConflict: 'game_id' }
  )

  if (stateError) {
    await admin.from('games').delete().eq('id', gameId)
    throw new Error(`Не удалось открыть лобби: ${stateError.message}`)
  }

  return {
    gameId,
    code: (game.code as string) ?? code,
    admin,
    async startGame() {
      const startedAt = new Date().toISOString()
      const { error } = await admin.from('game_state').upsert(
        {
          game_id: gameId,
          current_state: 'playing',
          is_paused: false,
          paused_at: null,
          paused_by: null,
          player_data: { startedAt },
        },
        { onConflict: 'game_id' }
      )
      if (error) throw new Error(`startGame: ${error.message}`)
    },
    async destroy() {
      await admin.from('games').delete().eq('id', gameId)
    },
  }
}
