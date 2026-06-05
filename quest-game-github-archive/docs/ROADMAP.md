# Roadmap: три спринта

Принят план развития Quest Game. Каждая задача ссылается на ID из [IMPROVEMENTS_CATALOG.md](IMPROVEMENTS_CATALOG.md).

**Легенда статусов в каталоге:** `proposed` | `accepted` | `in_progress` | `done` | `rejected`

---

## Спринт 1 — Стабильность и продакшен-готовность

**Цель:** надёжность на 50–100 команд, безопасные операции, меньше нагрузки на Supabase.

| # | Задача | ID каталога | Критерий готовности |
|---|--------|-------------|---------------------|
| 1.1 | Задеплоить `player-upload` и `delete-game` | IMP-INF-001, IMP-INF-002 | `functions list` OK; upload/delete с телефона |
| 1.2 | SQL RPC `increment_team_score(team_id, delta)` | IMP-INF-003 | `teamScore.ts` вызывает RPC; нет гонок счёта |
| 1.3 | Убрать `select('*')` на табло и hot paths | IMP-TD-001 | Явные поля в AdminScoreboard, Scoreboard, export |
| 1.4 | Убрать service role с клиента (если есть) | IMP-SEC-003 | Только Edge для опасных операций |
| 1.5 | CI: `build` + `e2e-game-flow.mjs` | IMP-INF-005 | Pipeline green на PR |
| 1.6 | Документировать статус Edge в OPERATIONS | — | Чеклист обновлён |

**Не входит в спринт 1:** PWA, комната ожидания, AI.

---

## Спринт 2 — Опыт мероприятия ✅

**Цель:** удобство для ведущего и гостей в зале.

| # | Задача | ID каталога | Статус |
|---|--------|-------------|--------|
| 2.1 | Комната ожидания (общий старт) | IMP-UX-001 | done |
| 2.2 | Экран ведущего + QR на регистрацию | IMP-UX-002, IMP-UX-003 | done |
| 2.3 | PWA (manifest + service worker) | IMP-UX-004 | done |
| 2.4 | Блокировка табло до финиша (настройка игры) | IMP-UX-005 | done |
| 2.5 | Код игры 6 символов + буквы | IMP-PRD-001 | done |

**Зависимости:** 2.1 желательно до 2.2 (ведущий видит список команд в lobby).

---

## Спринт 3 — Realtime и расширения

**Цель:** масштабируемое табло, опциональные продуктовые фичи.

| # | Задача | ID каталога | Критерий готовности |
|---|--------|-------------|---------------------|
| 3.1 | Realtime Broadcast для счёта | IMP-RT-001 | done — `gameRealtime.ts`, broadcast `score_update` |
| 3.2 | Убрать poll 5s на AdminScoreboard | IMP-RT-002 | Только Broadcast/один channel |
| 3.3 | Серверная проверка авто-ответов | IMP-LOG-001 | done — RPC `submit_auto_answer` + миграция 013 |
| 3.4 | AI-генерация вопросов (Qwen / DeepSeek Edge) | IMP-PRD-002 | done — панель в GameEditor + `generate-questions`; деплой Edge + secrets |
| 3.5 | Docker Compose для self-host | IMP-INF-004 | `docker compose up` + README |
| 3.6 | Архив сессии / CSV история | IMP-DATA-001 | Таблица или export после игры |

**Опционально в спринте 3:** CDN Storage (IMP-INF-007), load test report (IMP-INF-006).

---

## После спринтов (бэклог без жёсткой даты)

См. каталог: IMP-ARC-001 (Socket.IO), IMP-PRD-003 (team chat), IMP-ST-002 (video transcode), GDPR doc.

---

## Как вести прогресс

1. Перед взятием задачи — пометить ID в IMPROVEMENTS_CATALOG как `accepted` → `in_progress`.
2. По завершении — `done` + строка в CHANGELOG.
3. Отклонённые — `rejected` + комментарий «почему».

---

## Связь со старым BACKLOG

[BACKLOG.md](BACKLOG.md) содержит исторические чеклисты без ID. Новые решения — **только через IMPROVEMENTS_CATALOG**.
