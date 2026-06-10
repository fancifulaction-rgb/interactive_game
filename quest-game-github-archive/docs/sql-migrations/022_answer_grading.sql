-- IMP-LOG-022 фаза 1: answer_grading в games.settings — normalize, fuzzy, MCQ partial flag

CREATE OR REPLACE FUNCTION public.resolve_answer_grading(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_block jsonb;
  v_baseline jsonb := jsonb_build_object(
    'version', 1,
    'normalize', jsonb_build_object(
      'ignore_case', true,
      'collapse_whitespace', true,
      'ignore_punctuation', false,
      'yo_to_e', false,
      'translit', false
    ),
    'text_match', 'strict',
    'fuzzy', jsonb_build_object(
      'short_word_max_len', 8,
      'max_distance_short', 1,
      'penalty_percent', 15
    ),
    'mcq', jsonb_build_object('partial_credit', true),
    'routing', 'auto',
    'pending_display', 'zero_with_badge'
  );
BEGIN
  v_block := coalesce(p_settings, '{}'::jsonb) -> 'answer_grading';
  IF v_block IS NULL OR v_block = 'null'::jsonb THEN
    RETURN v_baseline;
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'normalize', jsonb_build_object(
      'ignore_case', coalesce((v_block -> 'normalize' ->> 'ignore_case')::boolean, true),
      'collapse_whitespace', coalesce((v_block -> 'normalize' ->> 'collapse_whitespace')::boolean, true),
      'ignore_punctuation', coalesce((v_block -> 'normalize' ->> 'ignore_punctuation')::boolean, false),
      'yo_to_e', coalesce((v_block -> 'normalize' ->> 'yo_to_e')::boolean, false),
      'translit', coalesce((v_block -> 'normalize' ->> 'translit')::boolean, false)
    ),
    'text_match', coalesce(nullif(v_block ->> 'text_match', ''), 'strict'),
    'fuzzy', jsonb_build_object(
      'short_word_max_len', greatest(1, coalesce((v_block -> 'fuzzy' ->> 'short_word_max_len')::integer, 8)),
      'max_distance_short', greatest(0, coalesce((v_block -> 'fuzzy' ->> 'max_distance_short')::integer, 1)),
      'penalty_percent', greatest(0, least(100, coalesce((v_block -> 'fuzzy' ->> 'penalty_percent')::numeric, 15)))
    ),
    'mcq', jsonb_build_object(
      'partial_credit', coalesce((v_block -> 'mcq' ->> 'partial_credit')::boolean, true)
    ),
    'routing', coalesce(nullif(v_block ->> 'routing', ''), 'auto'),
    'pending_display', 'zero_with_badge'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.answer_levenshtein(p_a text, p_b text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_len_a integer := char_length(p_a);
  v_len_b integer := char_length(p_b);
  v_i integer;
  v_j integer;
  v_cost integer;
  v_prev integer[];
  v_curr integer[];
BEGIN
  IF v_len_a = 0 THEN RETURN v_len_b; END IF;
  IF v_len_b = 0 THEN RETURN v_len_a; END IF;

  v_prev := array_fill(0, ARRAY[v_len_b + 1]);
  v_curr := array_fill(0, ARRAY[v_len_b + 1]);

  FOR v_j IN 0..v_len_b LOOP
    v_prev[v_j + 1] := v_j;
  END LOOP;

  FOR v_i IN 1..v_len_a LOOP
    v_curr[1] := v_i;
    FOR v_j IN 1..v_len_b LOOP
      IF substr(p_a, v_i, 1) = substr(p_b, v_j, 1) THEN
        v_cost := 0;
      ELSE
        v_cost := 1;
      END IF;
      v_curr[v_j + 1] := least(
        v_curr[v_j] + 1,
        v_prev[v_j + 1] + 1,
        v_prev[v_j] + v_cost
      );
    END LOOP;
    v_prev := v_curr;
  END LOOP;

  RETURN v_prev[v_len_b + 1];
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_answer_token(p_text text, p_cfg jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := coalesce(p_text, '');
  v_norm jsonb := coalesce(p_cfg -> 'normalize', '{}'::jsonb);
BEGIN
  v := trim(both from v);
  IF coalesce((v_norm ->> 'collapse_whitespace')::boolean, true) THEN
    v := regexp_replace(v, '\s+', ' ', 'g');
  END IF;
  IF coalesce((v_norm ->> 'ignore_case')::boolean, true) THEN
    v := lower(v);
  END IF;
  IF coalesce((v_norm ->> 'ignore_punctuation')::boolean, false) THEN
    v := regexp_replace(v, '[^a-zа-яё0-9\s]', '', 'g');
    v := regexp_replace(v, '\s+', ' ', 'g');
    v := trim(both from v);
  END IF;
  IF coalesce((v_norm ->> 'yo_to_e')::boolean, false) THEN
    v := replace(replace(v, 'ё', 'е'), 'Ё', 'Е');
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_answer_text_array(p jsonb, p_cfg jsonb DEFAULT NULL)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    array_agg(public.normalize_answer_token(v, coalesce(p_cfg, public.resolve_answer_grading('{}'::jsonb))) ORDER BY ord)
    FILTER (WHERE public.normalize_answer_token(v, coalesce(p_cfg, public.resolve_answer_grading('{}'::jsonb))) <> ''),
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

CREATE OR REPLACE FUNCTION public.answer_words_match(p_expected text, p_actual text, p_cfg jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_fuzzy jsonb := coalesce(p_cfg -> 'fuzzy', '{}'::jsonb);
  v_max_len integer := coalesce((v_fuzzy ->> 'short_word_max_len')::integer, 8);
  v_max_dist integer := coalesce((v_fuzzy ->> 'max_distance_short')::integer, 1);
  v_len_e integer := char_length(p_expected);
  v_len_a integer := char_length(p_actual);
BEGIN
  IF p_expected = p_actual THEN
    RETURN true;
  END IF;
  IF v_len_e > v_max_len OR v_len_a > v_max_len THEN
    RETURN false;
  END IF;
  RETURN public.answer_levenshtein(p_expected, p_actual) <= v_max_dist;
END;
$$;

CREATE OR REPLACE FUNCTION public.grade_text_single_answer(
  p_correct text[],
  p_user text[],
  p_cfg jsonb
)
RETURNS TABLE(is_correct boolean, partial_multiplier numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_user text := coalesce(p_user[1], '');
  v_key text;
  v_key_words text[];
  v_user_words text[];
  v_i integer;
  v_penalty numeric;
  v_all_match boolean;
BEGIN
  IF v_user = '' OR coalesce(array_length(p_correct, 1), 0) = 0 THEN
    is_correct := false;
    partial_multiplier := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  FOREACH v_key IN ARRAY p_correct LOOP
    IF v_user = v_key THEN
      is_correct := true;
      partial_multiplier := 1;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  IF coalesce(p_cfg ->> 'text_match', 'strict') <> 'fuzzy' THEN
    is_correct := false;
    partial_multiplier := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_user_words := regexp_split_to_array(v_user, '\s+');

  FOREACH v_key IN ARRAY p_correct LOOP
    v_key_words := regexp_split_to_array(v_key, '\s+');
    IF coalesce(array_length(v_key_words, 1), 0) <> coalesce(array_length(v_user_words, 1), 0) THEN
      CONTINUE;
    END IF;

    v_all_match := true;
    FOR v_i IN 1..coalesce(array_length(v_key_words, 1), 0) LOOP
      IF NOT public.answer_words_match(v_key_words[v_i], v_user_words[v_i], p_cfg) THEN
        v_all_match := false;
        EXIT;
      END IF;
    END LOOP;

    IF v_all_match THEN
      v_penalty := coalesce((p_cfg -> 'fuzzy' ->> 'penalty_percent')::numeric, 15);
      is_correct := true;
      partial_multiplier := greatest(0, least(1, 1 - v_penalty / 100));
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  is_correct := false;
  partial_multiplier := 0;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.grade_auto_answer(
  p_answer_count integer,
  p_correct jsonb,
  p_user jsonb,
  p_cfg jsonb DEFAULT NULL
)
RETURNS TABLE(is_correct boolean, partial_multiplier numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cfg jsonb := coalesce(p_cfg, public.resolve_answer_grading('{}'::jsonb));
  v_correct text[];
  v_user text[];
  v_all_correct boolean;
  v_correct_count integer;
  v_total_correct integer;
  v_partial_credit boolean := coalesce((v_cfg -> 'mcq' ->> 'partial_credit')::boolean, true);
BEGIN
  v_correct := public.normalize_answer_text_array(p_correct, v_cfg);
  v_user := public.normalize_answer_text_array(p_user, v_cfg);

  IF coalesce(p_answer_count, 1) = 1 THEN
    RETURN QUERY
    SELECT * FROM public.grade_text_single_answer(v_correct, v_user, v_cfg);
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

  IF NOT v_partial_credit THEN
    IF v_all_correct AND v_correct_count = v_total_correct AND v_total_correct > 0 THEN
      is_correct := true;
      partial_multiplier := 1;
    ELSE
      is_correct := false;
      partial_multiplier := 0;
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

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
  p_hints_used integer DEFAULT 0,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
  v_grading_cfg jsonb;
BEGIN
  IF p_game_id IS NULL OR p_team_id IS NULL OR p_question_number IS NULL THEN
    RAISE EXCEPTION 'missing required fields';
  END IF;

  IF coalesce(trim(p_session_token), '') = ''
     OR NOT public.verify_team_session(p_team_id, p_game_id, p_session_token) THEN
    RAISE EXCEPTION 'invalid team session';
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

  v_grading_cfg := public.resolve_answer_grading(coalesce(v_game.settings, '{}'::jsonb));

  SELECT * INTO v_grade
  FROM public.grade_auto_answer(
    coalesce(v_question.answer_count, 1),
    v_question.answer,
    p_answer,
    v_grading_cfg
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

GRANT EXECUTE ON FUNCTION public.resolve_answer_grading(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer, text
) TO anon, authenticated, service_role;
