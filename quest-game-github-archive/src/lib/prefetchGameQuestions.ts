import { supabase } from './supabase'

const QUESTION_SELECT =
  'id, game_id, question_number, question_text, question_type, type, options, answer, answer_count, difficulty, points, hint_levels, hint_penalties, per_question_time_sec, media_url'

export async function prefetchQuestionsForGame(gameId: string) {
  const { data, error } = await supabase
    .from('questions')
    .select(QUESTION_SELECT)
    .eq('game_id', gameId)
    .order('question_number', { ascending: true })

  if (error) throw error
  return data ?? []
}

export function mapQuestionsForPlay(questionsData: Record<string, unknown>[]) {
  return questionsData.map((q) => ({
    ...q,
    order_index: q.question_number,
    prompt: q.question_text,
    base_points: q.points,
  }))
}
