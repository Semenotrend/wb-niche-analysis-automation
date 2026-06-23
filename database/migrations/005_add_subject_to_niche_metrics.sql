ALTER TABLE wb_analytics.niche_metrics
  ADD COLUMN IF NOT EXISTS subject_name text,
  ADD COLUMN IF NOT EXISTS wb_subject_id integer;

UPDATE wb_analytics.niche_metrics AS metrics
SET
  subject_name = snapshots.subject_name,
  wb_subject_id = snapshots.wb_subject_id
FROM wb_analytics.niche_snapshots AS snapshots
WHERE metrics.snapshot_id = snapshots.snapshot_id
  AND (
    metrics.subject_name IS NULL
    OR metrics.wb_subject_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_niche_metrics_subject
  ON wb_analytics.niche_metrics(subject_name, wb_subject_id);
