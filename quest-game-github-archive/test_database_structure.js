// Тестирование структуры базы данных и удаления команд
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hbucavkxxclouohfgsif.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTM5ODkxNSwiZXhwIjoyMDc2OTc0OTE1fQ.cDRAftpn6O9mwWFAdmDTI6FujJhx_0pBfGsNbMy0aiQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDatabaseStructure() {
  console.log('🗃️ НАЧАЛО ПРОВЕРКИ СТРУКТУРЫ БАЗЫ ДАННЫХ');
  
  try {
    // Проверяем таблицы
    console.log('\n📋 ПРОВЕРКА ТАБЛИЦ:');
    
    // 1. Проверяем таблицу games
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, code')
      .limit(5);
    
    if (gamesError) {
      console.error('❌ Ошибка при получении games:', gamesError);
    } else {
      console.log('✅ Таблица games доступна:', games);
    }
    
    // 2. Проверяем таблицу teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, team_name, game_id, avatar_url, total_score')
      .limit(10);
    
    if (teamsError) {
      console.error('❌ Ошибка при получении teams:', teamsError);
    } else {
      console.log('✅ Таблица teams доступна:', teams);
      console.log('📊 Команды по game_id:', teams.map(t => ({ id: t.id, game_id: t.game_id })));
    }
    
    // 3. Проверяем таблицу answers
    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select('id, team_id')
      .limit(5);
    
    if (answersError) {
      console.error('❌ Ошибка при получении answers:', answersError);
    } else {
      console.log('✅ Таблица answers доступна:', answers);
    }
    
    // 4. Проверяем таблицу message_recipients
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, team_id')
      .limit(5);
    
    if (messagesError) {
      console.error('❌ Ошибка при получении messages:', messagesError);
    } else {
      console.log('✅ Таблица messages доступна:', messages);
    }
    
    // Тестируем удаление команд
    console.log('\n🧪 ТЕСТИРОВАНИЕ УДАЛЕНИЯ КОМАНД:');
    
    if (teams && teams.length > 0) {
      const testGameId = teams[0].game_id;
      const testTeamId = teams[0].id;
      
      console.log('🎯 Тестируем удаление команды:', {
        teamId: testTeamId,
        gameId: testGameId
      });
      
      // Получаем связанные данные
      const { data: relatedAnswers } = await supabase
        .from('answers')
        .select('id')
        .eq('team_id', testTeamId);
      
      const { data: relatedMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('team_id', testTeamId);
      
      console.log('📋 Связанные данные:', {
        answersCount: relatedAnswers?.length || 0,
        messagesCount: relatedMessages?.length || 0
      });
      
      // Пробуем удалить связанные данные
      console.log('⛔ Удаляем связанные данные...');
      
      const { error: deleteAnswersError } = await supabase
        .from('answers')
        .delete()
        .eq('team_id', testTeamId);
      
      const { error: deleteMessagesError } = await supabase
        .from('messages')
        .delete()
        .eq('team_id', testTeamId);
      
      if (deleteAnswersError) {
        console.error('❌ Ошибка при удалении answers:', deleteAnswersError);
      } else {
        console.log('✅ Удалены связанные answers');
      }
      
      if (deleteMessagesError) {
        console.error('❌ Ошибка при удалении messages:', deleteMessagesError);
      } else {
        console.log('✅ Удалены связанные messages');
      }
      
      // Удаляем команду
      console.log('⛔ Удаляем команду...');
      
      const { error: deleteTeamError, count } = await supabase
        .from('teams')
        .delete()
        .eq('id', testTeamId);
      
      if (deleteTeamError) {
        console.error('❌ Ошибка при удалении команды:', deleteTeamError);
      } else {
        console.log('✅ Команда удалена:', count);
      }
      
      // Проверяем результат
      const { data: checkTeam } = await supabase
        .from('teams')
        .select('id')
        .eq('id', testTeamId);
      
      console.log('🔍 Проверка после удаления:', checkTeam);
      
    } else {
      console.log('⚠️ Нет команд для тестирования');
    }
    
  } catch (error) {
    console.error('💥 Критическая ошибка:', error);
  }
}

testDatabaseStructure();