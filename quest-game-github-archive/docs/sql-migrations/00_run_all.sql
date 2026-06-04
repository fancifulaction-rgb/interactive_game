-- Quest Game: полная установка схемы и seed. Выполнить один раз в SQL Editor.

-- ========== 001_initial_schema.sql ==========
-- Quest Game Database Schema
-- Create all necessary tables with proper relationships and constraints

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Games table
CREATE TABLE IF NOT EXISTS games (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    code VARCHAR(6) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    password TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Players table  
CREATE TABLE IF NOT EXISTS players (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    team_info JSONB DEFAULT '{}',
    current_question INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) DEFAULT 'text',
    options JSONB,
    correct_answer TEXT,
    hint TEXT,
    media_url TEXT,
    points INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Answers table
CREATE TABLE IF NOT EXISTS answers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL,
    answer JSONB,
    media_urls JSONB DEFAULT '[]',
    is_correct BOOLEAN DEFAULT FALSE,
    points_earned INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game state table
CREATE TABLE IF NOT EXISTS game_state (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_data JSONB DEFAULT '{}',
    current_state VARCHAR(50) DEFAULT 'waiting',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team scores table
CREATE TABLE IF NOT EXISTS team_scores (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    total_score INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table (for notifications)
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    sender TEXT DEFAULT 'admin',
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'info',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message recipients table
CREATE TABLE IF NOT EXISTS message_recipients (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message reads table
CREATE TABLE IF NOT EXISTS message_reads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);
CREATE INDEX IF NOT EXISTS idx_teams_game_id ON teams(game_id);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_questions_game_id ON questions(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_game_id ON answers(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_team_id ON answers(team_id);
CREATE INDEX IF NOT EXISTS idx_team_scores_game_id ON team_scores(game_id);

-- Enable Row Level Security
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for simplicity - customize as needed)
CREATE POLICY "Allow all operations on games" ON games FOR ALL USING (true);
CREATE POLICY "Allow all operations on teams" ON teams FOR ALL USING (true);
CREATE POLICY "Allow all operations on players" ON players FOR ALL USING (true);
CREATE POLICY "Allow all operations on questions" ON questions FOR ALL USING (true);
CREATE POLICY "Allow all operations on answers" ON answers FOR ALL USING (true);
CREATE POLICY "Allow all operations on game_state" ON game_state FOR ALL USING (true);
CREATE POLICY "Allow all operations on team_scores" ON team_scores FOR ALL USING (true);
CREATE POLICY "Allow all operations on messages" ON messages FOR ALL USING (true);
CREATE POLICY "Allow all operations on message_recipients" ON message_recipients FOR ALL USING (true);
CREATE POLICY "Allow all operations on message_reads" ON message_reads FOR ALL USING (true);

-- ========== 002_add_cascade_delete_rules.sql ==========
-- Add CASCADE delete rules for teams
-- This ensures that when a team is deleted, all related data is automatically removed

-- Add foreign key constraints with CASCADE delete for answers table
ALTER TABLE answers 
DROP CONSTRAINT IF EXISTS answers_team_id_fkey,
ADD CONSTRAINT answers_team_id_fkey 
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- Add foreign key constraints with CASCADE delete for message_reads table  
ALTER TABLE message_reads 
DROP CONSTRAINT IF EXISTS message_reads_team_id_fkey,
ADD CONSTRAINT message_reads_team_id_fkey 
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- Add foreign key constraints with CASCADE delete for message_recipients table
ALTER TABLE message_recipients 
DROP CONSTRAINT IF EXISTS message_recipients_team_id_fkey,
ADD CONSTRAINT message_recipients_team_id_fkey 
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- Update team_scores to use team_id instead of team_name for proper referential integrity
-- First add team_id column if it doesn't exist
ALTER TABLE team_scores ADD COLUMN IF NOT EXISTS team_id UUID;

-- Create index for the new team_id column
CREATE INDEX IF NOT EXISTS idx_team_scores_team_id ON team_scores(team_id);

-- Add foreign key constraint for team_scores
ALTER TABLE team_scores 
DROP CONSTRAINT IF EXISTS team_scores_team_id_fkey,
ADD CONSTRAINT team_scores_team_id_fkey 
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- Note: In production, you would need to populate team_id values before adding the constraint
-- and then remove the team_name column, but we keep both for backward compatibility

-- ========== 003_settings_and_themes.sql ==========
-- 1. РўРђР‘Р›РР¦Рђ РќРђРЎРўР РћР•Рљ (SETTINGS)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    category TEXT
);

-- 2. РўРђР‘Р›РР¦Рђ РўР•Рњ (THEMES)
CREATE TABLE IF NOT EXISTS themes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    colors JSONB NOT NULL,
    effects JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Р’СЃС‚Р°РІРєР° РґРµС„РѕР»С‚РЅС‹С… РЅР°СЃС‚СЂРѕРµРє
INSERT INTO settings (key, value, description, category) VALUES
('quest_title', 'РРЅС‚РµСЂР°РєС‚РёРІРЅС‹Р№ РљРІРµСЃС‚', 'Р—Р°РіРѕР»РѕРІРѕРє РЅР° РіР»Р°РІРЅРѕР№', 'РљРІРµСЃС‚'),
('quest_subtitle', 'Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ РІ РёРіСЂСѓ', 'РџРѕРґР·Р°РіРѕР»РѕРІРѕРє РЅР° РіР»Р°РІРЅРѕР№', 'РљРІРµСЃС‚'),
('quest_logo_url', '', 'URL Р»РѕРіРѕС‚РёРїР°', 'РљРІРµСЃС‚')
ON CONFLICT (key) DO NOTHING;



-- ========== 004_production_schema.sql ==========
-- Р Р°СЃС€РёСЂРµРЅРёРµ СЃС…РµРјС‹ РїРѕРґ Р°РєС‚СѓР°Р»СЊРЅРѕРµ РїСЂРёР»РѕР¶РµРЅРёРµ (v1.2.13)
-- Р’С‹РїРѕР»РЅСЏС‚СЊ РїРѕСЃР»Рµ 001, 002, 003

-- games: РїРѕР»СЏ РёР· РїСЂРѕРґР°РєС€РµРЅ-Р‘Р”
ALTER TABLE games ADD COLUMN IF NOT EXISTS mask_board BOOLEAN DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default';
ALTER TABLE games ADD COLUMN IF NOT EXISTS total_time_sec INTEGER DEFAULT 3600;
ALTER TABLE games ADD COLUMN IF NOT EXISTS per_question_time_sec INTEGER DEFAULT 60;
ALTER TABLE games ADD COLUMN IF NOT EXISTS scoring JSONB DEFAULT '{"k_diff":1,"k_fast":1.2,"k_skip":0.8,"k_time":0.5,"p_base":100,"combo_bonus":10}'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS finish_page_type VARCHAR(50) DEFAULT 'scoreboard';

-- questions: РЅРѕРІС‹Рµ РїРѕР»СЏ + СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚СЊ СЃРѕ СЃС‚Р°СЂС‹РјРё
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

-- RLS РґР»СЏ settings Рё themes
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on settings" ON settings;
CREATE POLICY "Allow all operations on settings" ON settings FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on themes" ON themes;
CREATE POLICY "Allow all operations on themes" ON themes FOR ALL USING (true);


-- ========== 005_seed_from_backup.sql ==========
-- РќР°С‡Р°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ РёР· Р±СЌРєР°РїР° db_cluster-09-12-2025 (public schema)
-- Р’С‹РїРѕР»РЅСЏС‚СЊ РїРѕСЃР»Рµ 004

INSERT INTO themes (name, display_name, colors, effects) VALUES
  ('default', 'РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ', '{"primary":"#8b5cf6","secondary":"#ec4899","background":"#f3f4f6"}'::jsonb, '{}'::jsonb),
  ('new-year', 'РќРѕРІС‹Р№ РіРѕРґ', '{"primary":"#dc2626","secondary":"#16a34a","background":"#1e293b"}'::jsonb, '{"snow":true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (key, value, description, category) VALUES
  ('quest_title', 'РРЅС‚РµСЂР°РєС‚РёРІРЅС‹Р№ РљРІРµСЃС‚', 'Р—Р°РіРѕР»РѕРІРѕРє РЅР° РіР»Р°РІРЅРѕР№', 'РљРІРµСЃС‚'),
  ('quest_subtitle', 'Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ РІ РёРіСЂСѓ', 'РџРѕРґР·Р°РіРѕР»РѕРІРѕРє РЅР° РіР»Р°РІРЅРѕР№', 'РљРІРµСЃС‚'),
  ('quest_logo_url', '', 'URL Р»РѕРіРѕС‚РёРїР°', 'РљРІРµСЃС‚')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

INSERT INTO games (
  id, code, title, password, settings, created_at, updated_at,
  mask_board, theme, total_time_sec, per_question_time_sec, scoring, finish_page_type
) VALUES (
  '34835359-82e0-4e1b-94cf-83c0deae6628',
  'QYA0E2',
  'РќРѕРІР°СЏ РёРіСЂР°',
  NULL,
  '{}'::jsonb,
  '2025-11-26 12:07:28.82649+00',
  '2025-11-26 12:07:28.82649+00',
  false,
  'new-year',
  1800,
  120,
  '{"k_diff":1,"k_fast":1.2,"k_skip":0.8,"k_time":0.5,"p_base":100,"combo_bonus":10}'::jsonb,
  'scoreboard'
)
ON CONFLICT (code) DO NOTHING;


