-- IMP-SEC-016: владелец игры — защита от IDOR (удаление/правка чужих игр).

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_games_owner_id ON public.games(owner_id);

COMMENT ON COLUMN public.games.owner_id IS
  'Админ-создатель (auth.users). NULL — legacy; любой authenticated до backfill.';

CREATE OR REPLACE FUNCTION public.games_set_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_set_owner_id_trg ON public.games;
CREATE TRIGGER games_set_owner_id_trg
  BEFORE INSERT ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.games_set_owner_id();

DROP POLICY IF EXISTS "games_authenticated_all" ON games;

CREATE POLICY "games_authenticated_select" ON games
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "games_authenticated_insert" ON games
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "games_authenticated_update" ON games
  FOR UPDATE TO authenticated
  USING (owner_id IS NULL OR owner_id = auth.uid())
  WITH CHECK (owner_id IS NULL OR owner_id = auth.uid());

CREATE POLICY "games_authenticated_delete" ON games
  FOR DELETE TO authenticated
  USING (owner_id IS NULL OR owner_id = auth.uid());
