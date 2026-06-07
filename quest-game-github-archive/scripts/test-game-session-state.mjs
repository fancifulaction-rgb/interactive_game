/**
 * Unit-тесты логики gameSessionState и participantAccess (без Supabase).
 * node scripts/test-game-session-state.mjs
 */

const GAME_STATE_PLAYING = 'playing'
const GAME_STATE_WAITING = 'waiting'
const GAME_STATE_FINISHED = 'finished'

function isGameFinished(state) {
  const s = (state?.current_state ?? '').toLowerCase()
  return s === GAME_STATE_FINISHED || s === 'ended' || s === 'completed'
}

function isGameSessionUnknown(state) {
  return state == null
}

function isGameInLobby(state) {
  if (!state) return false
  if (isGameFinished(state)) return false
  const s = (state?.current_state ?? '').toLowerCase()
  if (s === GAME_STATE_PLAYING || s === 'active') return false
  return true
}

function gameStateProgressRank(state) {
  if (!state) return 0
  if (isGameFinished(state)) return 3
  const s = (state?.current_state ?? '').toLowerCase()
  if (s === GAME_STATE_PLAYING || s === 'active') return 2
  return 1
}

function gameStateUpdatedAtMs(state) {
  if (!state?.updated_at) return 0
  const t = new Date(state.updated_at).getTime()
  return Number.isFinite(t) ? t : 0
}

function isGameStateRowNewer(incoming, current) {
  if (!incoming) return false
  if (!current) return true
  const inc = gameStateUpdatedAtMs(incoming)
  const cur = gameStateUpdatedAtMs(current)
  if (inc !== cur) return inc > cur
  return gameStateProgressRank(incoming) >= gameStateProgressRank(current)
}

function getRegistrationDenialFromState(state) {
  if (!state) return null
  if (isGameFinished(state)) return 'finished'
  if (!isGameInLobby(state)) return 'started'
  return null
}

let failed = 0
const ok = (label) => console.log('✓', label)
const fail = (label, detail) => {
  console.log('✗', label, detail ?? '')
  failed++
}

if (!isGameSessionUnknown(null)) fail('null is unknown')
else ok('null is unknown')
if (isGameInLobby(null)) fail('null is not lobby')
else ok('null is not lobby')

if (getRegistrationDenialFromState(null) !== null) fail('null state: no registration denial')
else ok('null state: no registration denial')

{
  const ts = '2026-06-06T12:00:00.000Z'
  const playing = { current_state: GAME_STATE_PLAYING, updated_at: ts }
  const waiting = { current_state: GAME_STATE_WAITING, updated_at: ts }
  if (!isGameStateRowNewer(playing, waiting)) fail('playing newer than waiting (equal ts)')
  else ok('playing newer than waiting (equal ts)')
  if (isGameStateRowNewer(waiting, playing)) fail('waiting not newer than playing (equal ts)')
  else ok('waiting not newer than playing (equal ts)')
}

{
  const playing = { current_state: GAME_STATE_PLAYING, updated_at: '2026-06-06T12:00:00.000Z' }
  const waiting = { current_state: GAME_STATE_WAITING, updated_at: '2026-06-06T12:00:01.000Z' }
  if (!isGameStateRowNewer(waiting, playing)) fail('newer waiting beats playing')
  else ok('newer waiting beats playing')
}

if (failed > 0) {
  console.log(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\nOK')
