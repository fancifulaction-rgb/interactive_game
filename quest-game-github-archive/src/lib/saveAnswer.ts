import { supabase } from './supabase'
import { debugLog } from './debugLog'
import { cancelActiveStorageUpload } from './storageUpload'
import { setAnswerSaveInFlight } from './networkMutex'
import { enqueueCritical } from './requestQueue'

export type AnswerInsertPayload = {
  game_id: string
  team_id: string
  question_number: number
  answer: string[]
  media_urls: string[]
  is_correct: boolean
  points_earned: number
  time_spent: number
}

async function insertAnswer(payload: AnswerInsertPayload): Promise<void> {
  cancelActiveStorageUpload()
  setAnswerSaveInFlight(true)
  const started = Date.now()
  debugLog('saveAnswer.ts', 'insert start', { q: payload.question_number }, 'H')

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('answers').insert(payload)
      if (!error) {
        debugLog('saveAnswer.ts', 'insert ok', { ms: Date.now() - started, attempt }, 'H')
        return
      }
      debugLog('saveAnswer.ts', 'insert retry', {
        attempt,
        msg: error.message,
        ms: Date.now() - started,
      }, 'H')
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      } else {
        throw new Error(error.message)
      }
    }
  } finally {
    setAnswerSaveInFlight(false)
  }
}

export function saveAnswerToServer(payload: AnswerInsertPayload): Promise<void> {
  return enqueueCritical(() => insertAnswer(payload))
}
