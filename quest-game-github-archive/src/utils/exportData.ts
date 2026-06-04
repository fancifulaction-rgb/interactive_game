import { supabase } from '../lib/supabase'

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

export interface ExportData {
  game: any
  teams: any[]
  questions: any[]
  answers: any[]
}

export async function loadExportData(gameId: string): Promise<ExportData> {
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle()

  const { data: teams } = await supabase
    .from('teams')
    .select('*')
    .eq('game_id', gameId)
    .order('total_score', { ascending: false })

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('game_id', gameId)
    .order('order_index', { ascending: true })

  const { data: answers } = await supabase
    .from('answers')
    .select('*')

  return {
    game: game || {},
    teams: teams || [],
    questions: questions || [],
    answers: answers || []
  }
}

export async function exportToExcel(gameId: string, gameName: string) {
  await loadExportLibraries()
  const data = await loadExportData(gameId)

  const teamsData = data.teams.map((team, index) => ({
    'Место': index + 1,
    'Команда': team.team_name,
    'Капитан': team.captain_name,
    'Очки': team.total_score,
    'Время регистрации': new Date(team.registration_time).toLocaleString('ru-RU')
  }))

  const questionsData = data.questions.map((q, index) => ({
    'Номер': index + 1,
    'Вопрос': q.prompt,
    'Тип': q.type,
    'Сложность': q.difficulty,
    'Базовые очки': q.base_points,
    'Время (сек)': q.per_question_time_sec
  }))

  const answersData = data.answers.map(answer => {
    const team = data.teams.find(t => t.id === answer.team_id)
    const question = data.questions.find(q => q.id === answer.question_id)
    
    return {
      'Команда': team?.team_name || 'Неизвестно',
      'Вопрос №': question ? (data.questions.findIndex(q => q.id === question.id) + 1) : 'Неизвестно',
      'Вопрос': question?.prompt?.substring(0, 50) + (question?.prompt?.length > 50 ? '...' : '') || 'Неизвестно',
      'Ответ': answer.answer_text || '',
      'Время (сек)': answer.time_taken,
      'Очки': answer.score,
      'Правильно': answer.is_correct ? 'Да' : 'Нет'
    }
  })

  const wb = XLSX.utils.book_new()
  
  // Создаем лист с информацией об игре
  const gameInfoData = [
    { 'Параметр': 'Название игры', 'Значение': data.game.title || gameName },
    { 'Параметр': 'Описание', 'Значение': data.game.description || 'Не указано' },
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

export async function exportToPDF(gameId: string, gameName: string) {
  await loadExportLibraries()
  const data = await loadExportData(gameId)
  
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

export async function exportToCSV(gameId: string, gameName: string) {
  await loadExportLibraries()
  const data = await loadExportData(gameId)

  const csvRows = [
    ['Место', 'Команда', 'Капитан', 'Очки', 'Время регистрации'],
    ...data.teams.map((team, index) => [
      index + 1,
      team.team_name,
      team.captain_name,
      team.total_score,
      new Date(team.registration_time).toLocaleString('ru-RU')
    ])
  ]

  const csvContent = csvRows.map(row => 
    row.map(cell => {
      // Экранируем кавычки и обрамляем поле в кавычки если нужно
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
        return '"' + cell.replace(/"/g, '""') + '"'
      }
      return cell
    }).join(',')
  ).join('\n')

  // Правильно добавляем BOM для UTF-8 и указываем кодировку
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]) // UTF-8 BOM
  const csvWithBom = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' })
  saveAs(csvWithBom, `${gameName}_результаты.csv`)
}

export async function exportAllFormats(gameId: string, gameName: string) {
  try {
    await exportToExcel(gameId, gameName)
    await exportToPDF(gameId, gameName)
    await exportToCSV(gameId, gameName)
    return true
  } catch (error) {
    console.error('Ошибка экспорта:', error)
    return false
  }
}
