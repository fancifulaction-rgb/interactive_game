#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hbucavkxxclouohfgsif.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTM5ODkxNSwiZXhwIjoyMDc2OTc0OTE1fQ.cDRAftpn6O9mwWFAdmDTI6FujJhx_0pBfGsNbMy0aiQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testWithCorrectStructure() {
  console.log('🔍 === ТЕСТ С ПРАВИЛЬНОЙ СТРУКТУРОЙ ===');
  
  try {
    // 1. Проверим структуру таблицы games
    console.log('\n📋 1. ПРОВЕРЯЕМ СТРУКТУРУ ТАБЛИЦЫ GAMES:');
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .limit(1);
    
    if (gamesError) {
      console.error('❌ Ошибка доступа к games:', gamesError);
      return;
    }
    
    if (games && games.length > 0) {
      console.log('📊 Структура таблицы games:');
      console.log(Object.keys(games[0]));
    } else {
      console.log('📊 Создаем тестовую игру...');
      
      const { data: newGame, error: createError } = await supabase
        .from('games')
        .insert({
          game_title: 'Тест игры'
        })
        .select()
        .single();
      
      if (createError) {
        console.error('❌ Ошибка создания игры:', createError);
        return;
      }
      
      console.log('✅ Тестовая игра создана:', newGame.id);
      
      // 2. Создаем команды для этой игры
      console.log('\n👥 2. СОЗДАЕМ ТЕСТОВЫЕ КОМАНДЫ:');
      const testTeams = [
        { team_name: 'Тест Команда 1', captain_name: 'Капитан 1', game_id: newGame.id },
        { team_name: 'Тест Команда 2', captain_name: 'Капитан 2', game_id: newGame.id },
        { team_name: 'Тест Команда 3', captain_name: 'Капитан 3', game_id: newGame.id },
        { team_name: 'Тест Команда 4', captain_name: 'Капитан 4', game_id: newGame.id }
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
      
      // 3. ТЕСТ УДАЛЕНИЯ ЧЕРЕЗ АНОНИМНЫЙ КЛЮЧ
      console.log('\n🗑️ 3. ТЕСТ УДАЛЕНИЯ ЧЕРЕЗ FRONTEND КЛЮЧ:');
      
      const anonSupabase = createClient(
        'https://hbucavkxxclouohfgsif.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhidWNhdmt4eGNsb3VvaGZnc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzOTg5MTUsImV4cCI6MjA3Njk3NDkxNX0.5_IjnU83pwlOvVu4ZBk6hZB0G9q5mGRXBBY3HNBGRGw'
      );
      
      // Пробуем удалить одну команду
      const teamToDelete = createdTeams[0];
      console.log(`   Удаляем: "${teamToDelete.team_name}" (${teamToDelete.id})`);
      
      const { data: deleteResult, error: deleteError } = await anonSupabase
        .from('teams')
        .delete()
        .eq('id', teamToDelete.id)
        .select();
      
      if (deleteError) {
        console.error('❌ Ошибка удаления через анонимный ключ:', deleteError);
        console.error('❌ Это может быть проблема с RLS политиками!');
        return;
      }
      
      console.log(`✅ Удалено команд: ${deleteResult?.length || 0}`);
      
      // 4. ПРОВЕРЯЕМ РЕЗУЛЬТАТ
      console.log('\n🔍 4. ПРОВЕРЯЕМ РЕЗУЛЬТАТ УДАЛЕНИЯ:');
      const { data: remainingTeams, error: remainingError } = await anonSupabase
        .from('teams')
        .select('*')
        .eq('game_id', newGame.id);
      
      if (remainingError) {
        console.error('❌ Ошибка чтения результата:', remainingError);
      } else {
        console.log(`✅ Команды после удаления: ${remainingTeams?.length || 0}`);
        remainingTeams?.forEach(team => {
          console.log(`   ${team.team_name} (${team.id})`);
        });
      }
      
      // 5. ОЧИСТКА
      console.log('\n🧹 5. ОЧИСТКА:');
      await supabase.from('games').delete().eq('id', newGame.id);
      console.log('✅ Очистка завершена');
    }
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  }
}

testWithCorrectStructure().then(() => {
  console.log('\n🎯 ТЕСТ ЗАВЕРШЕН');
  process.exit(0);
}).catch(err => {
  console.error('❌ НЕПРЕДВИДЕННАЯ ОШИБКА:', err);
  process.exit(1);
});