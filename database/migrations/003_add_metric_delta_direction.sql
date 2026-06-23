ALTER TABLE wb_analytics.niche_metrics
  ADD COLUMN IF NOT EXISTS delta_direction text;
