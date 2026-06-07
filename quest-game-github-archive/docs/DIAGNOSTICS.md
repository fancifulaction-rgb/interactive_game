# DEV-диагностика Quest Game

Политика: **оставляем и развиваем** — детальнее логируем «под капотом», чтобы быстрее находить баги и чинить.

Работает **только** при `npm run dev` (`import.meta.env.DEV`). В production-сборке сбор отключён.

---

## Архитектура

```
Браузер (localStorage ring)
    │ collectClientLog() / debugLog()
    ▼
POST /__client_logs  ──►  vite-client-logs-plugin  ──►  diagnostic/client-logs.jsonl
    │
    ▼
DiagnosticLogsPanel (AdminPanel) — скачать / импорт с телефона / очистить
```

| Файл | Назначение |
|------|------------|
| `src/lib/clientLogCollector.ts` | Кольцо ~800 записей, flush на dev-сервер, export JSON |
| `src/lib/debugLog.ts` | `debugLog` (VITE_DEBUG_LOG), `agentDebugLog` (всегда в DEV), ring в sessionStorage |
| `vite-client-logs-plugin.ts` | Middleware Vite: запись NDJSON на диск |
| `src/components/DiagnosticLogsPanel.tsx` | UI в админке (DEV) |
| `diagnostic/client-logs.jsonl` | Агрегат с ПК и телефонов (в `.gitignore`) |

---

## Что уже логируется

- Старт сессии, route, `game_code`, `team_id`, UA, host
- Ошибки `supabase.ts` fetch (URL, ms, timeout, auth)
- Очередь `requestQueue`, регистрация `teamRegister`, GamePlay, Storage upload
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

- Не удалять instrumentation (`agentDebugLog`, H17/H18/H21) без подтверждения владельца после успешного iPhone QA.
- Контекст сессии: `gstack-context-restore` → checkpoint `ios-stability-admin-scratch` (2026-06-07).
- IMP: INF-008, TD-001, RT-003 (частично), SEC-001 trade-off на finish-page.
