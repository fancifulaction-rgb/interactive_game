# Короткие промпты для Cursor (Quest Game)

Копируйте блоки ниже в чат. Домен и правила кода уже в `.cursor/rules/` — длинный онбординг не нужен.

Полная версия (архив): [AI_AGENT_ONBOARDING_PROMPT.md](AI_AGENT_ONBOARDING_PROMPT.md).

## Жизненный цикл сессии агента

| Когда | § | Полный текст |
|-------|---|--------------|
| **Новый чат / новый агент** | 1 | Стартовый онбординг |
| **Агент чинит баги по аудиту** | 1Б | Промт исполнителя багфиксов |
| **Каждые 1–2 ч, после перерыва** | 2 | [AI_AGENT_FOCUS_REMINDER.md](AI_AGENT_FOCUS_REMINDER.md) |
| **Конец сессии → другой агент** | 3 | [AI_AGENT_HANDOFF_PROMPT.md](AI_AGENT_HANDOFF_PROMPT.md) |
| Продолжение в том же чате | 4 | Короткий handoff |
| Перед push | 5 | gstack-review + build + e2e |

**Якорь владельца** (меняйте в FOCUS_REMINDER и HANDOFF_PROMPT):
Фокус — багфиксы по `docs/BUG_AUDIT_HANDOFF.md`. Порядок: P0-корректность (C1, H2, H3, H7),
затем H1/H4/H5/H6, затем C2/M6. Security-блок **S1–S6 — только по согласованию** (миграции
+ Edge + сессия команды), не катить на прод вслепую. Сделано: realtime-fallback (admin poll
6с; player postgres_changes + частый poll на паузе).

---

## 1. Стартовый (новый агент)

```
Quest Game — ведущий full-stack инженер.
Корень кода: quest-game-github-archive/ (репо g:\Code\quest-game\). v1.2.15.
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
   @quest-game-github-archive/docs/BUG_AUDIT_HANDOFF.md — текущий список багов и приоритеты
   @quest-game-github-archive/docs/ROADMAP.md — Спринт 1 + что уже done
   @quest-game-github-archive/CHANGELOG.md — [Unreleased]
   В IMPROVEMENTS_CATALOG — только IMP-* из ROADMAP / checkpoint / задачи владельца.

2) Ориентация в git (Git Bash, cwd = quest-game-github-archive)
   git status -sb && git log -3 --oneline && git remote -v
   Проверь: dev-сервер уже запущен? (часто npm run dev -- --host в другом терминале)
   Используй СУЩЕСТВУЮЩИЙ терминал владельца, не плоди новые.

3) Маршрутизация по типу задачи (дочитай по необходимости)
   Баги (текущий приоритет)            → BUG_AUDIT_HANDOFF (+ промт §1Б для исполнителя)
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
• select('*') на hot-path запрещён (IMP-TD-001). service role только на Edge, не во фронте.
• Не коммить .env, dist, node_modules, diagnostic/ (логи/выгрузки).

═══ ПРОЦЕСС ═══

• Работа только по IMP-* / пункту BUG_AUDIT_HANDOFF; вне списка / новая фича — спросить владельца.
• Минимальный diff: не рефакторить и не добавлять фичи вне запроса.
• После существенных правок: npm run build (+ ReadLints на изменённые файлы).
• Перед push: gstack-review (requestQueue, IMP-SEC, Edge, select на hot-path) → build → при сети node scripts/e2e-game-flow.mjs → commit+push по просьбе владельца или правилу «регулярные коммиты».
• Security-задачи (RLS/Edge): gstack-cso + Supabase MCP. UI: gstack-qa на уже поднятом http://localhost:5173.
• Конец блока / пауза: gstack-context-save (IMP-ID, ветка, коммит, ручная проверка, next step).

STOP без явного IMP-*: Socket.IO, новый бэкенд, большой рефактор, PWA/AI если не в задаче.

═══ ПОДТВЕРЖДЕНИЕ (первый ответ агента) ═══

Кратко, списком:
1) Checkpoint: найден / нет; что взял из него
2) Ветка, sync с origin, последний коммит
3) Активный IMP-ID / пункт аудита и статус (или «жду задачу от владельца»)
4) Один конкретный следующий шаг (файл или команда)
5) Риски сессии: менялись ли requestQueue / gameRealtime / participantAccess недавно — да/нет
```

---

## 1Б. Агент-исполнитель багфиксов (по аудиту)

Используйте, когда агент будет **чинить баги** из `docs/BUG_AUDIT_HANDOFF.md`.

```
Quest Game — инженер-исполнитель багфиксов. Корень: quest-game-github-archive/ (g:\Code\quest-game\). v1.2.15.
Стек: React 18 + Vite + TS + Tailwind + Supabase. С владельцем — русский. Минимальный diff, без новых фич.

Источник задач: @quest-game-github-archive/docs/BUG_AUDIT_HANDOFF.md
Правила кода: .cursor/rules/quest-game-*.mdc (применяй, не пересказывай).

═══ 0. ПОДГОТОВКА ═══
• gstack-context-restore. Прочитай AGENTS.md и BUG_AUDIT_HANDOFF.md целиком.
• git status -sb && git log -3 --oneline. Работай в feature-ветке (напр. fix/audit-c1-lobby).
• Используй существующий терминал владельца.

═══ 1. ВЫБОР ПУНКТА ═══
• Бери ОДИН пункт по порядку из раздела «Рекомендуемый порядок работ» аудита
  (по умолчанию: C1 → H2 → H3 → H7 → H1 → H4 → H5 → H6 → C2/M6).
• ❗ Security-блок S1–S6 НЕ начинай без явного «да» владельца: это миграции БД + Edge deploy +
  выдача командам сессионного токена; ужесточение RLS без этого ломает текущий публичный игровой
  поток. Для них: сначала план в чат, gstack-cso, Supabase MCP (list_tables/get_advisors), и только
  после согласования — изменения.

═══ 2. ПЕРЕД ПРАВКОЙ КАЖДОГО ПУНКТА ═══
• Маркер ✅ — баг подтверждён чтением кода: можно чинить.
• Маркер 🔍 — СНАЧАЛА воспроизведи по колонке «Проверка»/«repro» (или докажи чтением кода, что путь
  реальный). Если воспроизвести не удалось — не «чини вслепую», отметь это и спроси владельца.
• Прочитай окружающий код по указанным файлам:строкам, пойми существующий паттерн, не ломай очередь/кэш.

═══ 3. ПРАВКА ═══
• Минимальный diff строго в рамках пункта. Не трогай несвязанное «заодно».
• Соблюдай железные ограничения:
  — все REST к Supabase через supabase.ts/requestQueue; не параллелить REST+Storage; аватар после игры;
  — нет select('*') на hot-path; service role только на Edge; coalesce GET не дублировать.
• Заведи запись в docs/IMPROVEMENTS_CATALOG.md (IMP-* с ссылкой на пункт аудита, статус in_progress).
• Не добавляй комментарии-пересказы кода; комментарий — только про неочевидное «зачем».

═══ 4. ПРОВЕРКА ═══
• ReadLints на изменённые файлы; npm run build (должен быть зелёным).
• Выполни шаг из колонки «Проверка» пункта (ручной сценарий: PC + телефон, лобби/пауза/старт и т.п.).
• Для БД/Edge — Supabase MCP get_logs/get_advisors; при сети — node scripts/e2e-game-flow.mjs.

═══ 5. КОММИТ (один пункт = один коммит) ═══
• Conventional Commits: fix(scope): … с указанием ID пункта в теле (напр. «BUG_AUDIT C1»).
• Обнови статус IMP в каталоге (in_progress → done) и строку в CHANGELOG [Unreleased];
  для воспроизводимого бага — запись в BUGS_FOUND.
• Перед push: gstack-review → build → commit → push (push по правилу «регулярные коммиты» или просьбе).
• Не коммить .env/dist/node_modules/diagnostic.

═══ 6. ОТЧЁТ ПО КАЖДОМУ ПУНКТУ (в чат) ═══
1) Пункт аудита + IMP-ID
2) Что было / что стало (файлы:строки)
3) Как проверил (repro до/после, build, e2e)
4) Ветка/коммит, запушено ли
5) Следующий пункт

STOP: не расширять scope, не рефакторить архитектуру, не катить RLS/Edge на прод без согласования.
Если пункт оказался неверным (не воспроизводится / уже исправлен) — отметь и переходи к следующему,
не выдумывая правку.
```

---

## 2. Периодический фокус + подчистка (каждые 1–2 ч)

Полный текст и якорь владельца: **[AI_AGENT_FOCUS_REMINDER.md](AI_AGENT_FOCUS_REMINDER.md)**.

```
═══ QUEST GAME — ФОКУС + ПОДЧИСТКА ═══

Проект: командные квесты, 2–100 команд, Supabase-only, v1.2.15.
Ценность — стабильная игра на телефонах; враг — шторм запросов к *.supabase.co.
Очередь: requestQueue + supabase.ts; coalesce: prefetchGameQuestions, fetchGameState, fetchLobbyTeams.
Текущий фокус: багфиксы по docs/BUG_AUDIT_HANDOFF.md (P0-корректность раньше security).

A) Пункт аудита / IMP-ID сессии?  B) Сделано за 1–2 ч?  C) Отклонения без согласования?
D) Риски: parallel Supabase, select('*'), service role, лишний Realtime-канал, RLS/Edge на прод без «да»?
E) git status -sb — незакоммиченное?

Подчистка: build+ReadLints если менял src/; CHANGELOG/BUGS_FOUND/IMP-статусы; нет hot-path без очереди;
один пункт аудита = один коммит; убрать DEV-мусор (IMP-TD-002).
STOP без согласования: Socket.IO, новый бэкенд, большой рефактор, RLS/Edge на прод, PWA/AI вне задачи.

Память (5–8 буллетов): пункт аудита/IMP, решения, риск-файлы, следующий шаг, ветка/коммит.
Пауза >30 мин — gstack-context-save. Ответ: A–E + что подчистил + один следующий шаг.
```

---

## 3. Финальный handoff (конец сессии → новый агент)

Полный текст: **[AI_AGENT_HANDOFF_PROMPT.md](AI_AGENT_HANDOFF_PROMPT.md)**.

```
═══ QUEST GAME — ЗАВЕРШЕНИЕ СЕССИИ / HANDOFF ═══

Следующий агент: gstack-context-restore + §1 стартовый (или §1Б, если продолжает багфиксы).
С владельцем — русский. cwd: quest-game-github-archive/.

1) Подчистка: git status; не коммить .env/dist/diagnostic; build+ReadLints если менял src/;
   IMP-каталог + CHANGELOG + BUGS_FOUND при необходимости; нет select('*')/обхода очереди;
   один пункт аудита = один коммит (не смешивать).

2) Перед push: gstack-review → build → node scripts/e2e-game-flow.mjs → commit → push.

3) gstack-context-save (обязательно): пункт аудита/IMP-ID, ветка, коммит, ручная проверка, next step.

4) Выведи блок Handoff для владельца:
   — ветка/коммит, checkpoint
   — какие пункты BUG_AUDIT_HANDOFF закрыты / WIP / не воспроизвелись
   — файлы-риски (requestQueue, gameRealtime, gameSessionSnapshotCache, adminTeams, …)
   — чеклист проверок (build, e2e, ручной QA по DIAGNOSTICS.md)
   — один шаг для следующего агента + STOP (security-блок S1–S6 без согласования не трогать)

Спроси: «commit+push сейчас или WIP?»
```

---

## 4. Handoff (продолжение в том же чате)

```
Продолжаем Quest Game в quest-game-github-archive/. gstack-context-restore если был перерыв.

git status -sb && git log -1 --oneline
Пункт BUG_AUDIT_HANDOFF / IMP-* в работе, что осталось, что подчистить из §2 (build, незакоммиченное).

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
gstack-context-save. Пункт аудита/IMP-ID, ветка, коммит, ручная проверка, следующий шаг, незакоммиченный WIP.
```

---

## 8. Supabase MCP + DEV-логи (отладка)

```
Баг с БД / RLS / Edge / Storage:
- Supabase MCP: list_tables, get_logs, list_edge_functions, get_advisors.
- Сверь с @docs/DATA_LIFECYCLE.md и @docs/DATABASE.md.

Баг в браузере / iPhone / очередь fetch:
- @docs/DIAGNOSTICS.md, diagnostic-логи устройств, DiagnosticLogsPanel в админке (DEV).
```

---

*Версия: 2026-06-07 (промпты v4: старт §1, исполнитель багфиксов §1Б, фокус §2, handoff §3). Источник багов — BUG_AUDIT_HANDOFF.md. gstack + Project Rules + Supabase MCP + DEV diagnostics.*
