# Edge Functions

**Продакшен-деплой:** только через `npm run edge:deploy` (`scripts/deploy-edge-functions.mjs`).

| Функция | JWT | Назначение |
|---------|-----|------------|
| `player-upload` | нет (team session внутри) | Загрузка медиа игрока |
| `delete-game` | да | Удаление игры |
| `delete-teams` | да | Удаление команд |
| `confirm-admin-email` | да | Подтверждение email админа |
| `generate-questions` | да | AI-генерация вопросов (admin auth + rate-limit) |

Удалены из репозитория (IMP-SEC-021): `alternative-upload`, `test-upload`, `test-alternative-upload`, `test-image-upload` — не деплоить.
