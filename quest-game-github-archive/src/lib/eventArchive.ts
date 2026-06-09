import { supabase } from './supabase'
import { fetchGameStateForGame } from './fetchGameState'
import { getGameStartedAt } from './gameSessionState'
import {
  buildTeamsCsvContent,
  downloadCsvFile,
  loadExportData,
  type ExportData,
} from '../utils/exportData'

export type EventArchiveRow = {
  id: string
  game_id: string | null
  game_code: string | null
  game_title: string
  started_at: string | null
  finished_at: string
  team_count: number
  question_count: number
  answer_count: number
  teams_summary: TeamArchiveSummary[]
  csv_content: string | null
  created_at: string
}

export type TeamArchiveSummary = {
  place: number
  team_name: string
  captain_name: string
  total_score: number
  registration_time: string
}

export type ArchiveGameSessionResult = {
  success: boolean
  archiveId?: string
  error?: string
}

function buildTeamsSummary(data: ExportData): TeamArchiveSummary[] {
  return data.teams.map((team, index) => ({
    place: index + 1,
    team_name: team.team_name,
    captain_name: team.captain_name,
    total_score: team.total_score,
    registration_time: team.registration_time,
  }))
}

export async function archiveGameSession(gameId: string): Promise<ArchiveGameSessionResult> {
  const [data, state] = await Promise.all([
    loadExportData(gameId),
    fetchGameStateForGame(gameId),
  ])

  const teamsSummary = buildTeamsSummary(data)
  const csvContent = buildTeamsCsvContent(data)
  const finishedAt = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('event_archive')
    .insert({
      game_id: gameId,
      game_code: data.game.code ?? null,
      game_title: data.game.title || 'Без названия',
      started_at: getGameStartedAt(state),
      finished_at: finishedAt,
      team_count: data.teams.length,
      question_count: data.questions.length,
      answer_count: data.answers.length,
      teams_summary: teamsSummary,
      csv_content: csvContent,
    })
    .select('id')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, archiveId: row?.id as string }
}

const ARCHIVE_SELECT =
  'id, game_id, game_code, game_title, started_at, finished_at, team_count, question_count, answer_count, teams_summary, csv_content, created_at'

export async function listEventArchivesForGame(
  gameId: string,
  limit = 100
): Promise<EventArchiveRow[]> {
  const { data, error } = await supabase
    .from('event_archive')
    .select(ARCHIVE_SELECT)
    .eq('game_id', gameId)
    .order('finished_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as EventArchiveRow[]
}

function csvFromSummary(archive: EventArchiveRow): string {
  const rows = [
    ['Место', 'Команда', 'Капитан', 'Очки', 'Время регистрации'],
    ...archive.teams_summary.map((team) => [
      team.place,
      team.team_name,
      team.captain_name,
      team.total_score,
      new Date(team.registration_time).toLocaleString('ru-RU'),
    ]),
  ]
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (
            typeof cell === 'string' &&
            (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
          ) {
            return '"' + cell.replace(/"/g, '""') + '"'
          }
          return cell
        })
        .join(',')
    )
    .join('\n')
}

function archiveCsvFilename(archive: EventArchiveRow): string {
  const date = new Date(archive.finished_at).toISOString().slice(0, 10)
  const safeTitle = (archive.game_title || 'игра').replace(/[<>:"/\\|?*]+/g, '_').slice(0, 60)
  return `${safeTitle}_заезд_${date}.csv`
}

export async function downloadArchivedCsv(archive: EventArchiveRow): Promise<void> {
  const content = archive.csv_content || csvFromSummary(archive)
  await downloadCsvFile(content, archiveCsvFilename(archive))
}

export function formatArchiveDuration(
  startedAt: string | null,
  finishedAt: string
): string | null {
  if (!startedAt) return null
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  if (min === 0) return `${sec} сек`
  return `${min} мин ${sec} сек`
}
