-- Realtime для lobby → playing (таблица game_state в publication)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%already member%' AND SQLERRM NOT LIKE '%already exists%' THEN
      RAISE;
    END IF;
END $$;
