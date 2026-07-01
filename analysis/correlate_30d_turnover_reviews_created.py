#!/usr/bin/env python3
"""Correlate 30-day turnover with reviews and card creation age."""

from __future__ import annotations

import csv
import io
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from scipy import stats


DATABASE_URL = "postgresql://wb_niche:wb_niche_local@127.0.0.1:7777/wb_niche_analysis"
SOURCE_CSV = Path("reports/novelty_recommendation_radar_2026-06-29.csv")
MATRIX_CSV = Path("reports/new_product_matrix_ranking_2026-06-29.csv")
OUT_CSV = Path("reports/turnover_30d_reviews_created_correlation_2026-06-29.csv")
OUT_MD = Path("reports/turnover_30d_reviews_created_correlation_2026-06-29.md")


QUERY = r"""
WITH bounds AS (
  SELECT
    MAX(metric_date) AS max_date,
    MAX(metric_date) - 29 AS start_date
  FROM wb_analytics.compare_card_report_chart_daily
),
blender AS (
  SELECT DISTINCT nm_id
  FROM wb_analytics.compare_card_recommendations
  WHERE subject_name = 'Блендеры'
),
turnover AS (
  SELECT
    c.nm_id,
    SUM(c.value_numeric) FILTER (
      WHERE c.metric_name = 'Заказали на сумму'
    ) AS ordered_turnover_30d,
    SUM(c.value_numeric) FILTER (
      WHERE c.metric_name = 'Выкупили на сумму'
    ) AS buyout_turnover_30d,
    COUNT(DISTINCT c.metric_date) FILTER (
      WHERE c.metric_name = 'Заказали на сумму'
    ) AS ordered_chart_days_30d,
    COUNT(DISTINCT c.metric_date) FILTER (
      WHERE c.metric_name = 'Выкупили на сумму'
    ) AS buyout_chart_days_30d,
    MIN(c.metric_date) AS observed_start_date,
    MAX(c.metric_date) AS observed_end_date
  FROM wb_analytics.compare_card_report_chart_daily c
  JOIN blender b USING (nm_id)
  CROSS JOIN bounds
  WHERE c.metric_date BETWEEN bounds.start_date AND bounds.max_date
    AND c.metric_name IN ('Заказали на сумму', 'Выкупили на сумму')
  GROUP BY c.nm_id
)
SELECT
  bounds.start_date,
  bounds.max_date AS end_date,
  turnover.*
FROM turnover
CROSS JOIN bounds
ORDER BY ordered_turnover_30d DESC;
"""


def read_turnover_from_db() -> pd.DataFrame:
    completed = subprocess.run(
        [
            "psql",
            DATABASE_URL,
            "-A",
            "-F",
            ",",
            "-c",
            f"COPY ({QUERY.rstrip().rstrip(';')}) TO STDOUT WITH CSV HEADER",
        ],
        check=True,
        text=True,
        capture_output=True,
    )
    return pd.read_csv(io.StringIO(completed.stdout))


def corr_row(frame: pd.DataFrame, x: str, y: str) -> dict[str, float | int | str]:
    pair = frame[[x, y]].replace([np.inf, -np.inf], np.nan).dropna()
    pearson = stats.pearsonr(pair[x], pair[y])
    spearman = stats.spearmanr(pair[x], pair[y])
    return {
        "x": x,
        "y": y,
        "n": int(len(pair)),
        "pearson_r": float(pearson.statistic),
        "pearson_p": float(pearson.pvalue),
        "spearman_r": float(spearman.statistic),
        "spearman_p": float(spearman.pvalue),
    }


def fetch_feedback_count(imt_id: int) -> dict[str, float | int | str | None]:
    url = f"https://feedbacks1.wb.ru/feedbacks/v2/{imt_id}"
    try:
        response = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
        return {
            "card_imt_id": imt_id,
            "card_feedback_count": data.get("feedbackCount"),
            "card_feedback_rating": data.get("valuation"),
            "card_feedback_source": url,
        }
    except Exception:
        return {
            "card_imt_id": imt_id,
            "card_feedback_count": None,
            "card_feedback_rating": None,
            "card_feedback_source": url,
        }


def fetch_feedback_counts(imt_ids: pd.Series) -> pd.DataFrame:
    unique_ids = sorted({int(value) for value in imt_ids.dropna().tolist()})
    records: list[dict[str, float | int | str | None]] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(fetch_feedback_count, imt_id) for imt_id in unique_ids]
        for future in as_completed(futures):
            records.append(future.result())
    return pd.DataFrame(records)


def fmt_money(value: float) -> str:
    return f"{value:,.0f}".replace(",", " ")


def fmt(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}f}"


def main() -> None:
    turnover = read_turnover_from_db()
    cards = pd.read_csv(
        SOURCE_CSV,
        usecols=[
            "nm_id",
            "product_url",
            "wb_product_name",
            "reviews_count",
            "card_create_date",
            "card_age_days",
            "recommendation_type",
        ],
    )
    matrix = pd.read_csv(
        MATRIX_CSV,
        usecols=[
            "nm_id",
            "feedbacks_count_raw",
            "card_imt_id",
            "card_imt_name",
        ],
    )
    cards = cards.merge(matrix, on="nm_id", how="left")
    feedback_counts = fetch_feedback_counts(cards["card_imt_id"])
    cards = cards.merge(feedback_counts, on="card_imt_id", how="left")
    cards["card_feedback_count"] = cards["card_feedback_count"].fillna(
        cards["feedbacks_count_raw"]
    )

    frame = turnover.merge(cards, on="nm_id", how="left")
    frame["card_create_ordinal"] = pd.to_datetime(frame["card_create_date"]).map(
        lambda value: value.toordinal() if pd.notna(value) else np.nan
    )
    frame["log_ordered_turnover_30d"] = np.log1p(frame["ordered_turnover_30d"])
    frame["log_buyout_turnover_30d"] = np.log1p(frame["buyout_turnover_30d"])
    frame["log_reviews_count"] = np.log1p(frame["reviews_count"])
    frame["log_card_feedback_count"] = np.log1p(frame["card_feedback_count"])
    frame["turnover_30d_rank"] = frame["ordered_turnover_30d"].rank(
        method="first", ascending=False
    )
    frame["buyout_turnover_30d_rank"] = frame["buyout_turnover_30d"].rank(
        method="first", ascending=False
    )

    output_columns = [
        "turnover_30d_rank",
        "buyout_turnover_30d_rank",
        "nm_id",
        "product_url",
        "wb_product_name",
        "recommendation_type",
        "ordered_turnover_30d",
        "buyout_turnover_30d",
        "ordered_chart_days_30d",
        "buyout_chart_days_30d",
        "start_date",
        "end_date",
        "observed_start_date",
        "observed_end_date",
        "reviews_count",
        "feedbacks_count_raw",
        "card_feedback_count",
        "card_feedback_rating",
        "card_feedback_source",
        "card_imt_id",
        "card_imt_name",
        "card_create_date",
        "card_age_days",
        "card_create_ordinal",
        "log_ordered_turnover_30d",
        "log_buyout_turnover_30d",
        "log_reviews_count",
        "log_card_feedback_count",
    ]
    frame[output_columns].sort_values("turnover_30d_rank").to_csv(
        OUT_CSV, index=False, quoting=csv.QUOTE_MINIMAL
    )

    correlations = pd.DataFrame(
        [
            corr_row(frame, "ordered_turnover_30d", "reviews_count"),
            corr_row(frame, "ordered_turnover_30d", "card_feedback_count"),
            corr_row(frame, "ordered_turnover_30d", "card_age_days"),
            corr_row(frame, "ordered_turnover_30d", "card_create_ordinal"),
            corr_row(frame, "log_ordered_turnover_30d", "log_reviews_count"),
            corr_row(frame, "log_ordered_turnover_30d", "log_card_feedback_count"),
            corr_row(frame, "buyout_turnover_30d", "reviews_count"),
            corr_row(frame, "buyout_turnover_30d", "card_feedback_count"),
            corr_row(frame, "buyout_turnover_30d", "card_age_days"),
        ]
    )

    top = frame.sort_values("ordered_turnover_30d", ascending=False).head(10).copy()
    top["turnover"] = top["ordered_turnover_30d"].map(fmt_money)
    top["buyout"] = top["buyout_turnover_30d"].map(fmt_money)
    top["reviews"] = top["reviews_count"].map(lambda value: "" if pd.isna(value) else fmt_money(value))
    top["card_reviews"] = top["card_feedback_count"].map(
        lambda value: "" if pd.isna(value) else fmt_money(value)
    )
    top["age"] = top["card_age_days"].map(lambda value: "" if pd.isna(value) else fmt_money(value))
    top["name"] = top["wb_product_name"].fillna("")

    lines = [
        "# Корреляция 30-дневного оборота с отзывами и датой создания",
        "",
        f"Окно оборота: `{frame['start_date'].iloc[0]}` - `{frame['end_date'].iloc[0]}`.",
        "Основной оборот: `Заказали на сумму`. Дополнительно посчитан оборот по `Выкупили на сумму`.",
        "`reviews_count` — исходное число отзывов из карточной API. `card_feedback_count` — публичный feedback-count по `imt_id`, ближе к отзывам общей карточки.",
        "",
        "## Корреляции",
        "",
        "| metric_x | metric_y | n | pearson_r | pearson_p | spearman_r | spearman_p |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in correlations.to_dict("records"):
        lines.append(
            "| {x} | {y} | {n} | {pearson_r} | {pearson_p} | {spearman_r} | {spearman_p} |".format(
                x=row["x"],
                y=row["y"],
                n=row["n"],
                pearson_r=fmt(row["pearson_r"]),
                pearson_p=fmt(row["pearson_p"], 4),
                spearman_r=fmt(row["spearman_r"]),
                spearman_p=fmt(row["spearman_p"], 4),
            )
        )

    lines.extend(
        [
            "",
            "## Top 10 по обороту за 30 дней",
            "",
            "| rank | nm_id | name | turnover_30d | buyout_30d | reviews | card_reviews | age_days | chart_days |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for _, row in top.iterrows():
        lines.append(
            f"| {int(row['turnover_30d_rank'])} | {int(row['nm_id'])} | {row['name']} | "
            f"{row['turnover']} | {row['buyout']} | {row['reviews']} | {row['card_reviews']} | "
            f"{row['age']} | {int(row['ordered_chart_days_30d'])} |"
        )

    lines.extend(
        [
            "",
            f"Полная таблица по карточкам: `{OUT_CSV}`.",
            "",
        ]
    )
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")

    print(f"wrote {OUT_CSV}")
    print(f"wrote {OUT_MD}")
    print(correlations.to_string(index=False))


if __name__ == "__main__":
    main()
