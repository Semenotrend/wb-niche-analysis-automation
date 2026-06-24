DROP TABLE IF EXISTS wb_analytics.compare_card_report_metrics;

ALTER TABLE wb_analytics.compare_card_reports
  DROP COLUMN IF EXISTS opened_url;

ALTER TABLE wb_analytics.compare_card_report_items
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS hover_payload;
