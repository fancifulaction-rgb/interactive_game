import { supabase } from './supabase'
import { enqueueBackground } from './requestQueue'
import type { GameSettingsJson } from './gameSettings'

export type GameScheduleMode = 'manual' | 'scheduled'

export type GameScheduleConfig = {
  mode: GameScheduleMode
  /** Автоматические переходы по времени (только при mode=scheduled) */
  enabled: boolean
  /** ISO UTC — когда открыть регистрацию / лобби */
  lobbyOpensAt: string | null
  /** ISO UTC — когда начать игру */
  gameStartsAt: string | null
  /** IANA timezone для отображения в админке */
  timezone: string
  lobbyOpenedAt: string | null
  gameStartedAt: string | null
  lastError: string | null
}

export const DEFAULT_GAME_SCHEDULE: GameScheduleConfig = {
  mode: 'manual',
  enabled: false,
  lobbyOpensAt: null,
  gameStartsAt: null,
  timezone: typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'Europe/Moscow',
  lobbyOpenedAt: null,
  gameStartedAt: null,
  lastError: null,
}

function asString(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  return v.trim()
}

export function parseGameSchedule(raw: unknown): GameScheduleConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_GAME_SCHEDULE }
  }
  const s = raw as Record<string, unknown>
  const mode: GameScheduleMode = s.mode === 'scheduled' ? 'scheduled' : 'manual'
  return {
    mode,
    enabled: mode === 'scheduled' && s.enabled === true,
    lobbyOpensAt: asString(s.lobbyOpensAt),
    gameStartsAt: asString(s.gameStartsAt),
    timezone: asString(s.timezone) ?? DEFAULT_GAME_SCHEDULE.timezone,
    lobbyOpenedAt: asString(s.lobbyOpenedAt),
    gameStartedAt: asString(s.gameStartedAt),
    lastError: asString(s.lastError),
  }
}

export function parseGameScheduleFromSettings(settings: unknown): GameScheduleConfig {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { ...DEFAULT_GAME_SCHEDULE }
  }
  return parseGameSchedule((settings as Record<string, unknown>).schedule)
}

export function mergeScheduleIntoSettings(
  settings: GameSettingsJson | Record<string, unknown> | null | undefined,
  schedule: GameScheduleConfig
): Record<string, unknown> {
  const base =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {}
  return {
    ...base,
    schedule: {
      mode: schedule.mode,
      enabled: schedule.mode === 'scheduled' && schedule.enabled,
      lobbyOpensAt: schedule.lobbyOpensAt,
      gameStartsAt: schedule.gameStartsAt,
      timezone: schedule.timezone,
      lobbyOpenedAt: schedule.lobbyOpenedAt,
      gameStartedAt: schedule.gameStartedAt,
      lastError: schedule.lastError,
    },
  }
}

/** datetime-local value (YYYY-MM-DDTHH:mm) → ISO UTC */
export function localDatetimeToIsoUtc(localValue: string, timezone?: string): string | null {
  const trimmed = localValue.trim()
  if (!trimmed) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(trimmed)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const tz = timezone ?? DEFAULT_GAME_SCHEDULE.timezone
  try {
    const probe = new Date(`${y}-${mo}-${d}T${h}:${mi}:00`)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(probe)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
    const tzLocal = new Date(
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00`
    )
    const offsetMs = probe.getTime() - tzLocal.getTime()
    const utc = new Date(probe.getTime() + offsetMs)
    return utc.toISOString()
  } catch {
    const fallback = new Date(`${y}-${mo}-${d}T${h}:${mi}:00`)
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString()
  }
}

/** ISO UTC → datetime-local в указанной TZ (приближённо через offset браузера для редактирования) */
export function isoUtcToLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatScheduleMoment(iso: string | null | undefined, timezone?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone ?? DEFAULT_GAME_SCHEDULE.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return d.toLocaleString('ru-RU')
  }
}

export function msUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return t - Date.now()
}

export function isScheduleActive(schedule: GameScheduleConfig): boolean {
  return schedule.mode === 'scheduled' && schedule.enabled
}

export async function fetchGameScheduleByCode(code: string): Promise<GameScheduleConfig | null> {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return null
  const { data, error } = await supabase
    .from('games')
    .select('settings')
    .eq('code', normalized)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return parseGameScheduleFromSettings(data.settings)
}

export async function fetchGameSchedule(gameId: string): Promise<GameScheduleConfig> {
  const { data, error } = await supabase
    .from('games')
    .select('settings')
    .eq('id', gameId)
    .maybeSingle()
  if (error) throw error
  return parseGameScheduleFromSettings(data?.settings)
}

export async function saveGameSchedule(
  gameId: string,
  schedule: GameScheduleConfig
): Promise<GameScheduleConfig> {
  const payload = {
    mode: schedule.mode,
    enabled: schedule.mode === 'scheduled' && schedule.enabled,
    lobbyOpensAt: schedule.lobbyOpensAt,
    gameStartsAt: schedule.gameStartsAt,
    timezone: schedule.timezone,
    lobbyOpenedAt: schedule.lobbyOpenedAt,
    gameStartedAt: schedule.gameStartedAt,
    lastError: schedule.lastError,
  }
  const { data, error } = await supabase.rpc('admin_update_game_schedule', {
    p_game_id: gameId,
    p_schedule: payload,
  })
  if (error) throw error
  return parseGameSchedule(data)
}

export async function triggerProcessGameSchedule(gameId?: string): Promise<void> {
  await enqueueBackground(async () => {
    const { error } = await supabase.rpc('process_game_schedule', {
      p_game_id: gameId ?? null,
    })
    if (error) console.warn('process_game_schedule:', error.message)
  })
}
