-- Автоматическое открытие лобби / старт игры по расписанию (games.settings.schedule).

CREATE OR REPLACE FUNCTION public._patch_game_schedule(
  p_game_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_schedule jsonb;
BEGIN
  SELECT coalesce(settings, '{}'::jsonb) INTO v_settings FROM games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_schedule := coalesce(v_settings->'schedule', '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb);
  UPDATE games
     SET settings = v_settings || jsonb_build_object('schedule', v_schedule)
   WHERE id = p_game_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_game_schedule(
  p_game_id uuid,
  p_schedule jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_game_id IS NULL THEN
    RAISE EXCEPTION 'game_id required';
  END IF;

  SELECT coalesce(settings, '{}'::jsonb) INTO v_settings FROM games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;

  UPDATE games
     SET settings = v_settings || jsonb_build_object('schedule', coalesce(p_schedule, '{}'::jsonb))
   WHERE id = p_game_id;

  RETURN (SELECT settings->'schedule' FROM games WHERE id = p_game_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_game_schedule(p_game_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game record;
  v_schedule jsonb;
  v_state text;
  v_lobby_at timestamptz;
  v_start_at timestamptz;
  v_qcount integer;
  v_result jsonb;
  v_processed integer := 0;
  v_actions jsonb := '[]'::jsonb;
BEGIN
  FOR v_game IN
    SELECT g.id, g.settings, gs.current_state
      FROM games g
      LEFT JOIN game_state gs ON gs.game_id = g.id
     WHERE (p_game_id IS NULL OR g.id = p_game_id)
       AND coalesce(g.settings->'schedule'->>'mode', 'manual') = 'scheduled'
       AND coalesce((g.settings->'schedule'->>'enabled')::boolean, false) = true
  LOOP
    v_schedule := coalesce(v_game.settings->'schedule', '{}'::jsonb);
    v_state := coalesce(v_game.current_state, 'closed');

    BEGIN
      IF v_state = 'closed'
         AND v_schedule->>'lobbyOpensAt' IS NOT NULL
         AND v_schedule->>'lobbyOpensAt' <> ''
         AND (v_schedule->>'lobbyOpenedAt' IS NULL OR v_schedule->>'lobbyOpenedAt' = '')
      THEN
        v_lobby_at := (v_schedule->>'lobbyOpensAt')::timestamptz;
        IF now() >= v_lobby_at THEN
          v_result := public.admin_set_session(v_game.id, 'open_lobby', 'schedule');
          PERFORM public._patch_game_schedule(v_game.id, jsonb_build_object(
            'lobbyOpenedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'lastError', null
          ));
          v_actions := v_actions || jsonb_build_array(jsonb_build_object(
            'game_id', v_game.id, 'action', 'open_lobby'
          ));
        END IF;
      END IF;

      SELECT coalesce(current_state, 'closed') INTO v_state FROM game_state WHERE game_id = v_game.id;

      IF v_state IN ('waiting', 'lobby')
         AND v_schedule->>'gameStartsAt' IS NOT NULL
         AND v_schedule->>'gameStartsAt' <> ''
         AND (v_schedule->>'gameStartedAt' IS NULL OR v_schedule->>'gameStartedAt' = '')
      THEN
        v_start_at := (v_schedule->>'gameStartsAt')::timestamptz;
        IF now() >= v_start_at THEN
          SELECT count(*)::integer INTO v_qcount FROM questions WHERE game_id = v_game.id;
          IF v_qcount < 1 THEN
            PERFORM public._patch_game_schedule(v_game.id, jsonb_build_object(
              'lastError', 'Нельзя начать игру: нет сохранённых вопросов'
            ));
          ELSE
            v_result := public.admin_set_session(v_game.id, 'start_game', 'schedule');
            PERFORM public._patch_game_schedule(v_game.id, jsonb_build_object(
              'gameStartedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'lastError', null
            ));
            v_actions := v_actions || jsonb_build_array(jsonb_build_object(
              'game_id', v_game.id, 'action', 'start_game'
            ));
          END IF;
        END IF;
      END IF;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM public._patch_game_schedule(v_game.id, jsonb_build_object(
        'lastError', SQLERRM
      ));
      v_actions := v_actions || jsonb_build_array(jsonb_build_object(
        'game_id', v_game.id, 'action', 'error', 'message', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'actions', v_actions);
END;
$$;

-- Расширение admin_set_session: метки расписания при ручных действиях
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
  v_now_iso text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_now_iso := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

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
    PERFORM public._patch_game_schedule(p_game_id, jsonb_build_object(
      'lobbyOpenedAt', v_now_iso,
      'lastError', null
    ));

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
    PERFORM public._patch_game_schedule(p_game_id, jsonb_build_object(
      'enabled', false,
      'lobbyOpenedAt', null,
      'gameStartedAt', null,
      'lastError', null
    ));

  ELSIF p_action = 'start_game' THEN
    IF coalesce(v_row.current_state, '') NOT IN ('waiting', 'lobby') THEN
      RAISE EXCEPTION 'start_game requires waiting lobby';
    END IF;
    IF v_pd->>'startedAt' IS NULL OR v_pd->>'startedAt' = '' THEN
      v_pd := v_pd || jsonb_build_object('startedAt', v_now_iso);
    END IF;
    UPDATE game_state
       SET current_state = 'playing',
           is_paused = false,
           paused_at = NULL,
           paused_by = NULL,
           player_data = v_pd,
           updated_at = now()
     WHERE game_id = p_game_id;
    PERFORM public._patch_game_schedule(p_game_id, jsonb_build_object(
      'gameStartedAt', v_now_iso,
      'lastError', null
    ));

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

    PERFORM public._patch_game_schedule(p_game_id, jsonb_build_object(
      'gameStartedAt', null,
      'lastError', null
    ));

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

GRANT EXECUTE ON FUNCTION public.admin_update_game_schedule(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_game_schedule(uuid) TO authenticated, service_role, anon;
