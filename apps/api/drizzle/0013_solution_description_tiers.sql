-- Add three-tier description system to solutions
ALTER TABLE solutions ADD COLUMN long_description TEXT;
ALTER TABLE solutions ADD COLUMN agent_description TEXT;
