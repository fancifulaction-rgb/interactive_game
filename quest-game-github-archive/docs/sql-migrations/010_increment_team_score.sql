-- IMP-INF-003: атомарное увеличение счёта команды (без гонок read-modify-write)
CREATE OR REPLACE FUNCTION public.increment_team_score(p_team_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_score integer;
BEGIN
  IF p_delta IS NULL OR p_delta <= 0 THEN
    SELECT COALESCE(total_score, 0) INTO new_score FROM teams WHERE id = p_team_id;
    RETURN COALESCE(new_score, 0);
  END IF;

  UPDATE teams
  SET total_score = COALESCE(total_score, 0) + p_delta
  WHERE id = p_team_id
  RETURNING total_score INTO new_score;

  RETURN COALESCE(new_score, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_team_score(uuid, integer) TO anon, authenticated, service_role;
