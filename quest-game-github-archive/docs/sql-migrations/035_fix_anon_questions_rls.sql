-- IMP-SEC-013: anon не читает questions/players напрямую (только view questions_player).
-- Миграция 021 вернула questions_anon_select USING(true) → утечка колонки answer.
-- PostgREST: REVOKE на таблицу блокирует /questions; view questions_player без answer — разрешён.

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

REVOKE ALL ON TABLE public.questions FROM anon;
REVOKE ALL ON TABLE public.players FROM anon;

DROP POLICY IF EXISTS "players_anon_select" ON players;

-- questions_anon_select оставляем: RLS для строк при чтении через view (без GRANT на таблицу — прямой REST закрыт).
