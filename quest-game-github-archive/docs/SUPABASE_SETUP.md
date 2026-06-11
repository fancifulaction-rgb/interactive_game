# 🛠️ Настройка Supabase для Quest Game

Этот документ содержит пошаговые инструкции по настройке Supabase проекта для Quest Game.

## 📋 Предварительные требования

- Аккаунт на [supabase.com](https://supabase.com)
- Установленный [Supabase CLI](https://supabase.com/docs/guides/cli)

## 🚀 Проект Supabase

Создайте **новый** проект: [SUPABASE_NEW_PROJECT.md](./SUPABASE_NEW_PROJECT.md).

Старый `quest_game` (ref `qsomqrzkuivgfutpautf`) восстановить через Dashboard нельзя.

1. **Получите ключи доступа**
   - Перейдите в Settings → API
   - Скопируйте:
     - `Project URL`
     - `anon public key`
     - `service_role key` (для административных функций)

## 🗄️ Настройка базы данных

### 1. Применение SQL миграций

Выполните SQL скрипты из папки `docs/sql-migrations/` в следующем порядке:

```sql
-- 1. Создание основной схемы
-- Выполните содержимое файла: docs/sql-migrations/001_initial_schema.sql

-- 2. Добавление CASCADE правил
-- Выполните содержимое файла: docs/sql-migrations/002_add_cascade_delete_rules.sql

-- 3. settings, themes
-- docs/sql-migrations/003_settings_and_themes.sql

-- 4–5. Продакшен-схема и seed из бэкапа
-- docs/sql-migrations/004_production_schema.sql
-- docs/sql-migrations/005_seed_from_backup.sql
```

### 2. Проверка таблиц

После применения миграций убедитесь, что созданы следующие таблицы:
- `games` - игры
- `teams` - команды
- `players` - игроки
- `questions` - вопросы
- `answers` - ответы
- `game_state` - состояние игр
- `team_scores` - счета команд
- `messages` - сообщения
- `message_recipients` - получатели сообщений
- `message_reads` - прочтения сообщений

## 📦 Настройка Storage

### 1. Создание Buckets

Создайте следующие публичные buckets в Storage:

```sql
-- Выполните в SQL Editor
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, '{"image/*"}'),
  ('answer-media', 'answer-media', true, 104857600, '{"image/*","video/*","audio/*"}'),
  ('question-media', 'question-media', true, 104857600, '{"image/*","video/*","audio/*"}'),
  ('quest-logos', 'quest-logos', true, 5242880, '{"image/*"}');
```

### 2. Настройка RLS политик для Storage

```sql
-- Политики для avatars bucket
CREATE POLICY "Public read access for avatars" ON storage.objects 
FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Public upload access for avatars" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'avatars');

-- Политики для answer-media bucket  
CREATE POLICY "Public read access for answer-media" ON storage.objects 
FOR SELECT USING (bucket_id = 'answer-media');

CREATE POLICY "Public upload access for answer-media" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'answer-media');

-- Политики для question-media bucket
CREATE POLICY "Public read access for question-media" ON storage.objects 
FOR SELECT USING (bucket_id = 'question-media');

CREATE POLICY "Public upload access for question-media" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'question-media');

-- Политики для quest-logos bucket
CREATE POLICY "Public read access for quest-logos" ON storage.objects 
FOR SELECT USING (bucket_id = 'quest-logos');

CREATE POLICY "Public upload access for quest-logos" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'quest-logos');
```

## ⚡ Развертывание Edge Functions

### 1. Установка Supabase CLI

```bash
npm install -g @supabase/cli
```

### 2. Логин в Supabase

```bash
supabase login
```

### 3. Связывание с проектом

```bash
supabase link --project-ref YOUR_PROJECT_ID
```

### 4. Развертывание функций

```bash
# Разверните все функции из папки supabase/functions/
supabase functions deploy delete-teams
supabase functions deploy player-upload
supabase functions deploy setup-storage-rls
# ... и другие функции по необходимости
```

## 🔑 Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 🧪 Тестирование настройки

### 1. Проверка подключения

Запустите приложение и убедитесь, что:
- Главная страница загружается
- Можно создать новую игру в админ панели
- Регистрация команд работает
- Загрузка файлов функционирует

### 2. Тестовые данные

Вставьте тестовые данные для проверки:

```sql
-- Тестовая игра
INSERT INTO games (code, title, password) 
VALUES ('TEST01', 'Тестовый квест', 'admin123');

-- Тестовые вопросы (замените game_id на ID созданной игры)
INSERT INTO questions (game_id, question_number, question_text, question_type) 
VALUES 
  ('your-game-id', 1, 'Тестовый вопрос 1', 'text'),
  ('your-game-id', 2, 'Тестовый вопрос 2', 'text');
```

## 🔧 Устранение неполадок

### Проблема: Ошибки RLS политик
**Решение:** Убедитесь, что все RLS политики созданы и применены корректно

### Проблема: Edge Functions не работают
**Решение:** 
1. Проверьте, что функции развернуты: `supabase functions list`
2. Проверьте логи: `supabase functions logs`

### Проблема: Storage не работает
**Решение:**
1. Убедитесь, что buckets созданы как публичные
2. Проверьте RLS политики для storage.objects

### Проблема: CORS ошибки
**Решение:**
1. Добавьте ваш домен в Supabase → Settings → API → CORS Origins
2. Для локальной разработки добавьте `http://localhost:5173`

## 📚 Дополнительные ресурсы

- [Документация Supabase](https://supabase.com/docs)
- [Руководство по RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Storage](https://supabase.com/docs/guides/storage)

## 🆘 Поддержка

Если у вас возникли проблемы с настройкой:
1. Создайте issue в вашем репозитории или опишите проблему в `docs/BACKLOG.md`
2. Создайте новый Issue с описанием проблемы
3. Приложите логи и скриншоты

---

**🎮 После успешной настройки ваш Quest Game готов к использованию!**