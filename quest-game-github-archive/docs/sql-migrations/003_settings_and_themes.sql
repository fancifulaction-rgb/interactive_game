-- 1. ТАБЛИЦА НАСТРОЕК (SETTINGS)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    category TEXT
);

-- 2. ТАБЛИЦА ТЕМ (THEMES)
CREATE TABLE IF NOT EXISTS themes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    colors JSONB NOT NULL,
    effects JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Вставка дефолтных настроек
INSERT INTO settings (key, value, description, category) VALUES
('quest_title', 'Интерактивный Квест', 'Заголовок на главной', 'Квест'),
('quest_subtitle', 'Добро пожаловать в игру', 'Подзаголовок на главной', 'Квест'),
('quest_logo_url', '', 'URL логотипа', 'Квест')
ON CONFLICT (key) DO NOTHING;

