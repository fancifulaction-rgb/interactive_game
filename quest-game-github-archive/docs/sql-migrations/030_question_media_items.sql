-- IMP-PRD-009: мульти-медиа в вопросах и подсказках (этап 1)

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS media_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS hints jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.questions.media_items IS
  'Упорядоченный список медиа вопроса (image/video/audio). Этап 2: layout, playback.';

COMMENT ON COLUMN public.questions.hints IS
  'Структурированные подсказки: text, penalty, media_items. Этап 2: layout, playback.';

CREATE OR REPLACE VIEW public.questions_player AS
SELECT
  id,
  game_id,
  question_number,
  order_index,
  question_text,
  question_type,
  type,
  options,
  answer_count,
  difficulty,
  points,
  hint_levels,
  hint_penalties,
  per_question_time_sec,
  media_url,
  media_items,
  hints
FROM questions
WHERE NOT coalesce(is_hidden, false);

GRANT SELECT ON public.questions_player TO anon, authenticated;
