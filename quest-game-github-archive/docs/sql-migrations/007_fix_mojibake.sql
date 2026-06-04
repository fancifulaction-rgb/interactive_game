-- Исправление кракозябр после запуска 00_run_all.sql в неверной кодировке (Windows-1251 → UTF-8)
-- Выполнить в Supabase SQL Editor один раз

UPDATE settings SET value = 'Интерактивный Квест', description = 'Заголовок на главной', category = 'Квест'
WHERE key = 'quest_title' AND value LIKE '%Р%';

UPDATE settings SET value = 'Добро пожаловать в игру', description = 'Подзаголовок на главной', category = 'Квест'
WHERE key = 'quest_subtitle' AND value LIKE '%Р%';

UPDATE themes SET display_name = 'По умолчанию' WHERE name = 'default' AND display_name LIKE '%Р%';
UPDATE themes SET display_name = 'Новый год' WHERE name = 'new-year' AND display_name LIKE '%Р%';

UPDATE games SET title = 'Новая игра' WHERE title LIKE 'Р%' OR title LIKE '%Рќ%';

-- Восстановить демо-игру, если удалили при тестах (ON CONFLICT по code)
INSERT INTO games (
  id, code, title, password, settings, created_at, updated_at,
  mask_board, theme, total_time_sec, per_question_time_sec, scoring, finish_page_type
) VALUES (
  '34835359-82e0-4e1b-94cf-83c0deae6628',
  'QYA0E2',
  'Новая игра',
  NULL,
  '{}'::jsonb,
  '2025-11-26 12:07:28.82649+00',
  '2025-11-26 12:07:28.82649+00',
  false,
  'new-year',
  1800,
  120,
  '{"k_diff":1,"k_fast":1.2,"k_skip":0.8,"k_time":0.5,"p_base":100,"combo_bonus":10}'::jsonb,
  'scoreboard'
)
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title;
