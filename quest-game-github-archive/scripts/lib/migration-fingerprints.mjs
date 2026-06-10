/**
 * Fingerprints: эффект миграции уже в БД → можно отметить в schema_migrations без SQL.
 */
import { ALL_MIGRATION_FILES } from './migration-manifest.mjs'

export async function policyExists(client, table, name, schema = 'public') {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_policies
     WHERE schemaname = $1 AND tablename = $2 AND policyname = $3`,
    [schema, table, name]
  )
  return rows.length > 0
}

export async function fnExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' AND p.proname = $1`,
    [name]
  )
  return rows.length > 0
}

export async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )
  return rows.length > 0
}

export async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  )
  return rows.length > 0
}

async function settingExists(client, key) {
  const { rows } = await client.query('SELECT 1 FROM settings WHERE key = $1', [key])
  return rows.length > 0
}

async function varcharMaxLen(client, table, column) {
  const { rows } = await client.query(
    `SELECT character_maximum_length FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  )
  return rows[0]?.character_maximum_length ?? null
}

async function gameStateDefaultClosed(client) {
  const { rows } = await client.query(
    `SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'game_state' AND column_name = 'current_state'`
  )
  return String(rows[0]?.column_default ?? '').includes('closed')
}

/** true = эффект миграции уже в БД */
export const MIGRATION_FINGERPRINTS = {
  '011_tighten_rls.sql': (c) => policyExists(c, 'games', 'games_authenticated_all'),
  '012_storage_delete_authenticated.sql': (c) =>
    policyExists(c, 'objects', 'Authenticated delete game media', 'storage'),
  '013_submit_auto_answer.sql': (c) => fnExists(c, 'submit_auto_answer'),
  '014_event_archive.sql': (c) => tableExists(c, 'event_archive'),
  '015_final_page_texts_and_integrity.sql': (c) => tableExists(c, 'final_page_texts'),
  '016_game_state_closed.sql': (c) => gameStateDefaultClosed(c),
  '017_admin_session_rpc.sql': (c) => fnExists(c, 'admin_set_session'),
  '018_security_s1_s5.sql': async (c) =>
    (await fnExists(c, 'register_team')) &&
    (await fnExists(c, 'verify_team_session')) &&
    (await columnExists(c, 'teams', 'session_token_hash')),
  '019_game_access_code_length.sql': (c) => settingExists(c, 'game_access_code_length'),
  '020_game_code_varchar10.sql': async (c) => (await varcharMaxLen(c, 'games', 'code')) === 10,
  '021_drop_legacy_rls_allow_all.sql': async (c) =>
    !(await policyExists(c, 'teams', 'Allow all operations on teams')),
  '022_answer_grading.sql': (c) => fnExists(c, 'resolve_answer_grading'),
  '023_answer_grading_phase2.sql': (c) => fnExists(c, 'grade_auto_answer'),
  '024_answer_grading_phase3.sql': (c) => fnExists(c, 'posthoc_accept_answer'),
  '025_answer_grading_phase4.sql': (c) => fnExists(c, 'merge_question_answer_grading'),
  '026_team_progress.sql': async (c) =>
    (await columnExists(c, 'teams', 'finished_at')) &&
    (await fnExists(c, 'mark_team_finished')) &&
    (await fnExists(c, 'get_team_progress')),
  '027_question_hidden.sql': (c) => columnExists(c, 'questions', 'is_hidden'),
}

/** 001–010 без отдельных probe: если public.games уже есть — считаем базовый слой применённым */
function isLegacyBootstrapFile(file) {
  const n = Number.parseInt(file.slice(0, 3), 10)
  return Number.isFinite(n) && n >= 1 && n <= 10
}

/**
 * Сверяет schema_migrations с фактической схемой (дрейф журнала).
 * Вызывается автоматически из apply-migrations перед прогоном SQL.
 */
export async function reconcileMigrationJournal(client, { dryRun = false } = {}) {
  const { rows } = await client.query('SELECT filename FROM public.schema_migrations')
  const applied = new Set(rows.map((r) => r.filename))
  const hasGames = await tableExists(client, 'games')

  const marked = []
  const pending = []

  for (const file of ALL_MIGRATION_FILES) {
    if (applied.has(file)) continue

    const probe = MIGRATION_FINGERPRINTS[file]
    let ready = false

    if (probe) {
      ready = await probe(client)
    } else if (hasGames && isLegacyBootstrapFile(file)) {
      ready = true
    }

    if (!ready) {
      pending.push(file)
      continue
    }

    if (dryRun) {
      marked.push(file)
      continue
    }

    await client.query(
      `INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
      [file]
    )
    marked.push(file)
  }

  return { marked, pending }
}
