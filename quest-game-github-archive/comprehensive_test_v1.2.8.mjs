#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hbucavkxxclouohfgsif.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTM5ODkxNSwiZXhwIjoyMDc2OTc0OTE1fQ.cDRAftpn6O9mwWFAdmDTI6FujJhx_0pBfGsNbMy0aiQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function comprehensiveTest() {
  console.log('🔍 === КОМПЛЕКСНЫЙ ТЕСТ БД ===');
  console.log('Время:', new Date().toISOString());
  
  try {
    // 1. Проверяем игры
    console.log('\n📋 1. ПОЛУЧАЕМ СПИСОК ИГР:');
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (gamesError) {
      console.error('❌ Ошибка получения игр:', gamesError);
      return;
    }
    
    console.log('✅ Найдено игр:', games?.length || 0);
    if (games && games.length > 0) {
      console.log('📊 Список игр:');
      games.forEach((game, index) => {
        console.log(`   ${index + 1}. ID: ${game.id}, Название: ${game.game_title}, Дата: ${game.created_at}`);
      });
    }
    
    // 2. Берем первую игру для тестирования
    if (!games || games.length === 0) {
      console.log('❌ Нет игр для тестирования!');
      return;
    }
    
    const testGame = games[0];
    console.log(`\n🎮 2. ТЕСТИРУЕМ ИГРУ: ${testGame.game_title} (ID: ${testGame.id})`);
    
    // 3. Получаем команды для тестовой игры
    console.log('\n👥 3. ПОЛУЧАЕМ КОМАНДЫ:');
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .eq('game_id', testGame.id)
      .order('registration_time', { ascending: false });
    
    if (teamsError) {
      console.error('❌ Ошибка получения команд:', teamsError);
      return;
    }
    
    console.log('✅ Найдено команд:', teams?.length || 0);
    if (teams && teams.length > 0) {
      console.log('📊 Список команд:');
      teams.forEach((team, index) => {
        console.log(`   ${index + 1}. ID: ${team.id}, Название: ${team.team_name}, Капитан: ${team.captain_name}`);
      });
    } else {
      console.log('❌ В выбранной игре нет команд для тестирования!');
      return;
    }
    
    // 4. Тестируем удаление ОДНОЙ команды (первой)
    if (teams && teams.length > 0) {
      const testTeam = teams[0];
      console.log(`\n🗑️ 4. ТЕСТ УДАЛЕНИЯ ОДНОЙ КОМАНДЫ:`);
      console.log(`   Команда для удаления: "${testTeam.team_name}" (ID: ${testTeam.id})`);
      
      console.log('   ВЫПОЛНЯЕМ УДАЛЕНИЕ...');
      const { data: deleteResult, error: deleteError } = await supabase
        .from('teams')
        .delete()
        .eq('id', testTeam.id)
        .select(); // Возвращаем удаленные записи
      
      if (deleteError) {
        console.error('❌ ОШИБКА при удалении:', deleteError);
        return;
      }
      
      console.log('✅ Результат удаления:', deleteResult);
      console.log('✅ Удалено команд:', deleteResult?.length || 0);
      
      // 5. Проверяем, что команда действительно удалена
      console.log('\n🔍 5. ПРОВЕРЯЕМ РЕЗУЛЬТАТ УДАЛЕНИЯ:');
      const { data: remainingTeams, error: remainingError } = await supabase
        .from('teams')
        .select('*')
        .eq('game_id', testGame.id)
        .order('registration_time', { ascending: false });
      
      if (remainingError) {
        console.error('❌ Ошибка проверки оставшихся команд:', remainingError);
        return;
      }
      
      console.log('✅ Команды после удаления:', remainingTeams?.length || 0);
      if (remainingTeams && remainingTeams.length > 0) {
        console.log('📊 Оставшиеся команды:');
        remainingTeams.forEach((team, index) => {
          console.log(`   ${index + 1}. ID: ${team.id}, Название: ${team.team_name}, Капитан: ${team.captain_name}`);
        });
      }
      
      // 6. Проверяем что удаленная команда НЕ осталась в БД
      const deletedTeamStillExists = remainingTeams?.some(team => team.id === testTeam.id);
      if (deletedTeamStillExists) {
        console.log('❌ КРИТИЧЕСКАЯ ОШИБКА: Удаленная команда все еще существует в БД!');
      } else {
        console.log('✅ Команда успешно удалена из БД');
      }
      
      // 7. ТЕСТ УДАЛЕНИЯ НЕСКОЛЬКИХ КОМАНД (если есть)
      if (remainingTeams && remainingTeams.length >= 2) {
        console.log('\n🗑️ 6. ТЕСТ УДАЛЕНИЯ НЕСКОЛЬКИХ КОМАНД:');
        const teamsToDelete = remainingTeams.slice(0, 2).map(team => team.id);
        console.log('   ID команд для удаления:', teamsToDelete);
        
        console.log('   ВЫПОЛНЯЕМ МАССОВОЕ УДАЛЕНИЕ...');
        const { data: bulkDeleteResult, error: bulkDeleteError } = await supabase
          .from('teams')
          .delete()
          .in('id', teamsToDelete)
          .select();
        
        if (bulkDeleteError) {
          console.error('❌ Ошибка массового удаления:', bulkDeleteError);
          return;
        }
        
        console.log('✅ Результат массового удаления:', bulkDeleteResult);
        console.log('✅ Удалено команд:', bulkDeleteResult?.length || 0);
        
        // Финальная проверка
        const { data: finalTeams, error: finalError } = await supabase
          .from('teams')
          .select('*')
          .eq('game_id', testGame.id)
          .order('registration_time', { ascending: false });
        
        if (finalError) {
          console.error('❌ Ошибка финальной проверки:', finalError);
          return;
        }
        
        console.log('\n📊 ФИНАЛЬНОЕ СОСТОЯНИЕ БД:');
        console.log('✅ Команд в БД после всех тестов:', finalTeams?.length || 0);
        if (finalTeams && finalTeams.length > 0) {
          finalTeams.forEach((team, index) => {
            console.log(`   ${index + 1}. ID: ${team.id}, Название: ${team.team_name}`);
          });
        }
      }
    }
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  }
}

comprehensiveTest().then(() => {
  console.log('\n🎯 ТЕСТ ЗАВЕРШЕН');
  process.exit(0);
}).catch(err => {
  console.error('❌ НЕПРЕДВИДЕННАЯ ОШИБКА:', err);
  process.exit(1);
});