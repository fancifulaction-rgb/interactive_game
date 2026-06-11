-- IMP-SEC-017: process_game_schedule — не для anon (только authenticated/service_role).

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
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.process_game_schedule(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_game_schedule(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_game_schedule(uuid) TO authenticated, service_role;
