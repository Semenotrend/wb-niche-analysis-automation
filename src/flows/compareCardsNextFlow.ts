import type { Page } from "playwright";
import type { RuntimeConfig, ScenarioConfig } from "../core/config.js";
import type { StepRunner } from "../core/stepRunner.js";
import {
  addManualCompareCardIds,
  loadManualCompareCardIdsFromDb,
  MANUAL_COMPARE_CARD_LIMIT
} from "../steps/addManualCompareCard.js";
import { openCompareCardsPage } from "../steps/openCompareCardsPage.js";
import {
  attachComparisonApiCapture,
  parseOpenedComparisonChartDailyFromApi
} from "../steps/parseComparisonChartDaily.js";
import { parseOpenedComparisonReport } from "../steps/parseOpenedComparisonReport.js";
import { selectComparisonQuarterPeriod } from "../steps/selectComparisonQuarterPeriod.js";
import {
  saveComparisonChartDailyToDb,
  saveSubmittedComparisonReportToDb
} from "../steps/saveExistingCompareReportToDb.js";
import {
  createCompareCardsNextRun,
  markCompareCardsComparisonSubmitted,
  markCompareCardsNextRunFailed,
  reserveCompareCardsForComparison
} from "../steps/saveCompareCardIdsToDb.js";
import { startCompareCards } from "../steps/startCompareCards.js";
import { submitCompareCards } from "../steps/submitCompareCards.js";

export const IMPLEMENTED_COMPARE_CARDS_NEXT_STEPS = 14;

export type CompareCardsNextFlowResult = {
  runId: string;
  sourceRunId: string;
  sourceAvailableBeforeRun: number;
  selectedNmIds: string[];
  comparisonRequestId: string;
  markedForComparisonCount: number;
  reportId: string;
  savedReportItems: number;
  savedChartPoints: number;
};

export async function runCompareCardsNextFlow(options: {
  page: Page;
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  stepRunner: StepRunner;
  sourceRunId?: string | null;
}): Promise<CompareCardsNextFlowResult> {
  const { page, scenario, runtime, stepRunner } = options;
  let runId: string | null = null;

  try {
    await stepRunner.runStep("openCompareCardsPage", () =>
      openCompareCardsPage(page)
    );

    const nextRun = await stepRunner.runStep("createCompareCardsNextRun", () =>
      createCompareCardsNextRun({
        scenario,
        runtime,
        sourceRunId: options.sourceRunId ?? null,
        sourceUrl: page.url(),
        limit: MANUAL_COMPARE_CARD_LIMIT
      })
    );
    runId = nextRun.runId;

    const nmIds = await stepRunner.runStep("loadNextCompareCardIds", () =>
      loadManualCompareCardIdsFromDb(
        nextRun.sourceRunId,
        MANUAL_COMPARE_CARD_LIMIT
      )
    );

    await stepRunner.runStep("startCompareCards", () => startCompareCards(page));

    const addedNmIds = await stepRunner.runStep("addManualCompareCardIds", () =>
      addManualCompareCardIds(page, nmIds)
    );

    const comparisonRequest = await stepRunner.runStep(
      "reserveCompareCardsForComparison",
      () =>
        reserveCompareCardsForComparison({
          runId: nextRun.runId,
          recommendationsRunId: nextRun.sourceRunId,
          nmIds: addedNmIds,
          sourceUrl: page.url()
        })
    );

    await stepRunner.runStep("attachComparisonApiCapture", async () => {
      attachComparisonApiCapture(page);
    });

    await stepRunner.runStep("submitCompareCards", () =>
      submitCompareCards(page, addedNmIds.length)
    );

    await stepRunner.runStep(
      "markCompareCardsComparisonSubmitted",
      () =>
        markCompareCardsComparisonSubmitted({
          comparisonRequestId: comparisonRequest.comparisonRequestId,
          sourceUrl: page.url()
        })
    );

    const openedReport = await stepRunner.runStep("parseOpenedComparisonReport", () =>
      parseOpenedComparisonReport(page, {
        comparisonRequestId: comparisonRequest.comparisonRequestId,
        nmIds: addedNmIds
      })
    );

    const reportSaveResult = await stepRunner.runStep(
      "saveSubmittedComparisonReportToDb",
      () =>
        saveSubmittedComparisonReportToDb({
          runId: nextRun.runId,
          comparisonRequestId: comparisonRequest.comparisonRequestId,
          report: openedReport,
          sourceUrl: page.url()
        })
    );

    await stepRunner.runStep("selectComparisonQuarterPeriod", () =>
      selectComparisonQuarterPeriod(page)
    );

    const chartBatch = await stepRunner.runStep(
      "parseOpenedComparisonChartDailyFromApi",
      () => parseOpenedComparisonChartDailyFromApi(page, addedNmIds)
    );

    const chartSaveResult = await stepRunner.runStep(
      "saveComparisonChartDailyToDb",
      () =>
        saveComparisonChartDailyToDb({
          reportId: reportSaveResult.reportId,
          chart: chartBatch
        })
    );

    return {
      runId: nextRun.runId,
      sourceRunId: nextRun.sourceRunId,
      sourceAvailableBeforeRun: nextRun.availableCount,
      selectedNmIds: addedNmIds,
      comparisonRequestId: comparisonRequest.comparisonRequestId,
      markedForComparisonCount: comparisonRequest.markedCount,
      reportId: reportSaveResult.reportId,
      savedReportItems: reportSaveResult.savedItems,
      savedChartPoints: chartSaveResult.savedChartPoints
    };
  } catch (error) {
    if (runId !== null) {
      await markCompareCardsNextRunFailed({
        runId,
        stepLogs: stepRunner.getStepLogs(),
        error
      });
    }

    throw error;
  }
}
