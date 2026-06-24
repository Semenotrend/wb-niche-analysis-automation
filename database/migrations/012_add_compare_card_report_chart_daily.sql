CREATE TABLE IF NOT EXISTS wb_analytics.compare_card_report_chart_daily (
  chart_point_id bigserial PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES wb_analytics.compare_card_reports(report_id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  period_type text NOT NULL,
  granularity text NOT NULL,
  nm_id bigint NOT NULL,
  metric_date date NOT NULL,
  value_numeric numeric NOT NULL,
  unit text,
  source text NOT NULL,
  stroke_color text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, metric_name, period_type, granularity, nm_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_compare_card_report_chart_daily_report_id
  ON wb_analytics.compare_card_report_chart_daily(report_id);

CREATE INDEX IF NOT EXISTS idx_compare_card_report_chart_daily_nm_date
  ON wb_analytics.compare_card_report_chart_daily(nm_id, metric_date);
