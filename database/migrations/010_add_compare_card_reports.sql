CREATE TABLE IF NOT EXISTS wb_analytics.compare_card_reports (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES automation.runs(run_id) ON DELETE CASCADE,
  list_rank integer NOT NULL,
  comparison_date date,
  comparison_date_text text,
  available_until_text text NOT NULL,
  available_until_at timestamptz,
  cards_count integer NOT NULL,
  source_url text NOT NULL,
  report_fingerprint text NOT NULL,
  raw_text text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  parser_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (list_rank > 0),
  CHECK (cards_count >= 0),
  UNIQUE (run_id, list_rank),
  UNIQUE (run_id, report_fingerprint)
);

CREATE TABLE IF NOT EXISTS wb_analytics.compare_card_report_items (
  item_id bigserial PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES wb_analytics.compare_card_reports(report_id) ON DELETE CASCADE,
  slot_position integer NOT NULL,
  nm_id bigint,
  product_name text,
  product_url text,
  image_url text,
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slot_position > 0),
  UNIQUE (report_id, slot_position)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compare_card_report_items_report_nm_id
  ON wb_analytics.compare_card_report_items(report_id, nm_id)
  WHERE nm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compare_card_reports_run_id
  ON wb_analytics.compare_card_reports(run_id);

CREATE INDEX IF NOT EXISTS idx_compare_card_reports_available_until
  ON wb_analytics.compare_card_reports(available_until_at);

CREATE INDEX IF NOT EXISTS idx_compare_card_report_items_nm_id
  ON wb_analytics.compare_card_report_items(nm_id);
