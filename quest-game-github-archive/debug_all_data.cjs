const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Задайте SUPABASE_URL (или VITE_SUPABASE_URL) и SUPABASE_SERVICE_ROLE_KEY в .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugAllData() {
    console.log('🔍 Проверка ВСЕХ данных в базе...');
    
    try {
        console.log('\n🎮 ВСЕ ИГРЫ:');
        const { data: games, error: gamesError } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (gamesError) {
            console.error('❌ Ошибка поиска игр:', gamesError);
        } else if (games) {
            games.forEach((game, index) => {
                console.log(`${index + 1}. ID: ${game.id}`);
                console.log(`   Код: "${game.code}"`);
                console.log(`   Название: "${game.name}"`);
                console.log(`   Создан: ${game.created_at || 'не указано'}`);
                console.log('   ---');
            });
        }
        
        console.log('\n👥 ВСЕ ИГРОКИ:');
        const { data: players, error: playersError } = await supabase
            .from('players')
            .select('*');
        
        if (playersError) {
            console.error('❌ Ошибка поиска игроков:', playersError);
        } else if (players) {
            players.forEach((player, index) => {
                console.log(`${index + 1}. ID: ${player.id}`);
                console.log(`   Игра: ${player.game_id}`);
                console.log(`   Имя: "${player.name}"`);
                console.log(`   Название команды: "${player.team_name}"`);
                console.log('   ---');
            });
        }
        
        // Попробуем найти игровые состояния (возможно это и есть сессии)
        console.log('\n🎯 ИГРОВЫЕ СОСТОЯНИЯ:');
        const { data: gameStates, error: statesError } = await supabase
            .from('game_state')
            .select('*');
        
        if (statesError) {
            console.error('❌ Ошибка поиска game_state:', statesError);
        } else if (gameStates) {
            console.log(`Найдено ${gameStates.length} игровых состояний:`);
            gameStates.forEach((state, index) => {
                console.log(`${index + 1}. ID: ${state.id}`);
                console.log(`   Игра: ${state.game_id}`);
                console.log(`   Имя игрока: "${state.player_name}"`);
                console.log(`   Название команды: "${state.team_name}"`);
                console.log(`   Очки: ${state.score}`);
                console.log(`   Время: ${state.elapsed_time} сек`);
                console.log(`   Завершено: ${state.completed_at}`);
                console.log(`   Создан: ${state.created_at || 'не указано'}`);
                console.log('   ---');
            });
        }
        
        // Также проверим все остальные таблицы
        console.log('\n📊 СПИСОК ВСЕХ ТАБЛИЦ (через SQL):');
        const { data: tables, error: tablesError } = await supabase.rpc('get_schema_tables');
        
        if (tablesError) {
            console.log('❌ Не удалось получить список таблиц через RPC, попробуем обычный запрос...');
            // Попробуем обычный SQL запрос
            const { data: rawTables, error: rawError } = await supabase
                .from('information_schema.tables')
                .select('table_name')
                .eq('table_schema', 'public')
                .like('table_name', '%game%');
            
            if (!rawError && rawTables) {
                rawTables.forEach(table => {
                    console.log(`- ${table.table_name}`);
                });
            }
        } else {
            tables.forEach(table => {
                console.log(`- ${table.table_name}`);
            });
        }
        
    } catch (error) {
        console.error('💥 Общая ошибка:', error);
    }
}

debugAllData();