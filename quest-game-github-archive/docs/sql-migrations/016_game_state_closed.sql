-- Default game state: closed (admin must open lobby before registration).
ALTER TABLE game_state ALTER COLUMN current_state SET DEFAULT 'closed';

-- Migrate all existing sessions to closed (per product requirement).
UPDATE game_state SET current_state = 'closed', updated_at = NOW()
WHERE current_state IS DISTINCT FROM 'closed';
