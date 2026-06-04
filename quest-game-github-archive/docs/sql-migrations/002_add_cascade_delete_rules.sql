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