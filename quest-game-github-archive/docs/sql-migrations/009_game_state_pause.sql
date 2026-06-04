-- Поля паузы для game_state (ожидает GameControls / GameStateManager)
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT false;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS paused_by TEXT;

-- После выполнения: Supabase Dashboard → Project Settings → API → Reload schema
