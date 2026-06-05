-- IMP-DATA-001: архив завершённых заездов (снимок табло + CSV)

CREATE TABLE IF NOT EXISTS event_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  game_code TEXT,
  game_title TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  team_count INT NOT NULL DEFAULT 0,
  question_count INT NOT NULL DEFAULT 0,
  answer_count INT NOT NULL DEFAULT 0,
  teams_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  csv_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_archive_game_id ON event_archive(game_id);
CREATE INDEX IF NOT EXISTS idx_event_archive_finished_at ON event_archive(finished_at DESC);

ALTER TABLE event_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_archive_authenticated_all ON event_archive;
CREATE POLICY event_archive_authenticated_all ON event_archive
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
