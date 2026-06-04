import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Users, Trash2, Check, AlertCircle } from 'lucide-react'

interface Game {
  id: string
  title: string
  code: string | null
  created_at: string
}

interface Team {
  id: string
  team_name: string
  captain_name: string
  avatar_url?: string
  total_score: number
  registration_time: string
  game_id: string
}

export default function TeamManagementManager() {
  const [games, setGames] = useState<Game[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string>('')
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'deleteAll' | 'deleteSelected' | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // === ВЕРСИЯ 1.2.11: КРИТИЧЕСКАЯ ДИАГНОСТИКА ===
  
  // Функция для детального логирования состояния
  const logCriticalState = (context: string) => {
    console.log(`🚨 === КРИТИЧЕСКОЕ СОСТОЯНИЕ [${context}] ===`)
    console.log('📊 ВРЕМЯ:', new Date().toISOString())
    console.log('🎮 selectedGameId:', selectedGameId, '(тип:', typeof selectedGameId, ')')
    console.log('👥 teams.length:', teams.length)
    console.log('📝 teams содержимое:', teams.map(t => ({ id: t.id, name: t.team_name, game_id: t.game_id || 'НЕТ' })))
    console.log('🎯 selectedTeamIds.size:', selectedTeamIds.size)
    console.log('🎯 selectedTeamIds содержимое:', Array.from(selectedTeamIds))
    console.log('🌐 DOM количество команд:', document.querySelectorAll('[data-team-id]').length)
    
    // КРИТИЧЕСКАЯ ПРОВЕРКА: соответствие game_id
    const teamsWithWrongGameId = teams.filter(team => team.game_id !== selectedGameId)
    if (teamsWithWrongGameId.length > 0) {
      console.error('❌ НАЙДЕНЫ КОМАНДЫ С НЕПРАВИЛЬНЫМ GAME_ID:', teamsWithWrongGameId)
    }
    
    console.log('🚨 === КОНЕЦ КРИТИЧЕСКОГО СОСТОЯНИЯ ===\n')
  }
  
  // Обертка для setTeams с логированием
  const setTeamsWithLogging = (newTeams: Team[], context = 'неизвестно') => {
    console.log(`🔄 === ИЗМЕНЕНИЕ TEAMS STATE [${context}] ===`)
    console.log('📊 БЫЛО команд:', teams.length)
    console.log('📊 СТАЛО команд:', newTeams.length)
    console.log('🔍 Старые teams:', teams.map(t => ({ id: t.id, name: t.team_name })))
    console.log('🔍 Новые teams:', newTeams.map(t => ({ id: t.id, name: t.team_name })))
    setTeams(newTeams)
    console.log('✅ Teams state обновлен\n')
  }

  useEffect(() => {
    loadGames()
  }, [])

  useEffect(() => {
    if (selectedGameId) {
      loadTeams()
      // Очищаем выбранные команды при смене игры
      setSelectedTeamIds(new Set())
    } else {
      setTeamsWithLogging([], 'selectedGameId-empty')
      setSelectedTeamIds(new Set())
    }
  }, [selectedGameId])

  const loadGames = async () => {
    console.log('=== ЗАГРУЗКА ИГР ===')
    setLoading(true)
    try {
      console.log('Запрашиваем список игр...')
      const { data, error } = await supabase
        .from('games')
        .select('id, title, code, created_at')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Ошибка загрузки игр:', error)
        throw error
      }
      
      console.log('Загружены игры:', data?.length || 0)
      console.log('Список игр:', data)
      
      setGames(data || [])
    } catch (err: any) {
      console.error('Ошибка загрузки игр:', err)
      setErrorMessage('Ошибка загрузки игр: ' + err.message)
      setGames([])
    } finally {
      setLoading(false)
      console.log('=== ЗАГРУЗКА ИГР ЗАВЕРШЕНА ===')
    }
  }

  const loadTeams = async () => {
    if (!selectedGameId) {
      console.log('Не выбрана игра для загрузки команд')
      setTeamsWithLogging([], 'selectedGameId-missing')
      return
    }
    
    console.log('=== ЗАГРУЗКА КОМАНД ===')
    console.log('selectedGameId:', selectedGameId)
    console.log('Тип selectedGameId:', typeof selectedGameId)
    
    setLoadingTeams(true)
    try {
      console.log('Выполняем запрос к БД...')
      const { data, error } = await supabase
        .from('teams')
        .select('id, team_name, captain_name, avatar_url, total_score, registration_time, game_id')
        .eq('game_id', selectedGameId)
        .order('registration_time', { ascending: false })

      if (error) {
        console.error('Ошибка запроса к БД:', error)
        throw error
      }
      
      console.log('Загружены команды:', data?.length || 0, 'команд')
      console.log('Команды:', data)
      
      // Проверяем все команды в БД (для отладки)
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Проверяем все команды в БД (debug)...')
        const { data: allTeams, error: allTeamsError } = await supabase
          .from('teams')
          .select('id, team_name, game_id')
          .limit(10)
        
        if (allTeamsError) {
          console.error('Ошибка при получении всех команд:', allTeamsError)
        } else {
          console.log('🔍 Всего команд в БД:', allTeams?.length || 0)
        }
      }
      
      // Обновляем состояние команд
      console.log('🔄 ОБНОВЛЕНИЕ СОСТОЯНИЯ:')
      console.log('   Текущее количество команд в state:', teams.length)
      console.log('   Новое количество команд:', data?.length || 0)
      console.log('   Данные команд:', data)
      console.log('   Обновляю state через setTeams...')
      setTeamsWithLogging(data || [], 'loadTeams')
      console.log('✅ Состояние команд обновлено')
      
      // КРИТИЧЕСКИ ВАЖНО: Очищаем выбранные команды при перезагрузке списка
      console.log('🧹 ОЧИСТКА ВЫБРАННЫХ КОМАНД ПРИ ПЕРЕЗАГРУЗКЕ...')
      setSelectedTeamIds(new Set())
      console.log('✅ Выбранные команды очищены')
      
    } catch (err: any) {
      console.error('=== ОШИБКА ЗАГРУЗКИ ===', err)
      setErrorMessage('Ошибка загрузки команд: ' + err.message)
      setTeamsWithLogging([], 'loadTeams-error')
    } finally {
      setLoadingTeams(false)
      console.log('=== ЗАГРУЗКА ЗАВЕРШЕНА ===')
    }
  }

  const toggleTeamSelection = (teamId: string) => {
    console.log('🔄 toggleTeamSelection вызван для:', teamId)
    console.log('📊 Текущие выбранные ID:', Array.from(selectedTeamIds))
    console.log('📊 Количество выбранных команд:', selectedTeamIds.size)
    
    setSelectedTeamIds(prev => {
      const newSet = new Set(prev)
      const wasSelected = newSet.has(teamId)
      
      if (wasSelected) {
        newSet.delete(teamId)
        console.log('❌ Снимаем выбор с команды:', teamId)
      } else {
        newSet.add(teamId)
        console.log('✅ Добавляем в выбор команду:', teamId)
      }
      
      console.log('📊 Новый список выбранных ID:', Array.from(newSet))
      console.log('📊 Новое количество выбранных команд:', newSet.size)
      
      return newSet
    })
  }

  const selectAllTeams = () => {
    if (selectedTeamIds.size === teams.length) {
      setSelectedTeamIds(new Set())
    } else {
      setSelectedTeamIds(new Set(teams.map(team => team.id)))
    }
  }

  const handleDeleteAction = (action: 'deleteAll' | 'deleteSelected') => {
    if (action === 'deleteSelected' && selectedTeamIds.size === 0) {
      setErrorMessage('Выберите команды для удаления')
      return
    }
    setConfirmAction(action)
    setShowConfirmModal(true)
  }

  const confirmDelete = async () => {
    if (!confirmAction || !selectedGameId) return
    
    // 🚨 КРИТИЧЕСКАЯ ДИАГНОСТИКА В НАЧАЛЕ ФУНКЦИИ
    logCriticalState('НАЧАЛО confirmDelete')
    
    console.log('=== НАЧАЛО УДАЛЕНИЯ КОМАНД ===')
    console.log('confirmAction:', confirmAction)
    console.log('selectedGameId:', selectedGameId)
    console.log('Текущие команды:', teams)
    console.log('Выбранные team IDs:', Array.from(selectedTeamIds))
    console.log('Количество выбранных команд:', selectedTeamIds.size)
    
    // 🚨 КРИТИЧЕСКАЯ ПРОВЕРКА: ПОЧЕМУ TEAMS ПУСТОЙ?
    if (teams.length === 0) {
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: teams пустой, но UI показывает команды!')
      console.error('🔍 Попытка загрузки команд прямо сейчас...')
      
      // Попытка экстренной загрузки
      try {
        const { data: emergencyTeams, error: emergencyError } = await supabase
          .from('teams')
          .select('id, team_name, captain_name, avatar_url, total_score, registration_time, game_id')
          .eq('game_id', selectedGameId)
        
        if (emergencyError) {
          console.error('❌ Экстренная загрузка не удалась:', emergencyError)
        } else {
          console.log('🚨 ЭКСТРЕННАЯ ЗАГРУЗКА УСПЕШНА:', emergencyTeams?.length || 0, 'команд')
          console.log('🚨 Экстренно загруженные команды:', emergencyTeams)
          
          if (emergencyTeams && emergencyTeams.length > 0) {
            console.log('🔄 Обновляем teams state экстренно загруженными данными')
            setTeamsWithLogging(emergencyTeams, 'экстренная-загрузка')
            
            // Используем экстренно загруженные данные для удаления
            if (confirmAction === 'deleteAll') {
              const emergencyTeamsToDelete = emergencyTeams.map(team => team.id)
              console.log('🚨 ИСПОЛЬЗУЕМ ЭКСТРЕННЫЕ ДАННЫЕ ДЛЯ УДАЛЕНИЯ:', emergencyTeamsToDelete)
            }
          }
        }
      } catch (emergencyErr) {
        console.error('❌ Ошибка экстренной загрузки:', emergencyErr)
      }
    }
    
    setDeleting(true)
    try {
      let teamsToDelete: string[] = []
      
      if (confirmAction === 'deleteAll') {
        teamsToDelete = teams.map(team => team.id)
        console.log('📋 УДАЛЯЕМ ВСЕ КОМАНДЫ:', teamsToDelete.length)
      } else {
        teamsToDelete = Array.from(selectedTeamIds)
        console.log('📋 УДАЛЯЕМ ВЫБРАННЫЕ КОМАНДЫ:', teamsToDelete.length, 'IDs:', teamsToDelete)
        
        // ДЕТАЛЬНАЯ ПРОВЕРКА КОМАНД
        console.log('🔍 ДЕТАЛЬНАЯ ПРОВЕРКА:')
        console.log('   Все команды в teams:', teams.map(t => ({ id: t.id, name: t.team_name })))
        console.log('   selectedTeamIds:', Array.from(selectedTeamIds))
        console.log('   teamsToDelete:', teamsToDelete)
        
        // Проверяем что selectedTeamIds действительно содержит нужные ID
        const validTeamIds = teams.map(team => team.id)
        const invalidIds = teamsToDelete.filter(id => !validTeamIds.includes(id))
        if (invalidIds.length > 0) {
          console.warn('⚠️ Найдены недействительные ID команд:', invalidIds)
          teamsToDelete = teamsToDelete.filter(id => validTeamIds.includes(id))
          console.log('📋 Отфильтрованные ID для удаления:', teamsToDelete)
        }
      }
      
      console.log('ID команд для удаления:', teamsToDelete)
      console.log('Количество команд для удаления:', teamsToDelete.length)

      // 🚀 НОВАЯ ЛОГИКА: Используем Supabase Functions API для полного удаления команд
      console.log('🚀 Вызываем Edge Function delete-teams через Supabase client...')
      console.log('📋 Передаем team_ids:', teamsToDelete)
      console.log('🎮 Передаем game_id:', selectedGameId)
      
      const { data: deleteResult, error: functionError } = await supabase.functions.invoke('delete-teams', {
        body: {
          team_ids: teamsToDelete,
          game_id: selectedGameId
        }
      })

      if (functionError) {
        console.error('❌ ОШИБКА при вызове Edge Function:', functionError)
        throw new Error(`Ошибка удаления команд: ${functionError.message}`)
      }

      console.log('✅ Результат полного удаления команд:', deleteResult)
      
      if (deleteResult?.error) {
        console.error('❌ Ошибка от Edge Function:', deleteResult.error)
        throw new Error(deleteResult.error.message)
      }

      // Выводим детальную статистику удаления
      console.log('📊 СТАТИСТИКА УДАЛЕНИЯ:')
      console.log('   Команд удалено:', deleteResult?.data?.teams_deleted || 0)
      console.log('   Ответов удалено:', deleteResult?.data?.answers_deleted || 0)
      console.log('   Записей о прочтении удалено:', deleteResult?.data?.message_reads_deleted || 0)
      console.log('   Получателей сообщений удалено:', deleteResult?.data?.message_recipients_deleted || 0)
      console.log('   Игроков удалено:', deleteResult?.data?.players_deleted || 0)
      
      if (deleteResult?.data?.errors && deleteResult.data.errors.length > 0) {
        console.warn('⚠️ Предупреждения при удалении:', deleteResult.data.errors)
      }

      const message = confirmAction === 'deleteAll' 
        ? `Удалено все команды (${deleteResult?.data?.teams_deleted || 0}) и все связанные данные` 
        : `Удалено выбранные команды (${deleteResult?.data?.teams_deleted || 0}) и все связанные данные`
      
      console.log('=== ПОЛНОЕ УДАЛЕНИЕ КОМАНД ЗАВЕРШЕНО ===')
      setSuccessMessage(message)
      setSelectedTeamIds(new Set())
      
      // Проверяем, что команды действительно удалены из БД (CASCADE должен сработать)
      console.log('🔍 Проверяем CASCADE удаление через запрос к БД...')
      const { data: remainingTeams, error: checkError } = await supabase
        .from('teams')
        .select('id, team_name, captain_name, avatar_url, total_score, registration_time, game_id')
        .eq('game_id', selectedGameId)
      
      if (checkError) {
        console.error('Ошибка при проверке оставшихся команд:', checkError)
      } else {
        console.log('🔍 Проверка результата CASCADE удаления:')
        console.log('   Оставшиеся команды в БД:', remainingTeams?.length || 0)
        console.log('   Данные команд:', remainingTeams)
        
        // ОБНОВЛЯЕМ СОСТОЯНИЕ С НОВЫМИ ДАННЫМИ!
        console.log('🔄 ОБНОВЛЯЕМ REACT STATE С ОСТАВШИМИСЯ КОМАНДАМИ...')
        setTeamsWithLogging(remainingTeams || [], 'delete-teams-edge-function-result')
        console.log('✅ React state обновлен после полного удаления команд')
        
        // Дополнительная проверка связанных данных
        console.log('🔍 Проверяем полное удаление связанных данных...')
        if (teamsToDelete.length > 0) {
          // Проверяем ответы
          const { data: remainingAnswers } = await supabase
            .from('answers')
            .select('id')
            .in('team_id', teamsToDelete)
          
          // Проверяем записи о прочтении
          const { data: remainingMessageReads } = await supabase
            .from('message_reads')
            .select('id')
            .in('team_id', teamsToDelete)
          
          // Проверяем получателей сообщений
          const { data: remainingMessageRecipients } = await supabase
            .from('message_recipients')
            .select('id')
            .in('team_id', teamsToDelete)
          
          console.log('📊 ПОЛНАЯ ПРОВЕРКА УДАЛЕНИЯ:')
          console.log('   Оставшиеся ответы:', remainingAnswers?.length || 0)
          console.log('   Оставшиеся записи о прочтении:', remainingMessageReads?.length || 0)
          console.log('   Оставшиеся получатели сообщений:', remainingMessageRecipients?.length || 0)
          
          if ((remainingAnswers?.length || 0) === 0 && 
              (remainingMessageReads?.length || 0) === 0 && 
              (remainingMessageRecipients?.length || 0) === 0) {
            console.log('✅ ПОЛНОЕ CASCADE УДАЛЕНИЕ ПОДТВЕРЖДЕНО!')
          } else {
            console.warn('⚠️ Остались orphaned данные - CASCADE не сработал полностью')
          }
        }
      }
      
    } catch (err: any) {
      console.error('=== ОШИБКА УДАЛЕНИЯ ===', err)
      setErrorMessage('Ошибка удаления команд: ' + err.message)
    } finally {
      setDeleting(false)
      setShowConfirmModal(false)
      setConfirmAction(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU')
  }

  return (
    <div className="space-y-6">
      {/* Уведомления */}
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded flex items-center">
          <Check className="w-5 h-5 mr-2" />
          {successMessage}
          <button 
            onClick={() => setSuccessMessage('')}
            className="ml-auto text-green-700 hover:text-green-900"
          >
            ✕
          </button>
        </div>
      )}
      
      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {errorMessage}
          <button 
            onClick={() => setErrorMessage('')}
            className="ml-auto text-red-700 hover:text-red-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Выбор игры */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Выбор игры</h3>
          <select
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Выберите игру...</option>
            {games.map(game => (
              <option key={game.id} value={game.id}>
                {game.title} {game.code ? `(${game.code})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Список команд */}
      {selectedGameId && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Команды игры {loadingTeams ? '...' : `(${teams.length})`}
            </h3>
            
            <div className="flex gap-2">
              <button
                onClick={selectAllTeams}
                disabled={teams.length === 0}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                {selectedTeamIds.size === teams.length ? 'Снять все' : 'Выбрать все'}
              </button>
              
              <button
                onClick={() => {
                  logCriticalState('ДЕБАГ-КНОПКА');
                }}
                className="px-3 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                🚨 ДЕБАГ: Показать состояние
              </button>
              
              <button
                onClick={async () => {
                  console.log('🧪 v1.2.11: ТЕСТ удаления выбранных команд');
                  setConfirmAction('deleteSelected');
                  await confirmDelete();
                }}
                disabled={selectedTeamIds.size === 0 || deleting}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                🧪 ТЕСТ: Удалить выбранные ({selectedTeamIds.size})
              </button>
              
              <button
                onClick={async () => {
                  console.log('🧪 v1.2.11: ТЕСТ удаления всех команд');
                  setConfirmAction('deleteAll');
                  await confirmDelete();
                }}
                disabled={teams.length === 0 || deleting}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                🧪 ТЕСТ: Удалить все команды
              </button>
              
              <button
                onClick={() => handleDeleteAction('deleteSelected')}
                disabled={selectedTeamIds.size === 0 || deleting}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                Удалить выбранные ({selectedTeamIds.size})
              </button>
              
              <button
                onClick={() => handleDeleteAction('deleteAll')}
                disabled={teams.length === 0 || deleting}
                className="px-3 py-2 text-sm bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50"
              >
                Удалить все команды
              </button>
            </div>
          </div>

          {loadingTeams ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>В этой игре пока нет команд</p>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map(team => (
                <div
                  key={team.id}
                  data-team-id={team.id}
                  className={`border rounded-lg p-4 flex items-center gap-4 ${
                    selectedTeamIds.has(team.id) ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTeamIds.has(team.id)}
                    onChange={() => toggleTeamSelection(team.id)}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  
                  {team.avatar_url && (
                    <img
                      src={team.avatar_url}
                      alt={team.team_name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  )}
                  
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{team.team_name}</div>
                    <div className="text-sm text-gray-500">
                      Капитан: {team.captain_name} • Счет: {team.total_score} • Регистрация: {formatDate(team.registration_time)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Модальное окно подтверждения */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 mr-2" />
              <h3 className="text-lg font-semibold">Подтверждение удаления</h3>
            </div>
            
            <p className="text-gray-700 mb-6">
              {confirmAction === 'deleteAll' 
                ? `Вы уверены, что хотите удалить ВСЕ команды (${teams.length})? Это действие нельзя отменить.`
                : `Вы уверены, что хотите удалить ${selectedTeamIds.size} выбранных команд? 
                   Выбранные команды: ${teams.filter(team => selectedTeamIds.has(team.id)).map(team => team.team_name).join(', ') || 'нет данных'}`
              }
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={deleting}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
