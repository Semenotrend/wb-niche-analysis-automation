CREATE TABLE IF NOT EXISTS wb_analytics.compare_card_recommendations (
  recommendation_id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES automation.runs(run_id) ON DELETE CASCADE,
  rank_position integer NOT NULL,
  nm_id bigint NOT NULL,
  subject_name text NOT NULL,
  top_by text NOT NULL,
  source_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rank_position BETWEEN 1 AND 50),
  UNIQUE (run_id, rank_position),
  UNIQUE (run_id, nm_id)
);

CREATE INDEX IF NOT EXISTS idx_compare_card_recommendations_run_id
  ON wb_analytics.compare_card_recommendations(run_id);

CREATE INDEX IF NOT EXISTS idx_compare_card_recommendations_nm_id
  ON wb_analytics.compare_card_recommendations(nm_id);

CREATE INDEX IF NOT EXISTS idx_compare_card_recommendations_subject
  ON wb_analytics.compare_card_recommendations(subject_name, top_by);
