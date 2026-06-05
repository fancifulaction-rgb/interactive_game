-- Справочные данные: темы и дефолтные настройки главной (без демо-игры).
-- Выполнять после 004. Игры создаются только через AdminPanel / API.

INSERT INTO themes (name, display_name, colors, effects) VALUES
  ('default', 'По умолчанию', '{"primary":"#8b5cf6","secondary":"#ec4899","background":"#f3f4f6"}'::jsonb, '{}'::jsonb),
  ('new-year', 'Новый год', '{"primary":"#dc2626","secondary":"#16a34a","background":"#1e293b"}'::jsonb, '{"snow":true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (key, value, description, category) VALUES
  ('quest_title', 'Интерактивный Квест', 'Заголовок на главной', 'Квест'),
  ('quest_subtitle', 'Добро пожаловать в игру', 'Подзаголовок на главной', 'Квест'),
  ('quest_logo_url', '', 'URL логотипа', 'Квест')
ON CONFLICT (key) DO NOTHING;
