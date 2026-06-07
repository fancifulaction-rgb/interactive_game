# Финальный handoff: конец сессии агента

Вставляйте этот блок **перед закрытием чата**, когда следующий агент продолжит в **новом** чате (или на следующий день).

Короткая версия для paste: [AI_AGENT_PROMPTS_SHORT.md](AI_AGENT_PROMPTS_SHORT.md) §3.

Старт для нового агента: тот же файл §1 + **`gstack-context-restore`**.

---

## Якорь владельца (обновляйте вручную)

```
Текущий фокус: багфиксы по docs/BUG_AUDIT_HANDOFF.md (раздел «Рекомендуемый порядок работ»:
C1 → H2/H3 → H1 → H7 → H4/M7 → H5 → H6 → C2/M6). Один пункт = один IMP = один коммит.
Security-блок S1–S6 — ТОЛЬКО по согласованию (миграции + Edge + сессия команды).
Сделано: realtime-fallback (admin poll 6с; player postgres_changes + частый poll на паузе).
Не начинать: Socket.IO, новый бэкенд, рефактор без IMP-*, RLS/Edge на прод без «да».
```

---

## Текст для копирования агенту

```
═══ QUEST GAME — ЗАВЕРШЕНИЕ СЕССИИ / HANDOFF ═══

Ты заканчиваешь работу. Следующий агент начнёт с gstack-context-restore + стартовый промпт (AI_AGENT_PROMPTS_SHORT §1, или §1Б для багфиксов).
С владельцем — русский. cwd: quest-game-github-archive/.

═══ 1. ПОДЧИСТКА (сделай сам, не оставляй «на потом») ═══

Git (Git Bash):
  git status -sb
  • Незакоммиченное по задаче — commit или явно опиши WIP в handoff
  • Не коммить: .env, dist/, node_modules/, diagnostic/client-logs.jsonl
  • Ветка синхронизирована с origin? Если нет и код готов — push после gstack-review

Код и качество:
  • npm run build — если менялся src/ в этой сессии и build ещё не гоняли
  • Нет ли нового select('*') на hot-path (IMP-TD-001)
  • Нет ли прямого fetch к Supabase в обход supabase.ts / requestQueue
  • Временный console.log / agentDebugLog — убрать или пометить в handoff (IMP-TD-002)
  • Откат экспериментов: закомментированный код, дублирующие Realtime-каналы

Документация (если менялось поведение):
  • IMPROVEMENTS_CATALOG — статус IMP-* (in_progress → done / accepted)
  • CHANGELOG [Unreleased] — одна строка на завершённый блок
  • BUGS_FOUND — запись, если чинили воспроизводимый баг
  • AGENTS / REALTIME / API_AND_FLOWS — только если менялся контракт модулей

Безопасность:
  • Секреты не в diff (service role, пароли, токены)
  • При сомнении — gstack-cso или отметка в handoff

═══ 2. ПЕРЕД PUSH (если коммитишь сейчас) ═══

gstack-review → npm run build → при сети/БД: node scripts/e2e-game-flow.mjs → commit → push
Фокус review: requestQueue, IMP-SEC, Edge, select на hot-path.

═══ 3. gstack-context-save (обязательно) ═══

Прочитай ~/.cursor/skills/gstack-context-save/SKILL.md и сохрани checkpoint.
В checkpoint должны попасть: IMP-ID, ветка, хеш коммита, что проверить вручную, следующий шаг.

═══ 4. ОТЧЁТ ДЛЯ СЛЕДУЮЩЕГО АГЕНТА (выведи в чат блоком) ═══

Скопируй владельцу этот шаблон, заполненный фактами:

---
## Handoff Quest Game — [дата]

**Ветка / коммит:** … / …
**Checkpoint:** путь или «сохранён через gstack-context-save»

### IMP и прогресс
- Активные IMP-ID / пункты BUG_AUDIT_HANDOFF: … (статус в каталоге)
- Сделано в сессии (какие пункты закрыты): …
- Не доделано / WIP / не воспроизвелось: …

### Файлы и зоны риска
- Ключевые изменения: …
- Трогали requestQueue / gameRealtime / participantAccess / adminTeams: да/нет — что именно

### Проверки
- [ ] npm run build
- [ ] e2e-game-flow.mjs (если применимо)
- [ ] gstack-review перед push
- Ручная проверка владельца: … (см. DIAGNOSTICS.md)

### Следующий агент — один шаг
…

### STOP / не трогать
…
---

После отчёта — коротко спроси владельца: «Нужен commit+push сейчас или оставляем WIP?»
```

---

## Как использовать владельцу

| Когда | Действие |
|-------|----------|
| Конец дня / смена агента | Этот промпт → скопировать блок Handoff в заметку или новый чат |
| Новый чат | Стартовый промпт (PROMPTS_SHORT §1) + при необходимости вставить Handoff |
| Агент ушёл без handoff | `gstack-context-restore` + git log + git status |

## Связанные документы

- [AI_AGENT_PROMPTS_SHORT.md](AI_AGENT_PROMPTS_SHORT.md) — все paste-блоки (§1Б — багфиксы)
- [AI_AGENT_FOCUS_REMINDER.md](AI_AGENT_FOCUS_REMINDER.md) — каждые 1–2 ч
- [BUG_AUDIT_HANDOFF.md](BUG_AUDIT_HANDOFF.md) — текущий список багов
- [AGENTS.md](../AGENTS.md) — правила кода

*Версия: 2026-06-07 (фокус: багфиксы по BUG_AUDIT_HANDOFF).*
