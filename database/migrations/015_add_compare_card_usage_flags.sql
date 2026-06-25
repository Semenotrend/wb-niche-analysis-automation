CREATE TABLE IF NOT EXISTS wb_analytics.compare_card_comparison_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES automation.runs(run_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'submitted',
  selected_count integer NOT NULL,
  source_url text NOT NULL,
  submitted_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('submitted', 'failed')),
  CHECK (selected_count > 0)
);

ALTER TABLE wb_analytics.compare_card_recommendations
  ADD COLUMN IF NOT EXISTS used_for_comparison boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comparison_request_id uuid
    REFERENCES wb_analytics.compare_card_comparison_requests(request_id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comparison_slot integer,
  ADD COLUMN IF NOT EXISTS used_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compare_card_recommendations_comparison_slot_check'
      AND conrelid = 'wb_analytics.compare_card_recommendations'::regclass
  ) THEN
    ALTER TABLE wb_analytics.compare_card_recommendations
      ADD CONSTRAINT compare_card_recommendations_comparison_slot_check
      CHECK (comparison_slot IS NULL OR comparison_slot > 0) NOT VALID;
  END IF;
END $$;

ALTER TABLE wb_analytics.compare_card_recommendations
  VALIDATE CONSTRAINT compare_card_recommendations_comparison_slot_check;

CREATE INDEX IF NOT EXISTS idx_compare_card_requests_run_id
  ON wb_analytics.compare_card_comparison_requests(run_id);

CREATE INDEX IF NOT EXISTS idx_compare_card_recommendations_unused
  ON wb_analytics.compare_card_recommendations(run_id, rank_position)
  WHERE used_for_comparison = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_compare_card_recommendations_request_slot
  ON wb_analytics.compare_card_recommendations(comparison_request_id, comparison_slot)
  WHERE comparison_request_id IS NOT NULL AND comparison_slot IS NOT NULL;
