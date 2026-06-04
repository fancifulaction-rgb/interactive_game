# MCP для workspace Quest Game

## Что сделано автоматически

- Создан `.cursor/mcp.json` с пустым `mcpServers: {}` — в проекте **нет** дополнительных MCP из конфига.

## Что нужно один раз в UI (плагины Cursor)

Плагины **Notion**, **Figma**, **Datadog**, **Framelink** подключаются через Cursor Marketplace и **не** отключаются через пустой `mcp.json`.

Для продуктивной работы над Quest Game:

1. `Ctrl+Shift+J` → **Tools & MCP** (или Settings → MCP).
2. **Выключить** (toggle off) для этого workspace:
   - `plugin-notion-workspace-notion`
   - `plugin-figma-figma`
   - `plugin-datadog-datadog`
   - `Framelink MCP for Figma` (если виден; глобально из `~/.cursor/mcp.json`)
3. Оставить включёнными только то, что реально нужно для квеста (обычно **ничего**).

4. **Developer: Reload Window** (`Ctrl+Shift+P`).

## Глобальный `~/.cursor/mcp.json`

Там может быть Framelink Figma — он действует во **всех** проектах. Для Quest Game достаточно toggle off в MCP Settings; удалять из global — только если не нужен в других репозиториях.

## Проверка

В новом Agent-чате список tools не должен содержать notion/figma/datadog. Если есть — повторите toggle и Reload Window.
