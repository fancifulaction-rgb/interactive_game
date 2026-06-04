// Простой тест удаления без внешних зависимостей
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Не найдены переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const gameId = '5e6c2d57-f047-4cab-b016-47a2f3a75cbe'; // тестовая игра 37

console.log('🔍 ТЕСТ ПРЯМОГО УДАЛЕНИЯ ВОПРОСОВ');
console.log('='.repeat(50));

async function testDelete() {
    try {
        console.log(`🎯 Целевая игра ID: ${gameId}`);
        
        // Шаг 1: Подсчёт вопросов до удаления
        console.log('\n📊 ШАГ 1: Подсчёт вопросов ДО удаления...');
        const { count: beforeCount, error: beforeError } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('game_id', gameId);
        
        if (beforeError) {
            console.error('❌ Ошибка при подсчёте до удаления:', beforeError);
            return;
        }
        
        console.log(`   ✅ Найдено вопросов: ${beforeCount}`);
        
        // Шаг 2: Попытка удаления
        console.log('\n🗑️ ШАГ 2: Выполнение удаления...');
        
        const { data: deleteData, error: deleteError } = await supabase
            .from('questions')
            .delete()
            .eq('game_id', gameId)
            .select();
        
        if (deleteError) {
            console.error('   ❌ Ошибка при удалении:', deleteError);
            console.error('   📋 Детали ошибки:', JSON.stringify(deleteError, null, 2));
            return;
        }
        
        console.log(`   ✅ Удалено записей: ${deleteData?.length || 0}`);
        
        // Шаг 3: Подсчёт вопросов после удаления
        console.log('\n📊 ШАГ 3: Подсчёт вопросов ПОСЛЕ удаления...');
        const { count: afterCount, error: afterError } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('game_id', gameId);
        
        if (afterError) {
            console.error('❌ Ошибка при подсчёте после удаления:', afterError);
            return;
        }
        
        console.log(`   ✅ Осталось вопросов: ${afterCount}`);
        
        // Анализ результата
        console.log('\n📈 АНАЛИЗ РЕЗУЛЬТАТА:');
        if (afterCount === 0) {
            console.log('   🎉 УДАЛЕНИЕ УСПЕШНО! Все вопросы удалены.');
        } else if (afterCount === beforeCount) {
            console.log('   🚨 КРИТИЧЕСКАЯ ОШИБКА: Ни один вопрос не был удалён!');
            console.log('      Возможные причины:');
            console.log('      1. RLS политики блокируют удаление');
            console.log('      2. Недостаточно прав доступа');
            console.log('      3. Данные защищены от удаления');
        } else {
            console.log(`   ⚠️  ЧАСТИЧНОЕ УДАЛЕНИЕ: Удалено ${beforeCount - afterCount} из ${beforeCount} вопросов`);
        }
        
    } catch (error) {
        console.error('💥 Критическая ошибка:', error);
    }
}

testDelete();