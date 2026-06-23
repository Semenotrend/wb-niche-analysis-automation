import type { RuntimeConfig, ScenarioConfig } from "../core/config.js";
import { withDbClient, type DbClient } from "../core/db.js";
import type { StepExecutionLog } from "../core/stepRunner.js";
import type { ParsedNicheReport } from "./parseNicheReport.js";

export type SaveNicheReportOptions = {
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  report: ParsedNicheReport;
  fallbackUsed: boolean;
};

export type SaveNicheReportResult = {
  runId: string;
  snapshotId: string;
};

async function insertRun(
  client: DbClient,
  scenario: ScenarioConfig,
  runtime: RuntimeConfig,
  fallbackUsed: boolean
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
      VALUES ('niche_report', $1::jsonb, $2::jsonb, 'success', now(), now())
      RETURNING run_id
    `,
    [
      JSON.stringify({ ...scenario, fallbackUsed }),
      JSON.stringify(runtime)
    ]
  );

  return result.rows[0].run_id;
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
        JSON.stringify({ source: "stepRunner" })
      ]
    );
  }
}

async function upsertSnapshot(
  client: DbClient,
  runId: string,
  report: ParsedNicheReport
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
        run_id = EXCLUDED.run_id,
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

export async function saveNicheReportToDb(
  options: SaveNicheReportOptions
): Promise<SaveNicheReportResult> {
  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const runId = await insertRun(
        client,
        options.scenario,
        options.runtime,
        options.fallbackUsed
      );
      const snapshotId = await upsertSnapshot(client, runId, options.report);

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

export async function saveNicheReportStepLogs(options: {
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
