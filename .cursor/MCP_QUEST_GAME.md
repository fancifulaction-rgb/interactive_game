# MCP для workspace Quest Game

## Supabase MCP (основной)

Подключён в `.cursor/mcp.json` к проекту **`tvytsnnujaucoluoyvjq`** (тот же ref, что в `.env.example`).

| Параметр | Значение |
|----------|----------|
| `project_ref` | `tvytsnnujaucoluoyvjq` — только этот проект |
| `read_only` | **не задан** — полный доступ: SQL, миграции, Edge deploy, логи |
| `features` | database, debugging, development, edge_functions, docs, storage |

### Один раз: авторизация в Cursor

1. `Ctrl+Shift+J` → **Tools & MCP** — сервер **supabase** должен быть в списке.
2. При первом использовании откроется браузер → войти в Supabase → выбрать org с проектом `tvytsnnujaucoluoyvjq` → разрешить доступ.
3. `Ctrl+Shift+P` → **Developer: Reload Window**.
4. В Agent-чате включите подтверждение tool calls (не auto-run без review) — см. [Security](https://supabase.com/docs/guides/ai-tools/mcp#security-risks).

### Проверка (скопировать в новый Agent-чат)

```
Подключись к Supabase через MCP (project tvytsnnujaucoluoyvjq):
1. list_tables — перечисли public-таблицы.
2. Сверь с docs/DATA_LIFECYCLE.md: games, questions, teams, answers, game_state, team_scores, messages.
3. list_edge_functions — есть ли delete-game и player-upload?
4. Кратко: что не совпадает с документацией?
```

### Опционально: Agent Skills Supabase

```bash
npx skills add supabase/agent-skills
```

Готовые инструкции для миграций, RLS, Edge Functions — дополнение к MCP, не замена.

### Если project_ref другой

Если в `.env` другой URL (не `tvytsnnujaucoluoyvjq`), обновите query в `.cursor/mcp.json` под ваш Dashboard → Connect → MCP.

---

## Лишние MCP (отключить в UI)

Плагины **Notion**, **Figma**, **Datadog**, **Framelink** не отключаются пустым конфигом — только toggle:

1. `Ctrl+Shift+J` → **Tools & MCP**
2. Выключить: `plugin-notion-workspace-notion`, `plugin-figma-figma`, `plugin-datadog-datadog`, Framelink (если есть)
3. **Developer: Reload Window**

Глобальный `~/.cursor/mcp.json` может добавлять серверы во все проекты — для Quest Game достаточно workspace `.cursor/mcp.json` + toggle off лишнего.

---

## Безопасность

- MCP работает под **вашим** аккаунтом Supabase (не anon key приложения).
- Не вставлять service role / PAT в чат и в git.
- Перед деструктивными tool calls (DELETE, `apply_migration`, deploy) — смотреть preview в Cursor.
- Прод с реальными игроками: предпочитать dev/staging проект; для prod — осознанно.

---

## Связь с DEV-диагностикой

| Канал | Когда |
|-------|--------|
| **clientLogCollector + DiagnosticLogsPanel** | Баг в браузере/телефоне: очередь fetch, регистрация, GamePlay |
| **Supabase MCP `get_logs`** | Ошибки API, Postgres, Edge, Auth на стороне Supabase |
| **Код + docs** | Логика приложения, IMP-*, ROADMAP |

См. `quest-game-github-archive/docs/DIAGNOSTICS.md`.
