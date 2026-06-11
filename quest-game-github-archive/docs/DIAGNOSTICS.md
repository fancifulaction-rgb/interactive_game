# DEV-диагностика Quest Game

Политика: **оставляем и развиваем** — детальнее логируем «под капотом», чтобы быстрее находить баги и чинить.

Работает **только** при `npm run dev` (`import.meta.env.DEV`). В production-сборке сбор отключён.

---

## Архитектура

```
Браузер (localStorage ring)
    │ collectClientLog() / debugLog()
    ▼
POST /__client_logs  ──►  vite-client-logs-plugin  ──►  diagnostic/
    │                         ├── client-logs.jsonl      (общий поток)
    │                         ├── devices/{session}.jsonl (по устройству)
    │                         ├── devices-manifest.json
    │                         └── exports/*.json         (полный дамп при ошибке)
    ▼
DiagnosticLogsPanel (AdminPanel) — сессии с логами, активные/неактивные, удаление из manifest
```

| Файл | Назначение |
|------|------------|
| `src/lib/clientLogCollector.ts` | Кольцо ~800 записей, flush на dev-сервер, export JSON, bundle при ошибке |
| `src/lib/debugLog.ts` | `debugLog` (VITE_DEBUG_LOG=1), `agentDebugLog` → ring-buffer; bundle при ошибке регистрации |
| `vite-client-logs-plugin.ts` | Middleware Vite: NDJSON на диск, manifest устройств |
| `src/components/DiagnosticLogsPanel.tsx` | UI: подключённые устройства, скачать лог устройства / общий JSONL |
| `diagnostic/` | Папка логов (в `.gitignore`, кроме `.gitkeep`) |

### Автосбор с телефонов (без ручного копирования)

1. Запустите `npm run dev -- --host` на ПК.
2. Откройте игру на телефоне по `http://<IP-ПК>:5174` (не localhost).
3. Логи автоматически пишутся в `diagnostic/devices/` и обновляют `devices-manifest.json`.
4. В админке → **Общие** → **DiagnosticLogsPanel**: блок «Подключённые устройства» (poll 5 с).
5. При ошибке регистрации полный JSON сохраняется в `diagnostic/exports/` через `POST /__client_logs/bundle`.

Ручной экспорт с телефона нужен только если телефон не в той же Wi‑Fi сети, что dev-сервер.

---

## Product analytics (IMP-DATA-005)

Структурированные события продукта пишутся **в production и dev** через `trackProductEvent()` → RPC `track_product_events` → таблица `product_events`.

| Слой | Файл / объект |
|------|----------------|
| Клиент | `src/lib/productAnalytics.ts`, `ProductRouteTracker` |
| БД | `docs/sql-migrations/033_product_events.sql` |
| DEV-зеркало | `POST /__product_events` → `diagnostic/product-events.jsonl` |

События: `page_view`, `registration_completed`, `lobby_entered`, `game_play_entered`, `question_viewed`, `hint_requested`, `answer_submitted`, `team_finished`, `scoreboard_viewed`, `host_viewed`, `admin_session_action`.

Анализ: SQL по `product_events` (воронка, время на вопрос, подсказки) или NDJSON в dev.

---

## Что уже логируется

- Старт сессии, route, `game_code`, `team_id`, UA, host
- Ошибки `supabase.ts` fetch (URL, ms, timeout, auth, **priority**, **bypassBoost**, **criticalActive**)
- Очередь `requestQueue` (wait ≥3s: **waitedMs**, **maxSlots**, **queueByPriority**), admin actions (`adminActionLog`: phases start/rpc_done/optimistic/reload_skipped/done)
- Realtime / revalidate (точки с `debugLog` / `collectClientLog`)

Типичный сценарий: тест с **iPhone** по Wi‑Fi → на телефоне «Скачать диагностику» или на ПК «Скачать с DEV-сервера» / открыть `diagnostic/client-logs.jsonl`.

---

## Когда добавлять логи

Добавляйте `collectClientLog(source, message, data, { level, hypothesisId })` когда:

1. Новый hot-path (Supabase, Storage, Realtime, Edge invoke)
2. Повторяющийся баг без воспроизведения в Network tab
3. Race / optimistic UI / очередь pending

**Не логировать:** пароли, токены, полные anon/service keys, персональные данные сверх необходимого.

---

## Как расширять

1. **Новый модуль** — импорт `collectClientLog` или `debugLog` из `clientLogCollector` / `debugLog`.
2. **Гипотеза** — `hypothesisId: 'H4'` (как в `supabase.ts`) для фильтра в JSONL.
3. **Критичный путь** — `level: 'error' | 'warn'`.
4. После изменений — прогон сценария в dev, проверка записей в панели или `.jsonl`.

Пример:

```ts
import { collectClientLog } from './clientLogCollector'

collectClientLog('myModule', 'step failed', { step: 'upload', err: String(e) }, {
  level: 'error',
  hypothesisId: 'H-upload',
})
```

---

## Связь с Supabase MCP

| Симптом | Смотреть |
|---------|----------|
| Таймаут / reset в браузере | `client-logs.jsonl`, Network |
| 4xx/5xx REST, RLS, SQL | MCP `get_logs`, `execute_sql` (read), advisors |
| Edge Function | MCP `list_edge_functions`, `get_logs` (edge) |
| Схема vs код | MCP `list_tables`, `docs/DATA_LIFECYCLE.md` |

Настройка MCP: [`.cursor/MCP_QUEST_GAME.md`](../../.cursor/MCP_QUEST_GAME.md).

---

## Очистка

- Панель: «Очистить локальные» — только ring в браузере.
- Файл на диске: удалить или обнулить `diagnostic/client-logs.jsonl` (не коммитить).

---

## Ручной чеклист после изменений сети/очереди

1. **iPhone Safari** (тот же Wi‑Fi, `npm run dev -- --host`): регистрация → лобби → старт → вопросы (один prefetch, не 30+ с).
2. **Админка:** «Начать с нуля» — команды исчезают, без alert ERR_CONNECTION_RESET.
3. Счётчик команд в лобби = админка после realtime.
4. Пауза / возобновление / завершение.
5. Скачать логи: AdminPanel → Общие → DiagnosticLogsPanel (DEV).

Скрипты: `node scripts/test-game-session-state.mjs`, `node scripts/e2e-game-flow.mjs`.

---

## Для следующего агента

- Ingest на `:7862` / `__debug_ingest` удалён (IMP-TD-002); диагностика только через `POST /__client_logs` и DiagnosticLogsPanel.
- `agentDebugLog` пишет в `collectClientLog`, не в внешний ingest.
- IMP: RT-003 (частично), SEC-001 trade-off на finish-page.
