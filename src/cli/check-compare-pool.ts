import { withDbClient } from "../core/db.js";
import { loadScenarioConfig } from "../core/config.js";

const COMPARE_BATCH_SIZE = 5;

function readSourceRunId(): string {
  const value = process.env.SOURCE_RUN_ID?.trim();

  if (value === undefined || value === "") {
    throw new Error("compare-pool-status: SOURCE_RUN_ID must not be empty");
  }

  if (!/^[0-9a-fA-F-]{36}$/.test(value)) {
    throw new Error(`compare-pool-status: SOURCE_RUN_ID must be a UUID, got ${value}`);
  }

  return value;
}

function readExpectedBatches(): number {
  const rawValue = process.env.EXPECTED_COMPARE_BATCHES?.trim() ?? "1";

  if (!/^\d+$/.test(rawValue)) {
    throw new Error("compare-pool-status: EXPECTED_COMPARE_BATCHES must be an integer");
  }

  const value = Number(rawValue);

  if (value < 1) {
    throw new Error("compare-pool-status: EXPECTED_COMPARE_BATCHES must be at least 1");
  }

  return value;
}

async function main(): Promise<void> {
  const [scenario, sourceRunId, expectedBatches] = await Promise.all([
    loadScenarioConfig(),
    Promise.resolve(readSourceRunId()),
    Promise.resolve(readExpectedBatches())
  ]);

  const expectedSkuCount = expectedBatches * COMPARE_BATCH_SIZE;

  await withDbClient(async (client) => {
    const result = await client.query<{
      available_count: string;
      used_count: string;
      total_count: string;
    }>(
      `
        SELECT
          count(*) FILTER (
            WHERE candidate.used_for_comparison = false
              AND NOT EXISTS (
                SELECT 1
                FROM wb_analytics.compare_card_recommendations AS used
                WHERE used.nm_id = candidate.nm_id
                  AND used.used_for_comparison = true
              )
          )::text AS available_count,
          count(*) FILTER (WHERE candidate.used_for_comparison = true)::text AS used_count,
          count(*)::text AS total_count
        FROM wb_analytics.compare_card_recommendations AS candidate
        WHERE candidate.run_id = $1
          AND candidate.subject_name = $2
          AND candidate.top_by = $3
      `,
      [sourceRunId, scenario.subject, scenario.topBy]
    );

    const row = result.rows[0];
    const availableCount = Number(row.available_count);
    const usedCount = Number(row.used_count);
    const totalCount = Number(row.total_count);
    const availableBatches = Math.floor(availableCount / COMPARE_BATCH_SIZE);

    console.log(
      [
        "[compare-pool-status]",
        `source_run_id=${sourceRunId}`,
        `subject=${scenario.subject}`,
        `top_by=${scenario.topBy}`,
        `total_skus=${totalCount}`,
        `used_skus=${usedCount}`,
        `available_skus=${availableCount}`,
        `available_batches=${availableBatches}`,
        `expected_batches=${expectedBatches}`
      ].join(" ")
    );

    if (totalCount === 0) {
      throw new Error(
        `compare-pool-status: source run ${sourceRunId} has no recommendations for ${scenario.subject} / ${scenario.topBy}`
      );
    }

    if (availableCount < expectedSkuCount) {
      throw new Error(
        `compare-pool-status: source run ${sourceRunId} has ${availableCount} free SKU, expected at least ${expectedSkuCount}`
      );
    }
  });
}

main().catch((error: unknown) => {
  console.error("[compare-pool-status] Check failed.");
  console.error(error);
  process.exitCode = 1;
});
