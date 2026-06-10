-- Прогресс команд + mark_team_finished + автофиниш сессии (IMP team progress)

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

COMMENT ON COLUMN public.teams.finished_at IS
  'Момент, когда команда локально завершила прохождение квеста (последний вопрос).';

CREATE OR REPLACE FUNCTION public.team_quest_is_finished(
  p_finished_at timestamptz,
  p_answered_count bigint,
  p_total_questions bigint
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_finished_at IS NOT NULL
    OR (coalesce(p_total_questions, 0) > 0 AND coalesce(p_answered_count, 0) >= p_total_questions);
$$;

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

CREATE OR REPLACE FUNCTION public.try_auto_finish_game(p_game_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auto boolean := false;
  v_state text;
  v_team_count integer := 0;
  v_unfinished integer := 0;
BEGIN
  SELECT coalesce((g.settings->>'auto_finish_when_all_teams_done')::boolean, false)
    INTO v_auto
  FROM games g
  WHERE g.id = p_game_id;

  IF NOT coalesce(v_auto, false) THEN
    RETURN false;
  END IF;

  SELECT gs.current_state INTO v_state
  FROM game_state gs
  WHERE gs.game_id = p_game_id;

  IF coalesce(v_state, '') NOT IN ('playing', 'paused') THEN
    RETURN false;
  END IF;

  SELECT count(*)::integer INTO v_team_count
  FROM teams t
  WHERE t.game_id = p_game_id;

  IF v_team_count = 0 THEN
    RETURN false;
  END IF;

  SELECT count(*)::integer INTO v_unfinished
  FROM public.get_team_progress(p_game_id) p
  WHERE NOT p.is_finished;

  IF v_unfinished > 0 THEN
    RETURN false;
  END IF;

  UPDATE game_state
     SET current_state = 'finished',
         is_paused = false,
         paused_at = NULL,
         paused_by = NULL,
         updated_at = now()
   WHERE game_id = p_game_id
     AND current_state IN ('playing', 'paused');

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_team_finished(
  p_game_id uuid,
  p_team_id uuid,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_finished_at timestamptz;
  v_game_finished boolean := false;
  v_state text;
BEGIN
  IF p_session_token IS NULL
     OR trim(p_session_token) = ''
     OR NOT public.verify_team_session(p_team_id, p_game_id, p_session_token) THEN
    RAISE EXCEPTION 'invalid team session';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id = p_team_id AND t.game_id = p_game_id
  ) THEN
    RAISE EXCEPTION 'team does not belong to game';
  END IF;

  SELECT gs.current_state INTO v_state
  FROM game_state gs
  WHERE gs.game_id = p_game_id;

  IF coalesce(v_state, '') NOT IN ('playing', 'paused') THEN
  RETURN jsonb_build_object(
    'success', false,
    'reason', 'session_not_active',
    'current_state', v_state,
    'game_finished', false
  );
  END IF;

  UPDATE teams
     SET finished_at = coalesce(finished_at, now())
   WHERE id = p_team_id
     AND game_id = p_game_id
  RETURNING finished_at INTO v_finished_at;

  v_game_finished := public.try_auto_finish_game(p_game_id);

  IF v_game_finished THEN
    SELECT gs.current_state INTO v_state
    FROM game_state gs
    WHERE gs.game_id = p_game_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'team_id', p_team_id,
    'finished_at', v_finished_at,
    'game_finished', v_game_finished,
    'current_state', v_state
  );
END;
$$;

-- Сброс finished_at при возврате в лобби
CREATE OR REPLACE FUNCTION public.admin_set_session(
  p_game_id uuid,
  p_action text,
  p_admin_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row game_state%ROWTYPE;
  v_pd jsonb;
  v_state text;
  v_epoch integer;
  v_answers_deleted integer := 0;
  v_team_ids uuid[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM game_state WHERE game_id = p_game_id;
  v_pd := coalesce(v_row.player_data, '{}'::jsonb);

  IF p_action = 'open_lobby' THEN
    UPDATE game_state
       SET current_state = 'waiting',
           is_paused = false,
           paused_at = NULL,
           paused_by = NULL,
           updated_at = now()
     WHERE game_id = p_game_id;
    IF NOT FOUND THEN
      INSERT INTO game_state (game_id, current_state, is_paused, player_data, updated_at)
      VALUES (p_game_id, 'waiting', false, '{}'::jsonb, now());
    END IF;

  ELSIF p_action = 'close_game' THEN
    v_pd := v_pd - 'startedAt';
    UPDATE game_state
       SET current_state = 'closed',
           is_paused = false,
           paused_at = NULL,
           paused_by = NULL,
           player_data = v_pd,
           updated_at = now()
     WHERE game_id = p_game_id;
    IF NOT FOUND THEN
      INSERT INTO game_state (game_id, current_state, is_paused, player_data, updated_at)
      VALUES (p_game_id, 'closed', false, v_pd, now());
    END IF;

  ELSIF p_action = 'start_game' THEN
    IF coalesce(v_row.current_state, '') NOT IN ('waiting', 'lobby') THEN
      RAISE EXCEPTION 'start_game requires waiting lobby';
    END IF;
    IF v_pd->>'startedAt' IS NULL OR v_pd->>'startedAt' = '' THEN
      v_pd := v_pd || jsonb_build_object('startedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    END IF;
    UPDATE game_state
       SET current_state = 'playing',
           is_paused = false,
           paused_at = NULL,
           paused_by = NULL,
           player_data = v_pd,
           updated_at = now()
     WHERE game_id = p_game_id;

  ELSIF p_action = 'pause' THEN
    UPDATE game_state
       SET current_state = 'playing',
           is_paused = true,
           paused_at = now(),
           paused_by = coalesce(p_admin_name, 'admin'),
           updated_at = now()
     WHERE game_id = p_game_id;

  ELSIF p_action = 'resume' THEN
    UPDATE game_state
       SET current_state = 'playing',
           is_paused = false,
           paused_at = NULL,
           paused_by = NULL,
           updated_at = now()
     WHERE game_id = p_game_id;

  ELSIF p_action = 'finish_game' THEN
    UPDATE game_state
       SET current_state = 'finished',
           is_paused = false,
           paused_at = NULL,
           paused_by = NULL,
           updated_at = now()
     WHERE game_id = p_game_id;

  ELSIF p_action = 'restart_to_lobby' THEN
    WITH del AS (
      DELETE FROM answers WHERE game_id = p_game_id RETURNING 1
    )
    SELECT count(*)::integer INTO v_answers_deleted FROM del;

    DELETE FROM team_scores WHERE game_id = p_game_id;

    SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
      INTO v_team_ids
      FROM teams WHERE game_id = p_game_id;

    IF array_length(v_team_ids, 1) IS NOT NULL THEN
      DELETE FROM message_reads WHERE team_id = ANY(v_team_ids);
      DELETE FROM message_recipients WHERE team_id = ANY(v_team_ids);
    END IF;

    UPDATE teams
       SET total_score = 0,
           finished_at = NULL
     WHERE game_id = p_game_id;

    v_pd := v_pd - 'startedAt';
    v_epoch := coalesce((v_pd->>'lobbyEpoch')::integer, 0) + 1;
    v_pd := v_pd || jsonb_build_object('lobbyEpoch', v_epoch);

    UPDATE game_state
       SET current_state = 'waiting',
           is_paused = false,
           paused_at = NULL,
           paused_by = NULL,
           player_data = v_pd,
           updated_at = now()
     WHERE game_id = p_game_id;

  ELSE
    RAISE EXCEPTION 'unknown action: %', p_action;
  END IF;

  SELECT * INTO v_row FROM game_state WHERE game_id = p_game_id;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', p_game_id,
    'current_state', v_row.current_state,
    'is_paused', coalesce(v_row.is_paused, false),
    'paused_at', v_row.paused_at,
    'paused_by', v_row.paused_by,
    'player_data', coalesce(v_row.player_data, '{}'::jsonb),
    'updated_at', v_row.updated_at,
    'answers_deleted', v_answers_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_progress(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_team_finished(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.try_auto_finish_game(uuid) TO service_role;
