-- IMP-SEC-014: grading/scoreboard RPC — только authenticated/service_role (не anon).

CREATE OR REPLACE FUNCTION public.get_scoreboard_answers(p_game_id uuid)
RETURNS TABLE (
  team_id uuid,
  question_number integer,
  is_correct boolean,
  points_earned integer,
  time_spent integer,
  answer jsonb,
  grading_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (a.team_id, a.question_number)
    a.team_id,
    a.question_number,
    coalesce(a.is_correct, false),
    coalesce(a.points_earned, 0),
    coalesce(a.time_spent, 0),
    a.answer,
    coalesce(a.grading_status, 'auto_accepted')
  FROM answers a
  WHERE a.game_id = p_game_id
    AND coalesce(a.grading_status, 'auto_accepted') IS DISTINCT FROM 'superseded'
  ORDER BY a.team_id, a.question_number, a.created_at DESC;
END;
$$;

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
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
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teams_pending_review(p_game_id uuid)
RETURNS TABLE (
  team_id uuid,
  pending_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT a.team_id, count(*)::bigint
  FROM answers a
  WHERE a.game_id = p_game_id
    AND a.grading_status IN ('pending', 'jury_pending')
  GROUP BY a.team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_posthoc_answers(p_game_id uuid)
RETURNS TABLE (
  answer_id uuid,
  team_id uuid,
  team_name text,
  question_number integer,
  answer jsonb,
  media_urls jsonb,
  created_at timestamptz,
  grading_status text,
  grading_meta jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (a.team_id, a.question_number)
    a.id,
    a.team_id,
    coalesce(t.team_name, t.name, ''),
    a.question_number,
    a.answer,
    coalesce(a.media_urls, '[]'::jsonb),
    a.created_at,
    coalesce(a.grading_status, 'auto_accepted'),
    coalesce(a.grading_meta, '{}'::jsonb)
  FROM answers a
  JOIN teams t ON t.id = a.team_id
  WHERE a.game_id = p_game_id
    AND coalesce(a.grading_status, 'auto_accepted') IN ('auto_accepted', 'rejected')
    AND coalesce(a.is_correct, false) = false
    AND coalesce(a.points_earned, 0) = 0
  ORDER BY a.team_id, a.question_number, a.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_scoreboard_answers(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_pending_answers(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_teams_pending_review(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_posthoc_answers(uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.get_scoreboard_answers(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_pending_answers(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_teams_pending_review(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_posthoc_answers(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_scoreboard_answers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_answers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teams_pending_review(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_posthoc_answers(uuid) TO authenticated, service_role;
