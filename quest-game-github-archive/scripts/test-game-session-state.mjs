/**
 * Unit-тесты логики gameSessionState и participantAccess (без Supabase).
 * node scripts/test-game-session-state.mjs
 */

const GAME_STATE_CLOSED = 'closed'
const GAME_STATE_PLAYING = 'playing'
const GAME_STATE_WAITING = 'waiting'
const GAME_STATE_FINISHED = 'finished'

function isGameClosed(state) {
  if (!state) return false
  return (state?.current_state ?? '').toLowerCase() === GAME_STATE_CLOSED
}

function isGameFinished(state) {
  const s = (state?.current_state ?? '').toLowerCase()
  return s === GAME_STATE_FINISHED || s === 'ended' || s === 'completed'
}

function isGameSessionUnknown(state) {
  return state == null
}

function isGameInLobby(state) {
  if (!state) return false
  if (isGameFinished(state) || isGameClosed(state)) return false
  const s = (state?.current_state ?? '').toLowerCase()
  if (s === GAME_STATE_PLAYING || s === 'active') return false
  return s === GAME_STATE_WAITING
}

function gameStateProgressRank(state) {
  if (!state) return 0
  if (isGameFinished(state)) return 4
  const s = (state?.current_state ?? '').toLowerCase()
  if (s === GAME_STATE_PLAYING || s === 'active') return 3
  if (s === GAME_STATE_WAITING) return 2
  if (s === GAME_STATE_CLOSED) return 1
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

function getRegistrationDenialFromState(state, options) {
  if (!state) {
    return options?.stateFetchFailed ? 'unknown' : 'closed'
  }
  if (isGameClosed(state)) return 'closed'
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
if (isGameClosed(null)) fail('null is not closed')
else ok('null is not closed')

if (getRegistrationDenialFromState(null) !== 'closed') fail('null state: treated as closed (no row)')
else ok('null state: treated as closed (no row)')
if (getRegistrationDenialFromState(null, { stateFetchFailed: true }) !== 'unknown')
  fail('fetch failed: registration unknown')
else ok('fetch failed: registration unknown')

function getGameSessionStatus(state) {
  if (state == null) return 'closed'
  if (isGameClosed(state)) return 'closed'
  if (isGameFinished(state)) return 'finished'
  if (isGameInLobby(state)) return 'waiting'
  const s = (state?.current_state ?? '').toLowerCase()
  if (s === GAME_STATE_PLAYING || s === 'active') {
    return state.is_paused ? 'paused' : 'playing'
  }
  return 'closed'
}

if (getGameSessionStatus(null) !== 'closed') fail('null session status is closed')
else ok('null session status is closed')

{
  const pausedButClosed = { current_state: GAME_STATE_CLOSED, is_paused: true }
  if (getGameSessionStatus(pausedButClosed) !== 'closed') fail('closed wins over is_paused')
  else ok('closed wins over is_paused')
}

{
  const orphanPaused = { current_state: '', is_paused: true }
  if (getGameSessionStatus(orphanPaused) !== 'closed') fail('orphan is_paused without playing is closed')
  else ok('orphan is_paused without playing is closed')
}

{
  const closed = { current_state: GAME_STATE_CLOSED }
  if (isGameInLobby(closed)) fail('closed is not lobby')
  else ok('closed is not lobby')
  if (getRegistrationDenialFromState(closed) !== 'closed') fail('closed registration denial')
  else ok('closed registration denial')
}

{
  const waiting = { current_state: GAME_STATE_WAITING }
  if (!isGameInLobby(waiting)) fail('waiting is lobby')
  else ok('waiting is lobby')
  if (getRegistrationDenialFromState(waiting) !== null) fail('waiting allows registration')
  else ok('waiting allows registration')
}

{
  const ts = '2026-06-06T12:00:00.000Z'
  const playing = { current_state: GAME_STATE_PLAYING, updated_at: ts }
  const waiting = { current_state: GAME_STATE_WAITING, updated_at: ts }
  const closed = { current_state: GAME_STATE_CLOSED, updated_at: ts }
  if (!isGameStateRowNewer(playing, waiting)) fail('playing newer than waiting (equal ts)')
  else ok('playing newer than waiting (equal ts)')
  if (isGameStateRowNewer(waiting, playing)) fail('waiting not newer than playing (equal ts)')
  else ok('waiting not newer than playing (equal ts)')
  if (!isGameStateRowNewer(waiting, closed)) fail('waiting newer than closed (equal ts)')
  else ok('waiting newer than closed (equal ts)')
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\nAll game session state tests passed.')
