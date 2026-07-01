#!/usr/bin/env python3
"""Rank products by reviews, sales trend, clicks, order conversion, and buyout."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2


DB_URL = "postgresql://wb_niche:wb_niche_local@127.0.0.1:7777/wb_niche_analysis"
INPUT_CSV = Path("reports/low_review_sales_trend_2026-06-29.csv")
OPPORTUNITY_CSV = Path(
    "reports/reviews_trend_clicks_conversion_buyout_opportunity_2026-06-29.csv"
)
MARKET_STRENGTH_CSV = Path(
    "reports/reviews_trend_clicks_conversion_buyout_market_strength_2026-06-29.csv"
)


def pct_high(series: pd.Series) -> pd.Series:
    return series.rank(pct=True, ascending=True, method="average")


def pct_low(series: pd.Series) -> pd.Series:
    return series.rank(pct=True, ascending=False, method="average")


def read_recent_clicks() -> pd.DataFrame:
    query = """
      SELECT
        d.nm_id::bigint,
        d.metric_date,
        MAX(d.value_numeric) FILTER (WHERE d.metric_name = 'Переходы в карточку')::float8 AS clicks,
        MAX(d.value_numeric) FILTER (WHERE d.metric_name = 'Заказы')::float8 AS orders,
        MAX(d.value_numeric) FILTER (WHERE d.metric_name = 'Выкупы')::float8 AS buyouts
      FROM wb_analytics.compare_card_report_chart_daily AS d
      JOIN (
        SELECT DISTINCT nm_id
        FROM wb_analytics.compare_card_recommendations
        WHERE subject_name = 'Блендеры'
      ) AS b
        ON b.nm_id = d.nm_id
      WHERE d.metric_name IN ('Переходы в карточку', 'Заказы', 'Выкупы')
      GROUP BY d.nm_id, d.metric_date
      ORDER BY d.nm_id, d.metric_date
    """

    with psycopg2.connect(DB_URL) as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            columns = [description.name for description in cursor.description]
            frame = pd.DataFrame(cursor.fetchall(), columns=columns)

    frame["metric_date"] = pd.to_datetime(frame["metric_date"])
    return frame


def build_recent_features(daily: pd.DataFrame) -> pd.DataFrame:
    max_date = daily["metric_date"].max()
    recent14_start = max_date - pd.Timedelta(days=13)
    prev14_start = max_date - pd.Timedelta(days=27)
    rows: list[dict[str, object]] = []

    for nm_id, group in daily.groupby("nm_id"):
        recent14 = group[group["metric_date"] >= recent14_start]
        prev14 = group[
            (group["metric_date"] >= prev14_start) & (group["metric_date"] < recent14_start)
        ]

        recent14_clicks = float(recent14["clicks"].sum(skipna=True))
        prev14_clicks = float(prev14["clicks"].sum(skipna=True))
        recent14_orders = float(recent14["orders"].sum(skipna=True))
        recent14_buyouts = float(recent14["buyouts"].sum(skipna=True))
        recent14_order_conversion = (
            recent14_orders / recent14_clicks * 100 if recent14_clicks else np.nan
        )
        recent14_buyout_rate = (
            recent14_buyouts / recent14_orders * 100 if recent14_orders else np.nan
        )
        clicks_growth_14d_pct = (
            (recent14_clicks / prev14_clicks - 1) * 100 if prev14_clicks else np.nan
        )

        rows.append(
            {
                "nm_id": int(nm_id),
                "recent14_clicks": recent14_clicks,
                "prev14_clicks": prev14_clicks,
                "clicks_growth_14d_pct": clicks_growth_14d_pct,
                "recent14_order_conversion": recent14_order_conversion,
                "recent14_buyout_rate": recent14_buyout_rate,
            }
        )

    return pd.DataFrame(rows)


def main() -> None:
    ranking = pd.read_csv(INPUT_CSV)
    recent = build_recent_features(read_recent_clicks())
    frame = ranking.merge(recent, on="nm_id", how="left")

    available_reviews = frame["reviews_count"].notna()
    frame["reviews_barrier_component"] = 0.0
    frame.loc[available_reviews, "reviews_barrier_component"] = pct_low(
        frame.loc[available_reviews, "reviews_count"]
    )
    frame["reviews_trust_component"] = 0.0
    frame.loc[available_reviews, "reviews_trust_component"] = pct_high(
        frame.loc[available_reviews, "reviews_count"]
    )

    growth14 = frame["db_orders_growth_14d_pct"].replace([np.inf, -np.inf], np.nan)
    growth7 = frame["db_orders_growth_7d_pct"].replace([np.inf, -np.inf], np.nan)
    click_growth = frame["clicks_growth_14d_pct"].replace([np.inf, -np.inf], np.nan)
    frame["trend_component"] = (
        0.45 * pct_high(growth14)
        + 0.25 * pct_high(growth7)
        + 0.20 * pct_high(frame["db_orders_slope_last28_per_day"])
        + 0.10 * pct_high(click_growth)
    )
    frame["clicks_component"] = (
        0.60 * pct_high(frame["recent14_clicks"])
        + 0.25 * pct_high(frame["db_clicks_total"])
        + 0.15 * pct_high(click_growth)
    )
    frame["order_conversion_component"] = (
        0.60 * pct_high(frame["recent14_order_conversion"])
        + 0.40 * pct_high(frame["db_order_conversion_from_clicks"])
    )
    frame["buyout_component"] = (
        0.60 * pct_high(frame["recent14_buyout_rate"])
        + 0.25 * pct_high(frame["db_buyouts_total"])
        + 0.15 * pct_high(frame["db_buyout_revenue_total"])
    )

    frame["rtccb_opportunity_score"] = 100 * (
        0.20 * frame["reviews_barrier_component"]
        + 0.25 * frame["trend_component"]
        + 0.20 * frame["clicks_component"]
        + 0.20 * frame["order_conversion_component"]
        + 0.15 * frame["buyout_component"]
    )
    frame["rtccb_market_strength_score"] = 100 * (
        0.20 * frame["reviews_trust_component"]
        + 0.25 * frame["trend_component"]
        + 0.20 * frame["clicks_component"]
        + 0.20 * frame["order_conversion_component"]
        + 0.15 * frame["buyout_component"]
    )
    frame.loc[~available_reviews, "rtccb_opportunity_score"] = np.nan
    frame.loc[~available_reviews, "rtccb_market_strength_score"] = np.nan
    frame["rtccb_opportunity_rank"] = frame["rtccb_opportunity_score"].rank(
        method="first", ascending=False
    )
    frame["rtccb_market_strength_rank"] = frame["rtccb_market_strength_score"].rank(
        method="first", ascending=False
    )

    columns = [
        "rtccb_opportunity_rank",
        "rtccb_opportunity_score",
        "rtccb_market_strength_rank",
        "rtccb_market_strength_score",
        "nm_id",
        "product_url",
        "reviews_count",
        "reviews_status",
        "wb_product_name",
        "wb_brand",
        "review_rating",
        "sales_trend_label",
        "reviews_barrier_component",
        "reviews_trust_component",
        "trend_component",
        "clicks_component",
        "order_conversion_component",
        "buyout_component",
        "db_recent14_orders",
        "db_prev14_orders",
        "db_orders_growth_14d_pct",
        "db_orders_growth_7d_pct",
        "db_orders_slope_last28_per_day",
        "recent14_clicks",
        "prev14_clicks",
        "clicks_growth_14d_pct",
        "db_clicks_total",
        "db_order_conversion_from_clicks",
        "recent14_order_conversion",
        "db_buyouts_total",
        "db_buyout_revenue_total",
        "recent14_buyout_rate",
        "db_orders_total",
        "db_order_revenue_total",
        "novelty_relevance_score",
        "reviews_fetched_at",
        "reviews_source",
    ]
    opportunity = (
        frame[columns]
        .sort_values("rtccb_opportunity_rank", na_position="last")
        .reset_index(drop=True)
    )
    market = (
        frame[columns]
        .sort_values("rtccb_market_strength_rank", na_position="last")
        .reset_index(drop=True)
    )
    opportunity.to_csv(OPPORTUNITY_CSV, index=False)
    market.to_csv(MARKET_STRENGTH_CSV, index=False)

    print(f"wrote {OPPORTUNITY_CSV}")
    print(f"wrote {MARKET_STRENGTH_CSV}")
    print(
        f"rows={len(frame)} ranked={frame['rtccb_opportunity_score'].notna().sum()} "
        f"missing_reviews={frame['rtccb_opportunity_score'].isna().sum()}"
    )
    print("\nOPPORTUNITY TOP")
    print(
        opportunity.head(15)[
            [
                "rtccb_opportunity_rank",
                "rtccb_opportunity_score",
                "nm_id",
                "reviews_count",
                "wb_product_name",
                "sales_trend_label",
                "db_recent14_orders",
                "db_orders_growth_14d_pct",
                "recent14_clicks",
                "db_order_conversion_from_clicks",
                "recent14_buyout_rate",
            ]
        ].to_string(index=False)
    )
    print("\nMARKET STRENGTH TOP")
    print(
        market.head(15)[
            [
                "rtccb_market_strength_rank",
                "rtccb_market_strength_score",
                "nm_id",
                "reviews_count",
                "wb_product_name",
                "sales_trend_label",
                "db_recent14_orders",
                "db_orders_growth_14d_pct",
                "recent14_clicks",
                "db_order_conversion_from_clicks",
                "recent14_buyout_rate",
            ]
        ].to_string(index=False)
    )


if __name__ == "__main__":
    main()
