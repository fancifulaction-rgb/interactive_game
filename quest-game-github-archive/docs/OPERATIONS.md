# Runbook: проведение мероприятия

Инструкция для организатора/IT в день корпоратива.

## За 1–3 дня до события

- [ ] Supabase проект **Active** (не Paused)
- [ ] Миграции **001–041** применены на облаке (`npm run db:migrate` + `npm run db:verify-schema` — журнал и DDL)
- [ ] После migrate: **обновить кэш PostgREST** (см. [§ Reload PostgREST schema](#reload-postgrest-schema)) — иначе REST может не видеть новые RPC/view
- [ ] Realtime publication включена
- [ ] Edge Functions `player-upload`, `delete-game`, `generate-questions` задеплоены — см. [§ Edge Functions](#edge-functions)
- [ ] `npm run test:api`, `npm run edge:verify` и `node scripts/security-smoke.mjs` на prod (14 проверок SEC-013–019, S3–S5)
- [ ] Создана игра, код записан (например на бумаге для ведущего)
- [ ] Все вопросы сохранены, превью в GameEditor
- [ ] Тестовая команда прошла квест на телефоне
- [ ] Фронт собран и задеплоен (`npm run build` → хостинг)
- [ ] `VITE_*` на хостинге указывают на **прод** Supabase

## За 2 часа до старта

- [ ] Wi‑Fi / LTE стабильны в зале (гостевой VLAN без изоляции клиентов)
- [ ] Ноутбук ведущего заряжен, резерв браузера (Chrome)
- [ ] Проектор: открыть `/scoreboard-admin/<CODE>`
- [ ] Короткая ссылка или QR на `/team/register` (см. IMP-UX-002)
- [ ] Админ: `/admin/panel` — проверить игру активна

## Во время регистрации

- Озвучить код игры крупно на экране.
- Команды: зайти на сайт → Регистрация → код → имя → (аватар опционально).
- При тормозах: не обновлять страницу во время «Отправить» — подождать 10 с.

**Ожидаемая нагрузка:** до 100 команд — см. [SCALING.md](SCALING.md).

## Во время игры

- Пауза: админ → Game Controls → пауза (все экраны `GameStateManager`).
- Сообщения: админ → рассылка (NotificationPopup у игроков).
- **Одна вкладка админки** на игру — лишние вкладки Game Controls / Team Management конкурируют с телефонами за HTTP к Supabase.
- Не держать открытыми лишние табло (`/scoreboard`, `/scoreboard-detailed`) на том же ноутбуке, если iPhone «висят» на загрузке — poll табло добавляет GET в общую очередь.
- Не открывать тяжёлый AdminScoreboard на том же ноутбуке, что раздаёт Wi‑Fi hotspot (опционально).

## Если что-то сломалось

| Симптом | Действие |
|---------|----------|
| Не регистрируется | Проверить код; Dashboard → API logs |
| Ответ «завис» | F5 только если UI не реагирует 60+ с; проверить Network reset |
| Табло не обновляется | F5 табло; проверить Realtime publication |
| 429 Too Many Requests | Пауза 2 мин; апгрейд план Supabase |
| Storage error | Проверить размер фото (&lt; 5 MB аватар) |

Эскалация разработчику: логи Network HAR, код игры, время, браузер.

## После мероприятия

- [ ] Экспорт результатов (Excel)
- [ ] Удалить тестовые игры или вызвать `delete-game`
- [x] Архив заездов — IMP-DATA-001 (`npm run db:migrate:014`)

## Reload PostgREST schema

PostgREST кэширует метаданные БД. После DDL (миграции, новые RPC/view) кэш нужно обновить.

**Предпочтительно (агент через Supabase MCP):** SQL в проекте:

```sql
NOTIFY pgrst, 'reload schema';
```

Проверка: `npm run db:verify-schema` (блок PostgREST RPC) и `node scripts/security-smoke.mjs`.

**Вручную в Dashboard (если кнопка есть):**

1. [supabase.com/dashboard](https://supabase.com/dashboard) → проект `tvytsnnujaucoluoyvjq`
2. Слева **Project Settings** (шестерёнка внизу) → **Infrastructure**
3. Секция **PostgREST** / **PostgREST Health** → **Reload schema cache**

Старая кнопка **Settings → API → Reload schema** в новом Studio часто **отсутствует** — это нормально, используйте SQL выше.

Альтернатива: **SQL Editor** → New query → `NOTIFY pgrst, 'reload schema';` → Run.

Если после NOTIFY всё ещё PGRST204/PGRST205: подождать ~1 мин, повторить NOTIFY; в крайнем случае **Infrastructure → Restart PostgREST** (краткий downtime API).

## Edge Functions

Продакшен-функции: `player-upload` (upload с service role), `delete-game` (игра + Storage), `generate-questions` (AI-генерация вопросов, опционально).

**Деплой (один раз или после изменений в `supabase/functions/`):**

```bash
cd quest-game-github-archive
npx supabase login
npm run edge:deploy
```

**Проверка без CLI:**

```bash
npm run edge:verify
```

Ожидается HTTP ≠ 404 для обеих функций. Клиент: `storageUpload.ts` fallback на `player-upload` при ошибке Storage; `deleteGame.ts` — Edge с fallback на CASCADE.

Секреты в Dashboard → Edge Functions → Secrets:

- Обязательно: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`player-upload`, `delete-game`)
- Для AI (`generate-questions`, IMP-PRD-002): хотя бы один из `GROQ_API_KEY`, `DASHSCOPE_API_KEY`, `DEEPSEEK_API_KEY` (не в `VITE_*`, только Edge)

**CI e2e (GitHub Actions):** один раз после `gh auth login`:

```bash
cd quest-game-github-archive
npm run ci:secrets
```

Записывает `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` из `.env` в secrets репозитория.

## Тест с телефона в локальной Wi‑Fi

Фронт только на ПК; Supabase — в облаке. Для телефона в той же сети:

```bash
cd quest-game-github-archive
npm run dev -- --host
```

На телефоне: `http://192.168.3.65:5173` (IP из строки **Network** в терминале Vite).

CORS: облачный проект отвечает `Access-Control-Allow-Origin: *` — отдельно добавлять origin в Dashboard **не нужно**. Проверка:

```bash
node scripts/verify-cors-origin.mjs http://192.168.3.65:5173
```

`172.18.0.x` — Docker/WSL; для телефона используй `192.168.x.x`.

## Rate limit (429) — runbook (IMP-INF-008)

**Симптомы:** в консоли браузера или в Network — `429 Too Many Requests`; Realtime отваливается; insert/update «молча» не проходят.

**Где смотреть:** Supabase Dashboard → **Reports** → API requests (всплеск), **Database** → connection pool, **Logs** → API / Postgres.

**Типичные причины в Quest Game:**

| Источник | Что делать |
|----------|------------|
| Много вкладок табло / админки на одной игре | Закрыть лишние; табло — один экран на зал |
| Realtime reconnect storm | Обновить страницу; проверить Wi‑Fi |
| Массовый upload медиа | `uploadAnswerMediaQueued` уже с очередью; не гонять десятки файлов параллельно |
| E2E / скрипты в цикле | Не запускать `e2e-game-flow` пачкой; пауза между прогонами |
| План Supabase (free tier) | Dashboard → **Settings → Billing**; при постоянных 429 — апгрейд или кэш на табло |

**Действия по приоритету:**

1. Убедиться, что это не локальный баг: один клиент, одна игра, повторить через 60 с.
2. Dashboard → Reports: если RPS вырос в 10× — найти источник (IP, время, endpoint).
3. Временно снизить нагрузку: отключить лишние Realtime-подписки (закрыть AdminScoreboard на втором ПК).
4. Если 429 на **Auth** — не долбить login; подождать reset окна (обычно 1 мин).
5. Зафиксировать в [BUGS_FOUND.md](BUGS_FOUND.md): время, endpoint, `x-ratelimit-*` из ответа.

**Профилактика:** узкие `select` (сделано в Спринте 1), RPC `increment_team_score` вместо read-modify-write, очередь upload.

## Мониторинг в Dashboard

Supabase → Reports:

- API requests spike
- Storage bandwidth
- Realtime connections

## Контакты и документы

- Техническая отладка: [BUGS_FOUND.md](BUGS_FOUND.md), [REALTIME_AND_NETWORKING.md](REALTIME_AND_NETWORKING.md)
- Деплой: [DEPLOYMENT.md](DEPLOYMENT.md)
