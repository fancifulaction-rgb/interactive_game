# Безопасность

## Модель угроз (текущая)

| Угроза | Вероятность | Текущая защита |
|--------|-------------|----------------|
| Чтение всех игр/ответов с anon key | Средняя | Миграция 018: нет anon SELECT answers; `questions_player` без эталона |
| Подмена `total_score` через API | Низкая | anon REVOKE на `increment_team_score`; счёт только в `submit_auto_answer` |
| Ответ от чужой команды | Низкая | Team session token (HMAC в БД), проверка в RPC и Edge upload |
| Загрузка мусора в Storage | Средняя | Размер/MIME buckets; публичный upload |
| Утечка service role | Критично | Только `.env` / Edge secrets, не `VITE_*` |
| XSS на фронте | Низкая-средняя | React escape; проверять `dangerouslySetInnerHTML` |

## Аутентификация

- **Админ:** Supabase Auth (email/password).
- **Игрок:** без аккаунта; `team_id` + **session token** в localStorage (`teamSession.ts`), выдаётся при `register_team` / `recover_team_session`.

Создание админа: `scripts/create_admin_script.js` (service role, локально).

## Row Level Security

Миграция 001 создаёт permissive policies:

```sql
CREATE POLICY "Allow all operations on teams" ON teams FOR ALL USING (true);
```

**Следствие:** любой, кто знает `VITE_SUPABASE_ANON_KEY` из сборки, может вызывать PostgREST как «суперпользователь» данных.

### Рекомендуемое ужесточение (IMP-SEC-001)

1. Игроки: `INSERT`/`SELECT` только для своей `game_id` (по коду в JWT custom claim или signed session).
2. Админ: политики с `auth.role() = 'authenticated'`.
3. Публичное табло: read-only view `teams_public` без лишних полей.

## Секреты

| Переменная | Где можно | Где нельзя |
|------------|-----------|------------|
| `VITE_SUPABASE_ANON_KEY` | `.env`, CI build | — (публичен в bundle) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` локально, Edge secrets, scripts | `VITE_*`, браузер, git |

Проверка перед commit:

```bash
git diff | findstr SERVICE_ROLE
```

## Edge Functions

Service role живёт только на сервере Deno.

| Функция | JWT | Проверки |
|---------|-----|----------|
| `delete-game`, `delete-teams` | да | authenticated admin (`_shared/adminAuth.ts`) |
| `player-upload` | нет (anon игрок) | bucket whitelist, path `{gameId}/…`, размер, `verify_team_session` |
| `confirm-admin-email` | да + `ADMIN_SETUP_SECRET` | одноразовый setup, не для прода без секрета |

Миграция: `docs/sql-migrations/018_security_s1_s5.sql` (`npm run db:migrate:018`).

## Удаление команд с клиента (IMP-SEC-001)

Админ с Supabase Auth (email) удаляет команды **прямым DELETE** через PostgREST (`adminTeams.ts`). Edge `delete-teams` — только fallback. Требует RLS: authenticated admin на `teams`, `players`, `answers`.

## Финиш-страница при сбое сети

`participantAccess.verifyFinishPageAccess`: если есть `hasFinishNavigation` (sessionStorage / `finishNavigation`) и ошибка transient (`failed to fetch`, timeout), доступ **разрешается** без повторной проверки `game_state`.

**Trade-off:** UX на iPhone vs строгая проверка «игра завершена». Не даёт доступ без предшествующего финиш-navigation state. Документировать при ужесточении IMP-SEC.

## Клиентский счёт и ответы

Авто-вопросы: только `submit_auto_answer` с session token; очки и `is_correct` на сервере (IMP-LOG-001 + IMP-SEC-007/008). Прямой INSERT в `answers` и `increment_team_score` с клиента убраны.

Медиа-вопросы: статус выставляет админ.

## Storage

Публичные buckets: любой может читать URL, если угадал path. Используйте непредсказуемые имена (уже есть random suffix).

Signed URLs / private buckets — IMP-SEC-002.

## CORS

Добавить production-домен в Supabase → Settings → API.

## Чеклист перед мероприятием

- [ ] service role не в frontend bundle
- [ ] `.env` в `.gitignore`
- [ ] Отдельный Supabase проект для прода vs тестов
- [ ] Ротация пароля админа после `create_admin_script`

## Связанные документы

- [IMPROVEMENTS_CATALOG.md](IMPROVEMENTS_CATALOG.md) — IMP-SEC-*
- [EDGE_FUNCTIONS.md](EDGE_FUNCTIONS.md)
