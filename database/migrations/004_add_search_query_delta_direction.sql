ALTER TABLE wb_analytics.niche_search_queries
  ADD COLUMN IF NOT EXISTS cart_conversion_delta_direction text,
  ADD COLUMN IF NOT EXISTS order_conversion_delta_direction text;
