-- IMP-LOG-001: серверная проверка и подсчёт очков для авто-вопросов

CREATE OR REPLACE FUNCTION public.normalize_answer_text_array(p jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    array_agg(lower(trim(both from v)) ORDER BY ord)
    FILTER (WHERE trim(both from v) <> ''),
    ARRAY[]::text[]
  )
  FROM (
    SELECT elem AS v, ord
    FROM jsonb_array_elements_text(
      CASE
        WHEN p IS NULL THEN '[]'::jsonb
        WHEN jsonb_typeof(p) = 'array' AND jsonb_array_length(p) > 0
             AND jsonb_typeof(p -> 0) = 'array' THEN p -> 0
        WHEN jsonb_typeof(p) = 'array' THEN p
        ELSE jsonb_build_array(p)
      END
    ) WITH ORDINALITY AS t(elem, ord)
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.difficulty_factor(p_difficulty text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_difficulty, ''))
    WHEN 'легкий' THEN 0.85
    WHEN 'easy' THEN 0.85
    WHEN 'сложный' THEN 1.25
    WHEN 'hard' THEN 1.25
    ELSE 1
  END;
$$;

CREATE OR REPLACE FUNCTION public.calc_auto_question_score(
  p_scoring jsonb,
  p_base_points integer,
  p_difficulty text,
  p_time_spent integer,
  p_max_time integer,
  p_hints_used integer,
  p_hint_penalties jsonb,
  p_is_correct boolean,
  p_partial_multiplier numeric
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_partial numeric := coalesce(p_partial_multiplier, 0);
  v_p_base numeric;
  v_k_diff numeric;
  v_k_time numeric;
  v_k_fast numeric;
  v_safe_max numeric;
  v_time_left_ratio numeric;
  v_score numeric;
  v_i integer;
  v_penalty numeric;
BEGIN
  IF NOT coalesce(p_is_correct, false) OR v_partial <= 0 THEN
    RETURN 0;
  END IF;

  v_p_base := coalesce(nullif(p_base_points, 0), (p_scoring ->> 'p_base')::numeric, 100);
  v_k_diff := coalesce((p_scoring ->> 'k_diff')::numeric, 1) * public.difficulty_factor(p_difficulty);
  v_safe_max := greatest(1, coalesce(nullif(p_max_time, 0), 120));
  v_time_left_ratio := greatest(0, least(1, (v_safe_max - greatest(0, coalesce(p_time_spent, 0))) / v_safe_max));
  v_k_time := 1 + coalesce((p_scoring ->> 'k_time')::numeric, 0.5) * v_time_left_ratio;
  v_k_fast := CASE WHEN v_time_left_ratio >= 0.7 THEN coalesce((p_scoring ->> 'k_fast')::numeric, 1) ELSE 1 END;

  v_score := v_p_base * v_k_diff * v_k_time * v_k_fast;

  IF p_hint_penalties IS NOT NULL AND jsonb_typeof(p_hint_penalties) = 'array' THEN
    FOR v_i IN 0 .. least(greatest(0, coalesce(p_hints_used, 0)) - 1, jsonb_array_length(p_hint_penalties) - 1) LOOP
      v_penalty := coalesce((p_hint_penalties ->> v_i)::numeric, 0);
      v_score := v_score - v_penalty;
    END LOOP;
  END IF;

  v_score := round(v_score * v_partial);
  RETURN greatest(1, v_score::integer);
END;
$$;

CREATE OR REPLACE FUNCTION public.grade_auto_answer(
  p_answer_count integer,
  p_correct jsonb,
  p_user jsonb
)
RETURNS TABLE(is_correct boolean, partial_multiplier numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_correct text[];
  v_user text[];
  v_all_correct boolean;
  v_correct_count integer;
  v_total_correct integer;
BEGIN
  v_correct := public.normalize_answer_text_array(p_correct);
  v_user := public.normalize_answer_text_array(p_user);

  IF coalesce(p_answer_count, 1) = 1 THEN
    is_correct := array_length(v_correct, 1) IS NOT NULL
      AND coalesce(v_user[1], '') <> ''
      AND v_user[1] = ANY (v_correct);
    partial_multiplier := CASE WHEN is_correct THEN 1 ELSE 0 END;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT coalesce(bool_and(u = ANY (v_correct)), false)
  INTO v_all_correct
  FROM unnest(v_user) AS u;

  SELECT count(*)::integer
  INTO v_correct_count
  FROM unnest(v_user) AS u
  WHERE u = ANY (v_correct);

  v_total_correct := coalesce(array_length(v_correct, 1), 0);

  IF v_all_correct AND v_correct_count = v_total_correct AND v_total_correct > 0 THEN
    is_correct := true;
    partial_multiplier := 1;
  ELSIF v_correct_count > 0 AND v_all_correct THEN
    is_correct := true;
    partial_multiplier := 0.5;
  ELSIF v_correct_count > 0 THEN
    is_correct := true;
    partial_multiplier := 0.3;
  ELSE
    is_correct := false;
    partial_multiplier := 0;
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_auto_answer(
  p_game_id uuid,
  p_team_id uuid,
  p_question_number integer,
  p_answer jsonb,
  p_media_urls jsonb DEFAULT '[]'::jsonb,
  p_time_spent integer DEFAULT 0,
  p_hints_used integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team teams%ROWTYPE;
  v_question questions%ROWTYPE;
  v_game games%ROWTYPE;
  v_grade record;
  v_points integer;
  v_total integer;
  v_max_time integer;
  v_answer_id uuid;
BEGIN
  IF p_game_id IS NULL OR p_team_id IS NULL OR p_question_number IS NULL THEN
    RAISE EXCEPTION 'missing required fields';
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND OR v_team.game_id IS DISTINCT FROM p_game_id THEN
    RAISE EXCEPTION 'team does not belong to game';
  END IF;

  SELECT * INTO v_game FROM games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;

  SELECT * INTO v_question
  FROM questions
  WHERE game_id = p_game_id AND question_number = p_question_number
  ORDER BY id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  SELECT * INTO v_grade
  FROM public.grade_auto_answer(
    coalesce(v_question.answer_count, 1),
    v_question.answer,
    p_answer
  );

  v_max_time := coalesce(
    v_question.per_question_time_sec,
    v_game.per_question_time_sec,
    120
  );

  v_points := public.calc_auto_question_score(
    v_game.scoring,
    coalesce(v_question.points, 100),
    v_question.difficulty,
    greatest(0, coalesce(p_time_spent, 0)),
    v_max_time,
    greatest(0, coalesce(p_hints_used, 0)),
    coalesce(v_question.hint_penalties, '[]'::jsonb),
    v_grade.is_correct,
    v_grade.partial_multiplier
  );

  INSERT INTO answers (
    game_id,
    team_id,
    question_number,
    answer,
    media_urls,
    is_correct,
    points_earned,
    time_spent
  ) VALUES (
    p_game_id,
    p_team_id,
    p_question_number,
    p_answer,
    coalesce(p_media_urls, '[]'::jsonb),
    v_grade.is_correct,
    v_points,
    greatest(0, coalesce(p_time_spent, 0))
  )
  RETURNING id INTO v_answer_id;

  IF v_points > 0 THEN
    v_total := public.increment_team_score(p_team_id, v_points);
  ELSE
    SELECT coalesce(total_score, 0) INTO v_total FROM teams WHERE id = p_team_id;
  END IF;

  RETURN jsonb_build_object(
    'answer_id', v_answer_id,
    'is_correct', v_grade.is_correct,
    'points_earned', v_points,
    'team_total_score', coalesce(v_total, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer
) TO anon, authenticated, service_role;
