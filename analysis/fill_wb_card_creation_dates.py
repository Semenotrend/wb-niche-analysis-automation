#!/usr/bin/env python3
"""Fill WB card creation dates next to review counts in report CSV files."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd


REPORT_FILES = [
    Path("reports/new_product_matrix_ranking_2026-06-29.csv"),
    Path("reports/low_review_sales_trend_2026-06-29.csv"),
    Path("reports/reviews_trend_clicks_conversion_buyout_opportunity_2026-06-29.csv"),
    Path("reports/reviews_trend_clicks_conversion_buyout_market_strength_2026-06-29.csv"),
]

USER_AGENT = "Mozilla/5.0"

# Wildberries basket host ranges by nm_id // 100000 ("vol").
BASKET_RANGES = [
    (143, 1),
    (287, 2),
    (431, 3),
    (719, 4),
    (1007, 5),
    (1061, 6),
    (1115, 7),
    (1169, 8),
    (1313, 9),
    (1601, 10),
    (1655, 11),
    (1919, 12),
    (2045, 13),
    (2189, 14),
    (2405, 15),
    (2621, 16),
    (2837, 17),
    (3053, 18),
    (3269, 19),
    (3485, 20),
    (3701, 21),
    (3917, 22),
    (4133, 23),
    (4349, 24),
    (4565, 25),
    (4877, 26),
    (5189, 27),
    (5501, 28),
    (5813, 29),
    (6125, 30),
    (6437, 31),
    (6757, 32),
    (7077, 33),
    (7397, 34),
    (7717, 35),
    (8037, 36),
    (8357, 37),
    (8677, 38),
    (8997, 39),
    (9317, 40),
    (9637, 41),
    (9957, 42),
    (10277, 43),
    (10597, 44),
    (10917, 45),
]


def basket_number_for_nm(nm_id: int) -> int:
    vol = nm_id // 100000
    for max_vol, basket_number in BASKET_RANGES:
        if vol <= max_vol:
            return basket_number
    return BASKET_RANGES[-1][1]


def card_json_url(nm_id: int, basket_number: int) -> str:
    vol = nm_id // 100000
    part = nm_id // 1000
    return (
        f"https://basket-{basket_number:02d}.wbbasket.ru"
        f"/vol{vol}/part{part}/{nm_id}/info/ru/card.json"
    )


def read_json_url(url: str) -> dict[str, object] | None:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None


def fetch_card_info(nm_id: int) -> dict[str, object]:
    primary_basket = basket_number_for_nm(nm_id)
    candidate_baskets = [primary_basket]

    # Fallback for any future range drift: check near the expected basket first.
    for delta in range(1, 4):
        for basket_number in (primary_basket - delta, primary_basket + delta):
            if 1 <= basket_number <= 60 and basket_number not in candidate_baskets:
                candidate_baskets.append(basket_number)

    for basket_number in candidate_baskets:
        url = card_json_url(nm_id, basket_number)
        data = read_json_url(url)
        if data and str(data.get("nm_id")) == str(nm_id):
            return {
                "nm_id": nm_id,
                "card_create_datetime": data.get("create_date"),
                "card_update_datetime": data.get("update_date"),
                "card_imt_id": data.get("imt_id"),
                "card_imt_name": data.get("imt_name"),
                "card_created_source": url,
                "card_created_status": "ok",
            }

    return {
        "nm_id": nm_id,
        "card_create_datetime": None,
        "card_update_datetime": None,
        "card_imt_id": None,
        "card_imt_name": None,
        "card_created_source": card_json_url(nm_id, primary_basket),
        "card_created_status": "not_found",
    }


def normalize_date(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = pd.to_datetime(value, utc=True)
    except Exception:
        return value[:10]
    return parsed.date().isoformat()


def age_days(value: object) -> int | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = pd.to_datetime(value, utc=True)
    except Exception:
        return None
    now = datetime.now(timezone.utc)
    return (now.date() - parsed.date()).days


def insert_after(columns: list[str], anchor: str, new_columns: list[str]) -> list[str]:
    existing = [column for column in columns if column not in new_columns]
    if anchor not in existing:
        return existing + new_columns
    index = existing.index(anchor) + 1
    return existing[:index] + new_columns + existing[index:]


def update_report(path: Path, info: pd.DataFrame) -> None:
    frame = pd.read_csv(path)
    new_columns = [
        "card_create_date",
        "card_age_days",
        "card_create_datetime",
        "card_update_datetime",
        "card_imt_id",
        "card_imt_name",
        "card_created_status",
        "card_created_source",
    ]
    frame = frame.drop(columns=[column for column in new_columns if column in frame.columns])
    frame = frame.merge(info, on="nm_id", how="left")
    frame = frame[insert_after(list(frame.columns), "reviews_count", new_columns)]
    frame.to_csv(path, index=False)


def main() -> None:
    nm_ids: set[int] = set()
    for path in REPORT_FILES:
        frame = pd.read_csv(path, usecols=["nm_id"])
        nm_ids.update(int(value) for value in frame["nm_id"].dropna().tolist())

    records: list[dict[str, object]] = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_nm = {executor.submit(fetch_card_info, nm_id): nm_id for nm_id in sorted(nm_ids)}
        for future in as_completed(future_to_nm):
            records.append(future.result())

    info = pd.DataFrame(records)
    info["card_create_date"] = info["card_create_datetime"].map(normalize_date)
    info["card_age_days"] = info["card_create_datetime"].map(age_days)
    info = info[
        [
            "nm_id",
            "card_create_date",
            "card_age_days",
            "card_create_datetime",
            "card_update_datetime",
            "card_imt_id",
            "card_imt_name",
            "card_created_status",
            "card_created_source",
        ]
    ]

    for path in REPORT_FILES:
        update_report(path, info)
        print(f"updated {path}")

    print(
        f"cards={len(info)} dates={info['card_create_date'].notna().sum()} "
        f"missing={info['card_create_date'].isna().sum()}"
    )
    print(
        info.sort_values(["card_created_status", "card_create_date"], na_position="last")[
            [
                "nm_id",
                "card_create_date",
                "card_age_days",
                "card_created_status",
                "card_imt_name",
            ]
        ].to_string(index=False)
    )


if __name__ == "__main__":
    main()
