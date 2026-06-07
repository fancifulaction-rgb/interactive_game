-- BUG_AUDIT S1–S5: team session tokens, tighten RLS, lock increment_team_score, player views/RPCs.
-- Применять одним блоком перед деплоем Edge и обновлением клиента.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS session_token_hash text;

CREATE OR REPLACE FUNCTION public.hash_team_session_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.verify_team_session(
  p_team_id uuid,
  p_game_id uuid,
  p_session_token text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM teams t
    WHERE t.id = p_team_id
      AND t.game_id = p_game_id
      AND t.session_token_hash IS NOT NULL
      AND t.session_token_hash = public.hash_team_session_token(p_session_token)
  );
$$;

CREATE OR REPLACE FUNCTION public.register_team(
  p_game_id uuid,
  p_team_name text,
  p_captain_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_team teams%ROWTYPE;
BEGIN
  IF p_game_id IS NULL
     OR trim(coalesce(p_team_name, '')) = ''
     OR trim(coalesce(p_captain_name, '')) = '' THEN
    RAISE EXCEPTION 'invalid registration fields';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM games g WHERE g.id = p_game_id) THEN
    RAISE EXCEPTION 'game not found';
  END IF;

  v_token := encode(gen_random_bytes(32), 'base64');

  INSERT INTO teams (
    game_id, team_name, captain_name, name,
    avatar_url, avatar, total_score, registration_time, session_token_hash
  ) VALUES (
    p_game_id,
    trim(p_team_name),
    trim(p_captain_name),
    trim(p_team_name),
    NULL, NULL, 0, now(),
    public.hash_team_session_token(v_token)
  )
  RETURNING * INTO v_team;

  RETURN jsonb_build_object(
    'team', jsonb_build_object(
      'id', v_team.id,
      'game_id', v_team.game_id,
      'team_name', v_team.team_name,
      'captain_name', v_team.captain_name,
      'name', v_team.name,
      'avatar_url', v_team.avatar_url,
      'avatar', v_team.avatar,
      'registration_time', v_team.registration_time,
      'created_at', v_team.created_at,
      'total_score', coalesce(v_team.total_score, 0)
    ),
    'session_token', v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_team_session(
  p_game_id uuid,
  p_team_name text,
  p_captain_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_team teams%ROWTYPE;
BEGIN
  SELECT * INTO v_team
  FROM teams
  WHERE game_id = p_game_id
    AND team_name = trim(p_team_name)
    AND captain_name = trim(p_captain_name)
  ORDER BY registration_time DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team not found';
  END IF;

  v_token := encode(gen_random_bytes(32), 'base64');

  UPDATE teams
  SET session_token_hash = public.hash_team_session_token(v_token)
  WHERE id = v_team.id
  RETURNING * INTO v_team;

  RETURN jsonb_build_object(
    'team', jsonb_build_object(
      'id', v_team.id,
      'game_id', v_team.game_id,
      'team_name', v_team.team_name,
      'captain_name', v_team.captain_name,
      'name', v_team.name,
      'avatar_url', v_team.avatar_url,
      'avatar', v_team.avatar,
      'registration_time', v_team.registration_time,
      'created_at', v_team.created_at,
      'total_score', coalesce(v_team.total_score, 0)
    ),
    'session_token', v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_team_avatar(
  p_team_id uuid,
  p_game_id uuid,
  p_session_token text,
  p_avatar_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_team_session(p_team_id, p_game_id, p_session_token) THEN
    RAISE EXCEPTION 'invalid team session';
  END IF;
  IF coalesce(trim(p_avatar_url), '') = '' THEN
    RAISE EXCEPTION 'avatar url required';
  END IF;

  UPDATE teams
  SET avatar_url = p_avatar_url,
      avatar = p_avatar_url
  WHERE id = p_team_id AND game_id = p_game_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_has_answers(
  p_team_id uuid,
  p_game_id uuid,
  p_session_token text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.verify_team_session(p_team_id, p_game_id, p_session_token) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM answers a WHERE a.team_id = p_team_id LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_scoreboard_answers(p_game_id uuid)
RETURNS TABLE (
  team_id uuid,
  question_number integer,
  is_correct boolean,
  points_earned integer,
  time_spent integer,
  answer jsonb
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
    a.answer
  FROM answers a
  WHERE a.game_id = p_game_id;
$$;

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
FROM questions;

GRANT SELECT ON public.questions_player TO anon, authenticated;

DROP POLICY IF EXISTS "questions_anon_select" ON questions;

DROP FUNCTION IF EXISTS public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer
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

REVOKE EXECUTE ON FUNCTION public.increment_team_score(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_team_score(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_team_score(uuid, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.verify_team_session(uuid, uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.register_team(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recover_team_session(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_team_avatar(uuid, uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_has_answers(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_scoreboard_answers(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_auto_answer(
  uuid, uuid, integer, jsonb, jsonb, integer, integer, text
) TO anon, authenticated, service_role;

-- S3: убрать anon UPDATE/INSERT на чувствительных таблицах
DROP POLICY IF EXISTS "teams_anon_insert" ON teams;
DROP POLICY IF EXISTS "teams_anon_update" ON teams;
DROP POLICY IF EXISTS "answers_anon_insert" ON answers;
DROP POLICY IF EXISTS "answers_anon_update" ON answers;
DROP POLICY IF EXISTS "answers_anon_select" ON answers;
DROP POLICY IF EXISTS "team_scores_anon_insert" ON team_scores;
DROP POLICY IF EXISTS "team_scores_anon_update" ON team_scores;
