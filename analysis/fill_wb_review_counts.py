#!/usr/bin/env python3
"""Fill WB review counts for product links in the ranking CSV."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd


CSV_PATH = Path("reports/new_product_matrix_ranking_2026-06-29.csv")
API_URL = "https://card.wb.ru/cards/v4/detail"
USER_AGENT = "Mozilla/5.0"
BATCH_SIZE = 10


def chunks(values: list[int], size: int) -> list[list[int]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def fetch_batch(nm_ids: list[int]) -> dict[int, dict[str, object]]:
    params = {
        "appType": "1",
        "curr": "rub",
        "dest": "-1257786",
        "spp": "30",
        "nm": ";".join(str(nm_id) for nm_id in nm_ids),
    }
    url = f"{API_URL}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": USER_AGENT})

    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    products = payload.get("products", [])
    return {int(product["id"]): product for product in products}


def insert_after(columns: list[str], anchor: str, new_columns: list[str]) -> list[str]:
    existing = [column for column in columns if column not in new_columns]
    if anchor not in existing:
        return existing + new_columns

    anchor_index = existing.index(anchor) + 1
    return existing[:anchor_index] + new_columns + existing[anchor_index:]


def main() -> None:
    frame = pd.read_csv(CSV_PATH)
    nm_ids = [int(value) for value in frame["nm_id"].tolist()]
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    products: dict[int, dict[str, object]] = {}
    for batch in chunks(nm_ids, BATCH_SIZE):
        products.update(fetch_batch(batch))
        time.sleep(0.35)

    frame["reviews_count"] = frame["nm_id"].map(
        lambda nm_id: products.get(int(nm_id), {}).get("nmFeedbacks")
    )
    frame["feedbacks_count_raw"] = frame["nm_id"].map(
        lambda nm_id: products.get(int(nm_id), {}).get("feedbacks")
    )
    frame["review_rating"] = frame["nm_id"].map(
        lambda nm_id: products.get(int(nm_id), {}).get("nmReviewRating")
    )
    frame["wb_product_name"] = frame["nm_id"].map(
        lambda nm_id: products.get(int(nm_id), {}).get("name")
    )
    frame["wb_brand"] = frame["nm_id"].map(
        lambda nm_id: products.get(int(nm_id), {}).get("brand")
    )
    frame["reviews_source"] = API_URL
    frame["reviews_fetched_at"] = fetched_at

    new_columns = [
        "reviews_count",
        "feedbacks_count_raw",
        "review_rating",
        "wb_product_name",
        "wb_brand",
        "reviews_source",
        "reviews_fetched_at",
    ]
    frame = frame[insert_after(list(frame.columns), "product_url", new_columns)]
    frame.to_csv(CSV_PATH, index=False)

    missing = frame["reviews_count"].isna().sum()
    print(f"updated {CSV_PATH}")
    print(f"rows={len(frame)} review_counts={len(frame) - missing} missing={missing}")
    print(frame[["rank", "nm_id", "reviews_count", "review_rating", "wb_product_name"]].head(10).to_string(index=False))


if __name__ == "__main__":
    main()
