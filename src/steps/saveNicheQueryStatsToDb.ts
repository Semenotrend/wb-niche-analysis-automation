import type { RuntimeConfig, ScenarioConfig } from "../core/config.js";
import { withDbClient, type DbClient } from "../core/db.js";
import type { StepExecutionLog } from "../core/stepRunner.js";
import type { ParsedNicheQueryStats } from "./parseNicheQueryStats.js";

export type SaveNicheQueryStatsOptions = {
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  report: ParsedNicheQueryStats;
  fallbackUsed: boolean;
};

export type SaveNicheQueryStatsResult = {
  runId: string;
  snapshotId: string;
  savedCount: number;
};

async function insertRun(
  client: DbClient,
  options: SaveNicheQueryStatsOptions
): Promise<string> {
  const result = await client.query<{ run_id: string }>(
    `
      INSERT INTO automation.runs (
        scenario_name,
        scenario_config,
        runtime_config,
        status,
        started_at,
        finished_at
      )
      VALUES ('niche_query_stats', $1::jsonb, $2::jsonb, 'success', now(), now())
      RETURNING run_id
    `,
    [
      JSON.stringify({
        ...options.scenario,
        fallbackUsed: options.fallbackUsed,
        parsedSearchQueries: options.report.searchQueries.length
      }),
      JSON.stringify(options.runtime)
    ]
  );

  return result.rows[0].run_id;
}

async function upsertSnapshot(
  client: DbClient,
  runId: string,
  report: ParsedNicheQueryStats
): Promise<string> {
  const { snapshot } = report;
  const result = await client.query<{ snapshot_id: string }>(
    `
      INSERT INTO wb_analytics.niche_snapshots (
        run_id,
        snapshot_date,
        category_name,
        subject_name,
        wb_subject_id,
        period_type,
        period_start,
        period_end,
        comparison_start,
        comparison_end,
        source_url,
        parser_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (
        snapshot_date,
        category_name,
        subject_name,
        period_type,
        period_start,
        period_end
      )
      DO UPDATE SET
        wb_subject_id = EXCLUDED.wb_subject_id,
        comparison_start = EXCLUDED.comparison_start,
        comparison_end = EXCLUDED.comparison_end,
        source_url = EXCLUDED.source_url,
        parser_version = EXCLUDED.parser_version,
        created_at = now()
      RETURNING snapshot_id
    `,
    [
      runId,
      snapshot.snapshotDate,
      snapshot.categoryName,
      snapshot.subjectName,
      snapshot.wbSubjectId,
      snapshot.periodType,
      snapshot.periodStart,
      snapshot.periodEnd,
      snapshot.comparisonStart,
      snapshot.comparisonEnd,
      snapshot.sourceUrl,
      snapshot.parserVersion
    ]
  );

  return result.rows[0].snapshot_id;
}

function getRunDurationMs(stepLogs: StepExecutionLog[]): number {
  return stepLogs.reduce((sum, stepLog) => sum + stepLog.durationMs, 0);
}

async function replaceStepLogs(
  client: DbClient,
  runId: string,
  stepLogs: StepExecutionLog[]
): Promise<void> {
  await client.query("DELETE FROM automation.step_logs WHERE run_id = $1", [runId]);

  for (const stepLog of stepLogs) {
    await client.query(
      `
        INSERT INTO automation.step_logs (
          run_id,
          step_index,
          step_total,
          step_name,
          status,
          started_at,
          finished_at,
          duration_ms,
          incident_type,
          error_message,
          meta
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        runId,
        stepLog.index,
        stepLog.total,
        stepLog.name,
        stepLog.status,
        stepLog.startedAt,
        stepLog.finishedAt,
        stepLog.durationMs,
        stepLog.incidentType ?? null,
        stepLog.errorMessage ?? null,
        JSON.stringify({ source: "nicheQueryStatsFlow" })
      ]
    );
  }
}

export async function saveNicheQueryStatsToDb(
  options: SaveNicheQueryStatsOptions
): Promise<SaveNicheQueryStatsResult> {
  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const runId = await insertRun(client, options);
      const snapshotId = await upsertSnapshot(client, runId, options.report);

      await client.query(
        "DELETE FROM wb_analytics.niche_search_queries WHERE snapshot_id = $1",
        [snapshotId]
      );

      for (const item of options.report.searchQueries) {
        await client.query(
          `
            INSERT INTO wb_analytics.niche_search_queries (
              snapshot_id,
              rank_position,
              query_text,
              query_count,
              cart_conversion_pct,
              cart_conversion_delta_pct,
              cart_conversion_delta_direction,
              order_conversion_pct,
              order_conversion_delta_pct,
              order_conversion_delta_direction,
              raw_text
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            snapshotId,
            item.rankPosition,
            item.queryText,
            item.queryCount,
            item.cartConversionPct,
            item.cartConversionDeltaPct,
            item.cartConversionDeltaDirection,
            item.orderConversionPct,
            item.orderConversionDeltaPct,
            item.orderConversionDeltaDirection,
            item.rawText
          ]
        );
      }

      await client.query("COMMIT");
      return {
        runId,
        snapshotId,
        savedCount: options.report.searchQueries.length
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveNicheQueryStatsStepLogs(options: {
  runId: string;
  stepLogs: StepExecutionLog[];
}): Promise<void> {
  await withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `
          UPDATE automation.runs
          SET duration_ms = $2
          WHERE run_id = $1
        `,
        [options.runId, getRunDurationMs(options.stepLogs)]
      );
      await replaceStepLogs(client, options.runId, options.stepLogs);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
