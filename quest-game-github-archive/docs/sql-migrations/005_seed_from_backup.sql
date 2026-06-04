-- Начальные данные из бэкапа db_cluster-09-12-2025 (public schema)
-- Выполнять после 004

INSERT INTO themes (name, display_name, colors, effects) VALUES
  ('default', 'По умолчанию', '{"primary":"#8b5cf6","secondary":"#ec4899","background":"#f3f4f6"}'::jsonb, '{}'::jsonb),
  ('new-year', 'Новый год', '{"primary":"#dc2626","secondary":"#16a34a","background":"#1e293b"}'::jsonb, '{"snow":true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (key, value, description, category) VALUES
  ('quest_title', 'Интерактивный Квест', 'Заголовок на главной', 'Квест'),
  ('quest_subtitle', 'Добро пожаловать в игру', 'Подзаголовок на главной', 'Квест'),
  ('quest_logo_url', '', 'URL логотипа', 'Квест')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

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
ON CONFLICT (code) DO NOTHING;
