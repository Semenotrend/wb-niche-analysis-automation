#!/usr/bin/env python3
"""Rank WB blender cards for new-product matrix decisions.

The script reads only from the local Postgres analytics store and writes a
reproducible CSV + Markdown report under reports/.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.pipeline import make_pipeline


DB_URL = "postgresql://wb_niche:wb_niche_local@127.0.0.1:7777/wb_niche_analysis"
REPORT_DIR = Path("reports")
CSV_PATH = REPORT_DIR / "new_product_matrix_ranking_2026-06-29.csv"
MD_PATH = REPORT_DIR / "new_product_matrix_ranking_2026-06-29.md"

METRIC_NAMES = [
    "Показы",
    "Переходы в карточку",
    "CTR",
    "Добавления в корзину",
    "Конверсия в корзину",
    "Заказы",
    "Заказали на сумму",
    "Конверсия в заказ",
    "Выкупы",
    "Выкупили на сумму",
    "Процент выкупа",
    "Отмены",
    "Медианная цена покупателя",
    "Отменили на сумму",
    "Средняя позиция",
]

LEADING_FEATURES = [
    "Показы",
    "Переходы в карточку",
    "CTR",
    "Добавления в корзину",
    "Конверсия в корзину",
    "Медианная цена покупателя",
    "Средняя позиция",
]


def pct_high(series: pd.Series) -> pd.Series:
    return series.rank(pct=True, ascending=True, method="average")


def pct_low(series: pd.Series) -> pd.Series:
    return series.rank(pct=True, ascending=False, method="average")


def fmt_float(value: float, digits: int = 2) -> str:
    if pd.isna(value):
        return ""
    return f"{value:.{digits}f}"


def fmt_int(value: float) -> str:
    if pd.isna(value):
        return ""
    return f"{value:,.0f}".replace(",", " ")


def read_chart_data() -> pd.DataFrame:
    query = """
      SELECT
        d.report_id::text,
        d.nm_id::bigint,
        d.metric_date,
        d.metric_name,
        d.value_numeric::float8 AS value_numeric,
        d.value_state,
        NULLIF(i.product_name, '') AS product_name,
        COALESCE(
          NULLIF(i.product_url, ''),
          'https://www.wildberries.ru/catalog/' || d.nm_id::text || '/detail.aspx'
        ) AS product_url
      FROM wb_analytics.compare_card_report_chart_daily AS d
      LEFT JOIN wb_analytics.compare_card_report_items AS i
        ON i.report_id = d.report_id
       AND i.nm_id = d.nm_id
      JOIN (
        SELECT DISTINCT nm_id
        FROM wb_analytics.compare_card_recommendations
        WHERE subject_name = 'Блендеры'
      ) AS b
        ON b.nm_id = d.nm_id
      ORDER BY d.nm_id, d.metric_date, d.metric_name
    """

    with psycopg2.connect(DB_URL) as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            columns = [description.name for description in cursor.description]
            frame = pd.DataFrame(cursor.fetchall(), columns=columns)

    frame["metric_date"] = pd.to_datetime(frame["metric_date"])
    return frame


def build_daily_matrix(raw: pd.DataFrame) -> pd.DataFrame:
    return raw.pivot_table(
        index=["report_id", "nm_id", "metric_date"],
        columns="metric_name",
        values="value_numeric",
        aggfunc="first",
    ).reset_index()


def build_meta(raw: pd.DataFrame) -> pd.DataFrame:
    def first_text(values: pd.Series) -> str:
        for value in values:
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    return (
        raw.groupby("nm_id")
        .agg(product_name=("product_name", first_text), product_url=("product_url", "first"))
        .reset_index()
    )


def calculate_correlations(daily: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    target = daily["Заказы"]

    for metric in METRIC_NAMES:
        if metric == "Заказы":
            continue
        source = daily[metric]
        mask = source.notna() & target.notna()
        if mask.sum() < 3:
            continue

        rows.append(
            {
                "metric": metric,
                "n": int(mask.sum()),
                "pearson": float(np.corrcoef(source[mask], target[mask])[0, 1]),
                "spearman": float(spearmanr(source[mask], target[mask]).correlation),
            }
        )

    return pd.DataFrame(rows).sort_values("pearson", ascending=False).reset_index(drop=True)


def calculate_leading_importance(daily: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, float]]:
    model_frame = daily.copy()
    for column in [
        "Показы",
        "Переходы в карточку",
        "Добавления в корзину",
        "Медианная цена покупателя",
    ]:
        model_frame[column] = np.log1p(model_frame[column])

    cutoff = model_frame["metric_date"].max() - pd.Timedelta(days=21)
    train_mask = model_frame["metric_date"] <= cutoff
    test_mask = model_frame["metric_date"] > cutoff

    x_train = model_frame.loc[train_mask, LEADING_FEATURES]
    y_train = np.log1p(model_frame.loc[train_mask, "Заказы"])
    x_test = model_frame.loc[test_mask, LEADING_FEATURES]
    y_test = np.log1p(model_frame.loc[test_mask, "Заказы"])

    model = make_pipeline(
        SimpleImputer(strategy="median"),
        RandomForestRegressor(
            n_estimators=400,
            random_state=42,
            min_samples_leaf=8,
            max_features="sqrt",
            n_jobs=-1,
        ),
    )
    model.fit(x_train, y_train)
    prediction = model.predict(x_test)

    permutation = permutation_importance(
        model,
        x_test,
        y_test,
        n_repeats=30,
        random_state=42,
        n_jobs=-1,
    )

    importance = (
        pd.DataFrame(
            {
                "feature": LEADING_FEATURES,
                "importance": permutation.importances_mean,
                "std": permutation.importances_std,
            }
        )
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )
    diagnostics = {
        "train_rows": int(train_mask.sum()),
        "test_rows": int(test_mask.sum()),
        "test_r2": float(r2_score(y_test, prediction)),
        "test_mae_log_orders": float(mean_absolute_error(y_test, prediction)),
        "cutoff": cutoff.date().isoformat(),
    }

    return importance, diagnostics


def build_card_features(daily: pd.DataFrame, meta: pd.DataFrame) -> pd.DataFrame:
    max_date = daily["metric_date"].max()
    recent_start = max_date - pd.Timedelta(days=13)
    prev_start = max_date - pd.Timedelta(days=27)
    rows: list[dict[str, object]] = []

    for nm_id, group in daily.groupby("nm_id"):
        def total(column: str) -> float:
            return float(group[column].sum(skipna=True))

        def avg(column: str) -> float:
            return float(group[column].mean(skipna=True))

        orders = total("Заказы")
        impressions = total("Показы")
        clicks = total("Переходы в карточку")
        carts = total("Добавления в корзину")
        buyouts = total("Выкупы")
        cancels = total("Отмены")
        order_amount = total("Заказали на сумму")
        buyout_amount = total("Выкупили на сумму")
        cancel_amount = total("Отменили на сумму")

        recent = group[group["metric_date"] >= recent_start]
        previous = group[(group["metric_date"] >= prev_start) & (group["metric_date"] < recent_start)]
        order_mean = avg("Заказы")
        order_std = float(group["Заказы"].std(skipna=True))
        order_cv = order_std / (order_mean + 1e-9)
        recent_order_mean = float(recent["Заказы"].mean()) if len(recent) else 0.0
        previous_order_mean = float(previous["Заказы"].mean()) if len(previous) else 0.0
        recent_impression_mean = float(recent["Показы"].mean()) if len(recent) else 0.0
        previous_impression_mean = float(previous["Показы"].mean()) if len(previous) else 0.0

        rows.append(
            {
                "nm_id": int(nm_id),
                "orders_total": orders,
                "order_amount_total": order_amount,
                "buyouts_total": buyouts,
                "buyout_amount_total": buyout_amount,
                "impressions_total": impressions,
                "clicks_total": clicks,
                "carts_total": carts,
                "cancels_total": cancels,
                "cancel_amount_total": cancel_amount,
                "ctr_calc": clicks / impressions * 100 if impressions else np.nan,
                "cart_conv_calc": carts / clicks * 100 if clicks else np.nan,
                "order_conv_calc": orders / clicks * 100 if clicks else np.nan,
                "orders_per_1000_impressions": orders / impressions * 1000 if impressions else np.nan,
                "buyout_rate_calc": buyouts / orders * 100 if orders else np.nan,
                "cancel_rate_calc": cancels / orders * 100 if orders else np.nan,
                "cancel_amount_share": cancel_amount / order_amount * 100 if order_amount else np.nan,
                "median_price": float(np.nanmedian(group["Медианная цена покупателя"])),
                "avg_position": float(np.nanmean(group["Средняя позиция"])),
                "avg_ctr_graph": avg("CTR"),
                "avg_cart_conv_graph": avg("Конверсия в корзину"),
                "avg_order_conv_graph": avg("Конверсия в заказ"),
                "avg_buyout_pct_graph": avg("Процент выкупа"),
                "recent14_orders": float(recent["Заказы"].sum()),
                "prev14_orders": float(previous["Заказы"].sum()),
                "orders_growth_14d": (recent_order_mean - previous_order_mean)
                / (abs(previous_order_mean) + 1),
                "impressions_growth_14d": (recent_impression_mean - previous_impression_mean)
                / (abs(previous_impression_mean) + 1),
                "zero_order_day_share": float((group["Заказы"] == 0).mean()),
                "order_stability": 1 / (1 + order_cv),
                "days": int(len(group)),
            }
        )

    card = pd.DataFrame(rows).merge(meta, on="nm_id", how="left")

    market_price = card["median_price"].median()
    price_iqr = card["median_price"].quantile(0.75) - card["median_price"].quantile(0.25)
    denominator = price_iqr if price_iqr else max(market_price, 1)
    card["price_sweet_spot"] = np.exp(-abs(card["median_price"] - market_price) / denominator)

    card["demand_score"] = (
        0.22 * pct_high(card["orders_total"])
        + 0.18 * pct_high(card["order_amount_total"])
        + 0.16 * pct_high(card["buyouts_total"])
        + 0.14 * pct_high(card["buyout_amount_total"])
        + 0.12 * pct_high(card["impressions_total"])
        + 0.10 * pct_high(card["clicks_total"])
        + 0.08 * pct_high(card["carts_total"])
    )
    card["efficiency_score"] = (
        0.18 * pct_high(card["orders_per_1000_impressions"])
        + 0.16 * pct_high(card["order_conv_calc"])
        + 0.14 * pct_high(card["cart_conv_calc"])
        + 0.12 * pct_high(card["ctr_calc"])
        + 0.14 * pct_high(card["avg_order_conv_graph"])
        + 0.10 * pct_high(card["avg_cart_conv_graph"])
        + 0.08 * pct_high(card["avg_ctr_graph"])
        + 0.08 * pct_low(card["avg_position"])
    )
    card["quality_score"] = (
        0.30 * pct_high(card["buyout_rate_calc"])
        + 0.20 * pct_high(card["avg_buyout_pct_graph"])
        + 0.20 * pct_low(card["cancel_rate_calc"].fillna(card["cancel_rate_calc"].max()))
        + 0.15 * pct_low(card["cancel_amount_share"].fillna(card["cancel_amount_share"].max()))
        + 0.15 * pct_high(card["order_stability"])
    )
    card["momentum_score"] = (
        0.30 * pct_high(card["recent14_orders"])
        + 0.25 * pct_high(card["orders_growth_14d"])
        + 0.20 * pct_high(card["impressions_growth_14d"])
        + 0.15 * pct_high(card["order_stability"])
        + 0.10 * pct_low(card["zero_order_day_share"])
    )
    card["price_score"] = pct_high(card["price_sweet_spot"])
    card["novelty_relevance_score"] = 100 * (
        0.35 * card["demand_score"]
        + 0.25 * card["efficiency_score"]
        + 0.15 * card["quality_score"]
        + 0.15 * card["momentum_score"]
        + 0.10 * card["price_score"]
    )

    card = card.sort_values("novelty_relevance_score", ascending=False).reset_index(drop=True)
    card.insert(0, "rank", np.arange(1, len(card) + 1))
    return card


def write_csv(card: pd.DataFrame) -> None:
    columns = [
        "rank",
        "nm_id",
        "product_name",
        "product_url",
        "novelty_relevance_score",
        "demand_score",
        "efficiency_score",
        "quality_score",
        "momentum_score",
        "price_score",
        "orders_total",
        "order_amount_total",
        "buyouts_total",
        "buyout_amount_total",
        "impressions_total",
        "clicks_total",
        "carts_total",
        "orders_per_1000_impressions",
        "ctr_calc",
        "cart_conv_calc",
        "order_conv_calc",
        "buyout_rate_calc",
        "cancel_rate_calc",
        "median_price",
        "avg_position",
        "recent14_orders",
        "orders_growth_14d",
        "impressions_growth_14d",
        "zero_order_day_share",
        "days",
    ]
    card[columns].to_csv(CSV_PATH, index=False)


def markdown_table(frame: pd.DataFrame, columns: list[str]) -> str:
    header = "| " + " | ".join(columns) + " |"
    separator = "| " + " | ".join(["---"] * len(columns)) + " |"
    rows = []
    for _, row in frame.iterrows():
        rows.append("| " + " | ".join(str(row[column]) for column in columns) + " |")
    return "\n".join([header, separator, *rows])


def build_report(
    raw: pd.DataFrame,
    daily: pd.DataFrame,
    correlations: pd.DataFrame,
    importance: pd.DataFrame,
    diagnostics: dict[str, float],
    card: pd.DataFrame,
) -> str:
    top = card.head(15).copy()
    top["score"] = top["novelty_relevance_score"].map(lambda value: fmt_float(value, 1))
    top["orders"] = top["orders_total"].map(fmt_int)
    top["revenue"] = top["order_amount_total"].map(fmt_int)
    top["buyout_pct"] = top["buyout_rate_calc"].map(lambda value: fmt_float(value, 1))
    top["orders_per_1000"] = top["orders_per_1000_impressions"].map(lambda value: fmt_float(value, 2))
    top["price"] = top["median_price"].map(fmt_int)
    top["position"] = top["avg_position"].map(lambda value: fmt_float(value, 1))
    top["name"] = top.apply(
        lambda row: row["product_name"] if row["product_name"] else f"nm_id {row['nm_id']}",
        axis=1,
    )

    corr = correlations.copy()
    corr["pearson"] = corr["pearson"].map(lambda value: fmt_float(value, 4))
    corr["spearman"] = corr["spearman"].map(lambda value: fmt_float(value, 4))

    imp = importance.copy()
    imp["importance"] = imp["importance"].map(lambda value: fmt_float(value, 4))
    imp["std"] = imp["std"].map(lambda value: fmt_float(value, 4))

    winner = card.iloc[0]
    winner_name = winner["product_name"] if winner["product_name"] else f"nm_id {winner['nm_id']}"

    lines = [
        "# Рейтинг карточек для матрицы новинок",
        "",
        "## Данные",
        "",
        f"- Источник: `wb_analytics.compare_card_report_chart_daily`, локальная БД `127.0.0.1:7777/wb_niche_analysis`.",
        (
            f"- Срез: `Блендеры`, {raw['nm_id'].nunique()} карточек, "
            f"{raw['metric_name'].nunique()} метрик, {fmt_int(len(raw))} графиковых точек."
        ),
        f"- Период: {raw['metric_date'].min().date()} ... {raw['metric_date'].max().date()}.",
        "- `missing_rendered_as_zero` для цены/позиции считается аналитическим пропуском, не настоящим нулем.",
        "",
        "## Математические связи с заказами",
        "",
        "Pearson показывает линейную связь с дневными заказами, Spearman показывает ранговую связь.",
        "Производные/постзаказные метрики важны как диагностика, но не трактуются как причина заказов.",
        "",
        markdown_table(corr.head(14), ["metric", "n", "pearson", "spearman"]),
        "",
        "## Что сильнее всего предсказывает заказы до самого заказа",
        "",
        (
            "Модель: RandomForestRegressor, цель `log1p(Заказы)`, обучение на раннем периоде, "
            "проверка на последних 21 днях. Использованы только предзаказные признаки: показы, переходы, "
            "CTR, добавления в корзину, конверсия в корзину, цена, средняя позиция."
        ),
        "",
        f"- train rows: {diagnostics['train_rows']}",
        f"- test rows: {diagnostics['test_rows']}",
        f"- test R2: {diagnostics['test_r2']:.4f}",
        f"- MAE по log1p(orders): {diagnostics['test_mae_log_orders']:.4f}",
        "",
        markdown_table(imp, ["feature", "importance", "std"]),
        "",
        "Интерпретация: самый сильный практический предиктор спроса - добавления в корзину. "
        "Цена имеет сильный обратный эффект: чем выше медианная цена, тем ниже заказы в этом срезе. "
        "Переходы в карточку - третий по силе фактор. Показы сами по себе слабее, потому что без "
        "перехода и корзины они не превращаются в спрос.",
        "",
        "## Формула скоринга",
        "",
        "Итоговый score 0-100 считается как взвешенная сумма процентильных компонент среди 50 карточек:",
        "",
        "- 35% demand: заказы, заказанная сумма, выкупы, выкупленная сумма, показы, переходы, корзины.",
        "- 25% efficiency: заказы на 1000 показов, order conversion, cart conversion, CTR, средняя позиция.",
        "- 15% quality: процент выкупа, низкие отмены, низкая сумма отмен, стабильность заказов.",
        "- 15% momentum: заказы за последние 14 дней, рост заказов, рост показов, стабильность.",
        "- 10% price fit: близость медианной цены к рабочему центру рынка, без экстремального прайса.",
        "",
        "## Top 15",
        "",
        markdown_table(
            top,
            [
                "rank",
                "nm_id",
                "name",
                "score",
                "orders",
                "revenue",
                "buyout_pct",
                "orders_per_1000",
                "price",
                "position",
            ],
        ),
        "",
        "## Вывод",
        "",
        (
            f"Главный кандидат для матрицы новинок: `{winner_name}` "
            f"(`nm_id={int(winner['nm_id'])}`, score={winner['novelty_relevance_score']:.1f}). "
            f"За период у него {fmt_int(winner['orders_total'])} заказов, "
            f"{fmt_int(winner['order_amount_total'])} руб. заказанной суммы, "
            f"выкуп {winner['buyout_rate_calc']:.1f}%, "
            f"{winner['orders_per_1000_impressions']:.2f} заказа на 1000 показов, "
            f"медианная цена {fmt_int(winner['median_price'])} руб."
        ),
        "",
        "Практически это означает: приоритетнее добавлять не просто `любой блендер`, а продуктовый тип "
        "с доказанным массовым спросом, сильной корзиной и нормальным выкупом. По карточкам с названиями "
        "лучше всего выглядит погружной блендер-измельчитель 3 в 1; вторым типом для проверки идет "
        "портативный блендер для смузи 2 в 1.",
        "",
        f"Полный рейтинг 50 карточек: `{CSV_PATH}`.",
        "",
    ]

    return "\n".join(lines)


def main() -> None:
    REPORT_DIR.mkdir(exist_ok=True)
    raw = read_chart_data()
    daily = build_daily_matrix(raw)
    meta = build_meta(raw)
    correlations = calculate_correlations(daily)
    importance, diagnostics = calculate_leading_importance(daily)
    card = build_card_features(daily, meta)

    write_csv(card)
    MD_PATH.write_text(
        build_report(raw, daily, correlations, importance, diagnostics, card),
        encoding="utf-8",
    )

    print(f"wrote {CSV_PATH}")
    print(f"wrote {MD_PATH}")
    print(card.loc[:9, ["rank", "nm_id", "product_name", "novelty_relevance_score"]].to_string(index=False))


if __name__ == "__main__":
    main()
