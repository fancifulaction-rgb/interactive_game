#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hbucavkxxclouohfgsif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzOTg5MTUsImV4cCI6MjA3Njk3NDkxNX0.5_IjnU83pwlOvVu4ZBk6hZB0G9q5mGRXBBY3HNBGRGw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function finalDeleteTest() {
  console.log('🔍 === ФИНАЛЬНЫЙ ТЕСТ УДАЛЕНИЯ ===');
  
  try {
    // 1. Получаем существующую игру
    console.log('\n📋 1. ПОЛУЧАЕМ ИГРУ:');
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .limit(1);
    
    if (gamesError) {
      console.error('❌ Ошибка игр:', gamesError);
      return;
    }
    
    if (!games || games.length === 0) {
      console.log('❌ Нет игр в БД');
      return;
    }
    
    const testGame = games[0];
    console.log(`✅ Игра: "${testGame.title}" (${testGame.id})`);
    
    // 2. Создаем команды для этой игры
    console.log('\n👥 2. СОЗДАЕМ ТЕСТОВЫЕ КОМАНДЫ:');
    const testTeams = [
      { team_name: 'Тест Команда 1', captain_name: 'Капитан 1', game_id: testGame.id },
      { team_name: 'Тест Команда 2', captain_name: 'Капитан 2', game_id: testGame.id },
      { team_name: 'Тест Команда 3', captain_name: 'Капитан 3', game_id: testGame.id },
      { team_name: 'Тест Команда 4', captain_name: 'Капитан 4', game_id: testGame.id }
    ];
    
    const { data: createdTeams, error: teamsError } = await supabase
      .from('teams')
      .insert(testTeams)
      .select();
    
    if (teamsError) {
      console.error('❌ Ошибка создания команд:', teamsError);
      return;
    }
    
    console.log(`✅ Создано команд: ${createdTeams.length}`);
    createdTeams.forEach((team, i) => {
      console.log(`   ${i + 1}. ${team.team_name} (${team.id})`);
    });
    
    // 3. ПРОВЕРЯЕМ УДАЛЕНИЕ ОДНОЙ КОМАНДЫ
    console.log('\n🗑️ 3. ТЕСТ УДАЛЕНИЯ ОДНОЙ КОМАНДЫ:');
    const teamToDelete = createdTeams[0];
    console.log(`   Удаляем: "${teamToDelete.team_name}"`);
    
    const { data: deleteResult, error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamToDelete.id)
      .select();
    
    if (deleteError) {
      console.error('❌ ОШИБКА УДАЛЕНИЯ:', deleteError);
      console.log('💡 ЭТО МОЖЕТ БЫТЬ ПРОБЛЕМА С RLS ПОЛИТИКАМИ!');
      return;
    }
    
    console.log(`✅ Удалено команд: ${deleteResult?.length || 0}`);
    
    // 4. ПРОВЕРЯЕМ УДАЛЕНИЕ НЕСКОЛЬКИХ КОМАНД
    console.log('\n🗑️ 4. ТЕСТ УДАЛЕНИЯ НЕСКОЛЬКИХ КОМАНД:');
    const remainingTeams = createdTeams.slice(1); // Берем оставшиеся 3 команды
    const teamsToDelete = remainingTeams.slice(0, 2).map(t => t.id); // Удаляем 2 из них
    console.log(`   Удаляем ID: ${teamsToDelete}`);
    
    const { data: bulkDeleteResult, error: bulkDeleteError } = await supabase
      .from('teams')
      .delete()
      .in('id', teamsToDelete)
      .select();
    
    if (bulkDeleteError) {
      console.error('❌ ОШИБКА МАССОВОГО УДАЛЕНИЯ:', bulkDeleteError);
      return;
    }
    
    console.log(`✅ Удалено команд: ${bulkDeleteResult?.length || 0}`);
    
    // 5. ПРОВЕРЯЕМ РЕЗУЛЬТАТ
    console.log('\n🔍 5. ПРОВЕРЯЕМ ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:');
    const { data: finalTeams, error: finalError } = await supabase
      .from('teams')
      .select('*')
      .eq('game_id', testGame.id);
    
    if (finalError) {
      console.error('❌ Ошибка финальной проверки:', finalError);
    } else {
      console.log(`✅ Команды в БД после всех тестов: ${finalTeams?.length || 0}`);
      finalTeams?.forEach(team => {
        console.log(`   - ${team.team_name}`);
      });
    }
    
    // 6. ОЧИСТКА - удаляем тестовые команды
    console.log('\n🧹 6. ОЧИСТКА ТЕСТОВЫХ КОМАНД:');
    if (finalTeams && finalTeams.length > 0) {
      const { error: cleanupError } = await supabase
        .from('teams')
        .delete()
        .in('id', finalTeams.map(t => t.id));
      
      if (cleanupError) {
        console.error('❌ Ошибка очистки:', cleanupError);
      } else {
        console.log('✅ Тестовые команды удалены');
      }
    }
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  }
}

finalDeleteTest().then(() => {
  console.log('\n🎯 ТЕСТ ЗАВЕРШЕН');
  process.exit(0);
}).catch(err => {
  console.error('❌ НЕПРЕДВИДЕННАЯ ОШИБКА:', err);
  process.exit(1);
});