import type { Page } from "playwright";
import type { RuntimeConfig } from "../core/config.js";
import type { StepRunner } from "../core/stepRunner.js";
import { openCompareCardsPage } from "../steps/openCompareCardsPage.js";
import { openVisibleComparisonReport } from "../steps/openVisibleComparisonReport.js";
import {
  COMPARISON_CHART_METRICS,
  combineParsedComparisonChartDaily,
  parseComparisonChartDaily
} from "../steps/parseComparisonChartDaily.js";
import { parseExistingComparisonList } from "../steps/parseExistingComparisonList.js";
import { selectComparisonQuarterPeriod } from "../steps/selectComparisonQuarterPeriod.js";
import {
  markExistingCompareReportRunFailed,
  saveComparisonChartDailyToDb,
  saveExistingComparisonListToDb,
  type SaveExistingComparisonListResult
} from "../steps/saveExistingCompareReportToDb.js";
import type { ParsedExistingComparisonReport } from "../steps/parseExistingComparisonList.js";

export const IMPLEMENTED_EXISTING_COMPARE_REPORTS_STEPS =
  6 + COMPARISON_CHART_METRICS.length;

type DomRectPayload = {
  y: number;
  height: number;
};

function isDomRectPayload(value: unknown): value is DomRectPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.y === "number" && typeof record.height === "number";
}

function isInCurrentViewport(
  report: ParsedExistingComparisonReport,
  viewportHeight: number
): boolean {
  const domRect = report.rawPayload.domRect;

  if (!isDomRectPayload(domRect)) {
    return true;
  }

  return domRect.y < viewportHeight && domRect.y + domRect.height > 0;
}

export async function runExistingCompareReportsFlow(options: {
  page: Page;
  runtime: RuntimeConfig;
  stepRunner: StepRunner;
}): Promise<SaveExistingComparisonListResult> {
  const { page, runtime, stepRunner } = options;
  let runId: string | null = null;

  try {
    await stepRunner.runStep("openCompareCardsPage", () =>
      openCompareCardsPage(page)
    );

    const reports = await stepRunner.runStep("parseExistingComparisonList", () =>
      parseExistingComparisonList(page)
    );
    const selectedReport = reports.find(
      (report) =>
        report.cardsCount === 5 && isInCurrentViewport(report, runtime.viewport.height)
    );

    if (selectedReport === undefined) {
      throw new Error(
        "empty_result: no visible comparison report with exactly 5 SKU was found"
      );
    }

    const listSaveResult = await stepRunner.runStep(
      "saveVisibleComparisonReportToDb",
      () =>
        saveExistingComparisonListToDb({
          runtime,
          reports: [selectedReport],
          sourceUrl: page.url()
        })
    );
    runId = listSaveResult.runId;

    await stepRunner.runStep("openVisibleComparisonReport", () =>
      openVisibleComparisonReport(page, selectedReport)
    );

    await stepRunner.runStep("selectComparisonQuarterPeriod", () =>
      selectComparisonQuarterPeriod(page)
    );

    const metricCharts = [];

    for (const metric of COMPARISON_CHART_METRICS) {
      const chart = await stepRunner.runStep(
        `parseComparisonChartDaily:${metric.code}`,
        () => parseComparisonChartDaily(page, selectedReport, metric)
      );

      metricCharts.push(chart);
    }

    const chartBatch = combineParsedComparisonChartDaily(metricCharts);

    const chartSaveResult = await stepRunner.runStep(
      "saveComparisonChartDailyToDb",
      () =>
        saveComparisonChartDailyToDb({
          reportId: listSaveResult.reportId,
          chart: chartBatch
        })
    );

    return {
      ...listSaveResult,
      savedChartPoints: chartSaveResult.savedChartPoints
    };
  } catch (error) {
    if (runId !== null) {
      await markExistingCompareReportRunFailed({
        runId,
        stepLogs: stepRunner.getStepLogs(),
        error
      });
    }

    throw error;
  }
}
