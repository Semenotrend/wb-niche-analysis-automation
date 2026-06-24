ALTER TABLE wb_analytics.compare_card_report_chart_daily
  DROP CONSTRAINT IF EXISTS compare_card_report_chart_daily_value_state_check;

ALTER TABLE wb_analytics.compare_card_report_chart_daily
  ADD CONSTRAINT compare_card_report_chart_daily_value_state_check
  CHECK (value_state IN (
    'actual',
    'estimated',
    'zero',
    'missing',
    'missing_rendered_as_zero'
  ));
