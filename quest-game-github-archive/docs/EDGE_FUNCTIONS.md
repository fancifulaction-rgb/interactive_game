# Edge Functions (Supabase Deno)

Каталог: `supabase/functions/<name>/index.ts`.

Секреты в Dashboard → Edge Functions → Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Приоритет для продакшена

| Функция | Статус | Назначение |
|---------|--------|------------|
| `player-upload` | **Обязательно задеплоить** | Upload файлов с service role |
| `delete-game` | **Обязательно задеплоить** | Удаление игры + Storage |
| `delete-teams` | Рекомендуется | Массовое удаление команд |
| `setup-storage-rls` | Однократно при настройке | RLS для buckets |
| `confirm-admin-email` | По необходимости | Подтверждение email админа |

## Деплой

```bash
cd quest-game-github-archive
npx supabase login
npx supabase link --project-ref <REF>
npx supabase functions deploy player-upload
npx supabase functions deploy delete-game
npx supabase functions deploy delete-teams
```

Проверка:

```bash
npx supabase functions list
```

## Описание функций

### `player-upload` (продакшен)

- **Вход:** JSON `{ file, bucket, fileName, mimeType }` — file как base64 или bytes.
- **Действие:** POST в Storage API с service role.
- **Выход:** `{ publicUrl, path }`.
- **CORS:** `*` для POST/OPTIONS.

Вызывается из `storageUpload.ts` при fallback, если прямой upload неудачен (зависит от версии клиента).

### `delete-game` (продакшен)

- **Вход:** `{ gameId }`.
- **Действие:**
  1. Собрать URL медиа из `questions`, `answers`, `teams`.
  2. Удалить объекты Storage.
  3. DELETE `answers`, `teams`, `questions`, `games` (и связанные).
- **Почему Edge:** service role + единая транзакционная логика; клиент не тянет service key.

### `delete-teams`

Удаление выбранных команд и связанных `answers` (админ-панель).

### `setup-storage-rls` / `create-storage-policies` / `create-storage-policies-v2` / `final-policy-setup` / `fix-storage-permissions`

Вспомогательные функции первичной настройки Storage policies. Запускать **один раз** при новом проекте, не в hot path мероприятия.

### `create-bucket-*-temp`

Создание buckets (`avatars`, `answer-media`, …) если SQL миграция 006 не применена.

### `setup-quest-settings`

Seed настроек `settings` таблицы.

### `confirm-admin-email`

Подтверждение пользователя Auth для админа.

### `alternative-upload` / `test-upload` / `test-image-upload` / `test-alternative-upload` / `check-storage`

**Только разработка/отладка.** Не деплоить на прод без необходимости.

## Вызов с фронта

```typescript
const { data, error } = await supabase.functions.invoke('player-upload', {
  body: { file: base64, bucket: 'answer-media', fileName, mimeType },
})
```

Требуется валидный anon key в заголовке (стандарт SDK).

## Логи и отладка

```bash
npx supabase functions logs player-upload
```

Dashboard → Edge Functions → выбрать функцию → Logs.

## Связанные документы

- [STORAGE.md](STORAGE.md)
- [SUPABASE_NEW_PROJECT.md](SUPABASE_NEW_PROJECT.md)
- [DATA_LIFECYCLE.md](DATA_LIFECYCLE.md)
