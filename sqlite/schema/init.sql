PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '1')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

CREATE TABLE IF NOT EXISTS automation_runs (
  run_id TEXT PRIMARY KEY,
  scenario_name TEXT NOT NULL DEFAULT 'compare_cards',
  scenario_config TEXT NOT NULL DEFAULT '{}',
  runtime_config TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed')),
  incident_type TEXT
    CHECK (
      incident_type IS NULL OR incident_type IN (
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
      )
    ),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_step_logs (
  step_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES automation_runs(run_id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_total INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('start', 'success', 'failed')),
  incident_type TEXT
    CHECK (
      incident_type IS NULL OR incident_type IN (
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
      )
    ),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (run_id, step_index, status)
);

CREATE TABLE IF NOT EXISTS wb_niche_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES automation_runs(run_id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL DEFAULT (date('now')),
  category_name TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  wb_subject_id INTEGER,
  period_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  comparison_start TEXT,
  comparison_end TEXT,
  source_url TEXT NOT NULL,
  parser_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (
    snapshot_date,
    category_name,
    subject_name,
    period_type,
    period_start,
    period_end
  )
);

CREATE TABLE IF NOT EXISTS wb_niche_metrics (
  metric_id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES wb_niche_snapshots(snapshot_id) ON DELETE CASCADE,
  subject_name TEXT,
  wb_subject_id INTEGER,
  metric_code TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value_numeric REAL,
  value_text TEXT,
  unit TEXT,
  delta_value REAL,
  delta_unit TEXT,
  delta_direction TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (snapshot_id, metric_code)
);

CREATE TABLE IF NOT EXISTS wb_niche_search_queries (
  query_id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES wb_niche_snapshots(snapshot_id) ON DELETE CASCADE,
  rank_position INTEGER NOT NULL,
  query_text TEXT NOT NULL,
  query_count INTEGER,
  cart_conversion_pct REAL,
  cart_conversion_delta_pct REAL,
  cart_conversion_delta_direction TEXT,
  order_conversion_pct REAL,
  order_conversion_delta_pct REAL,
  order_conversion_delta_direction TEXT,
  raw_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (snapshot_id, rank_position),
  UNIQUE (snapshot_id, query_text)
);

CREATE TABLE IF NOT EXISTS wb_niche_dynamics_daily (
  dynamic_id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES wb_niche_snapshots(snapshot_id) ON DELETE CASCADE,
  metric_date TEXT NOT NULL,
  orders_qty INTEGER,
  buyouts_qty INTEGER,
  cards_qty INTEGER,
  sellers_qty INTEGER,
  brands_qty INTEGER,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (snapshot_id, metric_date)
);

CREATE TABLE IF NOT EXISTS wb_compare_card_recommendations (
  recommendation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES automation_runs(run_id) ON DELETE CASCADE,
  rank_position INTEGER NOT NULL CHECK (rank_position BETWEEN 1 AND 50),
  nm_id INTEGER NOT NULL,
  subject_name TEXT NOT NULL,
  top_by TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (run_id, rank_position),
  UNIQUE (run_id, nm_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_step_logs_run_id
  ON automation_step_logs(run_id);

CREATE INDEX IF NOT EXISTS idx_automation_step_logs_step_name
  ON automation_step_logs(step_name);

CREATE INDEX IF NOT EXISTS idx_wb_niche_snapshots_run_id
  ON wb_niche_snapshots(run_id);

CREATE INDEX IF NOT EXISTS idx_wb_niche_snapshots_subject
  ON wb_niche_snapshots(subject_name);

CREATE INDEX IF NOT EXISTS idx_wb_niche_snapshots_snapshot_date
  ON wb_niche_snapshots(snapshot_date);

CREATE INDEX IF NOT EXISTS idx_wb_niche_metrics_snapshot_id
  ON wb_niche_metrics(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_wb_niche_metrics_code
  ON wb_niche_metrics(metric_code);

CREATE INDEX IF NOT EXISTS idx_wb_niche_metrics_subject
  ON wb_niche_metrics(subject_name, wb_subject_id);

CREATE INDEX IF NOT EXISTS idx_wb_niche_search_queries_snapshot_id
  ON wb_niche_search_queries(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_wb_niche_search_queries_text
  ON wb_niche_search_queries(query_text);

CREATE INDEX IF NOT EXISTS idx_wb_compare_card_recommendations_run_id
  ON wb_compare_card_recommendations(run_id);

CREATE INDEX IF NOT EXISTS idx_wb_compare_card_recommendations_nm_id
  ON wb_compare_card_recommendations(nm_id);

CREATE INDEX IF NOT EXISTS idx_wb_compare_card_recommendations_subject
  ON wb_compare_card_recommendations(subject_name, top_by);
