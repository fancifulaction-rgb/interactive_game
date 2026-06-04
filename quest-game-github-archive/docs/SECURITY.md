# Безопасность

## Модель угроз (текущая)

| Угроза | Вероятность | Текущая защита |
|--------|-------------|----------------|
| Чтение всех игр/ответов с anon key | Высокая | **Слабая** — RLS `USING (true)` |
| Подмена `total_score` через API | Средняя | Клиент пишет score; нет RPC |
| Загрузка мусора в Storage | Средняя | Размер/MIME buckets; публичный upload |
| Утечка service role | Критично | Только `.env` / Edge secrets, не `VITE_*` |
| XSS на фронте | Низкая-средняя | React escape; проверять `dangerouslySetInnerHTML` |

## Аутентификация

- **Админ:** Supabase Auth (email/password).
- **Игрок:** без аккаунта; идентификация по `team_id` в localStorage.

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

Service role живёт только на сервере Deno. Функции должны валидировать вход (размер base64, allowed buckets).

## Клиентский счёт и ответы

Сейчас `is_correct` и `points_earned` вычисляются на клиенте и отправляются в `answers`.

**Риск:** модификация запроса в DevTools.

**План:** IMP-LOG-001 — серверная проверка для авто-вопросов; медиа-вопросы — статус выставляет админ.

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
