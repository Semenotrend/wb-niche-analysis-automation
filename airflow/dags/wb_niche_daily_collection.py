from __future__ import annotations

import os
import shlex
from datetime import datetime
from pathlib import Path

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.empty import EmptyOperator


PROJECT_ROOT = Path(
    os.environ.get(
        "WB_NICHE_PROJECT_ROOT",
        str(Path(__file__).resolve().parents[2]),
    )
).resolve()

PROJECT_ROOT_SHELL = shlex.quote(str(PROJECT_ROOT))
TOTAL_COMPARE_BATCHES = int(os.environ.get("WB_NICHE_COMPARE_BATCHES_TOTAL", "10"))
MIN_COMPARE_BATCH_SECONDS = int(
    os.environ.get("WB_NICHE_COMPARE_BATCH_MIN_SECONDS", "60")
)
COMPARE_BATCH_PAUSE_SECONDS = int(
    os.environ.get("WB_NICHE_COMPARE_BATCH_PAUSE_SECONDS", "60")
)

if TOTAL_COMPARE_BATCHES < 1:
    raise ValueError("WB_NICHE_COMPARE_BATCHES_TOTAL must be at least 1")

if MIN_COMPARE_BATCH_SECONDS < 60:
    raise ValueError("WB_NICHE_COMPARE_BATCH_MIN_SECONDS must be at least 60")

if COMPARE_BATCH_PAUSE_SECONDS < 60:
    raise ValueError("WB_NICHE_COMPARE_BATCH_PAUSE_SECONDS must be at least 60")


def pnpm_task(
    task_id: str,
    script_name: str,
    *,
    retries: int = 0,
    enforce_min_compare_duration: bool = False,
) -> BashOperator:
    if enforce_min_compare_duration:
        bash_command = f"""
set -euo pipefail
cd {PROJECT_ROOT_SHELL}

STARTED_AT="$(date +%s)"
set +e
HEADLESS="${{WB_NICHE_HEADLESS:-true}}" \\
SCENARIO_INDEX="{{{{ params.scenario_index }}}}" \\
pnpm run {script_name}
STATUS="$?"
set -e

FINISHED_AT="$(date +%s)"
ELAPSED_SECONDS="$((FINISHED_AT - STARTED_AT))"
MIN_SECONDS="{MIN_COMPARE_BATCH_SECONDS}"
if [ "$ELAPSED_SECONDS" -lt "$MIN_SECONDS" ]; then
  SLEEP_SECONDS="$((MIN_SECONDS - ELAPSED_SECONDS))"
  echo "Compare batch finished in $ELAPSED_SECONDS seconds; sleeping $SLEEP_SECONDS seconds to keep minimum $MIN_SECONDS seconds"
  sleep "$SLEEP_SECONDS"
fi

exit "$STATUS"
"""
    else:
        bash_command = f"""
set -euo pipefail
cd {PROJECT_ROOT_SHELL}

HEADLESS="${{WB_NICHE_HEADLESS:-true}}" \\
SCENARIO_INDEX="{{{{ params.scenario_index }}}}" \\
pnpm run {script_name}
"""
    return BashOperator(
        task_id=task_id,
        bash_command=bash_command,
        retries=retries,
    )


def pause_between_batches_task(task_id: str) -> BashOperator:
    return BashOperator(
        task_id=task_id,
        bash_command=f"""
set -euo pipefail
PAUSE_SECONDS="{COMPARE_BATCH_PAUSE_SECONDS}"
echo "Pausing $PAUSE_SECONDS seconds between compare batches"
sleep "$PAUSE_SECONDS"
""",
        retries=0,
    )


with DAG(
    dag_id="wb_niche_daily_collection",
    description="Collect WB niche report, search queries, and 10 compare-card batches.",
    start_date=datetime(2026, 6, 25),
    schedule=None,
    catchup=False,
    max_active_runs=1,
    params={
        "scenario_index": 0,
    },
    tags=["wb", "playwright", "niche-analysis"],
) as dag:
    start = EmptyOperator(task_id="start")

    preflight = pnpm_task(
        task_id="preflight_doctor",
        script_name="doctor",
        retries=0,
    )

    collect_niche_report = pnpm_task(
        task_id="collect_niche_report",
        script_name="niche-report",
        retries=1,
    )

    collect_niche_query_stats = pnpm_task(
        task_id="collect_niche_query_stats",
        script_name="niche-query-stats",
        retries=1,
    )

    create_compare_seed = pnpm_task(
        task_id="create_compare_seed",
        script_name="compare-cards",
        retries=0,
        enforce_min_compare_duration=True,
    )

    previous_compare_task = create_compare_seed

    for batch_number in range(2, TOTAL_COMPARE_BATCHES + 1):
        next_compare_task = pnpm_task(
            task_id=f"create_compare_next_{batch_number - 1:02d}",
            script_name="compare-cards-next",
            retries=0,
            enforce_min_compare_duration=True,
        )

        pause_task = pause_between_batches_task(
            f"pause_between_compare_batches_{batch_number - 1:02d}"
        )
        previous_compare_task >> pause_task >> next_compare_task
        previous_compare_task = next_compare_task

    finish = EmptyOperator(task_id="finish")

    (
        start
        >> preflight
        >> collect_niche_report
        >> collect_niche_query_stats
        >> create_compare_seed
    )
    previous_compare_task >> finish
