import { randomUUID } from "node:crypto";
import type {
  AutomationStorage,
  SaveCompareCardIdsOptions,
  SaveCompareCardIdsResult,
  SaveNicheQueryStatsOptions,
  SaveNicheQueryStatsResult,
  SaveNicheReportOptions,
  SaveNicheReportResult,
  SaveStepLogsOptions
} from "../../src/core/storage.js";
import type { StepExecutionLog } from "../../src/core/stepRunner.js";
import type { ParsedNicheQueryStats } from "../../src/steps/parseNicheQueryStats.js";
import type { ParsedNicheReport } from "../../src/steps/parseNicheReport.js";
import { assertSqliteSchemaReady, openSqliteDatabase } from "./connection.js";

type SqliteDb = ReturnType<typeof openSqliteDatabase>;

function nowIso(): string {
  return new Date().toISOString();
}

function getRunDurationMs(stepLogs: StepExecutionLog[]): number {
  return stepLogs.reduce((sum, stepLog) => sum + stepLog.durationMs, 0);
}

function withSqliteDb<T>(callback: (db: SqliteDb) => T): T {
  const db = openSqliteDatabase();

  try {
    assertSqliteSchemaReady(db);
    return callback(db);
  } finally {
    db.close();
  }
}

function insertRun(
  db: SqliteDb,
  scenarioName: string,
  scenarioConfig: unknown,
  runtimeConfig: unknown
): string {
  const runId = randomUUID();
  const timestamp = nowIso();

  db.prepare(
    `
      INSERT INTO automation_runs (
        run_id,
        scenario_name,
        scenario_config,
        runtime_config,
        status,
        started_at,
        finished_at
      )
      VALUES (?, ?, ?, ?, 'success', ?, ?)
    `
  ).run(
    runId,
    scenarioName,
    JSON.stringify(scenarioConfig),
    JSON.stringify(runtimeConfig),
    timestamp,
    timestamp
  );

  return runId;
}

function replaceStepLogs(
  db: SqliteDb,
  runId: string,
  stepLogs: StepExecutionLog[],
  source: string
): void {
  db.prepare("DELETE FROM automation_step_logs WHERE run_id = ?").run(runId);

  const insert = db.prepare(
    `
      INSERT INTO automation_step_logs (
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  for (const stepLog of stepLogs) {
    insert.run(
      runId,
      stepLog.index,
      stepLog.total,
      stepLog.name,
      stepLog.status,
      stepLog.startedAt.toISOString(),
      stepLog.finishedAt.toISOString(),
      stepLog.durationMs,
      stepLog.incidentType ?? null,
      stepLog.errorMessage ?? null,
      JSON.stringify({ source })
    );
  }
}

function saveStepLogs(options: SaveStepLogsOptions, source: string): Promise<void> {
  return Promise.resolve(
    withSqliteDb((db) => {
      const transaction = db.transaction(() => {
        db.prepare(
          `
            UPDATE automation_runs
            SET duration_ms = ?
            WHERE run_id = ?
          `
        ).run(getRunDurationMs(options.stepLogs), options.runId);
        replaceStepLogs(db, options.runId, options.stepLogs, source);
      });

      transaction();
    })
  );
}

function upsertNicheSnapshot(
  db: SqliteDb,
  runId: string,
  report: ParsedNicheReport | ParsedNicheQueryStats,
  updateRunId: boolean
): string {
  const { snapshot } = report;
  const snapshotId = randomUUID();

  db.prepare(
    `
      INSERT INTO wb_niche_snapshots (
        snapshot_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (
        snapshot_date,
        category_name,
        subject_name,
        period_type,
        period_start,
        period_end
      )
      DO UPDATE SET
        run_id = CASE
          WHEN ? = 1 THEN excluded.run_id
          ELSE wb_niche_snapshots.run_id
        END,
        wb_subject_id = excluded.wb_subject_id,
        comparison_start = excluded.comparison_start,
        comparison_end = excluded.comparison_end,
        source_url = excluded.source_url,
        parser_version = excluded.parser_version,
        created_at = datetime('now')
    `
  ).run(
    snapshotId,
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
    updateRunId ? 1 : 0
  );

  const row = db
    .prepare(
      `
        SELECT snapshot_id
        FROM wb_niche_snapshots
        WHERE snapshot_date = ?
          AND category_name = ?
          AND subject_name = ?
          AND period_type = ?
          AND period_start = ?
          AND period_end = ?
      `
    )
    .get(
      snapshot.snapshotDate,
      snapshot.categoryName,
      snapshot.subjectName,
      snapshot.periodType,
      snapshot.periodStart,
      snapshot.periodEnd
    ) as { snapshot_id: string } | undefined;

  if (!row) {
    throw new Error("sqlite: niche snapshot was not found after upsert");
  }

  return row.snapshot_id;
}

async function saveNicheReport(
  options: SaveNicheReportOptions
): Promise<SaveNicheReportResult> {
  return withSqliteDb((db) => {
    const transaction = db.transaction(() => {
      const runId = insertRun(
        db,
        "niche_report",
        { ...options.scenario, fallbackUsed: options.fallbackUsed },
        options.runtime
      );
      const snapshotId = upsertNicheSnapshot(db, runId, options.report, true);

      db.prepare("DELETE FROM wb_niche_metrics WHERE snapshot_id = ?").run(snapshotId);

      const insertMetric = db.prepare(
        `
          INSERT INTO wb_niche_metrics (
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const item of options.report.metrics) {
        insertMetric.run(
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
        );
      }

      return { runId, snapshotId };
    });

    return transaction() as SaveNicheReportResult;
  });
}

async function saveNicheQueryStats(
  options: SaveNicheQueryStatsOptions
): Promise<SaveNicheQueryStatsResult> {
  return withSqliteDb((db) => {
    const transaction = db.transaction(() => {
      const runId = insertRun(
        db,
        "niche_query_stats",
        {
          ...options.scenario,
          fallbackUsed: options.fallbackUsed,
          parsedSearchQueries: options.report.searchQueries.length
        },
        options.runtime
      );
      const snapshotId = upsertNicheSnapshot(db, runId, options.report, false);

      db.prepare("DELETE FROM wb_niche_search_queries WHERE snapshot_id = ?").run(
        snapshotId
      );

      const insertSearchQuery = db.prepare(
        `
          INSERT INTO wb_niche_search_queries (
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const item of options.report.searchQueries) {
        insertSearchQuery.run(
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
        );
      }

      return {
        runId,
        snapshotId,
        savedCount: options.report.searchQueries.length
      };
    });

    return transaction() as SaveNicheQueryStatsResult;
  });
}

async function saveCompareCardIds(
  options: SaveCompareCardIdsOptions
): Promise<SaveCompareCardIdsResult> {
  const uniqueNmIds = new Set(options.items.map((item) => item.nmId));

  if (uniqueNmIds.size !== options.items.length) {
    throw new Error("schema_changed: parsed compare card IDs contain duplicates");
  }

  return withSqliteDb((db) => {
    const transaction = db.transaction(() => {
      const runId = insertRun(
        db,
        "compare_cards",
        {
          ...options.scenario,
          sourceUrl: options.sourceUrl,
          parsedCardIds: options.items.length
        },
        options.runtime
      );
      const insertRecommendation = db.prepare(
        `
          INSERT INTO wb_compare_card_recommendations (
            run_id,
            rank_position,
            nm_id,
            subject_name,
            top_by,
            source_url
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `
      );

      for (const item of options.items) {
        insertRecommendation.run(
          runId,
          item.rankPosition,
          item.nmId,
          options.scenario.subject,
          options.scenario.topBy,
          item.productUrl
        );
      }

      return {
        runId,
        savedCount: options.items.length
      };
    });

    return transaction() as SaveCompareCardIdsResult;
  });
}

async function loadManualCompareCardIds(
  runId: string,
  limit: number
): Promise<string[]> {
  return withSqliteDb((db) => {
    const rows = db
      .prepare(
        `
          SELECT CAST(nm_id AS TEXT) AS nm_id
          FROM wb_compare_card_recommendations
          WHERE run_id = ?
          ORDER BY rank_position
          LIMIT ?
        `
      )
      .all(runId, limit) as Array<{ nm_id: string }>;

    return rows.map((row) => row.nm_id);
  });
}

export function createSqliteStorage(): AutomationStorage {
  return {
    saveNicheReport,
    saveNicheReportStepLogs: (options) => saveStepLogs(options, "stepRunner"),
    saveNicheQueryStats,
    saveNicheQueryStatsStepLogs: (options) =>
      saveStepLogs(options, "nicheQueryStatsFlow"),
    saveCompareCardIds,
    saveCompareCardStepLogs: (options) =>
      saveStepLogs(options, "compareCardsFlow"),
    loadManualCompareCardIds
  };
}
