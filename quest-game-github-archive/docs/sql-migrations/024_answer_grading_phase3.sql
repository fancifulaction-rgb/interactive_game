-- IMP-LOG-022 фаза 3: resubmit penalty, post-hoc accept, superseded attempts

ALTER TABLE public.answers DROP CONSTRAINT IF EXISTS answers_grading_status_check;

ALTER TABLE public.answers
  ADD CONSTRAINT answers_grading_status_check
  CHECK (grading_status IN (
    'auto_accepted', 'pending', 'rejected', 'accepted_manual', 'superseded'
  ));

CREATE OR REPLACE FUNCTION public.adjust_team_score(p_team_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_total integer;
BEGIN
  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'team_id required';
  END IF;

  IF p_delta = 0 THEN
    SELECT coalesce(total_score, 0) INTO v_total FROM teams WHERE id = p_team_id;
    RETURN coalesce(v_total, 0);
  END IF;

  UPDATE teams
     SET total_score = greatest(0, coalesce(total_score, 0) + p_delta)
   WHERE id = p_team_id
   RETURNING total_score INTO v_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team not found';
  END IF;

  RETURN coalesce(v_total, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_answer_grading(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_block jsonb;
  v_keywords jsonb;
  v_numeric jsonb;
  v_resubmit jsonb;
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
    'pending_display', 'zero_with_badge',
    'resubmit', jsonb_build_object('penalty_percent', 0)
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

  v_resubmit := v_block -> 'resubmit';
  IF v_resubmit IS NULL OR v_resubmit = 'null'::jsonb THEN
    v_resubmit := jsonb_build_object('penalty_percent', 0);
  ELSE
    v_resubmit := jsonb_build_object(
      'penalty_percent', greatest(0, least(100, coalesce((v_resubmit ->> 'penalty_percent')::numeric, 0)))
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
    'pending_display', 'zero_with_badge',
    'resubmit', v_resubmit
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_scoreboard_answers(uuid);

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
  SELECT DISTINCT ON (a.team_id, a.question_number)
    a.team_id,
    a.question_number,
    coalesce(a.is_correct, false),
    coalesce(a.points_earned, 0),
    coalesce(a.time_spent, 0),
    a.answer,
    coalesce(a.grading_status, 'auto_accepted')
  FROM answers a
  WHERE a.game_id = p_game_id
    AND coalesce(a.grading_status, 'auto_accepted') IS DISTINCT FROM 'superseded'
  ORDER BY a.team_id, a.question_number, a.created_at DESC;
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
  v_prior_count integer;
  v_prior_points integer;
  v_penalty numeric;
  v_attempt integer;
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

  SELECT count(*)::integer, coalesce(sum(coalesce(points_earned, 0)), 0)::integer
    INTO v_prior_count, v_prior_points
  FROM answers
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND question_number = p_question_number
    AND coalesce(grading_status, 'auto_accepted') IS DISTINCT FROM 'superseded';

  v_attempt := v_prior_count + 1;

  IF v_prior_count > 0 THEN
    UPDATE answers
       SET grading_status = 'superseded',
           grading_meta = coalesce(grading_meta, '{}'::jsonb)
             || jsonb_build_object('superseded_at', now())
     WHERE game_id = p_game_id
       AND team_id = p_team_id
       AND question_number = p_question_number
       AND coalesce(grading_status, 'auto_accepted') IS DISTINCT FROM 'superseded';

    IF v_prior_points > 0 THEN
      v_total := public.adjust_team_score(p_team_id, -v_prior_points);
    END IF;
  END IF;

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
    'attempt', v_attempt,
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

    IF v_attempt > 1 AND v_points > 0 THEN
      v_penalty := coalesce((v_grading_cfg -> 'resubmit' ->> 'penalty_percent')::numeric, 0);
      IF v_penalty > 0 THEN
        v_points := greatest(
          0,
          floor(v_points * (1 - greatest(0, least(100, v_penalty)) / 100))::integer
        );
        v_meta := v_meta || jsonb_build_object(
          'resubmit_penalty_percent', v_penalty,
          'resubmit_attempt', v_attempt
        );
      END IF;
    END IF;
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
    'match_tier', CASE WHEN v_pending THEN 'none' ELSE coalesce(v_grade.match_tier, 'none') END,
    'attempt', v_attempt
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_posthoc_answers(p_game_id uuid)
RETURNS TABLE (
  answer_id uuid,
  team_id uuid,
  team_name text,
  question_number integer,
  answer jsonb,
  media_urls jsonb,
  created_at timestamptz,
  grading_status text,
  grading_meta jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT DISTINCT ON (a.team_id, a.question_number)
    a.id,
    a.team_id,
    coalesce(t.team_name, t.name, ''),
    a.question_number,
    a.answer,
    coalesce(a.media_urls, '[]'::jsonb),
    a.created_at,
    coalesce(a.grading_status, 'auto_accepted'),
    coalesce(a.grading_meta, '{}'::jsonb)
  FROM answers a
  JOIN teams t ON t.id = a.team_id
  WHERE a.game_id = p_game_id
    AND coalesce(a.grading_status, 'auto_accepted') IN ('auto_accepted', 'rejected')
    AND coalesce(a.is_correct, false) = false
    AND coalesce(a.points_earned, 0) = 0
  ORDER BY a.team_id, a.question_number, a.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.posthoc_accept_answer(p_answer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_answer answers%ROWTYPE;
  v_question questions%ROWTYPE;
  v_game games%ROWTYPE;
  v_points integer;
  v_total integer;
  v_max_time integer;
  v_hints integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_answer
  FROM answers
  WHERE id = p_answer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'answer not found';
  END IF;

  IF coalesce(v_answer.grading_status, 'auto_accepted') NOT IN ('auto_accepted', 'rejected') THEN
    RAISE EXCEPTION 'answer not eligible for post-hoc accept';
  END IF;

  IF coalesce(v_answer.is_correct, false) = true OR coalesce(v_answer.points_earned, 0) > 0 THEN
    RAISE EXCEPTION 'answer already scored';
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

  v_hints := greatest(0, coalesce((v_answer.grading_meta ->> 'hints_used')::integer, 0));
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
    true,
    1
  );

  UPDATE answers
     SET grading_status = 'accepted_manual',
         is_correct = true,
         points_earned = v_points,
         match_tier = 'none',
         grading_meta = coalesce(grading_meta, '{}'::jsonb)
           || jsonb_build_object('posthoc_accept', true, 'posthoc_at', now())
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
    'is_correct', true,
    'points_earned', v_points,
    'team_total_score', coalesce(v_total, 0),
    'match_tier', 'none'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_team_score(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_posthoc_answers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.posthoc_accept_answer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer, text
) TO anon, authenticated, service_role;
