# Глоссарий

| Термин | Значение в Quest Game |
|--------|----------------------|
| **Игра (game)** | Запись в `games` с уникальным `code` |
| **Код игры** | 4–6 символов для регистрации команд |
| **Команда (team)** | Участник квеста; одна регистрация на код |
| **Квест** | Синоним игры в продуктовых текстах |
| **Вопрос (question)** | Шаг квеста с типом, очками, таймером |
| **Ответ (answer)** | Запись в `answers` + опционально медиа |
| **Табло (scoreboard)** | Рейтинг команд по `total_score` |
| **Critical queue** | Очередь сетевых задач с приоритетом (1 одновременно) |
| **Background queue** | Фоновые задачи после critical |
| **Оптимистичный UI** | Обновление экрана до ответа сервера |
| **Jitter** | Случайная задержка 0–15 с для upload аватаров |
| **gamePlayCache** | sessionStorage кэш игры/вопросов/команд |
| **Edge Function** | Deno serverless на Supabase |
| **Anon key** | Публичный API ключ в frontend bundle |
| **Service role** | Секретный ключ с полным доступом — только сервер |
| **RLS** | Row Level Security в Postgres |
| **Realtime** | WebSocket подписки Supabase |
| **postgres_changes** | Realtime событие при изменении таблицы |
| **Broadcast** | Realtime сообщение без записи в БД (план IMP-RT-001) |
| **Пауза** | `game_state.is_paused` — стоп для всех команд |
| **scoring** | JSONB коэффициенты формулы очков в `games` |
