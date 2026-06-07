-- Batch admin session operations: 8+ REST → 1 RPC per action.

CREATE OR REPLACE FUNCTION public.admin_restart_from_scratch(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_ids uuid[];
  v_team_names text[];
  v_answers_deleted integer := 0;
  v_teams_deleted integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]),
         coalesce(array_agg(team_name) FILTER (WHERE team_name IS NOT NULL), ARRAY[]::text[])
    INTO v_team_ids, v_team_names
    FROM teams
   WHERE game_id = p_game_id;

  WITH del AS (
    DELETE FROM answers WHERE game_id = p_game_id RETURNING 1
  )
  SELECT count(*)::integer INTO v_answers_deleted FROM del;

  IF array_length(v_team_ids, 1) IS NOT NULL THEN
    DELETE FROM message_reads WHERE team_id = ANY(v_team_ids);
    DELETE FROM message_recipients WHERE team_id = ANY(v_team_ids);
  END IF;

  DELETE FROM team_scores WHERE game_id = p_game_id;

  IF array_length(v_team_names, 1) IS NOT NULL THEN
    DELETE FROM players WHERE team_name = ANY(v_team_names);
  END IF;

  WITH del AS (
    DELETE FROM teams WHERE game_id = p_game_id RETURNING id
  )
  SELECT count(*)::integer INTO v_teams_deleted FROM del;

  UPDATE game_state
     SET current_state = 'closed',
         is_paused = false,
         paused_at = NULL,
         paused_by = NULL,
         player_data = '{}'::jsonb,
         updated_at = now()
   WHERE game_id = p_game_id;

  IF NOT FOUND THEN
    INSERT INTO game_state (game_id, current_state, is_paused, player_data, updated_at)
    VALUES (p_game_id, 'closed', false, '{}'::jsonb, now());
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', p_game_id,
    'current_state', 'closed',
    'is_paused', false,
    'paused_at', NULL,
    'paused_by', NULL,
    'player_data', '{}'::jsonb,
    'teams_deleted', v_teams_deleted,
    'answers_deleted', v_answers_deleted
  );
END;
$$;

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

    UPDATE teams SET total_score = 0 WHERE game_id = p_game_id;

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

GRANT EXECUTE ON FUNCTION public.admin_restart_from_scratch(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_session(uuid, text, text) TO authenticated, service_role;
