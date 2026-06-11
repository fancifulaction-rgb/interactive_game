-- IMP-DATA-005: структурированные product events для воронки и анализа продукта.
-- Запись только через RPC track_product_events (SECURITY DEFINER).

CREATE TABLE IF NOT EXISTS product_events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('player', 'admin', 'host', 'scoreboard', 'visitor')),
  game_id uuid REFERENCES games (id) ON DELETE SET NULL,
  game_code text,
  team_id uuid REFERENCES teams (id) ON DELETE SET NULL,
  client_session_id text NOT NULL,
  route text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text
);

CREATE INDEX IF NOT EXISTS product_events_created_at_idx ON product_events (created_at DESC);
CREATE INDEX IF NOT EXISTS product_events_game_id_idx ON product_events (game_id);
CREATE INDEX IF NOT EXISTS product_events_event_name_idx ON product_events (event_name);
CREATE INDEX IF NOT EXISTS product_events_client_session_idx ON product_events (client_session_id);

ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_events_select_authenticated ON product_events;
CREATE POLICY product_events_select_authenticated ON product_events
  FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.track_product_events(p_events jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev jsonb;
  v_game_id uuid;
  v_team_id uuid;
  v_role text;
  v_event_name text;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RETURN;
  END IF;

  IF jsonb_array_length(p_events) > 25 THEN
    RAISE EXCEPTION 'too many product events in one batch';
  END IF;

  FOR ev IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    v_event_name := left(trim(coalesce(ev->>'event_name', '')), 64);
    IF v_event_name = '' THEN
      CONTINUE;
    END IF;

    v_role := left(trim(coalesce(ev->>'role', 'visitor')), 24);
    IF v_role NOT IN ('player', 'admin', 'host', 'scoreboard', 'visitor') THEN
      v_role := 'visitor';
    END IF;

    BEGIN
      v_game_id := NULLIF(trim(ev->>'game_id'), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_game_id := NULL;
    END;

    BEGIN
      v_team_id := NULLIF(trim(ev->>'team_id'), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_team_id := NULL;
    END;

    IF v_game_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM games g WHERE g.id = v_game_id) THEN
      v_game_id := NULL;
      v_team_id := NULL;
    END IF;

    IF v_team_id IS NOT NULL AND (
      v_game_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM teams t WHERE t.id = v_team_id AND t.game_id = v_game_id
      )
    ) THEN
      v_team_id := NULL;
    END IF;

    INSERT INTO product_events (
      event_name,
      role,
      game_id,
      game_code,
      team_id,
      client_session_id,
      route,
      payload,
      app_version
    ) VALUES (
      v_event_name,
      v_role,
      v_game_id,
      left(coalesce(ev->>'game_code', ''), 16),
      v_team_id,
      left(coalesce(ev->>'client_session_id', 'unknown'), 80),
      left(coalesce(ev->>'route', ''), 256),
      coalesce(ev->'payload', '{}'::jsonb),
      left(coalesce(ev->>'app_version', ''), 32)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.track_product_events(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_product_events(jsonb) TO anon, authenticated;
