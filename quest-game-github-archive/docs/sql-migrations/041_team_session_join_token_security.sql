-- IMP-SEC-018/019: join_token обязателен; recover только с валидным session token (без угадывания).

DROP FUNCTION IF EXISTS public.register_team(uuid, text, text);
DROP FUNCTION IF EXISTS public.recover_team_session(uuid, text, text);

CREATE OR REPLACE FUNCTION public.register_team(
  p_game_id uuid,
  p_team_name text,
  p_captain_name text,
  p_join_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_team teams%ROWTYPE;
  v_normalized text;
  v_game_join uuid;
  v_answer_count integer;
BEGIN
  IF p_game_id IS NULL
     OR trim(coalesce(p_team_name, '')) = ''
     OR trim(coalesce(p_captain_name, '')) = ''
     OR p_join_token IS NULL THEN
    RAISE EXCEPTION 'invalid registration fields';
  END IF;

  SELECT g.join_token INTO v_game_join FROM games g WHERE g.id = p_game_id;
  IF NOT FOUND OR v_game_join IS DISTINCT FROM p_join_token THEN
    RAISE EXCEPTION 'invalid join token';
  END IF;

  v_normalized := lower(trim(p_team_name));

  SELECT * INTO v_team
  FROM teams t
  WHERE t.game_id = p_game_id
    AND public.team_display_name_normalized(t.team_name, t.name) = v_normalized
  LIMIT 1;

  IF FOUND THEN
    IF trim(v_team.captain_name) IS DISTINCT FROM trim(p_captain_name) THEN
      RAISE EXCEPTION 'team_name_taken';
    END IF;

    SELECT count(*)::integer INTO v_answer_count FROM answers a WHERE a.team_id = v_team.id;
    IF v_answer_count > 0 OR v_team.registration_time < now() - interval '20 minutes' THEN
      RAISE EXCEPTION 'team_name_taken';
    END IF;

    v_token := encode(gen_random_bytes(32), 'base64');
    UPDATE teams
    SET session_token_hash = public.hash_team_session_token(v_token)
    WHERE id = v_team.id
    RETURNING * INTO v_team;
  ELSE
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
  END IF;

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
  p_captain_name text,
  p_session_token text,
  p_join_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_team teams%ROWTYPE;
  v_normalized text;
  v_game_join uuid;
BEGIN
  IF p_game_id IS NULL
     OR trim(coalesce(p_team_name, '')) = ''
     OR trim(coalesce(p_captain_name, '')) = ''
     OR trim(coalesce(p_session_token, '')) = ''
     OR p_join_token IS NULL THEN
    RAISE EXCEPTION 'invalid recovery fields';
  END IF;

  SELECT g.join_token INTO v_game_join FROM games g WHERE g.id = p_game_id;
  IF NOT FOUND OR v_game_join IS DISTINCT FROM p_join_token THEN
    RAISE EXCEPTION 'invalid join token';
  END IF;

  v_normalized := lower(trim(coalesce(p_team_name, '')));

  SELECT * INTO v_team
  FROM teams
  WHERE game_id = p_game_id
    AND public.team_display_name_normalized(team_name, name) = v_normalized
    AND captain_name = trim(p_captain_name)
    AND session_token_hash = public.hash_team_session_token(trim(p_session_token))
  ORDER BY registration_time DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team session not found';
  END IF;

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
    'session_token', trim(p_session_token)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_team(uuid, text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recover_team_session(uuid, text, text, text, uuid) TO anon, authenticated, service_role;
