-- IMP-SEC-008: anon/authenticated не должны вызывать increment_team_score напрямую.
-- Регрессия: после 018 права могли восстановиться (default grants / pooler).
REVOKE ALL ON FUNCTION public.increment_team_score(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_team_score(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_team_score(uuid, integer) TO service_role;
