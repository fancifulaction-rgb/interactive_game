import { getClientSessionId } from './clientLogCollector'
import { enqueueBackground } from './requestQueue'
import { supabase } from './supabase'

export type ProductRole = 'player' | 'admin' | 'host' | 'scoreboard' | 'visitor'

export type ProductEventName =
  | 'page_view'
  | 'registration_completed'
  | 'registration_failed'
  | 'lobby_entered'
  | 'game_play_entered'
  | 'question_viewed'
  | 'hint_requested'
  | 'answer_submitted'
  | 'team_finished'
  | 'scoreboard_viewed'
  | 'host_viewed'
  | 'admin_session_action'

export type ProductEventInput = {
  event: ProductEventName
  role: ProductRole
  gameId?: string | null
  gameCode?: string | null
  teamId?: string | null
  payload?: Record<string, unknown>
}

type ProductEventRow = {
  event_name: ProductEventName
  role: ProductRole
  game_id: string | null
  game_code: string | null
  team_id: string | null
  client_session_id: string
  route: string
  payload: Record<string, unknown>
  app_version: string
}

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '1.2.16'

const FLUSH_MS = 2500
const FLUSH_BATCH = 12
const MAX_BATCH = 25

const queue: ProductEventRow[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const onceMemory = new Set<string>()

function currentRoute(): string {
  return typeof window !== 'undefined' ? window.location.pathname : ''
}

function rowFromInput(input: ProductEventInput): ProductEventRow {
  return {
    event_name: input.event,
    role: input.role,
    game_id: input.gameId ?? null,
    game_code: input.gameCode ?? null,
    team_id: input.teamId ?? null,
    client_session_id: getClientSessionId(),
    route: currentRoute(),
    payload: input.payload ?? {},
    app_version: APP_VERSION,
  }
}

function mirrorDevEvents(rows: ProductEventRow[]): void {
  if (!import.meta.env.DEV || rows.length === 0) return
  void fetch('/__product_events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: rows }),
  }).catch(() => {})
}

function scheduleFlush(): void {
  if (queue.length >= FLUSH_BATCH) {
    void flushProductEvents()
    return
  }
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushProductEvents()
  }, FLUSH_MS)
}

async function flushProductEvents(): Promise<void> {
  if (queue.length === 0) return
  const batch = queue.splice(0, MAX_BATCH)
  mirrorDevEvents(batch)
  try {
    const { error } = await supabase.rpc('track_product_events', { p_events: batch })
    if (error) {
      queue.unshift(...batch)
    }
  } catch {
    queue.unshift(...batch)
  }
}

/** Не блокирует hot-path: событие уходит в фоновую очередь. */
export function trackProductEvent(input: ProductEventInput): void {
  const row = rowFromInput(input)
  queue.push(row)
  scheduleFlush()
}

/** Один раз за вкладку (in-memory + sessionStorage). */
export function trackProductEventOnce(dedupeKey: string, input: ProductEventInput): void {
  if (onceMemory.has(dedupeKey)) return
  try {
    const raw = sessionStorage.getItem('quest_product_once_v1')
    const parsed = raw ? (JSON.parse(raw) as string[]) : []
    if (Array.isArray(parsed) && parsed.includes(dedupeKey)) {
      onceMemory.add(dedupeKey)
      return
    }
    const next = [...(Array.isArray(parsed) ? parsed : []), dedupeKey].slice(-300)
    sessionStorage.setItem('quest_product_once_v1', JSON.stringify(next))
  } catch {
    // ignore storage errors (private mode)
  }
  onceMemory.add(dedupeKey)
  trackProductEvent(input)
}

export function trackAdminSessionAction(
  gameId: string,
  action: string,
  extra: Record<string, unknown> = {}
): void {
  trackProductEvent({
    event: 'admin_session_action',
    role: 'admin',
    gameId,
    payload: { action, ...extra },
  })
}

export function roleForPathname(pathname: string): ProductRole {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/host/')) return 'host'
  if (pathname.startsWith('/scoreboard')) return 'scoreboard'
  if (pathname.startsWith('/game/')) return 'player'
  if (pathname.startsWith('/team/register')) return 'visitor'
  return 'visitor'
}

export function flushProductEventsNow(): Promise<void> {
  return enqueueBackground(() => flushProductEvents())
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (queue.length === 0) return
    const batch = queue.splice(0, MAX_BATCH)
    mirrorDevEvents(batch)
    const body = JSON.stringify({ p_events: batch })
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/track_product_events`
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) return
    try {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // ignore
    }
  })
}
