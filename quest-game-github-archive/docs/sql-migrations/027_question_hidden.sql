-- IMP-ADM-004: скрытие вопросов без удаления

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.questions.is_hidden IS
  'Скрытый вопрос не попадает в заезд (questions_player, прогресс, submit_auto_answer).';

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
  media_url
FROM questions
WHERE NOT coalesce(is_hidden, false);

GRANT SELECT ON public.questions_player TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_team_progress(p_game_id uuid)
RETURNS TABLE (
  team_id uuid,
  answered_count integer,
  last_question_number integer,
  total_questions integer,
  is_finished boolean,
  finished_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT count(*)::integer AS total
    FROM questions
    WHERE game_id = p_game_id
      AND NOT coalesce(is_hidden, false)
  ),
  ans AS (
    SELECT
      a.team_id,
      count(DISTINCT a.question_number)::integer AS answered_count,
      max(a.question_number)::integer AS last_question_number
    FROM answers a
    WHERE a.game_id = p_game_id
      AND coalesce(a.grading_status, 'auto_accepted') IS DISTINCT FROM 'superseded'
    GROUP BY a.team_id
  )
  SELECT
    t.id AS team_id,
    coalesce(ans.answered_count, 0) AS answered_count,
    ans.last_question_number,
    q.total AS total_questions,
    public.team_quest_is_finished(t.finished_at, coalesce(ans.answered_count, 0), q.total) AS is_finished,
    t.finished_at
  FROM teams t
  CROSS JOIN q
  LEFT JOIN ans ON ans.team_id = t.id
  WHERE t.game_id = p_game_id
  ORDER BY t.registration_time ASC NULLS LAST, t.id;
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
  v_game games%ROWTYPE;
  v_question questions%ROWTYPE;
  v_grade record;
  v_grading_cfg jsonb;
  v_pending boolean;
  v_status text;
  v_points integer;
  v_total integer;
  v_max_time integer;
  v_meta jsonb;
  v_answer_id uuid;
  v_prior_count integer;
  v_prior_points integer;
  v_attempt integer;
  v_resubmit_pct numeric;
  v_resubmit_mult numeric;
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

  IF coalesce(v_question.is_hidden, false) THEN
    RAISE EXCEPTION 'question is hidden';
  END IF;

  v_grading_cfg := public.merge_question_answer_grading(
    coalesce(v_game.settings, '{}'::jsonb),
    v_question.grading_override
  );

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

    v_resubmit_pct := coalesce((v_grading_cfg -> 'resubmit' ->> 'penalty_percent')::numeric, 0);
    IF v_attempt > 1 AND v_resubmit_pct > 0 AND v_points > 0 THEN
      v_resubmit_mult := greatest(0, least(1, 1 - v_resubmit_pct / 100));
      v_points := greatest(0, round(v_points * v_resubmit_mult)::integer);
      v_meta := v_meta || jsonb_build_object(
        'resubmit_penalty_percent', v_resubmit_pct,
        'attempt', v_attempt
      );
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
    'match_tier', CASE WHEN v_pending THEN 'none' ELSE coalesce(v_grade.match_tier, 'none') END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_progress(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer, text
) TO anon, authenticated, service_role;
