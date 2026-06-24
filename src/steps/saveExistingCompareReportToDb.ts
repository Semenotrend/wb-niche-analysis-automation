import { withDbClient, type DbClient } from "../core/db.js";
import type { RuntimeConfig } from "../core/config.js";
import { classifyIncident } from "../core/incidents.js";
import type { StepExecutionLog } from "../core/stepRunner.js";
import type { ParsedComparisonChartDailyBatch } from "./parseComparisonChartDaily.js";
import type {
  ParsedComparisonPreviewItem,
  ParsedExistingComparisonReport
} from "./parseExistingComparisonList.js";

export type SaveExistingComparisonListOptions = {
  runtime: RuntimeConfig;
  reports: ParsedExistingComparisonReport[];
  sourceUrl: string;
};

export type SaveExistingComparisonListResult = {
  runId: string;
  savedReports: number;
  savedItems: number;
  reportId: string;
  savedChartPoints?: number;
};

export type SaveComparisonChartDailyOptions = {
  reportId: string;
  chart: ParsedComparisonChartDailyBatch;
};

export type SaveComparisonChartDailyResult = {
  savedChartPoints: number;
};

export type SaveExistingCompareReportStepLogsOptions = {
  runId: string;
  stepLogs: StepExecutionLog[];
};

export type MarkExistingCompareReportRunFailedOptions = {
  runId: string;
  stepLogs: StepExecutionLog[];
  error: unknown;
};

function getRunDurationMs(stepLogs: StepExecutionLog[]): number {
  return stepLogs.reduce((sum, stepLog) => sum + stepLog.durationMs, 0);
}

async function insertRunningRun(
  client: DbClient,
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
        started_at
      )
      VALUES ($1, $2::jsonb, $3::jsonb, 'running', now())
      RETURNING run_id
    `,
    [
      "existing_compare_reports",
      JSON.stringify(scenarioConfig),
      JSON.stringify(runtimeConfig)
    ]
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

function reportPayload(report: ParsedExistingComparisonReport): Record<string, unknown> {
  return {
    ...report.rawPayload,
    previewItems: report.previewItems
  };
}

async function insertReport(
  client: DbClient,
  runId: string,
  report: ParsedExistingComparisonReport,
  sourceUrl: string
): Promise<string> {
  const result = await client.query<{ report_id: string }>(
    `
      INSERT INTO wb_analytics.compare_card_reports (
        run_id,
        list_rank,
        comparison_date,
        comparison_date_text,
        available_until_text,
        available_until_at,
        cards_count,
        source_url,
        report_fingerprint,
        raw_text,
        raw_payload,
        parser_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, 'v1')
      RETURNING report_id
    `,
    [
      runId,
      report.listRank,
      report.comparisonDate,
      report.comparisonDateText,
      report.availableUntilText,
      report.availableUntilAt,
      report.cardsCount,
      sourceUrl,
      report.reportFingerprint,
      report.rawText,
      JSON.stringify(reportPayload(report))
    ]
  );

  return result.rows[0].report_id;
}

async function savePreviewReportItem(
  client: DbClient,
  reportId: string,
  item: ParsedComparisonPreviewItem
): Promise<void> {
  await client.query(
    `
      INSERT INTO wb_analytics.compare_card_report_items (
        report_id,
        slot_position,
        nm_id,
        product_name,
        product_url,
        image_url,
        raw_text
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      reportId,
      item.slotPosition,
      item.nmId,
      item.productName,
      item.productUrl,
      item.imageUrl,
      item.rawText
    ]
  );
}

export async function saveExistingComparisonListToDb(
  options: SaveExistingComparisonListOptions
): Promise<SaveExistingComparisonListResult> {
  if (options.reports.length === 0) {
    throw new Error("empty_result: no comparison reports to save");
  }

  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const runId = await insertRunningRun(
        client,
        {
          sourceUrl: options.sourceUrl,
          parsedReports: options.reports.length,
          mode: "visible_first_five_sku_report"
        },
        options.runtime
      );
      let savedItems = 0;
      let selectedReportId: string | null = null;

      for (const report of options.reports) {
        const reportId = await insertReport(client, runId, report, options.sourceUrl);
        selectedReportId ??= reportId;

        for (const item of report.previewItems.slice(0, 5)) {
          await savePreviewReportItem(client, reportId, item);
          savedItems += 1;
        }
      }

      await client.query(
        `
          UPDATE automation.runs
          SET
            status = 'success',
            finished_at = now(),
            scenario_config = scenario_config || $2::jsonb
          WHERE run_id = $1
        `,
        [
          runId,
          JSON.stringify({
            savedReports: options.reports.length,
            savedItems
          })
        ]
      );

      if (selectedReportId === null) {
        throw new Error("empty_result: no comparison report was saved");
      }

      await client.query("COMMIT");
      return {
        runId,
        savedReports: options.reports.length,
        savedItems,
        reportId: selectedReportId
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveComparisonChartDailyToDb(
  options: SaveComparisonChartDailyOptions
): Promise<SaveComparisonChartDailyResult> {
  if (options.chart.points.length === 0) {
    throw new Error("empty_result: no chart daily points to save");
  }

  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `
          DELETE FROM wb_analytics.compare_card_report_chart_daily
          WHERE report_id = $1
            AND period_type = $2
            AND granularity = $3
            AND metric_name = ANY($4::text[])
        `,
        [
          options.reportId,
          options.chart.periodType,
          options.chart.granularity,
          options.chart.metricNames
        ]
      );

      for (const point of options.chart.points) {
        await client.query(
          `
            INSERT INTO wb_analytics.compare_card_report_chart_daily (
              report_id,
              metric_name,
              period_type,
              granularity,
              nm_id,
              metric_date,
              value_numeric,
              value_state,
              is_baseline_zero,
              unit,
              source,
              stroke_color,
              raw_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
          `,
          [
            options.reportId,
            point.metricName,
            point.periodType,
            point.granularity,
            point.nmId,
            point.metricDate,
            point.valueNumeric,
            point.valueState,
            point.isBaselineZero,
            point.unit,
            point.source,
            point.strokeColor,
            JSON.stringify(point.rawPayload)
          ]
        );
      }

      await client.query(
        `
          UPDATE automation.runs AS run
          SET scenario_config = run.scenario_config || $2::jsonb
          FROM wb_analytics.compare_card_reports AS report
          WHERE report.report_id = $1
            AND report.run_id = run.run_id
        `,
        [
          options.reportId,
          JSON.stringify({
            savedChartPoints: options.chart.points.length,
            chartMetricNames: options.chart.metricNames,
            chartPeriodType: options.chart.periodType,
            chartGranularity: options.chart.granularity,
            chartPeriodStart: options.chart.periodStart,
            chartPeriodEnd: options.chart.periodEnd
          })
        ]
      );

      await client.query("COMMIT");
      return {
        savedChartPoints: options.chart.points.length
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveExistingCompareReportStepLogs(
  options: SaveExistingCompareReportStepLogsOptions
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
      await replaceStepLogs(
        client,
        options.runId,
        options.stepLogs,
        "existingCompareReportsFlow"
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function markExistingCompareReportRunFailed(
  options: MarkExistingCompareReportRunFailedOptions
): Promise<void> {
  const incidentType = classifyIncident(options.error);

  await withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `
          UPDATE automation.runs
          SET
            status = 'failed',
            incident_type = $2,
            finished_at = coalesce(finished_at, now()),
            duration_ms = $3
          WHERE run_id = $1
        `,
        [options.runId, incidentType, getRunDurationMs(options.stepLogs)]
      );
      await replaceStepLogs(
        client,
        options.runId,
        options.stepLogs,
        "existingCompareReportsFlow"
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
