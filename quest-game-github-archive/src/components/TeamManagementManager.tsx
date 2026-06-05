import { useCallback, useEffect, useRef, useState } from 'react'
import { Users, Trash2, Check, AlertCircle, RefreshCw } from 'lucide-react'
import type { AdminTeamRow } from '../lib/adminTeams'
import { deleteTeamsCompletely, fetchAdminTeamsWithRetry } from '../lib/adminTeams'

interface TeamManagementGame {
  id: string
  title: string
  code: string | null
  created_at?: string
}

interface TeamManagementManagerProps {
  games: TeamManagementGame[]
  gamesLoading?: boolean
  gamesError?: string
  onRefreshGames?: () => void
}

function TeamManagementManager({
  games,
  gamesLoading = false,
  gamesError = '',
  onRefreshGames,
}: TeamManagementManagerProps) {
  const [selectedGameId, setSelectedGameId] = useState<string>('')
  const [teams, setTeams] = useState<AdminTeamRow[]>([])
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'deleteAll' | 'deleteSelected' | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const teamsLoadSeq = useRef(0)

  useEffect(() => {
    setSelectedGameId((current) => {
      if (games.length === 0) return ''
      if (games.some((g) => g.id === current)) return current
      return games[0].id
    })
  }, [games])

  const loadTeams = useCallback(async () => {
    if (!selectedGameId) return
    if (gamesLoading && games.length === 0) return

    const seq = ++teamsLoadSeq.current
    setLoadingTeams(true)
    setErrorMessage('')

    try {
      const data = await fetchAdminTeamsWithRetry(selectedGameId)
      if (seq !== teamsLoadSeq.current) return
      setTeams(data)
      setSelectedTeamIds(new Set())
    } catch (err: unknown) {
      if (seq !== teamsLoadSeq.current) return
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка загрузки команд:', err)
      setErrorMessage(
        /failed to fetch/i.test(msg)
          ? 'Не удалось загрузить команды (сеть). Нажмите «Обновить» или повторите через несколько секунд.'
          : `Ошибка загрузки команд: ${msg}`
      )
      setTeams([])
    } finally {
      if (seq === teamsLoadSeq.current) {
        setLoadingTeams(false)
      }
    }
  }, [selectedGameId, gamesLoading, games.length])

  useEffect(() => {
    if (!selectedGameId) {
      setTeams([])
      setSelectedTeamIds(new Set())
      return
    }
    void loadTeams()
  }, [selectedGameId, gamesLoading, loadTeams])

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  const selectAllTeams = () => {
    if (selectedTeamIds.size === teams.length) {
      setSelectedTeamIds(new Set())
    } else {
      setSelectedTeamIds(new Set(teams.map((team) => team.id)))
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

    const teamsToDelete =
      confirmAction === 'deleteAll'
        ? teams.map((team) => team.id)
        : Array.from(selectedTeamIds)

    if (teamsToDelete.length === 0) {
      setErrorMessage('Нет команд для удаления')
      setShowConfirmModal(false)
      setConfirmAction(null)
      return
    }

    setDeleting(true)
    setErrorMessage('')

    try {
      const result = await deleteTeamsCompletely(teamsToDelete, selectedGameId)
      if (!result.success) {
        throw new Error(result.error ?? 'Не удалось удалить команды')
      }

      const message =
        confirmAction === 'deleteAll'
          ? `Удалены все команды (${result.teams_deleted})`
          : `Удалены выбранные команды (${result.teams_deleted})`

      setSuccessMessage(message)
      setSelectedTeamIds(new Set())
      await loadTeams()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка удаления команд:', err)
      setErrorMessage(
        /failed to fetch/i.test(msg)
          ? 'Не удалось связаться с сервером. Проверьте сеть или войдите через email в админке.'
          : `Ошибка удаления команд: ${msg}`
      )
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

      <div className="bg-white p-6 rounded-lg shadow">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Выбор игры</h3>
          <select
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            disabled={gamesLoading && games.length === 0}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
          >
            {gamesLoading && games.length === 0 ? (
              <option value="">Загрузка игр…</option>
            ) : games.length === 0 ? (
              <option value="">Нет игр</option>
            ) : (
              games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title} {game.code ? `(${game.code})` : ''}
                </option>
              ))
            )}
          </select>
          {gamesError && (
            <p className="mt-2 text-sm text-red-600">
              {gamesError}{' '}
              {onRefreshGames && (
                <button type="button" onClick={onRefreshGames} className="underline">
                  Повторить
                </button>
              )}
            </p>
          )}
        </div>
      </div>

      {selectedGameId && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Команды игры {loadingTeams ? '…' : `(${teams.length})`}
            </h3>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadTeams()}
                disabled={loadingTeams || deleting}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" />
                Обновить
              </button>

              <button
                type="button"
                onClick={selectAllTeams}
                disabled={teams.length === 0 || deleting}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                {selectedTeamIds.size === teams.length ? 'Снять все' : 'Выбрать все'}
              </button>

              <button
                type="button"
                onClick={() => handleDeleteAction('deleteSelected')}
                disabled={selectedTeamIds.size === 0 || deleting}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Удалить выбранные ({selectedTeamIds.size})
              </button>

              <button
                type="button"
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
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>В этой игре пока нет команд</p>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map((team) => (
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
                      Капитан: {team.captain_name} • Счёт: {team.total_score} • Регистрация:{' '}
                      {formatDate(team.registration_time)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 mr-2" />
              <h3 className="text-lg font-semibold">Подтверждение удаления</h3>
            </div>

            <p className="text-gray-700 mb-6">
              {confirmAction === 'deleteAll'
                ? `Вы уверены, что хотите удалить все команды (${teams.length})? Это действие нельзя отменить.`
                : `Вы уверены, что хотите удалить ${selectedTeamIds.size} выбранных команд?`}
            </p>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={deleting}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
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

export default TeamManagementManager
