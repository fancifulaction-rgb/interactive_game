-- Колонки teams, которые ожидает приложение (редактор, регистрация, табло)
-- Выполнять после 001–005, если teams создана только с name/avatar

ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS captain_name TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS registration_time TIMESTAMPTZ DEFAULT NOW();

UPDATE teams SET team_name = name WHERE team_name IS NULL AND name IS NOT NULL;
UPDATE teams SET avatar_url = avatar WHERE avatar_url IS NULL AND avatar IS NOT NULL;
