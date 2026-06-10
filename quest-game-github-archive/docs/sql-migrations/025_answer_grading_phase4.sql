-- IMP-LOG-022 фаза 4: regex, jury, per-question grading_override

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS grading_override jsonb;

ALTER TABLE public.answers DROP CONSTRAINT IF EXISTS answers_grading_status_check;

ALTER TABLE public.answers
  ADD CONSTRAINT answers_grading_status_check
  CHECK (grading_status IN (
    'auto_accepted', 'pending', 'rejected', 'accepted_manual', 'superseded', 'jury_pending'
  ));

CREATE OR REPLACE FUNCTION public.resolve_answer_grading(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_block jsonb;
  v_keywords jsonb;
  v_numeric jsonb;
  v_regex jsonb;
  v_jury jsonb;
  v_resubmit jsonb;
  v_result jsonb;
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
    'jury', jsonb_build_object('enabled', false, 'required_votes', 2)
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

  v_regex := v_block -> 'regex';
  IF v_regex IS NULL OR v_regex = 'null'::jsonb
     OR nullif(trim(v_regex ->> 'pattern'), '') IS NULL THEN
    v_regex := NULL;
  ELSE
    v_regex := jsonb_build_object(
      'pattern', v_regex ->> 'pattern',
      'flags', coalesce(v_regex ->> 'flags', '')
    );
  END IF;

  v_jury := v_block -> 'jury';
  IF v_jury IS NULL OR v_jury = 'null'::jsonb THEN
    v_jury := jsonb_build_object('enabled', false, 'required_votes', 2);
  ELSE
    v_jury := jsonb_build_object(
      'enabled', coalesce((v_jury ->> 'enabled')::boolean, false),
      'required_votes', greatest(1, coalesce((v_jury ->> 'required_votes')::integer, 2))
    );
  END IF;

  v_resubmit := v_block -> 'resubmit';
  IF v_resubmit IS NULL OR v_resubmit = 'null'::jsonb
     OR coalesce((v_resubmit ->> 'penalty_percent')::numeric, 0) <= 0 THEN
    v_resubmit := NULL;
  ELSE
    v_resubmit := jsonb_build_object(
      'penalty_percent', greatest(0, least(100, coalesce((v_resubmit ->> 'penalty_percent')::numeric, 0)))
    );
  END IF;

  v_result := jsonb_build_object(
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
    'jury', v_jury
  );

  IF v_regex IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('regex', v_regex);
  END IF;

  IF v_resubmit IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('resubmit', v_resubmit);
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_question_answer_grading(
  p_game_settings jsonb,
  p_question_override jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base jsonb;
  v_ov jsonb;
  v_result jsonb;
  v_resubmit jsonb;
BEGIN
  v_base := public.resolve_answer_grading(coalesce(p_game_settings, '{}'::jsonb));
  v_ov := p_question_override;

  IF v_ov IS NULL OR v_ov = 'null'::jsonb OR v_ov = '{}'::jsonb THEN
    RETURN v_base;
  END IF;

  v_result := v_base;

  IF v_ov ? 'normalize' AND v_ov -> 'normalize' IS NOT NULL AND v_ov -> 'normalize' <> 'null'::jsonb THEN
    v_result := jsonb_set(
      v_result,
      '{normalize}',
      (v_result -> 'normalize') || coalesce(v_ov -> 'normalize', '{}'::jsonb),
      true
    );
  END IF;

  IF nullif(v_ov ->> 'text_match', '') IS NOT NULL THEN
    v_result := jsonb_set(v_result, '{text_match}', to_jsonb(v_ov ->> 'text_match'), true);
  END IF;

  IF v_ov ? 'fuzzy' AND v_ov -> 'fuzzy' IS NOT NULL AND v_ov -> 'fuzzy' <> 'null'::jsonb THEN
    v_result := jsonb_set(
      v_result,
      '{fuzzy}',
      (v_result -> 'fuzzy') || coalesce(v_ov -> 'fuzzy', '{}'::jsonb),
      true
    );
  END IF;

  IF v_ov ? 'keywords' AND v_ov -> 'keywords' IS NOT NULL AND v_ov -> 'keywords' <> 'null'::jsonb THEN
    v_result := jsonb_set(
      v_result,
      '{keywords}',
      (v_result -> 'keywords') || coalesce(v_ov -> 'keywords', '{}'::jsonb),
      true
    );
  END IF;

  IF v_ov ? 'numeric' AND v_ov -> 'numeric' IS NOT NULL AND v_ov -> 'numeric' <> 'null'::jsonb THEN
    v_result := jsonb_set(
      v_result,
      '{numeric}',
      (v_result -> 'numeric') || coalesce(v_ov -> 'numeric', '{}'::jsonb),
      true
    );
  END IF;

  IF v_ov ? 'regex' THEN
    IF v_ov -> 'regex' IS NULL OR v_ov -> 'regex' = 'null'::jsonb
       OR nullif(trim(v_ov -> 'regex' ->> 'pattern'), '') IS NULL THEN
      v_result := v_result - 'regex';
    ELSE
      v_result := jsonb_set(
        v_result,
        '{regex}',
        jsonb_build_object(
          'pattern', v_ov -> 'regex' ->> 'pattern',
          'flags', coalesce(v_ov -> 'regex' ->> 'flags', '')
        ),
        true
      );
    END IF;
  END IF;

  IF nullif(v_ov ->> 'routing', '') IS NOT NULL THEN
    v_result := jsonb_set(v_result, '{routing}', to_jsonb(v_ov ->> 'routing'), true);
  END IF;

  v_resubmit := v_ov -> 'resubmit';
  IF v_ov ? 'resubmit' THEN
    IF v_resubmit IS NULL OR v_resubmit = 'null'::jsonb
       OR coalesce((v_resubmit ->> 'penalty_percent')::numeric, 0) <= 0 THEN
      v_result := v_result - 'resubmit';
    ELSE
      v_result := jsonb_set(
        v_result,
        '{resubmit}',
        jsonb_build_object(
          'penalty_percent', greatest(0, least(100, coalesce((v_resubmit ->> 'penalty_percent')::numeric, 0)))
        ),
        true
      );
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.grade_text_single_answer(text[], text[], jsonb);

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
  v_pattern text;
  v_flags text;
  v_matched boolean;
BEGIN
  IF v_user = '' THEN
    is_correct := false;
    partial_multiplier := 0;
    match_tier := 'none';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_mode = 'regex' THEN
    v_pattern := coalesce(p_cfg -> 'regex' ->> 'pattern', '');
    IF v_pattern = '' THEN
      is_correct := false;
      partial_multiplier := 0;
      match_tier := 'none';
      RETURN NEXT;
      RETURN;
    END IF;

    v_flags := coalesce(p_cfg -> 'regex' ->> 'flags', '');
    BEGIN
      IF position('i' in v_flags) > 0 THEN
        v_matched := v_user ~* v_pattern;
      ELSE
        v_matched := v_user ~ v_pattern;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_matched := false;
    END;

    IF v_matched THEN
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

  IF coalesce(array_length(p_correct, 1), 0) = 0 THEN
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
      IF NOT public.answer_words_match(
        v_key_words[v_i],
        v_user_words[v_i],
        p_cfg
      ) THEN
        v_all_match := false;
        EXIT;
      END IF;
    END LOOP;

    IF v_all_match THEN
      v_penalty := greatest(0, least(100, coalesce((p_cfg -> 'fuzzy' ->> 'penalty_percent')::numeric, 15)));
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

DROP FUNCTION IF EXISTS public.list_pending_answers(uuid);

CREATE OR REPLACE FUNCTION public.list_pending_answers(p_game_id uuid)
RETURNS TABLE (
  answer_id uuid,
  team_id uuid,
  team_name text,
  question_number integer,
  answer jsonb,
  media_urls jsonb,
  created_at timestamptz,
  grading_meta jsonb,
  grading_status text
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
    coalesce(a.grading_meta, '{}'::jsonb),
    a.grading_status
  FROM answers a
  JOIN teams t ON t.id = a.team_id
  WHERE a.game_id = p_game_id
    AND a.grading_status IN ('pending', 'jury_pending')
  ORDER BY a.created_at ASC;
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
    AND a.grading_status IN ('pending', 'jury_pending')
  GROUP BY a.team_id;
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
  v_jury jsonb;
  v_jury_enabled boolean;
  v_required_votes integer;
  v_reviewer text;
  v_meta jsonb;
  v_votes jsonb;
  v_vote_count integer;
  v_avg_points integer;
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

  IF v_answer.grading_status IS DISTINCT FROM 'pending'
     AND v_answer.grading_status IS DISTINCT FROM 'jury_pending' THEN
    RAISE EXCEPTION 'answer is not pending';
  END IF;

  IF v_action = 'reject' THEN
    UPDATE answers
       SET grading_status = 'rejected',
           match_tier = 'none',
           is_correct = false,
           points_earned = 0,
           grading_meta = coalesce(grading_meta, '{}'::jsonb)
             - 'jury_votes' - 'jury_required'
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

  v_grading_cfg := public.merge_question_answer_grading(
    coalesce(v_game.settings, '{}'::jsonb),
    v_question.grading_override
  );
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

  v_meta := coalesce(v_answer.grading_meta, '{}'::jsonb);
  v_jury := coalesce(v_grading_cfg -> 'jury', '{}'::jsonb);
  v_jury_enabled := coalesce((v_jury ->> 'enabled')::boolean, false);
  v_required_votes := greatest(1, coalesce((v_jury ->> 'required_votes')::integer, 2));

  IF v_jury_enabled AND v_required_votes > 1 THEN
    v_reviewer := coalesce(auth.uid()::text, 'service');
    v_votes := coalesce(v_meta -> 'jury_votes', '{}'::jsonb);
    v_votes := v_votes || jsonb_build_object(
      v_reviewer,
      jsonb_build_object(
        'points', v_points,
        'is_correct', v_grade.is_correct,
        'at', now()
      )
    );
    v_meta := v_meta
      || jsonb_build_object('jury_votes', v_votes, 'jury_required', v_required_votes);
    v_vote_count := (SELECT count(*)::integer FROM jsonb_object_keys(v_votes));

    IF v_vote_count < v_required_votes THEN
      UPDATE answers
         SET grading_status = 'jury_pending',
             is_correct = v_grade.is_correct,
             points_earned = 0,
             match_tier = coalesce(v_grade.match_tier, 'none'),
             grading_meta = v_meta
       WHERE id = p_answer_id;

      RETURN jsonb_build_object(
        'success', true,
        'answer_id', p_answer_id,
        'grading_status', 'jury_pending',
        'is_correct', v_grade.is_correct,
        'points_earned', 0,
        'jury_votes', v_vote_count,
        'jury_required', v_required_votes,
        'match_tier', coalesce(v_grade.match_tier, 'none')
      );
    END IF;

    SELECT round(avg((jv.value ->> 'points')::numeric))::integer
      INTO v_avg_points
    FROM jsonb_each(v_votes) AS jv(key, value);

    v_points := coalesce(v_avg_points, v_points);
  END IF;

  UPDATE answers
     SET grading_status = 'accepted_manual',
         is_correct = v_grade.is_correct,
         points_earned = v_points,
         match_tier = coalesce(v_grade.match_tier, 'none'),
         grading_meta = CASE
           WHEN v_jury_enabled AND v_required_votes > 1 THEN
             v_meta || jsonb_build_object('jury_finalized', true, 'jury_finalized_at', now())
           ELSE v_meta
         END
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

DROP FUNCTION IF EXISTS public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer, text
);

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

GRANT EXECUTE ON FUNCTION public.merge_question_answer_grading(jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_answers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teams_pending_review(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.moderate_answer(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer, text
) TO anon, authenticated, service_role;
