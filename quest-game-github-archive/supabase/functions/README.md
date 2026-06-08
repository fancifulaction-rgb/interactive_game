# Edge Functions

**Продакшен-деплой:** только через `npm run edge:deploy` (`scripts/deploy-edge-functions.mjs`).

| Функция | JWT | Назначение |
|---------|-----|------------|
| `player-upload` | нет (team session внутри) | Загрузка медиа игрока |
| `delete-game` | да | Удаление игры |
| `delete-teams` | да | Удаление команд |
| `confirm-admin-email` | да | Подтверждение email админа |
| `generate-questions` | — | деплой отдельно при необходимости |

## Не деплоить на prod (BUG_AUDIT L6)

Папки `test-upload`, `test-alternative-upload`, `test-image-upload` — локальная диагностика Storage; используют service role. **Не включать** в `edge:deploy` и не выкладывать на Supabase prod.
