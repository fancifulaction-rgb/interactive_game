#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hbucavkxxclouohfgsif.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTM5ODkxNSwiZXhwIjoyMDc2OTc0OTE1fQ.cDRAftpn6O9mwWFAdmDTI6FujJhx_0pBfGsNbMy0aiQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function createTestTeamsAndTestDelete() {
  console.log('🔍 === ТЕСТ УДАЛЕНИЯ С ТЕСТОВЫМИ КОМАНДАМИ ===');
  
  try {
    // 1. Создаем тестовую игру
    console.log('\n📋 1. СОЗДАЕМ ТЕСТОВУЮ ИГРУ:');
    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .insert({
        game_title: 'Тест удаления команд v1.2.9',
        game_description: 'Игра для тестирования функций удаления команд'
      })
      .select()
      .single();
    
    if (gameError) {
      console.error('❌ Ошибка создания игры:', gameError);
      return;
    }
    
    const testGameId = gameData.id;
    console.log(`✅ Тестовая игра создана: ${testGameId}`);
    
    // 2. Создаем тестовые команды
    console.log('\n👥 2. СОЗДАЕМ ТЕСТОВЫЕ КОМАНДЫ:');
    const testTeams = [
      { team_name: 'Команда А', captain_name: 'Капитан А', game_id: testGameId },
      { team_name: 'Команда Б', captain_name: 'Капитан Б', game_id: testGameId },
      { team_name: 'Команда В', captain_name: 'Капитан В', game_id: testGameId },
      { team_name: 'Команда Г', captain_name: 'Капитан Г', game_id: testGameId },
      { team_name: 'Команда Д', captain_name: 'Капитан Д', game_id: testGameId }
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
    
    // 3. ТЕСТ УДАЛЕНИЯ ОДНОЙ КОМАНДЫ
    console.log('\n🗑️ 3. ТЕСТ УДАЛЕНИЯ ОДНОЙ КОМАНДЫ:');
    const teamToDelete1 = createdTeams[0];
    console.log(`   Удаляем: "${teamToDelete1.team_name}" (${teamToDelete1.id})`);
    
    const { data: deleteResult1, error: deleteError1 } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamToDelete1.id)
      .select();
    
    if (deleteError1) {
      console.error('❌ Ошибка удаления одной команды:', deleteError1);
      return;
    }
    
    console.log(`✅ Удалено одной команды: ${deleteResult1.length}`);
    
    // 4. ТЕСТ УДАЛЕНИЯ НЕСКОЛЬКИХ КОМАНД
    console.log('\n🗑️ 4. ТЕСТ УДАЛЕНИЯ НЕСКОЛЬКИХ КОМАНД:');
    const teamsToDelete2 = [createdTeams[1].id, createdTeams[2].id];
    console.log(`   Удаляем ID: ${teamsToDelete2}`);
    
    const { data: deleteResult2, error: deleteError2 } = await supabase
      .from('teams')
      .delete()
      .in('id', teamsToDelete2)
      .select();
    
    if (deleteError2) {
      console.error('❌ Ошибка удаления нескольких команд:', deleteError2);
      return;
    }
    
    console.log(`✅ Удалено команд: ${deleteResult2.length}`);
    deleteResult2.forEach(team => {
      console.log(`   Удалена: "${team.team_name}"`);
    });
    
    // 5. ПРОВЕРЯЕМ РЕЗУЛЬТАТ
    console.log('\n🔍 5. ПРОВЕРЯЕМ РЕЗУЛЬТАТ:');
    const { data: remainingTeams, error: remainingError } = await supabase
      .from('teams')
      .select('*')
      .eq('game_id', testGameId)
      .order('team_name');
    
    if (remainingError) {
      console.error('❌ Ошибка проверки результата:', remainingError);
      return;
    }
    
    console.log(`✅ Команды в БД после удаления: ${remainingTeams.length}`);
    remainingTeams.forEach((team, i) => {
      console.log(`   ${i + 1}. ${team.team_name}`);
    });
    
    // 6. ТЕСТ ЧЕРЕЗ КЛИЕНТОВ КЛЮЧ (имитируем frontend)
    console.log('\n🔑 6. ТЕСТ ЧЕРЕЗ АНОНИМНЫЙ КЛЮЧ:');
    const anonSupabase = createClient(
      'https://hbucavkxxclouohfgsif.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzOTg5MTUsImV4cCI6MjA3Njk3NDkxNX0.5_IjnU83pwlOvVu4ZBk6hZB0G9q5mGRXBBY3HNBGRGw'
    );
    
    const remainingIds = remainingTeams.map(t => t.id);
    const testIds = [remainingIds[0]].slice(0, 1); // Берем одну команду
    
    console.log(`   Пробуем удалить через анонимный ключ ID: ${testIds}`);
    
    const { data: anonDelete, error: anonDeleteError } = await anonSupabase
      .from('teams')
      .delete()
      .in('id', testIds)
      .select();
    
    if (anonDeleteError) {
      console.error('❌ Ошибка удаления через анонимный ключ:', anonDeleteError);
    } else {
      console.log(`✅ Удалено через анонимный ключ: ${anonDelete.length}`);
    }
    
    // 7. ОЧИСТКА - удаляем тестовую игру и команды
    console.log('\n🧹 7. ОЧИСТКА ТЕСТОВЫХ ДАННЫХ:');
    const { error: cleanupError } = await supabase
      .from('games')
      .delete()
      .eq('id', testGameId);
    
    if (cleanupError) {
      console.error('❌ Ошибка очистки:', cleanupError);
    } else {
      console.log('✅ Тестовые данные удалены');
    }
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  }
}

createTestTeamsAndTestDelete().then(() => {
  console.log('\n🎯 ТЕСТ ЗАВЕРШЕН');
  process.exit(0);
}).catch(err => {
  console.error('❌ НЕПРЕДВИДЕННАЯ ОШИБКА:', err);
  process.exit(1);
});