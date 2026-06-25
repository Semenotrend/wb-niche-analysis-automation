import { withDbClient, type DbClient } from "./db.js";
import type { StepExecutionLog } from "./stepRunner.js";
import type {
  AutomationStorage,
  MarkCompareCardsUsedForComparisonOptions,
  MarkCompareCardsUsedForComparisonResult,
  SaveCompareCardIdsOptions,
  SaveCompareCardIdsResult,
  SaveNicheQueryStatsOptions,
  SaveNicheQueryStatsResult,
  SaveNicheReportOptions,
  SaveNicheReportResult,
  SaveStepLogsOptions
} from "./storage.js";
import type { ParsedNicheQueryStats } from "../steps/parseNicheQueryStats.js";
import type { ParsedNicheReport } from "../steps/parseNicheReport.js";

function getRunDurationMs(stepLogs: StepExecutionLog[]): number {
  return stepLogs.reduce((sum, stepLog) => sum + stepLog.durationMs, 0);
}

async function insertRun(
  client: DbClient,
  scenarioName: string,
  scenarioConfig: unknown,
  runtimeConfig: unknown
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
      VALUES ($1, $2::jsonb, $3::jsonb, 'success', now(), now())
      RETURNING run_id
    `,
    [scenarioName, JSON.stringify(scenarioConfig), JSON.stringify(runtimeConfig)]
  );

  return result.rows[0].run_id;
}

async function replaceStepLogs(
  client: DbClient,
  runId: string,
  stepLogs: StepExecutionLog[],
  source: string
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
        JSON.stringify({ source })
      ]
    );
  }
}

async function updateRunDurationAndStepLogs(
  options: SaveStepLogsOptions,
  source: string
): Promise<void> {
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
      await replaceStepLogs(client, options.runId, options.stepLogs, source);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function upsertNicheSnapshot(
  client: DbClient,
  runId: string,
  report: ParsedNicheReport | ParsedNicheQueryStats,
  updateRunId: boolean
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
        run_id = CASE WHEN $13 THEN EXCLUDED.run_id ELSE wb_analytics.niche_snapshots.run_id END,
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
      snapshot.parserVersion,
      updateRunId
    ]
  );

  return result.rows[0].snapshot_id;
}

async function saveNicheReport(
  options: SaveNicheReportOptions
): Promise<SaveNicheReportResult> {
  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const runId = await insertRun(
        client,
        "niche_report",
        { ...options.scenario, fallbackUsed: options.fallbackUsed },
        options.runtime
      );
      const snapshotId = await upsertNicheSnapshot(client, runId, options.report, true);

      await client.query("DELETE FROM wb_analytics.niche_metrics WHERE snapshot_id = $1", [
        snapshotId
      ]);

      for (const item of options.report.metrics) {
        await client.query(
          `
            INSERT INTO wb_analytics.niche_metrics (
              snapshot_id,
              subject_name,
              wb_subject_id,
              metric_code,
              metric_name,
              value_numeric,
              value_text,
              unit,
              delta_value,
              delta_unit,
              delta_direction
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            snapshotId,
            options.report.snapshot.subjectName,
            options.report.snapshot.wbSubjectId,
            item.metricCode,
            item.metricName,
            item.valueNumeric,
            item.valueText,
            item.unit,
            item.deltaValue,
            item.deltaUnit,
            item.deltaDirection
          ]
        );
      }

      await client.query("COMMIT");
      return { runId, snapshotId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function saveNicheQueryStats(
  options: SaveNicheQueryStatsOptions
): Promise<SaveNicheQueryStatsResult> {
  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const runId = await insertRun(
        client,
        "niche_query_stats",
        {
          ...options.scenario,
          fallbackUsed: options.fallbackUsed,
          parsedSearchQueries: options.report.searchQueries.length
        },
        options.runtime
      );
      const snapshotId = await upsertNicheSnapshot(client, runId, options.report, false);

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

async function saveCompareCardIds(
  options: SaveCompareCardIdsOptions
): Promise<SaveCompareCardIdsResult> {
  const uniqueNmIds = new Set(options.items.map((item) => item.nmId));

  if (uniqueNmIds.size !== options.items.length) {
    throw new Error("schema_changed: parsed compare card IDs contain duplicates");
  }

  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const runId = await insertRun(
        client,
        "compare_cards",
        {
          ...options.scenario,
          sourceUrl: options.sourceUrl,
          parsedCardIds: options.items.length
        },
        options.runtime
      );

      for (const item of options.items) {
        await client.query(
          `
            INSERT INTO wb_analytics.compare_card_recommendations (
              run_id,
              rank_position,
              nm_id,
              subject_name,
              top_by,
              source_url
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            runId,
            item.rankPosition,
            item.nmId,
            options.scenario.subject,
            options.scenario.topBy,
            item.productUrl
          ]
        );
      }

      await client.query("COMMIT");

      return {
        runId,
        savedCount: options.items.length
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function loadManualCompareCardIds(
  runId: string,
  limit: number
): Promise<string[]> {
  return withDbClient(async (client) => {
    const result = await client.query<{ nm_id: string }>(
      `
        SELECT nm_id::text AS nm_id
        FROM wb_analytics.compare_card_recommendations
        WHERE run_id = $1
          AND used_for_comparison = false
        ORDER BY rank_position
        LIMIT $2
      `,
      [runId, limit]
    );

    return result.rows.map((row) => row.nm_id);
  });
}

async function markCompareCardsUsedForComparison(
  options: MarkCompareCardsUsedForComparisonOptions
): Promise<MarkCompareCardsUsedForComparisonResult> {
  const uniqueNmIds = new Set(options.nmIds);

  if (options.nmIds.length === 0) {
    throw new Error("empty_result: no compare card IDs to mark as used");
  }

  if (uniqueNmIds.size !== options.nmIds.length) {
    throw new Error("schema_changed: duplicate compare card IDs to mark as used");
  }

  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const requestResult = await client.query<{ request_id: string }>(
        `
          INSERT INTO wb_analytics.compare_card_comparison_requests (
            run_id,
            status,
            selected_count,
            source_url,
            submitted_at,
            raw_payload
          )
          VALUES ($1, 'submitted', $2, $3, now(), $4::jsonb)
          RETURNING request_id
        `,
        [
          options.runId,
          options.nmIds.length,
          options.sourceUrl,
          JSON.stringify({ nmIds: options.nmIds })
        ]
      );
      const comparisonRequestId = requestResult.rows[0].request_id;

      for (const [index, nmId] of options.nmIds.entries()) {
        const updateResult = await client.query(
          `
            UPDATE wb_analytics.compare_card_recommendations
            SET
              used_for_comparison = true,
              comparison_request_id = $2,
              comparison_slot = $3,
              used_at = now()
            WHERE run_id = $1
              AND nm_id = $4
              AND used_for_comparison = false
          `,
          [options.runId, comparisonRequestId, index + 1, nmId]
        );

        if ((updateResult.rowCount ?? 0) !== 1) {
          throw new Error(
            `empty_result: expected one unused compare card ID "${nmId}" to mark`
          );
        }
      }

      await client.query("COMMIT");

      return {
        comparisonRequestId,
        markedCount: options.nmIds.length
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export function createPostgresStorage(): AutomationStorage {
  return {
    saveNicheReport,
    saveNicheReportStepLogs: (options) =>
      updateRunDurationAndStepLogs(options, "stepRunner"),
    saveNicheQueryStats,
    saveNicheQueryStatsStepLogs: (options) =>
      updateRunDurationAndStepLogs(options, "nicheQueryStatsFlow"),
    saveCompareCardIds,
    saveCompareCardStepLogs: (options) =>
      updateRunDurationAndStepLogs(options, "compareCardsFlow"),
    loadManualCompareCardIds,
    markCompareCardsUsedForComparison
  };
}
