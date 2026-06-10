-- Уникальное название команды в рамках одной игры (case-insensitive, trim).
-- register_team: проверка до INSERT + unique index против гонок.

CREATE OR REPLACE FUNCTION public.team_display_name_normalized(p_team_name text, p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(nullif(trim(p_team_name), ''), nullif(trim(p_name), ''), '')));
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
  v_normalized text;
BEGIN
  IF p_game_id IS NULL
     OR trim(coalesce(p_team_name, '')) = ''
     OR trim(coalesce(p_captain_name, '')) = '' THEN
    RAISE EXCEPTION 'invalid registration fields';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM games g WHERE g.id = p_game_id) THEN
    RAISE EXCEPTION 'game not found';
  END IF;

  v_normalized := lower(trim(p_team_name));

  IF EXISTS (
    SELECT 1
    FROM teams t
    WHERE t.game_id = p_game_id
      AND public.team_display_name_normalized(t.team_name, t.name) = v_normalized
  ) THEN
    RAISE EXCEPTION 'team_name_taken';
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
  v_normalized text;
BEGIN
  v_normalized := lower(trim(coalesce(p_team_name, '')));

  SELECT * INTO v_team
  FROM teams
  WHERE game_id = p_game_id
    AND public.team_display_name_normalized(team_name, name) = v_normalized
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

-- Если миграция падает на дубликатах — сначала вручную переименовать/удалить конфликтующие строки в teams.
CREATE UNIQUE INDEX IF NOT EXISTS teams_game_id_normalized_name_key
  ON teams (game_id, (public.team_display_name_normalized(team_name, name)))
  WHERE public.team_display_name_normalized(team_name, name) <> '';
