# Storage (Supabase)

Публичные buckets для медиа квеста. Миграция: `docs/sql-migrations/006_storage_buckets.sql`.

## Buckets

| ID | Назначение | Лимит (типично) | MIME |
|----|------------|-----------------|------|
| `avatars` | Аватары команд | ~5 MB | image/* |
| `answer-media` | Фото/видео/аудио ответов | ~100 MB | image, video, audio |
| `question-media` | Медиа в вопросах (редактор) | ~100 MB | image, video, audio |
| `quest-logos` | Логотип квеста на главной | ~5 MB | image/* |

Публичный bucket → URL вида:

`{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}`

## Пути файлов

Реализация: `src/lib/storageUpload.ts`.

- Уникальные имена: префикс + timestamp + random suffix (снижение коллизий при 100 upload).
- Аватар: `{gameId}/{teamId}/avatar-{rand}.webp` (после `compressImage`).

## Два пути загрузки

### 1. Прямой клиент (текущий default)

```typescript
supabase.storage.from(bucket).upload(path, file, { upsert: true })
```

Требует RLS policies `INSERT` для anon на `storage.objects`.

### 2. Edge Function `player-upload`

Клиент отправляет base64 → Deno upload с **service role** → возвращает `publicUrl`.

**Плюсы:** обход проблем RLS, единая валидация на сервере.  
**Минусы:** нужен deploy; больший payload (base64).

Проверка deploy:

```bash
supabase functions list
curl -X POST .../functions/v1/player-upload
```

## Очереди и retry

| Функция | Очередь | Retry |
|---------|---------|-------|
| `uploadAnswerMediaQueued` | critical | 3 |
| `uploadAvatarQueued` | background | 3 |
| `uploadTeamAvatarInBackground` | background + critical update teams | 3 |

При новом ответе: `cancelActiveStorageUpload()` — прерывание устаревшего upload.

## Сжатие

- **Изображения аватара:** `compressImage.ts` перед upload.
- **Медиа вопросов и ответов:** `compressQuestionMedia.ts` перед upload — WebP/JPEG до 2560px (цель ≤10 MB в bucket; исходник фото до **20 MB**); видео — исходник до **500 MB**, lazy `@ffmpeg/ffmpeg` WASM до **720p H.264** (цель ≤100 MB в bucket; пропуск перекодирования если ≤10 MB); аудио без перекодирования если ≤100 MB (IMP-PRD-009).

## Очистка при удалении игры

Клиентский CASCADE **не** удаляет объекты Storage.

- Edge `delete-game` — должен удалять по префиксу `gameId`.
- Иначе «сироты» в bucket (см. DATA_LIFECYCLE).

## Проблемы и решения

| Проблема | Решение |
|----------|---------|
| 403 на upload | Проверить policies; запустить `setup-storage-rls` Edge |
| Медленный upload | Очередь; не параллелить с insert |
| CORS | Добавить origin в Supabase API settings |

## Связанные документы

- [EDGE_FUNCTIONS.md](EDGE_FUNCTIONS.md)
- [API_AND_FLOWS.md](API_AND_FLOWS.md)
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
