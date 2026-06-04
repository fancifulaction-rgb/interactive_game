import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://hbucavkxxclouohfgsif.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTM5ODkxNSwiZXhwIjoyMDc2OTc0OTE1fQ.cDRAftpn6O9mwWFAdmDTI6FujJhx_0pBfGsNbMy0aiQ'
)

async function debugQuestions() {
  console.log('=== ДИАГНОСТИКА ВОПРОСОВ В БАЗЕ ДАННЫХ ===\n')
  
  try {
    // 1. Получаем все игры
    console.log('1. Список всех игр:')
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (gamesError) throw gamesError
    console.log('Найдено игр:', games?.length || 0)
    console.table(games?.map(game => ({
      ID: game.id,
      Код: game.code,
      Название: game.title,
      Создана: game.created_at
    })))
    console.log()
    
    // 2. Для каждой игры проверяем вопросы
    for (const game of games || []) {
      console.log(`2. Вопросы для игры "${game.title}" (код: ${game.code}, ID: ${game.id}):`)
      
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', game.id)
        .order('order_index', { ascending: true })
      
      if (questionsError) throw questionsError
      
      console.log(`   Найдено вопросов: ${questions?.length || 0}`)
      
      if (questions && questions.length > 0) {
        console.table(questions.map(q => ({
          ID: q.id,
          Индекс: q.order_index,
          Тип: q.type,
          Текст: q.prompt?.substring(0, 50) + '...',
          Ответы: q.answer?.length || 0,
          Создан: q.created_at
        })))
        
        // Проверяем на дубликаты по order_index
        const orderIndexes = questions.map(q => q.order_index)
        const uniqueIndexes = [...new Set(orderIndexes)]
        if (orderIndexes.length !== uniqueIndexes.length) {
          console.log('   ⚠️ ПРЕДУПРЕЖДЕНИЕ: Обнаружены дубликаты order_index!')
          console.log('   Все индексы:', orderIndexes.sort((a, b) => a - b))
          console.log('   Уникальные индексы:', uniqueIndexes.sort((a, b) => a - b))
        }
        
        // Проверяем на дубликаты по тексту вопроса
        const prompts = questions.map(q => q.prompt?.trim())
        const uniquePrompts = [...new Set(prompts)]
        if (prompts.length !== uniquePrompts.length) {
          console.log('   ⚠️ ПРЕДУПРЕЖДЕНИЕ: Обнаружены дубликаты по тексту вопроса!')
        }
      }
      
      console.log()
    }
    
    // 3. Статистика по таблицам
    console.log('3. Статистика базы данных:')
    
    const { count: gamesCount } = await supabase.from('games').select('*', { count: 'exact', head: true })
    const { count: questionsCount } = await supabase.from('questions').select('*', { count: 'exact', head: true })
    const { count: answersCount } = await supabase.from('answers').select('*', { count: 'exact', head: true })
    const { count: teamsCount } = await supabase.from('teams').select('*', { count: 'exact', head: true })
    
    console.log({
      'Игр в базе': gamesCount || 0,
      'Вопросов в базе': questionsCount || 0,
      'Ответов в базе': answersCount || 0,
      'Команд в базе': teamsCount || 0
    })
    
  } catch (error) {
    console.error('Ошибка диагностики:', error)
  }
}

debugQuestions()