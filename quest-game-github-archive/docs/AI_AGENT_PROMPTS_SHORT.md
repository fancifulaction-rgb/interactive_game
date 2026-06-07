# Короткие промпты для Cursor (Quest Game)

Копируйте блоки ниже в чат. Домен и правила кода уже в `.cursor/rules/` — длинный онбординг не нужен.

Полная версия (архив): [AI_AGENT_ONBOARDING_PROMPT.md](AI_AGENT_ONBOARDING_PROMPT.md).

## Жизненный цикл сессии агента

| Когда | § | Полный текст |
|-------|---|--------------|
| **Новый чат / новый агент** | 1 | Стартовый онбординг |
| **Каждые 1–2 ч, после перерыва** | 2 | [AI_AGENT_FOCUS_REMINDER.md](AI_AGENT_FOCUS_REMINDER.md) |
| **Конец сессии → другой агент** | 3 | [AI_AGENT_HANDOFF_PROMPT.md](AI_AGENT_HANDOFF_PROMPT.md) |
| Продолжение в том же чате | 4 | Короткий handoff |
| Перед push | 5 | gstack-review + build + e2e |

**Якорь владельца** (меняйте в FOCUS_REMINDER и HANDOFF_PROMPT): Спринт 1, iPhone QA, IMP-TD-002, IMP-RT-003.

---

## 1. Стартовый (новый агент)

```
Quest Game — ведущий full-stack инженер.
Корень кода: quest-game-github-archive/ (репо g:\Code\quest-game\). v1.2.13.
Стек: React 18 + Vite + TypeScript + Tailwind + Supabase (Postgres, Realtime, Storage, Edge). С владельцем — русский.

Project Rules уже в контексте — не пересказывай их, применяй:
  quest-game-focus.mdc      — спринт, STOP-лист, hot-path
  quest-game-player-network.mdc — requestQueue, fetch, iPhone
  quest-game-typescript.mdc — стиль, минимальный diff
  quest-game-supabase.mdc   — MCP, RLS, миграции
  quest-game-gstack.mdc     — когда review / QA / handoff

═══ ОНБОРДИНГ (выполни до первой правки кода) ═══

0) gstack-context-restore
   Прочитай ~/.cursor/skills/gstack-context-restore/SKILL.md, preamble в Git Bash.
   Если checkpoint пуст — зафиксируй «checkpoint не найден» и иди дальше.

1) Обязательное чтение (5–10 мин)
   @quest-game-github-archive/AGENTS.md
   @quest-game-github-archive/docs/INDEX.md — только § «Куда идти по задаче»
   @quest-game-github-archive/docs/ROADMAP.md — Спринт 1 + что уже done в 2–3
   @quest-game-github-archive/CHANGELOG.md — [Unreleased]
   В IMPROVEMENTS_CATALOG — только IMP-* из ROADMAP / checkpoint / задачи владельца.

2) Ориентация в git (Git Bash, cwd = quest-game-github-archive)
   git status -sb && git log -3 --oneline && git remote -v
   Проверь: dev-сервер уже запущен? (часто npm run dev -- --host в другом терминале)

3) Маршрутизация по типу задачи (дочитай по необходимости)
   Игрок / лобби / ответы / iPhone     → REALTIME_AND_NETWORKING, API_AND_FLOWS, DIAGNOSTICS
   Админ / «Начать с нуля» / GameControls → API_AND_FLOWS § admin, adminTeams, gameSessionControl
   БД / RLS / SQL                       → DATABASE, sql-migrations/, SECURITY
   Edge / Storage                       → EDGE_FUNCTIONS, STORAGE, DATA_LIFECYCLE
   Баг с историей                       → BUGS_FOUND (последние записи)

═══ ЖЕЛЕЗНЫЕ ОГРАНИЧЕНИЯ (ломают прод на 50+ телефонах) ═══

• Весь HTTP к Supabase — через обёртку в supabase.ts → enqueueSupabaseFetch (приоритеты URL).
• Логика игрока — enqueueCritical / enqueueBackground; не блокировать critical вложенными await.
• Не параллелить REST + Storage в одной вкладке; аватар — после игры (avatarAfterGame).
• Coalesce/dedupe уже есть: prefetchGameQuestions, fetchGameState, fetchLobbyTeams — не дублировать GET.
• select('*') на hot-path запрещён (IMP-TD-001). service role только на Edge.
• Не коммить .env, dist, node_modules, diagnostic/client-logs.jsonl.

═══ ПРОЦЕСС ═══

• Работа только по IMP-* из каталога; вне спринта / новая фича — спросить владельца.
• После существенных правок: npm run build.
• Перед push: gstack-review (requestQueue, IMP-SEC, Edge, select на hot-path) → build → при сети node scripts/e2e-game-flow.mjs → commit+push по просьбе владельца или правилу «регулярные коммиты».
• Security-задачи: gstack-cso. UI: gstack-qa на уже поднятом http://localhost:5173 (dev не стартует внутри QA).
• Конец блока / пауза: gstack-context-save (IMP-ID, ветка, коммит, ручная проверка, next step).

STOP без явного IMP-*: Socket.IO, новый бэкенд, большой рефактор, PWA/AI если не в задаче.

═══ ПОДТВЕРЖДЕНИЕ (первый ответ агента) ═══

Кратко, списком:
1) Checkpoint: найден / нет; что взял из него
2) Ветка, sync с origin, последний коммит
3) Активный IMP-ID и статус в каталоге (или «жду задачу от владельца»)
4) Один конкретный следующий шаг (файл или команда)
5) Риски сессии: менялись ли requestQueue / gameRealtime / participantAccess недавно — да/нет
```

---

## 2. Периодический фокус + подчистка (каждые 1–2 ч)

Полный текст и якорь владельца: **[AI_AGENT_FOCUS_REMINDER.md](AI_AGENT_FOCUS_REMINDER.md)**.

```
═══ QUEST GAME — ФОКУС + ПОДЧИСТКА ═══

Проект: командные квесты, 2–100 команд, Supabase-only, v1.2.13.
Ценность — стабильная игра на телефонах; враг — шторм запросов к *.supabase.co.
Очередь: requestQueue + supabase.ts; coalesce: prefetchGameQuestions, fetchGameState, fetchLobbyTeams.

A) IMP-ID / ROADMAP сессии?  B) Сделано за 1–2 ч?  C) Отклонения без согласования?
D) Риски: parallel Supabase, select('*'), service role, лишний Realtime-канал?
E) git status -sb — незакоммиченное?

Подчистка: build если менял src/; CHANGELOG/BUGS_FOUND/IMP-статусы; нет hot-path без очереди; убрать DEV-мусор (IMP-TD-002).
STOP без IMP-*: Socket.IO, новый бэкенд, большой рефактор, PWA/AI вне задачи.

Память (5–8 буллетов): IMP, решения, риск-файлы, следующий шаг, ветка/коммит.
Пауза >30 мин — gstack-context-save. Ответ: A–E + что подчистил + один следующий шаг.
```

---

## 3. Финальный handoff (конец сессии → новый агент)

Полный текст: **[AI_AGENT_HANDOFF_PROMPT.md](AI_AGENT_HANDOFF_PROMPT.md)**.

```
═══ QUEST GAME — ЗАВЕРШЕНИЕ СЕССИИ / HANDOFF ═══

Следующий агент: gstack-context-restore + §1 стартовый промпт.

1) Подчистка: git status; не коммить .env/dist/logs; build если менял src/;
   IMP-каталог + CHANGELOG + BUGS_FOUND при необходимости; нет select('*')/обхода очереди.

2) Перед push: gstack-review → build → node scripts/e2e-game-flow.mjs → commit → push.

3) gstack-context-save (обязательно): IMP-ID, ветка, коммит, ручная проверка, next step.

4) Выведи блок Handoff для владельца:
   — ветка/коммит, checkpoint
   — IMP сделано / WIP
   — файлы-риски (requestQueue, gameRealtime, adminTeams, …)
   — чеклист проверок (build, e2e, ручной QA по DIAGNOSTICS.md)
   — один шаг для следующего агента + STOP

Спроси: «commit+push сейчас или WIP?»
```

---

## 4. Handoff (продолжение в том же чате)

```
Продолжаем Quest Game в quest-game-github-archive/. gstack-context-restore если был перерыв.

git status -sb && git log -1 --oneline
IMP-* в работе, что осталось, что подчистить из §2 (build, незакоммиченное).

Один следующий шаг. Перед push — §5.
```

---

## 5. Перед push (явно)

```
Перед push: gstack-review на текущую ветку. Фокус: requestQueue, IMP-SEC, Edge, select на hot-path. Затем npm run build; при сети/БД — node scripts/e2e-game-flow.mjs. Потом commit+push.
```

---

## 6. UI-проверка (gstack-qa)

**`gstack-qa` не запускает игру сам** — он открывает уже работающий сайт в браузере (gstack browse) и проверяет экраны.

Порядок для владельца или агента:

1. В **отдельном терминале** (Git Bash), не закрывая его:
   ```bash
   cd quest-game-github-archive
   npm run dev
   ```
2. Убедиться, что в браузере открывается **http://localhost:5173** (Vite dev-сервер).
3. В чате агенту:
   ```
   gstack-qa на http://localhost:5173 — проверь [регистрацию / GamePlay / табло].
   ```

**Когда dev-сервер не нужен:** `gstack-review`, `gstack-cso`, `gstack-context-save`, обычные правки кода + `npm run build`.

---

## 7. Конец дня / пауза

Используйте **§3 финальный handoff** если смена агента. Для короткой паузы:

```
gstack-context-save. IMP-ID, ветка, коммит, ручная проверка, следующий шаг, незакоммиченный WIP.
```

---

## 8. Supabase MCP + DEV-логи (отладка)

```
Баг с БД / RLS / Edge / Storage:
- Supabase MCP: list_tables, get_logs, list_edge_functions, get_advisors.
- Сверь с @docs/DATA_LIFECYCLE.md и @docs/DATABASE.md.

Баг в браузере / iPhone / очередь fetch:
- @docs/DIAGNOSTICS.md, diagnostic/client-logs.jsonl, DiagnosticLogsPanel в админке (DEV).
```

---

*Версия: 2026-06-07 (промпты v3: старт §1, фокус §2, handoff §3). gstack + Project Rules + Supabase MCP + DEV diagnostics.*
