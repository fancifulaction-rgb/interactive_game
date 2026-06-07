import { supabase } from '../lib/supabase'
import { answerJsonToDisplayText } from '../lib/answerDisplay'
import { enqueueCritical } from '../lib/requestQueue'

// Динамические импорты для тяжелых библиотек
let jsPDF: any, XLSX: any, saveAs: any

// Функция для загрузки библиотек по требованию
async function loadExportLibraries() {
  if (!jsPDF) {
    const module = await import('jspdf')
    jsPDF = module.default || module.jsPDF || module
  }
  if (!XLSX) {
    const module = await import('xlsx')
    XLSX = module.default || module
  }
  if (!saveAs) {
    const module = await import('file-saver')
    saveAs = module.saveAs
  }
}

export interface ExportAnswerRow {
  id: string
  team_id: string
  question_number: number
  answer: unknown
  time_spent: number | null
  points_earned: number | null
  is_correct: boolean | null
}

export interface ExportData {
  game: any
  teams: any[]
  questions: any[]
  answers: ExportAnswerRow[]
}

const exportDataInflight = new Map<string, Promise<ExportData>>()

function questionNumberOf(q: { question_number?: number; order_index?: number }, index: number): number {
  return q.question_number ?? q.order_index ?? index + 1
}

export async function loadExportData(gameId: string): Promise<ExportData> {
  const existing = exportDataInflight.get(gameId)
  if (existing) return existing

  const promise = enqueueCritical(async () => {
    const { data: game } = await supabase
      .from('games')
      .select('id, title, created_at, code')
      .eq('id', gameId)
      .maybeSingle()

    const { data: teams } = await supabase
      .from('teams')
      .select('id, team_name, captain_name, total_score, registration_time')
      .eq('game_id', gameId)
      .order('total_score', { ascending: false })

    const { data: questions } = await supabase
      .from('questions')
      .select('id, question_text, type, difficulty, points, per_question_time_sec, question_number, order_index')
      .eq('game_id', gameId)
      .order('question_number', { ascending: true })

    const teamIds = (teams ?? []).map((t) => t.id)
    const { data: answers } =
      teamIds.length > 0
        ? await supabase
            .from('answers')
            .select('id, team_id, question_number, answer, time_spent, points_earned, is_correct')
            .in('team_id', teamIds)
        : { data: [] as ExportAnswerRow[] }

    return {
      game: game || {},
      teams: teams || [],
      questions: questions || [],
      answers: (answers || []) as ExportAnswerRow[],
    }
  })

  exportDataInflight.set(gameId, promise)
  try {
    return await promise
  } finally {
    exportDataInflight.delete(gameId)
  }
}

export async function exportToExcel(gameId: string, gameName: string, preloaded?: ExportData) {
  await loadExportLibraries()
  const data = preloaded ?? (await loadExportData(gameId))

  const teamsData = data.teams.map((team, index) => ({
    'Место': index + 1,
    'Команда': team.team_name,
    'Капитан': team.captain_name,
    'Очки': team.total_score,
    'Время регистрации': new Date(team.registration_time).toLocaleString('ru-RU')
  }))

  const questionsData = data.questions.map((q, index) => ({
    'Номер': questionNumberOf(q, index),
    'Вопрос': (q as { question_text?: string }).question_text ?? '',
    'Тип': q.type,
    'Сложность': q.difficulty,
    'Базовые очки': (q as { points?: number }).points ?? 0,
    'Время (сек)': q.per_question_time_sec
  }))

  const answersData = data.answers.map(answer => {
    const team = data.teams.find(t => t.id === answer.team_id)
    const question = data.questions.find(
      (q, idx) => questionNumberOf(q, idx) === answer.question_number
    )
    const questionText = (question as { question_text?: string } | undefined)?.question_text ?? ''
    
    return {
      'Команда': team?.team_name || 'Неизвестно',
      'Вопрос №': answer.question_number,
      'Вопрос': questionText.length > 50 ? questionText.substring(0, 50) + '...' : questionText || 'Неизвестно',
      'Ответ': answerJsonToDisplayText(answer.answer),
      'Время (сек)': answer.time_spent,
      'Очки': answer.points_earned,
      'Правильно': answer.is_correct ? 'Да' : 'Нет'
    }
  })

  const wb = XLSX.utils.book_new()
  
  // Создаем лист с информацией об игре
  const gameInfoData = [
    { 'Параметр': 'Название игры', 'Значение': data.game.title || gameName },
    { 'Параметр': 'Код игры', 'Значение': data.game.code || 'Не указан' },
    { 'Параметр': 'Количество команд', 'Значение': data.teams.length },
    { 'Параметр': 'Количество вопросов', 'Значение': data.questions.length },
    { 'Параметр': 'Дата создания', 'Значение': data.game.created_at ? new Date(data.game.created_at).toLocaleString('ru-RU') : 'Неизвестно' }
  ]
  
  const wsGameInfo = XLSX.utils.json_to_sheet(gameInfoData)
  XLSX.utils.book_append_sheet(wb, wsGameInfo, 'Информация')
  
  const wsTeams = XLSX.utils.json_to_sheet(teamsData)
  XLSX.utils.book_append_sheet(wb, wsTeams, 'Команды')
  
  const wsQuestions = XLSX.utils.json_to_sheet(questionsData)
  XLSX.utils.book_append_sheet(wb, wsQuestions, 'Вопросы')
  
  const wsAnswers = XLSX.utils.json_to_sheet(answersData)
  XLSX.utils.book_append_sheet(wb, wsAnswers, 'Ответы')

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/octet-stream' })
  saveAs(blob, `${gameName}_результаты.xlsx`)
}

export async function exportToPDF(gameId: string, gameName: string, preloaded?: ExportData) {
  await loadExportLibraries()
  const data = preloaded ?? (await loadExportData(gameId))
  
  const doc = new jsPDF()
  let yPos = 20

  doc.setFontSize(18)
  doc.text(gameName, 20, yPos)
  yPos += 10

  doc.setFontSize(14)
  doc.text('Результаты игры', 20, yPos)
  yPos += 15

  doc.setFontSize(12)
  doc.text('Топ команд:', 20, yPos)
  yPos += 8

  doc.setFontSize(10)
  data.teams.slice(0, 10).forEach((team, index) => {
    if (yPos > 270) {
      doc.addPage()
      yPos = 20
    }
    doc.text(
      `${index + 1}. ${team.team_name} (${team.captain_name}) - ${team.total_score} очков`,
      25,
      yPos
    )
    yPos += 6
  })

  yPos += 10
  if (yPos > 260) {
    doc.addPage()
    yPos = 20
  }

  doc.setFontSize(12)
  doc.text('Статистика:', 20, yPos)
  yPos += 8

  doc.setFontSize(10)
  doc.text(`Всего команд: ${data.teams.length}`, 25, yPos)
  yPos += 6
  doc.text(`Всего вопросов: ${data.questions.length}`, 25, yPos)
  yPos += 6
  doc.text(`Всего ответов: ${data.answers.length}`, 25, yPos)

  doc.save(`${gameName}_результаты.pdf`)
}

export function buildTeamsCsvContent(data: ExportData): string {
  const csvRows = [
    ['Место', 'Команда', 'Капитан', 'Очки', 'Время регистрации'],
    ...data.teams.map((team, index) => [
      index + 1,
      team.team_name,
      team.captain_name,
      team.total_score,
      new Date(team.registration_time).toLocaleString('ru-RU'),
    ]),
  ]

  return csvRows
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

export async function downloadCsvFile(content: string, filename: string): Promise<void> {
  await loadExportLibraries()
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const csvWithBom = new Blob([bom, content], { type: 'text/csv;charset=utf-8;' })
  saveAs(csvWithBom, filename)
}

export async function exportToCSV(gameId: string, gameName: string, preloaded?: ExportData) {
  const data = preloaded ?? (await loadExportData(gameId))
  const csvContent = buildTeamsCsvContent(data)
  const safeName = gameName.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 60)
  await downloadCsvFile(csvContent, `${safeName}_результаты.csv`)
}

export async function exportAllFormats(gameId: string, gameName: string) {
  try {
    const data = await loadExportData(gameId)
    await exportToExcel(gameId, gameName, data)
    await exportToPDF(gameId, gameName, data)
    await exportToCSV(gameId, gameName, data)
    return true
  } catch (error) {
    console.error('Ошибка экспорта:', error)
    return false
  }
}
