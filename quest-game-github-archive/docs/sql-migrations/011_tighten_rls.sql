-- IMP-SEC-001: админ (authenticated) — полный доступ; anon — только игровой поток
-- Идемпотентно: DROP IF EXISTS перед CREATE (повторный прогон / дрейф журнала).

-- games
DROP POLICY IF EXISTS "Allow all operations on games" ON games;
DROP POLICY IF EXISTS "games_authenticated_all" ON games;
DROP POLICY IF EXISTS "games_anon_select" ON games;
CREATE POLICY "games_authenticated_all" ON games FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "games_anon_select" ON games FOR SELECT TO anon USING (true);

-- questions
DROP POLICY IF EXISTS "Allow all operations on questions" ON questions;
DROP POLICY IF EXISTS "questions_authenticated_all" ON questions;
DROP POLICY IF EXISTS "questions_anon_select" ON questions;
CREATE POLICY "questions_authenticated_all" ON questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "questions_anon_select" ON questions FOR SELECT TO anon USING (true);

-- teams
DROP POLICY IF EXISTS "Allow all operations on teams" ON teams;
DROP POLICY IF EXISTS "teams_authenticated_all" ON teams;
DROP POLICY IF EXISTS "teams_anon_select" ON teams;
DROP POLICY IF EXISTS "teams_anon_insert" ON teams;
DROP POLICY IF EXISTS "teams_anon_update" ON teams;
CREATE POLICY "teams_authenticated_all" ON teams FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "teams_anon_select" ON teams FOR SELECT TO anon USING (true);
CREATE POLICY "teams_anon_insert" ON teams FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "teams_anon_update" ON teams FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- answers
DROP POLICY IF EXISTS "Allow all operations on answers" ON answers;
DROP POLICY IF EXISTS "answers_authenticated_all" ON answers;
DROP POLICY IF EXISTS "answers_anon_select" ON answers;
DROP POLICY IF EXISTS "answers_anon_insert" ON answers;
DROP POLICY IF EXISTS "answers_anon_update" ON answers;
CREATE POLICY "answers_authenticated_all" ON answers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "answers_anon_select" ON answers FOR SELECT TO anon USING (true);
CREATE POLICY "answers_anon_insert" ON answers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "answers_anon_update" ON answers FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- players (legacy table, не используется клиентом — read для anon)
DROP POLICY IF EXISTS "Allow all operations on players" ON players;
DROP POLICY IF EXISTS "players_authenticated_all" ON players;
DROP POLICY IF EXISTS "players_anon_select" ON players;
CREATE POLICY "players_authenticated_all" ON players FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "players_anon_select" ON players FOR SELECT TO anon USING (true);

-- game_state
DROP POLICY IF EXISTS "Allow all operations on game_state" ON game_state;
DROP POLICY IF EXISTS "game_state_authenticated_all" ON game_state;
DROP POLICY IF EXISTS "game_state_anon_select" ON game_state;
CREATE POLICY "game_state_authenticated_all" ON game_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "game_state_anon_select" ON game_state FOR SELECT TO anon USING (true);

-- team_scores
DROP POLICY IF EXISTS "Allow all operations on team_scores" ON team_scores;
DROP POLICY IF EXISTS "team_scores_authenticated_all" ON team_scores;
DROP POLICY IF EXISTS "team_scores_anon_select" ON team_scores;
DROP POLICY IF EXISTS "team_scores_anon_insert" ON team_scores;
DROP POLICY IF EXISTS "team_scores_anon_update" ON team_scores;
CREATE POLICY "team_scores_authenticated_all" ON team_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_scores_anon_select" ON team_scores FOR SELECT TO anon USING (true);
CREATE POLICY "team_scores_anon_insert" ON team_scores FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "team_scores_anon_update" ON team_scores FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- messages
DROP POLICY IF EXISTS "Allow all operations on messages" ON messages;
DROP POLICY IF EXISTS "messages_authenticated_all" ON messages;
DROP POLICY IF EXISTS "messages_anon_select" ON messages;
CREATE POLICY "messages_authenticated_all" ON messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "messages_anon_select" ON messages FOR SELECT TO anon USING (true);

-- message_recipients
DROP POLICY IF EXISTS "Allow all operations on message_recipients" ON message_recipients;
DROP POLICY IF EXISTS "message_recipients_authenticated_all" ON message_recipients;
DROP POLICY IF EXISTS "message_recipients_anon_select" ON message_recipients;
CREATE POLICY "message_recipients_authenticated_all" ON message_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "message_recipients_anon_select" ON message_recipients FOR SELECT TO anon USING (true);

-- message_reads
DROP POLICY IF EXISTS "Allow all operations on message_reads" ON message_reads;
DROP POLICY IF EXISTS "message_reads_authenticated_all" ON message_reads;
DROP POLICY IF EXISTS "message_reads_anon_insert" ON message_reads;
DROP POLICY IF EXISTS "message_reads_anon_select" ON message_reads;
CREATE POLICY "message_reads_authenticated_all" ON message_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "message_reads_anon_select" ON message_reads FOR SELECT TO anon USING (true);
CREATE POLICY "message_reads_anon_insert" ON message_reads FOR INSERT TO anon WITH CHECK (true);

-- settings / themes
DROP POLICY IF EXISTS "Allow all operations on settings" ON settings;
DROP POLICY IF EXISTS "settings_authenticated_all" ON settings;
DROP POLICY IF EXISTS "settings_anon_select" ON settings;
CREATE POLICY "settings_authenticated_all" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "settings_anon_select" ON settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow all operations on themes" ON themes;
DROP POLICY IF EXISTS "themes_authenticated_all" ON themes;
DROP POLICY IF EXISTS "themes_anon_select" ON themes;
CREATE POLICY "themes_authenticated_all" ON themes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "themes_anon_select" ON themes FOR SELECT TO anon USING (true);
