#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hbucavkxxclouohfgsif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzOTg5MTUsImV4cCI6MjA3Njk3NDkxNX0.5_IjnU83pwlOvVu4ZBk6hZB0G9q5mGRXBBY3HNBGRGw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function diagnoseDeletionProblems() {
  console.log('🔍 === ДИАГНОСТИКА ПРОБЛЕМ УДАЛЕНИЯ ===');
  console.log('Время:', new Date().toISOString());
  
  try {
    // 1. Получаем список игр
    console.log('\n📋 1. ПОЛУЧАЕМ ИГРЫ:');
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (gamesError) {
      console.error('❌ Ошибка игр:', gamesError);
      return;
    }
    
    if (!games || games.length === 0) {
      console.log('❌ Нет игр для тестирования');
      return;
    }
    
    const testGame = games[0];
    console.log(`✅ Игра для тестирования: ${testGame.id}`);
    
    // 2. Получаем команды
    console.log('\n👥 2. ПОЛУЧАЕМ КОМАНДЫ:');
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .eq('game_id', testGame.id)
      .order('registration_time', { ascending: false });
    
    if (teamsError) {
      console.error('❌ Ошибка команд:', teamsError);
      return;
    }
    
    if (!teams || teams.length < 3) {
      console.log('❌ Недостаточно команд для тестирования (нужно минимум 3):', teams?.length || 0);
      return;
    }
    
    console.log(`✅ Команды: ${teams.length}`);
    teams.forEach((team, i) => {
      console.log(`   ${i + 1}. ID: ${team.id}, Название: "${team.team_name}"`);
    });
    
    // 3. ТЕСТ 1: Удаление через .in() (как в коде)
    console.log('\n🗑️ 3. ТЕСТ УДАЛЕНИЯ ЧЕРЕЗ .in() МЕТОД:');
    const testTeam1 = teams[0];
    const testTeam2 = teams[1];
    const teamsIdsForTest = [testTeam1.id, testTeam2.id];
    
    console.log(`   Удаляем ID: ${teamsIdsForTest}`);
    
    const { data: deleteResult, error: deleteError } = await supabase
      .from('teams')
      .delete()
      .in('id', teamsIdsForTest)
      .select();
    
    if (deleteError) {
      console.error('❌ Ошибка удаления .in():', deleteError);
      return;
    }
    
    console.log(`✅ Удалено через .in(): ${deleteResult?.length || 0} команд`);
    if (deleteResult) {
      deleteResult.forEach((team, i) => {
        console.log(`   ${i + 1}. Удалена: "${team.team_name}" (${team.id})`);
      });
    }
    
    // 4. Проверяем что команды удалены
    console.log('\n🔍 4. ПРОВЕРЯЕМ РЕЗУЛЬТАТ УДАЛЕНИЯ:');
    const { data: remainingTeams, error: remainingError } = await supabase
      .from('teams')
      .select('*')
      .eq('game_id', testGame.id)
      .order('registration_time', { ascending: false });
    
    if (remainingError) {
      console.error('❌ Ошибка проверки:', remainingError);
      return;
    }
    
    console.log(`✅ Команды в БД после удаления: ${remainingTeams?.length || 0}`);
    
    const deletedIds = [testTeam1.id, testTeam2.id];
    const remainingIds = remainingTeams?.map(t => t.id) || [];
    const shouldBeGone = deletedIds.filter(id => remainingIds.includes(id));
    
    if (shouldBeGone.length > 0) {
      console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: ID ${shouldBeGone} остались в БД!`);
    } else {
      console.log('✅ Команды успешно удалены из БД');
    }
    
    // 5. ТЕСТ RLS (Row Level Security)
    console.log('\n🔐 5. ПРОВЕРЯЕМ RLS ПОЛИТИКИ:');
    const { data: policies, error: policiesError } = await supabase
      .rpc('get_policies_for_table', { table_name: 'teams' });
    
    if (policiesError) {
      console.log('⚠️ Не удалось получить политики RLS:', policiesError.message);
    } else {
      console.log('📋 RLS политики для таблицы teams:', policies);
    }
    
    // 6. ТЕСТ прав доступа
    console.log('\n🔑 6. ПРОВЕРЯЕМ ПРАВА ДОСТУПА:');
    
    // Проверяем можем ли мы читать
    const { data: readTest, error: readError } = await supabase
      .from('teams')
      .select('count', { count: 'exact', head: true })
      .eq('game_id', testGame.id);
    
    if (readError) {
      console.error('❌ Нет прав на чтение:', readError);
    } else {
      console.log(`✅ Права на чтение: count = ${readTest?.count || 'unknown'}`);
    }
    
    // Проверяем можем ли мы удалять
    const testTeam3 = teams[2];
    const { data: deletePermissionTest, error: deletePermissionError } = await supabase
      .from('teams')
      .delete()
      .eq('id', testTeam3.id)
      .select();
    
    if (deletePermissionError) {
      console.error('❌ Нет прав на удаление:', deletePermissionError);
    } else {
      console.log(`✅ Права на удаление: удалено ${deletePermissionTest?.length || 0} команд`);
    }
    
    // 7. ФИНАЛЬНАЯ СВОДКА
    console.log('\n📊 7. ФИНАЛЬНАЯ СВОДКА:');
    const { data: finalCount, error: finalError } = await supabase
      .from('teams')
      .select('*')
      .eq('game_id', testGame.id);
    
    if (finalError) {
      console.error('❌ Финальная ошибка:', finalError);
    } else {
      console.log(`✅ Команды в БД после всех тестов: ${finalCount?.length || 0}`);
    }
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  }
}

diagnoseDeletionProblems().then(() => {
  console.log('\n🎯 ДИАГНОСТИКА ЗАВЕРШЕНА');
  process.exit(0);
}).catch(err => {
  console.error('❌ НЕПРЕДВИДЕННАЯ ОШИБКА:', err);
  process.exit(1);
});