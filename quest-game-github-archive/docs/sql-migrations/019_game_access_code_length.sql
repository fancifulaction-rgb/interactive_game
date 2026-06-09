-- Длина автогенерации кодов игры (QA-B04)
INSERT INTO settings (key, value, description, category) VALUES
(
  'game_access_code_length',
  '6',
  'Длина автоматически создаваемых кодов игры (3–10 символов)',
  'Общие'
)
ON CONFLICT (key) DO NOTHING;
