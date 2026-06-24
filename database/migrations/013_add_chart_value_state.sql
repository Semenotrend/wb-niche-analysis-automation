ALTER TABLE wb_analytics.compare_card_report_chart_daily
  ALTER COLUMN value_numeric DROP NOT NULL;

ALTER TABLE wb_analytics.compare_card_report_chart_daily
  ADD COLUMN IF NOT EXISTS value_state text NOT NULL DEFAULT 'estimated',
  ADD COLUMN IF NOT EXISTS is_baseline_zero boolean NOT NULL DEFAULT false;

UPDATE wb_analytics.compare_card_report_chart_daily
SET
  is_baseline_zero = true,
  value_state = CASE
    WHEN metric_name IN ('Медианная цена покупателя', 'Средняя позиция')
      THEN 'missing_rendered_as_zero'
    ELSE 'zero'
  END,
  value_numeric = CASE
    WHEN metric_name IN ('Медианная цена покупателя', 'Средняя позиция')
      THEN NULL
    ELSE value_numeric
  END
WHERE value_numeric = 0;

UPDATE wb_analytics.compare_card_report_chart_daily
SET value_state = 'estimated'
WHERE value_numeric IS NOT NULL
  AND is_baseline_zero = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compare_card_report_chart_daily_value_state_check'
      AND conrelid = 'wb_analytics.compare_card_report_chart_daily'::regclass
  ) THEN
    ALTER TABLE wb_analytics.compare_card_report_chart_daily
      ADD CONSTRAINT compare_card_report_chart_daily_value_state_check
      CHECK (value_state IN ('estimated', 'zero', 'missing_rendered_as_zero'));
  END IF;
END $$;
