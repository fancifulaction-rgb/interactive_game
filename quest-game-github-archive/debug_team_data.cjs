const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Задайте SUPABASE_URL (или VITE_SUPABASE_URL) и SUPABASE_SERVICE_ROLE_KEY в .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugTeamData() {
    console.log('🔍 Проверка данных о команде в игре "1111"...');
    
    try {
        // Найдем игру с кодом "1111"
        const { data: games, error: gamesError } = await supabase
            .from('games')
            .select('*')
            .eq('code', '1111');
        
        if (gamesError) {
            console.error('❌ Ошибка поиска игры:', gamesError);
            return;
        }
        
        if (!games || games.length === 0) {
            console.log('❌ Игра с кодом "1111" не найдена');
            return;
        }
        
        const game = games[0];
        console.log(`✅ Найдена игра: ID=${game.id}, код="${game.code}", название="${game.name}"`);
        
        // Сначала проверим структуру таблицы players
        console.log('\n📋 Проверка игроков (без сортировки)...');
        const { data: players, error: playersError } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', game.id);
        
        if (playersError) {
            console.error('❌ Ошибка поиска игроков:', playersError);
            return;
        }
        
        console.log(`👥 Найдено ${players?.length || 0} игроков в игре "1111":`);
        
        if (players && players.length > 0) {
            players.forEach((player, index) => {
                console.log(`${index + 1}. ID: ${player.id}`);
                console.log(`   Имя: "${player.name}"`);
                console.log(`   Название команды: "${player.team_name}"`);
                console.log(`   Создан: ${player.created_at || 'не указано'}`);
                console.log('   ---');
            });
        } else {
            console.log('   (Нет игроков)');
        }
        
        // Проверим сессии игры
        console.log('\n🎮 Проверка сессий игры...');
        const { data: gameSessions, error: sessionsError } = await supabase
            .from('game_sessions')
            .select('*')
            .eq('game_id', game.id);
        
        if (sessionsError) {
            console.error('❌ Ошибка поиска сессий:', sessionsError);
            return;
        }
        
        console.log(`🎯 Найдено ${gameSessions?.length || 0} сессий игры:`);
        
        if (gameSessions && gameSessions.length > 0) {
            gameSessions.forEach((session, index) => {
                console.log(`${index + 1}. ID: ${session.id}`);
                console.log(`   Имя игрока: "${session.player_name}"`);
                console.log(`   Название команды: "${session.team_name}"`);
                console.log(`   Очки: ${session.score}`);
                console.log(`   Время: ${session.elapsed_time} сек`);
                console.log(`   Завершено: ${session.completed_at}`);
                console.log(`   Создан: ${session.created_at || 'не указано'}`);
                console.log('   ---');
            });
        } else {
            console.log('   (Нет сессий)');
        }
        
        // Также проверим все данные в этих таблицах для понимания
        console.log('\n🗂️  ВСЕ игроки в базе данных:');
        const { data: allPlayers, error: allPlayersError } = await supabase
            .from('players')
            .select('*');
        
        if (!allPlayersError && allPlayers) {
            allPlayers.forEach((player) => {
                console.log(`- Игра: ${player.game_id}, Имя: "${player.name}", Команда: "${player.team_name}"`);
            });
        }
        
        console.log('\n🗂️  ВСЕ сессии в базе данных:');
        const { data: allSessions, error: allSessionsError } = await supabase
            .from('game_sessions')
            .select('*');
        
        if (!allSessionsError && allSessions) {
            allSessions.forEach((session) => {
                console.log(`- Игра: ${session.game_id}, Игрок: "${session.player_name}", Команда: "${session.team_name}", Очки: ${session.score}`);
            });
        }
        
    } catch (error) {
        console.error('💥 Общая ошибка:', error);
    }
}

debugTeamData();