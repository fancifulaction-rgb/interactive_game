-- S3 / legacy RLS: на БД, где применили 001 но не 011, остаётся
-- «Allow all operations on *» (роль PUBLIC) — anon может UPDATE teams и т.д.
-- 018 снимает только teams_anon_* , но не legacy-политику.

DROP POLICY IF EXISTS "Allow all operations on games" ON games;
DROP POLICY IF EXISTS "Allow all operations on teams" ON teams;
DROP POLICY IF EXISTS "Allow all operations on answers" ON answers;
DROP POLICY IF EXISTS "Allow all operations on questions" ON questions;
DROP POLICY IF EXISTS "Allow all operations on players" ON players;
DROP POLICY IF EXISTS "Allow all operations on game_state" ON game_state;
DROP POLICY IF EXISTS "Allow all operations on team_scores" ON team_scores;
DROP POLICY IF EXISTS "Allow all operations on messages" ON messages;
DROP POLICY IF EXISTS "Allow all operations on message_recipients" ON message_recipients;
DROP POLICY IF EXISTS "Allow all operations on message_reads" ON message_reads;
DROP POLICY IF EXISTS "Allow all operations on settings" ON settings;
DROP POLICY IF EXISTS "Allow all operations on themes" ON themes;

-- Повтор 018: anon не пишет в teams/answers напрямую
DROP POLICY IF EXISTS "teams_anon_insert" ON teams;
DROP POLICY IF EXISTS "teams_anon_update" ON teams;
DROP POLICY IF EXISTS "answers_anon_insert" ON answers;
DROP POLICY IF EXISTS "answers_anon_update" ON answers;
DROP POLICY IF EXISTS "answers_anon_select" ON answers;
DROP POLICY IF EXISTS "team_scores_anon_insert" ON team_scores;
DROP POLICY IF EXISTS "team_scores_anon_update" ON team_scores;

-- Минимальные anon SELECT (если 011 не применялась)
DROP POLICY IF EXISTS "games_anon_select" ON games;
CREATE POLICY "games_anon_select" ON games FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "questions_anon_select" ON questions;
CREATE POLICY "questions_anon_select" ON questions FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "teams_anon_select" ON teams;
CREATE POLICY "teams_anon_select" ON teams FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "game_state_anon_select" ON game_state;
CREATE POLICY "game_state_anon_select" ON game_state FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "messages_anon_select" ON messages;
CREATE POLICY "messages_anon_select" ON messages FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "message_recipients_anon_select" ON message_recipients;
CREATE POLICY "message_recipients_anon_select" ON message_recipients FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "message_reads_anon_select" ON message_reads;
CREATE POLICY "message_reads_anon_select" ON message_reads FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "settings_anon_select" ON settings;
CREATE POLICY "settings_anon_select" ON settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "themes_anon_select" ON themes;
CREATE POLICY "themes_anon_select" ON themes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "team_scores_anon_select" ON team_scores;
CREATE POLICY "team_scores_anon_select" ON team_scores FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "players_anon_select" ON players;
CREATE POLICY "players_anon_select" ON players FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "message_reads_anon_insert" ON message_reads;
CREATE POLICY "message_reads_anon_insert" ON message_reads FOR INSERT TO anon WITH CHECK (true);
