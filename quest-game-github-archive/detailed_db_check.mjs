// Детальная проверка структуры БД и всех связей
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Задайте SUPABASE_URL (или VITE_SUPABASE_URL) и SUPABASE_SERVICE_ROLE_KEY в .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function detailedDatabaseCheck() {
  console.log('🔍 ДЕТАЛЬНАЯ ПРОВЕРКА БАЗЫ ДАННЫХ');
  
  try {
    // 1. Проверяем все доступные таблицы
    console.log('\n📋 1. ВСЕ ДОСТУПНЫЕ ТАБЛИЦЫ:');
    
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, code, title')
      .limit(3);
    
    console.log('Games:', games);
    
    // 2. Проверяем команды и их связи
    console.log('\n📋 2. ТЕСТОВЫЕ КОМАНДЫ:');
    
    const { data: testTeams, error: teamsError } = await supabase
      .from('teams')
      .select('id, team_name, game_id, total_score, registration_time')
      .limit(5);
    
    if (teamsError) {
      console.error('❌ Ошибка teams:', teamsError);
      return;
    }
    
    console.log('Test teams:', testTeams);
    
    if (!testTeams || testTeams.length === 0) {
      console.log('⚠️ Нет команд для тестирования');
      return;
    }
    
    const testTeam = testTeams[0];
    console.log('\n🎯 Анализируем команду:', testTeam.team_name);
    
    // 3. Проверяем все возможные связи
    console.log('\n📋 3. ПРОВЕРКА СВЯЗЕЙ:');
    
    // Проверяем answers
    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select('*')
      .eq('team_id', testTeam.id)
      .limit(10);
    
    if (answersError) {
      console.error('❌ Ошибка answers:', answersError);
    } else {
      console.log(`✅ Answers для команды: ${answers?.length || 0}`);
    }
    
    // Проверяем admin_messages
    const { data: adminMessages, error: adminMessagesError } = await supabase
      .from('admin_messages')
      .select('*')
      .eq('game_id', testTeam.game_id)
      .limit(10);
    
    if (adminMessagesError) {
      console.error('❌ Ошибка admin_messages:', adminMessagesError);
    } else {
      console.log(`✅ Admin_messages для игры: ${adminMessages?.length || 0}`);
    }
    
    // Проверяем message_reads
    const { data: messageReads, error: messageReadsError } = await supabase
      .from('message_reads')
      .select('*')
      .eq('team_id', testTeam.id)
      .limit(10);
    
    if (messageReadsError) {
      console.error('❌ Ошибка message_reads:', messageReadsError);
    } else {
      console.log(`✅ Message_reads для команды: ${messageReads?.length || 0}`);
    }
    
    // 4. Проверяем другие возможные связанные таблицы
    console.log('\n📋 4. ПРОВЕРКА ДОПОЛНИТЕЛЬНЫХ ТАБЛИЦ:');
    
    const tableNames = ['player_results', 'scores', 'team_scores', 'game_sessions', 'quests'];
    
    for (const tableName of tableNames) {
      try {
        const { count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .limit(1);
        
        console.log(`✅ Таблица ${tableName}: ${count} записей`);
      } catch (error) {
        console.log(`❌ Таблица ${tableName}: не найдена или ошибка`);
      }
    }
    
    // 5. ПРОВЕРЯЕМ RLS политики
    console.log('\n📋 5. ПРОВЕРКА RLS ПОЛИТИК:');
    
    // Проверяем политики на таблицах
    const { data: rlsData } = await supabase.rpc('get_table_policies', { table_name: 'teams' });
    console.log('RLS Policies teams:', rlsData);
    
    // 6. ТЕСТИРУЕМ УДАЛЕНИЕ ПОШАГОВО
    console.log('\n🧪 6. ПОШАГОВОЕ ТЕСТИРОВАНИЕ УДАЛЕНИЯ:');
    
    // Создаем тестовую команду для удаления
    const newTestGame = games?.[0];
    if (newTestGame) {
      const { data: newTeam, error: createError } = await supabase
        .from('teams')
        .insert({
          team_name: 'ТЕСТОВАЯ КОМАНДА УДАЛЕНИЯ',
          captain_name: 'Тест капитан',
          game_id: newTestGame.id,
          total_score: 0
        })
        .select()
        .single();
      
      if (createError) {
        console.error('❌ Ошибка создания тестовой команды:', createError);
        return;
      }
      
      console.log('✅ Создана тестовая команда:', newTeam.id);
      
      // Добавляем тестовый ответ
      await supabase
        .from('answers')
        .insert({
          team_id: newTeam.id,
          question_id: 'test-question',
          answer_text: 'test answer'
        });
      
      console.log('✅ Добавлен тестовый ответ');
      
      // Шаг 1: Удаляем answers
      console.log('\n⛔ Шаг 1: Удаляем answers...');
      const { data: deletedAnswers, error: deleteAnswersError } = await supabase
        .from('answers')
        .delete()
        .eq('team_id', newTeam.id)
        .select();
      
      if (deleteAnswersError) {
        console.error('❌ Ошибка удаления answers:', deleteAnswersError);
      } else {
        console.log('✅ Удалено answers:', deletedAnswers?.length || 0);
      }
      
      // Шаг 2: Удаляем message_reads (если есть)
      console.log('\n⛔ Шаг 2: Удаляем message_reads...');
      const { data: deletedReads, error: deleteReadsError } = await supabase
        .from('message_reads')
        .delete()
        .eq('team_id', newTeam.id)
        .select();
      
      if (deleteReadsError) {
        console.error('❌ Ошибка удаления message_reads:', deleteReadsError);
      } else {
        console.log('✅ Удалено message_reads:', deletedReads?.length || 0);
      }
      
      // Шаг 3: Удаляем команду
      console.log('\n⛔ Шаг 3: Удаляем команду...');
      const { data: deletedTeam, error: deleteTeamError } = await supabase
        .from('teams')
        .delete()
        .eq('id', newTeam.id)
        .select();
      
      if (deleteTeamError) {
        console.error('❌ Ошибка удаления команды:', deleteTeamError);
      } else {
        console.log('✅ Удалена команда:', deletedTeam);
      }
      
      // Шаг 4: Проверяем результат
      console.log('\n🔍 Шаг 4: Проверяем результат...');
      const { data: remainingTeam } = await supabase
        .from('teams')
        .select('id')
        .eq('id', newTeam.id);
      
      console.log('🔍 Команда осталась:', remainingTeam?.length || 0);
      
      if (remainingTeam && remainingTeam.length === 0) {
        console.log('✅ УДАЛЕНИЕ УСПЕШНО!');
      } else {
        console.log('❌ КОМАНДА НЕ УДАЛИЛАСЬ!');
      }
    }
    
  } catch (error) {
    console.error('💥 Критическая ошибка:', error);
  }
}

detailedDatabaseCheck();