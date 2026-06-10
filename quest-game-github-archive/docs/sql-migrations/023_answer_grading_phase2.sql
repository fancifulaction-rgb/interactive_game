-- IMP-LOG-022 фаза 2: grading_status, hybrid/manual routing, keywords, numeric, модерация

ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS grading_status text,
  ADD COLUMN IF NOT EXISTS match_tier text,
  ADD COLUMN IF NOT EXISTS grading_meta jsonb;

UPDATE public.answers
   SET grading_status = 'auto_accepted'
 WHERE grading_status IS NULL;

ALTER TABLE public.answers
  ALTER COLUMN grading_status SET DEFAULT 'auto_accepted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'answers_grading_status_check'
  ) THEN
    ALTER TABLE public.answers
      ADD CONSTRAINT answers_grading_status_check
      CHECK (grading_status IN (
        'auto_accepted', 'pending', 'rejected', 'accepted_manual'
      ));
  END IF;
END $$;

-- 022 → 023: новые колонки RETURNS TABLE — CREATE OR REPLACE недостаточно
DROP FUNCTION IF EXISTS public.grade_text_single_answer(text[], text[], jsonb);
DROP FUNCTION IF EXISTS public.grade_auto_answer(integer, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.get_scoreboard_answers(uuid);

CREATE OR REPLACE FUNCTION public.resolve_answer_grading(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_block jsonb;
  v_keywords jsonb;
  v_numeric jsonb;
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

  v_keywords := v_block -> 'keywords';
  IF v_keywords IS NULL OR v_keywords = 'null'::jsonb THEN
    v_keywords := jsonb_build_object('min_match', 1);
  ELSE
    v_keywords := jsonb_build_object(
      'min_match', greatest(1, coalesce((v_keywords ->> 'min_match')::integer, 1))
    );
  END IF;

  v_numeric := v_block -> 'numeric';
  IF v_numeric IS NULL OR v_numeric = 'null'::jsonb THEN
    v_numeric := jsonb_build_object(
      'tolerance_percent', 0,
      'allow_leading_zeros', false
    );
  ELSE
    v_numeric := jsonb_build_object(
      'tolerance_percent', greatest(0, coalesce((v_numeric ->> 'tolerance_percent')::numeric, 0)),
      'allow_leading_zeros', coalesce((v_numeric ->> 'allow_leading_zeros')::boolean, false)
    );
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
    'keywords', v_keywords,
    'numeric', v_numeric,
    'mcq', jsonb_build_object(
      'partial_credit', coalesce((v_block -> 'mcq' ->> 'partial_credit')::boolean, true)
    ),
    'routing', coalesce(nullif(v_block ->> 'routing', ''), 'auto'),
    'pending_display', 'zero_with_badge'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.extract_answer_number(p_text text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_m text[];
  v_s text;
BEGIN
  v_m := regexp_match(coalesce(p_text, ''), '[-+]?[0-9]+(?:[.,][0-9]+)?');
  IF v_m IS NULL OR v_m[1] IS NULL THEN
    RETURN NULL;
  END IF;
  v_s := replace(v_m[1], ',', '.');
  RETURN v_s::numeric;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.answer_has_text_content(
  p_answer jsonb,
  p_cfg jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.normalize_answer_text_array(p_answer, p_cfg)) AS t(tok)
    WHERE coalesce(tok, '') <> ''
  );
$$;

CREATE OR REPLACE FUNCTION public.answer_routing_pending(
  p_routing text,
  p_answer jsonb,
  p_media_urls jsonb,
  p_cfg jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_routing text := coalesce(nullif(p_routing, ''), 'auto');
  v_has_media boolean;
  v_has_text boolean;
BEGIN
  IF v_routing = 'manual' THEN
    RETURN true;
  END IF;

  IF v_routing <> 'hybrid' THEN
    RETURN false;
  END IF;

  v_has_media := coalesce(jsonb_array_length(coalesce(p_media_urls, '[]'::jsonb)), 0) > 0;
  v_has_text := public.answer_has_text_content(p_answer, p_cfg);
  RETURN v_has_media AND NOT v_has_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.grade_text_single_answer(
  p_correct text[],
  p_user text[],
  p_cfg jsonb
)
RETURNS TABLE(is_correct boolean, partial_multiplier numeric, match_tier text)
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
  v_mode text := coalesce(p_cfg ->> 'text_match', 'strict');
  v_min_match integer;
  v_hits integer;
  v_word text;
  v_user_num numeric;
  v_key_num numeric;
  v_tol numeric;
BEGIN
  IF v_user = '' OR coalesce(array_length(p_correct, 1), 0) = 0 THEN
    is_correct := false;
    partial_multiplier := 0;
    match_tier := 'none';
    RETURN NEXT;
    RETURN;
  END IF;

  FOREACH v_key IN ARRAY p_correct LOOP
    IF v_user = v_key THEN
      is_correct := true;
      partial_multiplier := 1;
      match_tier := 'exact';
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  IF v_mode = 'keywords' THEN
    v_user_words := regexp_split_to_array(v_user, '\s+');
    v_min_match := greatest(1, coalesce((p_cfg -> 'keywords' ->> 'min_match')::integer, 1));

    FOREACH v_key IN ARRAY p_correct LOOP
      v_key_words := regexp_split_to_array(v_key, '\s+');
      IF coalesce(array_length(v_key_words, 1), 0) = 0 THEN
        CONTINUE;
      END IF;

      v_hits := 0;
      FOREACH v_word IN ARRAY v_key_words LOOP
        IF v_word = ANY (v_user_words) THEN
          v_hits := v_hits + 1;
        END IF;
      END LOOP;

      IF v_hits >= least(v_min_match, coalesce(array_length(v_key_words, 1), 0)) THEN
        is_correct := true;
        partial_multiplier := 1;
        match_tier := 'exact';
        RETURN NEXT;
        RETURN;
      END IF;
    END LOOP;

    is_correct := false;
    partial_multiplier := 0;
    match_tier := 'none';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_mode = 'numeric' THEN
    v_tol := coalesce((p_cfg -> 'numeric' ->> 'tolerance_percent')::numeric, 0);
    v_user_num := public.extract_answer_number(v_user);

    IF v_user_num IS NULL THEN
      is_correct := false;
      partial_multiplier := 0;
      match_tier := 'none';
      RETURN NEXT;
      RETURN;
    END IF;

    FOREACH v_key IN ARRAY p_correct LOOP
      v_key_num := public.extract_answer_number(v_key);
      IF v_key_num IS NULL THEN
        CONTINUE;
      END IF;

      IF v_key_num = 0 THEN
        IF v_user_num = 0 THEN
          is_correct := true;
          partial_multiplier := 1;
          match_tier := 'exact';
          RETURN NEXT;
          RETURN;
        END IF;
      ELSIF abs(v_user_num - v_key_num) / abs(v_key_num) * 100 <= v_tol THEN
        is_correct := true;
        partial_multiplier := 1;
        match_tier := 'exact';
        RETURN NEXT;
        RETURN;
      END IF;
    END LOOP;

    is_correct := false;
    partial_multiplier := 0;
    match_tier := 'none';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_mode <> 'fuzzy' THEN
    is_correct := false;
    partial_multiplier := 0;
    match_tier := 'none';
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
      match_tier := 'fuzzy';
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  is_correct := false;
  partial_multiplier := 0;
  match_tier := 'none';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.grade_auto_answer(
  p_answer_count integer,
  p_correct jsonb,
  p_user jsonb,
  p_cfg jsonb DEFAULT NULL
)
RETURNS TABLE(is_correct boolean, partial_multiplier numeric, match_tier text)
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
      match_tier := 'exact';
    ELSE
      is_correct := false;
      partial_multiplier := 0;
      match_tier := 'none';
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_all_correct AND v_correct_count = v_total_correct AND v_total_correct > 0 THEN
    is_correct := true;
    partial_multiplier := 1;
    match_tier := 'exact';
  ELSIF v_correct_count > 0 AND v_all_correct THEN
    is_correct := true;
    partial_multiplier := 0.5;
    match_tier := 'partial_mcq';
  ELSIF v_correct_count > 0 THEN
    is_correct := true;
    partial_multiplier := 0.3;
    match_tier := 'partial_mcq';
  ELSE
    is_correct := false;
    partial_multiplier := 0;
    match_tier := 'none';
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
  v_pending boolean;
  v_status text;
  v_meta jsonb;
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

  v_pending := public.answer_routing_pending(
    v_grading_cfg ->> 'routing',
    p_answer,
    p_media_urls,
    v_grading_cfg
  );

  v_meta := jsonb_build_object(
    'hints_used', greatest(0, coalesce(p_hints_used, 0)),
    'time_spent', greatest(0, coalesce(p_time_spent, 0)),
    'routing', coalesce(v_grading_cfg ->> 'routing', 'auto'),
    'auto_preview', jsonb_build_object(
      'is_correct', v_grade.is_correct,
      'partial_multiplier', v_grade.partial_multiplier,
      'match_tier', v_grade.match_tier
    )
  );

  IF v_pending THEN
    v_status := 'pending';
    v_points := 0;
  ELSE
    v_status := 'auto_accepted';
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
  END IF;

  INSERT INTO answers (
    game_id,
    team_id,
    question_number,
    answer,
    media_urls,
    is_correct,
    points_earned,
    time_spent,
    grading_status,
    match_tier,
    grading_meta
  ) VALUES (
    p_game_id,
    p_team_id,
    p_question_number,
    p_answer,
    coalesce(p_media_urls, '[]'::jsonb),
    CASE WHEN v_pending THEN false ELSE v_grade.is_correct END,
    v_points,
    greatest(0, coalesce(p_time_spent, 0)),
    v_status,
    CASE WHEN v_pending THEN 'none' ELSE coalesce(v_grade.match_tier, 'none') END,
    v_meta
  )
  RETURNING id INTO v_answer_id;

  IF v_points > 0 THEN
    v_total := public.increment_team_score(p_team_id, v_points);
  ELSE
    SELECT coalesce(total_score, 0) INTO v_total FROM teams WHERE id = p_team_id;
  END IF;

  RETURN jsonb_build_object(
    'answer_id', v_answer_id,
    'is_correct', CASE WHEN v_pending THEN false ELSE v_grade.is_correct END,
    'points_earned', v_points,
    'team_total_score', coalesce(v_total, 0),
    'grading_status', v_status,
    'match_tier', CASE WHEN v_pending THEN 'none' ELSE coalesce(v_grade.match_tier, 'none') END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_scoreboard_answers(p_game_id uuid)
RETURNS TABLE (
  team_id uuid,
  question_number integer,
  is_correct boolean,
  points_earned integer,
  time_spent integer,
  answer jsonb,
  grading_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    a.team_id,
    a.question_number,
    coalesce(a.is_correct, false),
    coalesce(a.points_earned, 0),
    coalesce(a.time_spent, 0),
    a.answer,
    coalesce(a.grading_status, 'auto_accepted')
  FROM answers a
  WHERE a.game_id = p_game_id;
$$;

CREATE OR REPLACE FUNCTION public.get_teams_pending_review(p_game_id uuid)
RETURNS TABLE (
  team_id uuid,
  pending_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT a.team_id, count(*)::bigint
  FROM answers a
  WHERE a.game_id = p_game_id
    AND a.grading_status = 'pending'
  GROUP BY a.team_id;
$$;

CREATE OR REPLACE FUNCTION public.list_pending_answers(p_game_id uuid)
RETURNS TABLE (
  answer_id uuid,
  team_id uuid,
  team_name text,
  question_number integer,
  answer jsonb,
  media_urls jsonb,
  created_at timestamptz,
  grading_meta jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    a.id,
    a.team_id,
    coalesce(t.team_name, t.name, ''),
    a.question_number,
    a.answer,
    coalesce(a.media_urls, '[]'::jsonb),
    a.created_at,
    coalesce(a.grading_meta, '{}'::jsonb)
  FROM answers a
  JOIN teams t ON t.id = a.team_id
  WHERE a.game_id = p_game_id
    AND a.grading_status = 'pending'
  ORDER BY a.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.moderate_answer(
  p_answer_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_answer answers%ROWTYPE;
  v_question questions%ROWTYPE;
  v_game games%ROWTYPE;
  v_grade record;
  v_points integer;
  v_total integer;
  v_max_time integer;
  v_grading_cfg jsonb;
  v_hints integer;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_media_only boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_action NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  SELECT * INTO v_answer
  FROM answers
  WHERE id = p_answer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'answer not found';
  END IF;

  IF v_answer.grading_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'answer is not pending';
  END IF;

  IF v_action = 'reject' THEN
    UPDATE answers
       SET grading_status = 'rejected',
           match_tier = 'none',
           is_correct = false,
           points_earned = 0
     WHERE id = p_answer_id;

    RETURN jsonb_build_object(
      'success', true,
      'answer_id', p_answer_id,
      'grading_status', 'rejected',
      'points_earned', 0
    );
  END IF;

  SELECT * INTO v_game FROM games WHERE id = v_answer.game_id;
  SELECT * INTO v_question
  FROM questions
  WHERE game_id = v_answer.game_id
    AND question_number = v_answer.question_number
  ORDER BY id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  v_grading_cfg := public.resolve_answer_grading(coalesce(v_game.settings, '{}'::jsonb));
  v_hints := greatest(0, coalesce((v_answer.grading_meta ->> 'hints_used')::integer, 0));

  SELECT * INTO v_grade
  FROM public.grade_auto_answer(
    coalesce(v_question.answer_count, 1),
    v_question.answer,
    v_answer.answer,
    v_grading_cfg
  );

  v_media_only := coalesce(jsonb_array_length(coalesce(v_answer.media_urls, '[]'::jsonb)), 0) > 0
    AND NOT public.answer_has_text_content(v_answer.answer, v_grading_cfg);

  IF v_media_only AND NOT v_grade.is_correct THEN
    v_grade.is_correct := true;
    v_grade.partial_multiplier := 1;
    v_grade.match_tier := 'none';
  END IF;

  v_max_time := coalesce(
    v_question.per_question_time_sec,
    v_game.per_question_time_sec,
    120
  );

  v_points := public.calc_auto_question_score(
    v_game.scoring,
    coalesce(v_question.points, 100),
    v_question.difficulty,
    greatest(0, coalesce(v_answer.time_spent, 0)),
    v_max_time,
    v_hints,
    coalesce(v_question.hint_penalties, '[]'::jsonb),
    v_grade.is_correct,
    v_grade.partial_multiplier
  );

  UPDATE answers
     SET grading_status = 'accepted_manual',
         is_correct = v_grade.is_correct,
         points_earned = v_points,
         match_tier = coalesce(v_grade.match_tier, 'none')
   WHERE id = p_answer_id;

  IF v_points > 0 THEN
    v_total := public.increment_team_score(v_answer.team_id, v_points);
  ELSE
    SELECT coalesce(total_score, 0) INTO v_total FROM teams WHERE id = v_answer.team_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'answer_id', p_answer_id,
    'grading_status', 'accepted_manual',
    'is_correct', v_grade.is_correct,
    'points_earned', v_points,
    'team_total_score', coalesce(v_total, 0),
    'match_tier', coalesce(v_grade.match_tier, 'none')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.extract_answer_number(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.answer_has_text_content(jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.answer_routing_pending(text, jsonb, jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teams_pending_review(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_answers(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.moderate_answer(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer, text
) TO anon, authenticated, service_role;
