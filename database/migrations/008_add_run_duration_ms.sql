ALTER TABLE automation.runs
  ADD COLUMN IF NOT EXISTS duration_ms integer;
