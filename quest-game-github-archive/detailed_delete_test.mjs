// Тест для диагностики удаления команд из БД
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Задайте SUPABASE_URL (или VITE_SUPABASE_URL) и SUPABASE_SERVICE_ROLE_KEY в .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testTeamDeletion() {
    console.log('=== ТЕСТ УДАЛЕНИЯ КОМАНД ИЗ БД ===\n')
    
    try {
        // 1. Получаем список всех игр
        console.log('1️⃣ ПОЛУЧАЕМ СПИСОК ИГР:')
        const { data: games, error: gamesError } = await supabase
            .from('games')
            .select('id, title')
        
        if (gamesError) throw gamesError
        console.log('Найденные игры:', games)
        
        if (!games || games.length === 0) {
            console.log('❌ Нет игр в базе данных!')
            return
        }
        
        // Берем первую игру для тестирования
        const testGame = games[0]
        console.log(`\n🎯 Тестируем игру: ${testGame.title} (${testGame.id})`)
        
        // 2. Получаем команды этой игры
        console.log('\n2️⃣ ПОЛУЧАЕМ КОМАНДЫ ИГРЫ:')
        const { data: teams, error: teamsError } = await supabase
            .from('teams')
            .select('id, team_name, game_id')
            .eq('game_id', testGame.id)
        
        if (teamsError) throw teamsError
        console.log(`Найдено команд: ${teams.length}`)
        console.log('Команды:', teams)
        
        if (teams.length === 0) {
            console.log('❌ В этой игре нет команд!')
            return
        }
        
        // 3. Выбираем одну команду для удаления (НЕ все)
        const teamToDelete = teams[0]
        const teamsToDelete = [teamToDelete.id]
        console.log(`\n3️⃣ БУДЕМ УДАЛЯТЬ ТОЛЬКО ЭТУ КОМАНДУ: "${teamToDelete.team_name}" (ID: ${teamToDelete.id})`)
        console.log(`Всего команд для удаления: ${teamsToDelete.length}`)
        
        // 4. Проверяем связанные ответы
        console.log('\n4️⃣ ПРОВЕРЯЕМ СВЯЗАННЫЕ ОТВЕТЫ:')
        const { data: answersBefore, error: answersBeforeError } = await supabase
            .from('answers')
            .select('id, team_id')
            .in('team_id', teamsToDelete)
        
        if (answersBeforeError) throw answersBeforeError
        console.log(`Связанных ответов для удаления: ${answersBefore.length}`)
        console.log('Ответы:', answersBefore)
        
        // 5. Пытаемся удалить команды
        console.log('\n5️⃣ УДАЛЯЕМ КОМАНДЫ ИЗ ТАБЛИЦЫ TEAMS:')
        console.log('SQL-запрос:', `DELETE FROM teams WHERE id IN (${teamsToDelete.map(id => `'${id}'`).join(', ')})`)
        
        const { data: deleteResult, error: deleteError } = await supabase
            .from('teams')
            .delete()
            .in('id', teamsToDelete)
            .select()
        
        if (deleteError) {
            console.error('❌ ОШИБКА ПРИ УДАЛЕНИИ КОМАНД:', deleteError)
            throw deleteError
        }
        
        console.log('✅ Команды удалены успешно!')
        console.log('Результат удаления:', deleteResult)
        console.log('Количество удаленных записей:', deleteResult?.length || 0)
        
        // 6. Удаляем связанные ответы
        console.log('\n6️⃣ УДАЛЯЕМ СВЯЗАННЫЕ ОТВЕТЫ:')
        if (answersBefore.length > 0) {
            const { data: deleteAnswersResult, error: deleteAnswersError } = await supabase
                .from('answers')
                .delete()
                .in('team_id', teamsToDelete)
                .select()
            
            if (deleteAnswersError) {
                console.warn('⚠️ Ошибка при удалении ответов:', deleteAnswersError)
            } else {
                console.log('✅ Ответы удалены успешно!')
                console.log('Количество удаленных ответов:', deleteAnswersResult?.length || 0)
            }
        } else {
            console.log('ℹ️ Связанных ответов нет, пропускаем удаление')
        }
        
        // 7. Проверяем что команды действительно удалены
        console.log('\n7️⃣ ПРОВЕРЯЕМ РЕЗУЛЬТАТ УДАЛЕНИЯ:')
        
        const { data: remainingTeams, error: checkError } = await supabase
            .from('teams')
            .select('id, team_name, game_id')
            .eq('game_id', testGame.id)
        
        if (checkError) throw checkError
        console.log(`Команды после удаления: ${remainingTeams.length}`)
        console.log('Оставшиеся команды:', remainingTeams)
        
        // Проверяем что удаленная команда действительно исчезла
        const deletedTeamExists = remainingTeams.some(team => team.id === teamToDelete.id)
        if (deletedTeamExists) {
            console.log('❌ ПРОБЛЕМА: Удаленная команда все еще существует в БД!')
        } else {
            console.log('✅ УСПЕХ: Команда была удалена из БД!')
        }
        
        // Проверяем что другие команды остались
        const expectedRemainingTeams = teams.length - teamsToDelete.length
        if (remainingTeams.length === expectedRemainingTeams) {
            console.log(`✅ УСПЕХ: Осталось ${remainingTeams.length} команд (как ожидалось)`)
        } else {
            console.log(`❌ ПРОБЛЕМА: Должно было остаться ${expectedRemainingTeams} команд, но осталось ${remainingTeams.length}`)
        }
        
        console.log('\n=== ТЕСТ ЗАВЕРШЕН ===')
        
    } catch (error) {
        console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error)
    }
}

testTeamDeletion()