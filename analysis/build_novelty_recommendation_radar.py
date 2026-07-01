#!/usr/bin/env python3
"""Build a novelty recommendation radar using cohort-normalized methods."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


LOW_REVIEW_CSV = Path("reports/low_review_sales_trend_2026-06-29.csv")
RTCCB_CSV = Path("reports/reviews_trend_clicks_conversion_buyout_opportunity_2026-06-29.csv")
MATRIX_CSV = Path("reports/new_product_matrix_ranking_2026-06-29.csv")
OUT_CSV = Path("reports/novelty_recommendation_radar_2026-06-29.csv")
OUT_MD = Path("reports/novelty_recommendation_scheme_2026-06-29.md")

SOURCE_URL = "https://chatgpt.com/share/6a428b7b-ffcc-83eb-b460-2367f8a4f48a"


def pct_high(series: pd.Series) -> pd.Series:
    return series.rank(pct=True, ascending=True, method="average") * 100


def pct_low(series: pd.Series) -> pd.Series:
    return series.rank(pct=True, ascending=False, method="average") * 100


def robust_z(series: pd.Series) -> pd.Series:
    median = series.median(skipna=True)
    mad = (series - median).abs().median(skipna=True)
    if pd.isna(mad) or mad == 0:
        return pd.Series(0.0, index=series.index)
    return (series - median) / (1.4826 * mad)


def score_from_global_and_cohort(frame: pd.DataFrame, column: str, cohort_column: str = "age_cohort") -> pd.Series:
    global_score = pct_high(frame[column])
    cohort_score = frame.groupby(cohort_column)[column].transform(
        lambda value: value.rank(pct=True, ascending=True, method="average") * 100
    )
    cohort_size = frame.groupby(cohort_column)[column].transform("count")
    return pd.Series(
        np.where(cohort_size >= 5, 0.65 * global_score + 0.35 * cohort_score, global_score),
        index=frame.index,
    )


def score_low_from_global_and_cohort(
    frame: pd.DataFrame, column: str, cohort_column: str = "age_cohort"
) -> pd.Series:
    global_score = pct_low(frame[column])
    cohort_score = frame.groupby(cohort_column)[column].transform(
        lambda value: value.rank(pct=True, ascending=False, method="average") * 100
    )
    cohort_size = frame.groupby(cohort_column)[column].transform("count")
    return pd.Series(
        np.where(cohort_size >= 5, 0.65 * global_score + 0.35 * cohort_score, global_score),
        index=frame.index,
    )


def age_cohort(age_days: float) -> str:
    if pd.isna(age_days):
        return "unknown"
    if age_days <= 7:
        return "00_0_7"
    if age_days <= 14:
        return "01_8_14"
    if age_days <= 30:
        return "02_15_30"
    if age_days <= 60:
        return "03_31_60"
    if age_days <= 90:
        return "04_61_90"
    if age_days <= 180:
        return "05_91_180"
    if age_days <= 365:
        return "06_181_365"
    return "07_366_plus"


def clamp_score(series: pd.Series) -> pd.Series:
    return series.clip(lower=0, upper=100)


def format_int(value: float) -> str:
    if pd.isna(value):
        return ""
    return f"{value:,.0f}".replace(",", " ")


def format_float(value: float, digits: int = 1) -> str:
    if pd.isna(value):
        return ""
    return f"{value:.{digits}f}"


def load_frame() -> pd.DataFrame:
    low = pd.read_csv(LOW_REVIEW_CSV)
    rtccb = pd.read_csv(
        RTCCB_CSV,
        usecols=[
            "nm_id",
            "rtccb_opportunity_rank",
            "rtccb_opportunity_score",
            "recent14_clicks",
            "prev14_clicks",
            "clicks_growth_14d_pct",
            "recent14_order_conversion",
            "recent14_buyout_rate",
        ],
    )
    matrix = pd.read_csv(
        MATRIX_CSV,
        usecols=[
            "nm_id",
            "median_price",
            "avg_position",
            "orders_total",
            "order_amount_total",
            "buyout_rate_calc",
        ],
    )
    return low.merge(rtccb, on="nm_id", how="left").merge(matrix, on="nm_id", how="left")


def classify(row: pd.Series, cohort_median_reviews: float, market_median_price: float) -> tuple[str, str]:
    labels: list[str] = []
    age = row["card_age_days"]
    orders_pct = row["orders_per_day_pct"]
    revenue_pct = row["revenue_per_day_pct"]
    reviews_pct = row["reviews_per_day_pct"]
    conversion_pct = row["smoothed_conversion_pct"]
    momentum = row["momentum_score"]
    confidence = row["confidence_score"]
    reviews = row["reviews_count"]
    orders_now = row["db_recent14_orders"]
    orders_prev = row["db_prev14_orders"]
    price = row["median_price"]

    if age <= 45 and orders_pct >= 80 and momentum >= 70 and confidence >= 50:
        labels.append("растущая новинка")
    if age <= 60 and orders_pct >= 90 and revenue_pct >= 85 and reviews_pct >= 75:
        labels.append("горячая новинка")
    if (
        age <= 90
        and orders_pct >= 70
        and pd.notna(reviews)
        and reviews <= cohort_median_reviews
        and conversion_pct >= 75
    ):
        labels.append("скрытая новинка")
    if age <= 120 and momentum >= 80 and orders_now > orders_prev:
        labels.append("разгоняющаяся новинка")
    if age <= 120 and row["reviews_count_pct"] >= 95 and orders_pct <= 50:
        labels.append("подозрительная новинка")
    if age <= 180 and price >= market_median_price and revenue_pct >= 70 and conversion_pct >= 50:
        labels.append("новинка с маржинальным потенциалом")

    if labels:
        return labels[0], "; ".join(labels)
    if age <= 180 and row["novelty_radar_score"] >= 60:
        return "перспективная молодая карточка", "перспективная молодая карточка"
    if age <= 365 and row["novelty_radar_score"] >= 60:
        return "средневозрастной кандидат", "средневозрастной кандидат"
    if age > 365 and row["market_strength_score"] >= 70:
        return "сильный зрелый лидер", "сильный зрелый лидер"
    return "обычная карточка", "обычная карточка"


def main() -> None:
    frame = load_frame()
    frame["age_cohort"] = frame["card_age_days"].map(age_cohort)
    period_days = (
        pd.to_datetime(frame["db_period_end"]) - pd.to_datetime(frame["db_period_start"])
    ).dt.days + 1
    frame["active_observed_days"] = np.minimum(frame["card_age_days"], period_days).clip(lower=1)

    reviews_for_rates = frame["reviews_count"].fillna(0)
    frame["orders_per_day"] = frame["db_orders_total"] / frame["active_observed_days"]
    frame["revenue_per_day"] = frame["db_order_revenue_total"] / frame["active_observed_days"]
    frame["reviews_per_day"] = reviews_for_rates / frame["card_age_days"].clip(lower=1)
    frame["clicks_per_day"] = frame["db_clicks_total"] / frame["active_observed_days"]
    frame["recent_orders_per_day"] = frame["db_recent14_orders"] / 14
    frame["recent_revenue_per_day"] = frame["db_recent14_revenue"] / 14

    category_conversion = frame["db_orders_total"].sum() / frame["db_clicks_total"].sum()
    category_buyout = frame["db_buyouts_total"].sum() / frame["db_orders_total"].sum()
    prior_clicks = 1000
    prior_orders = 100
    frame["smoothed_conversion"] = (
        frame["db_orders_total"] + category_conversion * prior_clicks
    ) / (frame["db_clicks_total"] + prior_clicks) * 100
    frame["smoothed_buyout_rate"] = (
        frame["db_buyouts_total"] + category_buyout * prior_orders
    ) / (frame["db_orders_total"] + prior_orders) * 100

    frame["orders_growth_smooth_pct"] = (
        (frame["db_recent14_orders"] + 1) / (frame["db_prev14_orders"] + 1) - 1
    ) * 100
    frame["revenue_growth_smooth_pct"] = (
        (frame["db_recent14_revenue"] + 1) / (frame["db_prev14_revenue"] + 1) - 1
    ) * 100

    score_columns = [
        "orders_per_day",
        "revenue_per_day",
        "reviews_per_day",
        "clicks_per_day",
        "orders_growth_smooth_pct",
        "revenue_growth_smooth_pct",
        "clicks_growth_14d_pct",
        "smoothed_conversion",
        "smoothed_buyout_rate",
        "recent_orders_per_day",
        "recent_revenue_per_day",
    ]
    for column in score_columns:
        frame[f"{column}_pct"] = score_from_global_and_cohort(frame, column)

    frame["age_score"] = score_low_from_global_and_cohort(frame, "card_age_days")
    frame["reviews_count_pct"] = score_from_global_and_cohort(frame, "reviews_count")
    frame["low_reviews_barrier_score"] = score_low_from_global_and_cohort(
        frame, "reviews_count"
    ).fillna(0)
    frame["price_pct"] = pct_high(frame["median_price"])
    frame["rating_score"] = pct_high(frame["review_rating"].fillna(frame["review_rating"].median()))

    for column in ["orders_per_day", "revenue_per_day", "reviews_per_day"]:
        frame[f"{column}_robust_z"] = frame.groupby("age_cohort")[column].transform(robust_z)

    cohort_medians = frame.groupby("age_cohort").agg(
        expected_orders_per_day=("orders_per_day", "median"),
        expected_revenue_per_day=("revenue_per_day", "median"),
        expected_reviews_per_day=("reviews_per_day", "median"),
        median_reviews_for_age_category=("reviews_count", "median"),
    )
    frame = frame.merge(cohort_medians, on="age_cohort", how="left")
    frame["orders_outperformance"] = frame["orders_per_day"] / (
        frame["expected_orders_per_day"] + 1e-9
    )
    frame["revenue_outperformance"] = frame["revenue_per_day"] / (
        frame["expected_revenue_per_day"] + 1e-9
    )
    frame["reviews_outperformance"] = frame["reviews_per_day"] / (
        frame["expected_reviews_per_day"] + 1e-9
    )
    frame["outperformance_score"] = (
        0.45 * pct_high(np.log1p(frame["orders_outperformance"]))
        + 0.35 * pct_high(np.log1p(frame["revenue_outperformance"]))
        + 0.20 * pct_high(np.log1p(frame["reviews_outperformance"]))
    )

    frame["conversion_score"] = frame["smoothed_conversion_pct"]
    frame["visibility_score"] = (
        0.60 * frame["clicks_per_day_pct"] + 0.40 * frame["clicks_growth_14d_pct_pct"]
    )
    frame["momentum_score"] = (
        0.35 * frame["orders_growth_smooth_pct_pct"]
        + 0.25 * frame["revenue_growth_smooth_pct_pct"]
        + 0.15 * frame["reviews_per_day_pct"]
        + 0.15 * frame["clicks_growth_14d_pct_pct"]
        + 0.10 * frame["smoothed_conversion_pct"]
    )
    frame["early_demand_score"] = (
        0.30 * frame["orders_per_day_pct"]
        + 0.25 * frame["revenue_per_day_pct"]
        + 0.20 * frame["conversion_score"]
        + 0.15 * frame["reviews_per_day_pct"]
        + 0.10 * frame["rating_score"]
    )
    frame["early_demand_age_adjusted"] = frame["early_demand_score"] / np.log1p(
        frame["card_age_days"].clip(lower=1)
    )
    frame["early_demand_age_adjusted_score"] = pct_high(frame["early_demand_age_adjusted"])

    orders_conf = np.log1p(frame["db_orders_total"]) / np.log1p(frame["db_orders_total"].max())
    reviews_conf = np.log1p(reviews_for_rates) / np.log1p(reviews_for_rates.max())
    days_conf = frame["active_observed_days"] / frame["active_observed_days"].max()
    stability = 1 - (
        (frame["db_orders_growth_14d_pct"] - frame["db_orders_growth_7d_pct"]).abs() / 200
    ).clip(upper=1)
    frame["confidence_score"] = 100 * (
        0.35 * orders_conf + 0.25 * reviews_conf + 0.20 * days_conf + 0.20 * stability
    )
    frame["confidence_score"] = clamp_score(frame["confidence_score"])

    frame["novelty_radar_score"] = (
        0.20 * frame["age_score"]
        + 0.20 * frame["orders_per_day_pct"]
        + 0.15 * frame["revenue_per_day_pct"]
        + 0.15 * frame["momentum_score"]
        + 0.10 * frame["reviews_per_day_pct"]
        + 0.10 * frame["conversion_score"]
        + 0.05 * frame["visibility_score"]
        + 0.05 * frame["confidence_score"]
    )
    frame["market_strength_score"] = (
        0.20 * frame["reviews_count_pct"].fillna(0)
        + 0.20 * frame["orders_per_day_pct"]
        + 0.20 * frame["revenue_per_day_pct"]
        + 0.15 * frame["conversion_score"]
        + 0.15 * frame["smoothed_buyout_rate_pct"]
        + 0.10 * frame["confidence_score"]
    )

    market_median_price = frame["median_price"].median()
    classifications = frame.apply(
        lambda row: classify(
            row,
            row["median_reviews_for_age_category"],
            market_median_price,
        ),
        axis=1,
    )
    frame["recommendation_type"] = [item[0] for item in classifications]
    frame["recommendation_labels"] = [item[1] for item in classifications]
    frame["recommendation_reason"] = frame.apply(
        lambda row: (
            f"age={int(row['card_age_days'])}d, "
            f"orders/day={row['orders_per_day']:.1f} "
            f"(pct {row['orders_per_day_pct']:.0f}), "
            f"growth14={row['db_orders_growth_14d_pct']:.1f}%, "
            f"conv={row['smoothed_conversion']:.2f}%, "
            f"confidence={row['confidence_score']:.0f}"
        ),
        axis=1,
    )
    frame["novelty_radar_rank"] = frame["novelty_radar_score"].rank(
        method="first", ascending=False
    )
    frame["market_strength_rank"] = frame["market_strength_score"].rank(
        method="first", ascending=False
    )

    output_columns = [
        "novelty_radar_rank",
        "novelty_radar_score",
        "recommendation_type",
        "recommendation_labels",
        "recommendation_reason",
        "nm_id",
        "product_url",
        "wb_product_name",
        "wb_brand",
        "card_create_date",
        "card_age_days",
        "age_cohort",
        "reviews_count",
        "reviews_status",
        "review_rating",
        "orders_per_day",
        "revenue_per_day",
        "reviews_per_day",
        "clicks_per_day",
        "recent_orders_per_day",
        "recent_revenue_per_day",
        "smoothed_conversion",
        "smoothed_buyout_rate",
        "orders_growth_smooth_pct",
        "revenue_growth_smooth_pct",
        "clicks_growth_14d_pct",
        "orders_per_day_pct",
        "revenue_per_day_pct",
        "reviews_per_day_pct",
        "smoothed_conversion_pct",
        "smoothed_buyout_rate_pct",
        "momentum_score",
        "early_demand_score",
        "early_demand_age_adjusted_score",
        "confidence_score",
        "outperformance_score",
        "orders_outperformance",
        "revenue_outperformance",
        "reviews_outperformance",
        "market_strength_rank",
        "market_strength_score",
        "median_price",
        "avg_position",
        "db_recent14_orders",
        "db_prev14_orders",
        "db_orders_growth_14d_pct",
        "db_orders_total",
        "db_order_revenue_total",
        "db_buyouts_total",
        "db_buyout_revenue_total",
        "rtccb_opportunity_rank",
        "rtccb_opportunity_score",
    ]
    out = frame[output_columns].sort_values("novelty_radar_rank").reset_index(drop=True)
    out.to_csv(OUT_CSV, index=False)
    OUT_MD.write_text(build_report(out), encoding="utf-8")

    print(f"wrote {OUT_CSV}")
    print(f"wrote {OUT_MD}")
    print(out.head(12)[["novelty_radar_rank", "novelty_radar_score", "recommendation_type", "nm_id", "card_age_days", "reviews_count", "wb_product_name"]].to_string(index=False))


def markdown_table(frame: pd.DataFrame, columns: list[str]) -> str:
    header = "| " + " | ".join(columns) + " |"
    separator = "| " + " | ".join(["---"] * len(columns)) + " |"
    lines = [header, separator]
    for _, row in frame.iterrows():
        lines.append("| " + " | ".join(str(row[column]) for column in columns) + " |")
    return "\n".join(lines)


def build_report(out: pd.DataFrame) -> str:
    top = out.head(15).copy()
    top["score"] = top["novelty_radar_score"].map(lambda value: format_float(value, 1))
    top["age"] = top["card_age_days"].map(format_int)
    top["reviews"] = top["reviews_count"].map(format_int)
    top["orders_day"] = top["orders_per_day"].map(lambda value: format_float(value, 1))
    top["growth"] = top["db_orders_growth_14d_pct"].map(lambda value: format_float(value, 1))
    top["conv"] = top["smoothed_conversion"].map(lambda value: format_float(value, 2))
    top["conf"] = top["confidence_score"].map(lambda value: format_float(value, 0))
    top["name"] = top.apply(
        lambda row: row["wb_product_name"] if isinstance(row["wb_product_name"], str) else f"nm_id {row['nm_id']}",
        axis=1,
    )

    by_type = (
        out.groupby("recommendation_type")
        .size()
        .reset_index(name="cards")
        .sort_values("cards", ascending=False)
    )

    return "\n".join(
        [
            "# Схема рекомендаций: радар новинок",
            "",
            f"Основано на методике из shared-чата: {SOURCE_URL}",
            "",
            "## Логика",
            "",
            "Схема не ищет просто самые новые или самые большие карточки. Она ищет карточки, которые сильны относительно своего возраста и имеют объяснимые признаки раннего спроса.",
            "",
            "```mermaid",
            "flowchart TD",
            '  A["Сырые данные: графики WB + отзывы + дата создания"] --> B["Возрастная нормализация"]',
            '  B --> C["Метрики в день: orders/day, revenue/day, reviews/day, clicks/day"]',
            '  C --> D["Сравнение с рынком: перцентили, age cohort, robust z-score"]',
            '  D --> E["Momentum: рост заказов, выручки, кликов, отзывы/day"]',
            '  D --> F["Early demand: спрос/day, выручка/day, конверсия, рейтинг"]',
            '  D --> G["Confidence: заказы, отзывы, дни наблюдения, стабильность"]',
            '  E --> H["Novelty Radar Score"]',
            '  F --> H',
            '  G --> H',
            '  H --> I["Тип рекомендации: горячая, скрытая, разгоняющаяся, подозрительная, маржинальная"]',
            "```",
            "",
            "## Формулы",
            "",
            "- `active_observed_days = min(card_age_days, chart_period_days)`.",
            "- `orders_per_day = orders_total / active_observed_days`.",
            "- `revenue_per_day = revenue_total / active_observed_days`.",
            "- `reviews_per_day = reviews_count / card_age_days`.",
            "- Для кривых WB используем перцентили, а не средние, потому что распределения перекошены несколькими гигантами.",
            "- Для конверсии и выкупа используется Bayesian smoothing, чтобы молодые карточки с малой базой не улетали наверх случайно.",
            "",
            "Итоговый `novelty_radar_score`:",
            "",
            "```text",
            "0.20 * age_score",
            "+ 0.20 * orders_per_day_pct",
            "+ 0.15 * revenue_per_day_pct",
            "+ 0.15 * momentum_score",
            "+ 0.10 * reviews_per_day_pct",
            "+ 0.10 * conversion_score",
            "+ 0.05 * visibility_score",
            "+ 0.05 * confidence_score",
            "```",
            "",
            "Возраст не доминирует: молодость даёт плюс, но карточка должна доказать спросом, кликами, конверсией и выкупом, что она не пустая.",
            "",
            "## Классификация",
            "",
            "- `горячая новинка`: молодая карточка с очень высоким спросом/day, выручкой/day и быстрым набором отзывов.",
            "- `скрытая новинка`: молодая карточка с заказами, хорошей конверсией и отзывами не выше медианы своей возрастной группы.",
            "- `разгоняющаяся новинка`: молодая карточка с высоким momentum и ростом текущих заказов.",
            "- `подозрительная новинка`: молодая карточка с аномально многими отзывами, но слабым спросом/day.",
            "- `новинка с маржинальным потенциалом`: молодая карточка с ценой выше медианы, хорошей выручкой/day и нормальной конверсией.",
            "",
            "## Top 15 По Novelty Radar",
            "",
            markdown_table(
                top,
                [
                    "novelty_radar_rank",
                    "nm_id",
                    "name",
                    "recommendation_type",
                    "score",
                    "age",
                    "reviews",
                    "orders_day",
                    "growth",
                    "conv",
                    "conf",
                ],
            ),
            "",
            "## Сколько карточек по типам",
            "",
            markdown_table(by_type, ["recommendation_type", "cards"]),
            "",
            f"Полная таблица: `{OUT_CSV}`.",
            "",
        ]
    )


if __name__ == "__main__":
    main()
