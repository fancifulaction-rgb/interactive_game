-- Расширение схемы под актуальное приложение (v1.2.13)
-- Выполнять после 001, 002, 003

-- games: поля из продакшен-БД
ALTER TABLE games ADD COLUMN IF NOT EXISTS mask_board BOOLEAN DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default';
ALTER TABLE games ADD COLUMN IF NOT EXISTS total_time_sec INTEGER DEFAULT 3600;
ALTER TABLE games ADD COLUMN IF NOT EXISTS per_question_time_sec INTEGER DEFAULT 60;
ALTER TABLE games ADD COLUMN IF NOT EXISTS scoring JSONB DEFAULT '{"k_diff":1,"k_fast":1.2,"k_skip":0.8,"k_time":0.5,"p_base":100,"combo_bonus":10}'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS finish_page_type VARCHAR(50) DEFAULT 'scoreboard';

-- questions: новые поля + совместимость со старыми
ALTER TABLE questions ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS hint_penalties JSONB DEFAULT '[]'::jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer_count INTEGER DEFAULT 1;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS hint_levels JSONB DEFAULT '[]'::jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS per_question_time_sec INTEGER;

UPDATE questions SET type = COALESCE(type, question_type) WHERE type IS NULL AND question_type IS NOT NULL;
UPDATE questions SET order_index = question_number WHERE order_index = 0 OR order_index IS NULL;

-- RLS для settings и themes
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on settings" ON settings;
CREATE POLICY "Allow all operations on settings" ON settings FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on themes" ON themes;
CREATE POLICY "Allow all operations on themes" ON themes FOR ALL USING (true);
