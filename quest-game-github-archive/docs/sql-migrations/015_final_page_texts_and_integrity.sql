-- final_page_texts (Congratulation / FinalPageTextsManager) + целостность answers/game_state

CREATE TABLE IF NOT EXISTS final_page_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_type TEXT NOT NULL CHECK (page_type IN ('simple', 'with_stats')),
  text_key TEXT NOT NULL,
  default_value TEXT NOT NULL,
  current_value TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_type, text_key)
);

ALTER TABLE final_page_texts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS final_page_texts_authenticated_all ON final_page_texts;
CREATE POLICY final_page_texts_authenticated_all ON final_page_texts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS final_page_texts_anon_select ON final_page_texts;
CREATE POLICY final_page_texts_anon_select ON final_page_texts
  FOR SELECT TO anon USING (true);

INSERT INTO final_page_texts (page_type, text_key, default_value, description) VALUES
  ('simple', 'main_title', 'Поздравляем!', 'Заголовок страницы'),
  ('simple', 'description', 'Вы успешно завершили квест! Все ваши ответы сохранены в системе.', 'Основной текст'),
  ('simple', 'quest_completed', 'Квест пройден!', 'Подзаголовок с иконкой'),
  ('simple', 'thank_you', 'Спасибо за участие в нашем интеллектуальном приключении!', 'Благодарность'),
  ('simple', 'game_code_label', 'Код игры:', 'Подпись кода игры'),
  ('with_stats', 'main_title', 'Поздравляем!', 'Заголовок страницы'),
  ('with_stats', 'description', 'Вы успешно завершили квест!', 'Основной текст'),
  ('with_stats', 'captain_label', 'Капитан:', 'Подпись капитана'),
  ('with_stats', 'points_label', 'очков', 'Подпись очков'),
  ('with_stats', 'game_code_label', 'Код игры:', 'Подпись кода игры')
ON CONFLICT (page_type, text_key) DO NOTHING;

-- Один ответ на вопрос от команды
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'answers_team_question_unique'
  ) THEN
    DELETE FROM answers a
    USING answers b
    WHERE a.id > b.id
      AND a.team_id = b.team_id
      AND a.question_number = b.question_number;

    ALTER TABLE answers
      ADD CONSTRAINT answers_team_question_unique UNIQUE (team_id, question_number);
  END IF;
END $$;

-- Одно состояние на игру
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_state_game_id_unique'
  ) THEN
    DELETE FROM game_state a
    USING game_state b
    WHERE a.id > b.id AND a.game_id = b.game_id;

    ALTER TABLE game_state
      ADD CONSTRAINT game_state_game_id_unique UNIQUE (game_id);
  END IF;
END $$;
