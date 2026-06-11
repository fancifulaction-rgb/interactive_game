-- IMP-INF-011: Realtime publication для game_state (отдельный номер — коллизия с 013_submit_auto_answer).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%already member%' AND SQLERRM NOT LIKE '%already exists%' THEN
      RAISE;
    END IF;
END $$;
