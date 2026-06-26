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
TOTAL_CONTINUE_BATCHES = int(
    os.environ.get("WB_NICHE_CONTINUE_COMPARE_BATCHES_TOTAL", "8")
)
MIN_COMPARE_BATCH_SECONDS = int(
    os.environ.get("WB_NICHE_COMPARE_BATCH_MIN_SECONDS", "60")
)
COMPARE_BATCH_PAUSE_SECONDS = int(
    os.environ.get("WB_NICHE_COMPARE_BATCH_PAUSE_SECONDS", "60")
)

if TOTAL_CONTINUE_BATCHES < 1:
    raise ValueError("WB_NICHE_CONTINUE_COMPARE_BATCHES_TOTAL must be at least 1")

if MIN_COMPARE_BATCH_SECONDS < 60:
    raise ValueError("WB_NICHE_COMPARE_BATCH_MIN_SECONDS must be at least 60")

if COMPARE_BATCH_PAUSE_SECONDS < 60:
    raise ValueError("WB_NICHE_COMPARE_BATCH_PAUSE_SECONDS must be at least 60")


def compare_next_task(task_id: str) -> BashOperator:
    return BashOperator(
        task_id=task_id,
        bash_command=f"""
set -euo pipefail
cd {PROJECT_ROOT_SHELL}

STARTED_AT="$(date +%s)"
set +e
HEADLESS="${{WB_NICHE_HEADLESS:-true}}" \\
SCENARIO_INDEX="{{{{ params.scenario_index }}}}" \\
SOURCE_RUN_ID="{{{{ params.source_run_id }}}}" \\
pnpm run compare-cards-next
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
""",
        retries=0,
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
    dag_id="wb_niche_continue_compare_pool",
    description="Continue an existing WB compare-card source pool with compare-cards-next tasks.",
    start_date=datetime(2026, 6, 25),
    schedule=None,
    catchup=False,
    max_active_runs=1,
    params={
        "scenario_index": 0,
        "source_run_id": "37400677-4e90-4668-9a04-6a0c458a6e3a",
    },
    tags=["wb", "playwright", "niche-analysis", "continue-pool"],
) as dag:
    start = EmptyOperator(task_id="start")

    validate_source_run_id = BashOperator(
        task_id="validate_source_run_id",
        bash_command="""
set -euo pipefail
SOURCE_RUN_ID="{{ params.source_run_id }}"
if ! printf '%s' "$SOURCE_RUN_ID" | grep -Eq '^[0-9a-fA-F-]{36}$'; then
  echo "source_run_id Airflow param must be a UUID, got: $SOURCE_RUN_ID"
  exit 1
fi
""",
        retries=0,
    )

    validate_source_pool = BashOperator(
        task_id="validate_source_pool",
        bash_command=f"""
set -euo pipefail
cd {PROJECT_ROOT_SHELL}

SCENARIO_INDEX="{{{{ params.scenario_index }}}}" \\
SOURCE_RUN_ID="{{{{ params.source_run_id }}}}" \\
EXPECTED_COMPARE_BATCHES="{TOTAL_CONTINUE_BATCHES}" \\
pnpm run compare-pool-status
""",
        retries=0,
    )

    previous_task = validate_source_pool

    for batch_number in range(1, TOTAL_CONTINUE_BATCHES + 1):
        next_task = compare_next_task(f"continue_compare_next_{batch_number:02d}")
        previous_task >> next_task
        previous_task = next_task

        if batch_number < TOTAL_CONTINUE_BATCHES:
            pause_task = pause_between_batches_task(
                f"pause_between_compare_batches_{batch_number:02d}"
            )
            previous_task >> pause_task
            previous_task = pause_task

    finish = EmptyOperator(task_id="finish")

    start >> validate_source_run_id >> validate_source_pool
    previous_task >> finish
