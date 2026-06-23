CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS automation;
CREATE SCHEMA IF NOT EXISTS wb_analytics;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'automation_run_status') THEN
    CREATE TYPE automation.automation_run_status AS ENUM ('running', 'success', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'automation_step_status') THEN
    CREATE TYPE automation.automation_step_status AS ENUM ('start', 'success', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
    CREATE TYPE automation.incident_type AS ENUM (
      'auth_expired',
      'captcha',
      'selector_changed',
      'popup_blocking',
      'timeout',
      'business_limit',
      'empty_result',
      'invalid_niche_url',
      'schema_changed',
      'unknown_screen'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS automation.runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name text NOT NULL DEFAULT 'compare_cards',
  scenario_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  runtime_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status automation.automation_run_status NOT NULL DEFAULT 'running',
  incident_type automation.incident_type,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation.step_logs (
  step_log_id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES automation.runs(run_id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  step_total integer NOT NULL,
  step_name text NOT NULL,
  status automation.automation_step_status NOT NULL,
  incident_type automation.incident_type,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  error_message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_index, status)
);

CREATE TABLE IF NOT EXISTS wb_analytics.niche_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES automation.runs(run_id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT current_date,
  category_name text NOT NULL,
  subject_name text NOT NULL,
  wb_subject_id integer,
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  comparison_start date,
  comparison_end date,
  source_url text NOT NULL,
  parser_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, category_name, subject_name, period_type, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS wb_analytics.niche_metrics (
  metric_id bigserial PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES wb_analytics.niche_snapshots(snapshot_id) ON DELETE CASCADE,
  subject_name text,
  wb_subject_id integer,
  metric_code text NOT NULL,
  metric_name text NOT NULL,
  value_numeric numeric,
  value_text text,
  unit text,
  delta_value numeric,
  delta_unit text,
  delta_direction text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, metric_code)
);

CREATE TABLE IF NOT EXISTS wb_analytics.niche_search_queries (
  query_id bigserial PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES wb_analytics.niche_snapshots(snapshot_id) ON DELETE CASCADE,
  rank_position integer NOT NULL,
  query_text text NOT NULL,
  query_count integer,
  cart_conversion_pct numeric,
  cart_conversion_delta_pct numeric,
  cart_conversion_delta_direction text,
  order_conversion_pct numeric,
  order_conversion_delta_pct numeric,
  order_conversion_delta_direction text,
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, rank_position),
  UNIQUE (snapshot_id, query_text)
);

CREATE TABLE IF NOT EXISTS wb_analytics.niche_dynamics_daily (
  dynamic_id bigserial PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES wb_analytics.niche_snapshots(snapshot_id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  orders_qty integer,
  buyouts_qty integer,
  cards_qty integer,
  sellers_qty integer,
  brands_qty integer,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_step_logs_run_id ON automation.step_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_step_logs_step_name ON automation.step_logs(step_name);
CREATE INDEX IF NOT EXISTS idx_niche_snapshots_run_id ON wb_analytics.niche_snapshots(run_id);
CREATE INDEX IF NOT EXISTS idx_niche_snapshots_subject ON wb_analytics.niche_snapshots(subject_name);
CREATE INDEX IF NOT EXISTS idx_niche_snapshots_snapshot_date ON wb_analytics.niche_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_niche_metrics_snapshot_id ON wb_analytics.niche_metrics(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_niche_metrics_code ON wb_analytics.niche_metrics(metric_code);
CREATE INDEX IF NOT EXISTS idx_niche_metrics_subject ON wb_analytics.niche_metrics(subject_name, wb_subject_id);
CREATE INDEX IF NOT EXISTS idx_niche_search_queries_snapshot_id ON wb_analytics.niche_search_queries(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_niche_search_queries_text ON wb_analytics.niche_search_queries(query_text);
