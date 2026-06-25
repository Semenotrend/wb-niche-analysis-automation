import type { Page } from "playwright";
import type { RuntimeConfig, ScenarioConfig } from "../core/config.js";
import type { StepRunner } from "../core/stepRunner.js";
import { addManualCompareCards } from "../steps/addManualCompareCard.js";
import { openCompareCardsPage } from "../steps/openCompareCardsPage.js";
import {
  attachComparisonApiCapture,
  parseOpenedComparisonChartDailyFromApi
} from "../steps/parseComparisonChartDaily.js";
import { parseCompareCardIds } from "../steps/parseCompareCardIds.js";
import { parseOpenedComparisonReport } from "../steps/parseOpenedComparisonReport.js";
import { searchAndSelectCompareSubject } from "../steps/searchAndSelectCompareSubject.js";
import { selectComparisonQuarterPeriod } from "../steps/selectComparisonQuarterPeriod.js";
import { selectRecommendationsBySubject } from "../steps/selectRecommendationsBySubject.js";
import { selectTopByRevenue } from "../steps/selectTopByRevenue.js";
import {
  saveComparisonChartDailyToDb,
  saveSubmittedComparisonReportToDb
} from "../steps/saveExistingCompareReportToDb.js";
import {
  markCompareCardsComparisonSubmitted,
  reserveCompareCardsForComparison,
  saveCompareCardIdsToDb,
  type SaveCompareCardIdsResult
} from "../steps/saveCompareCardIdsToDb.js";
import { startCompareCards } from "../steps/startCompareCards.js";
import { submitCompareCards } from "../steps/submitCompareCards.js";

export const IMPLEMENTED_COMPARE_CARDS_STEPS = 17;

export type CompareCardsFlowResult = SaveCompareCardIdsResult & {
  comparisonRequestId: string;
  markedForComparisonCount: number;
  reportId: string;
  savedReportItems: number;
  savedChartPoints: number;
};

export async function runCompareCardsFlow(options: {
  page: Page;
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  stepRunner: StepRunner;
}): Promise<CompareCardsFlowResult> {
  const { page, scenario, runtime, stepRunner } = options;

  await stepRunner.runStep("openCompareCardsPage", () =>
    openCompareCardsPage(page)
  );
  await stepRunner.runStep("startCompareCards", () => startCompareCards(page));
  await stepRunner.runStep("selectRecommendationsBySubject", () =>
    selectRecommendationsBySubject(page)
  );
  await stepRunner.runStep("searchAndSelectCompareSubject", () =>
    searchAndSelectCompareSubject(page, scenario.subject)
  );
  await stepRunner.runStep("selectTopByRevenue", () =>
    selectTopByRevenue(page, scenario.topBy)
  );

  const items = await stepRunner.runStep("parseCompareCardIds", () =>
    parseCompareCardIds(page)
  );

  const result = await stepRunner.runStep("saveCompareCardIdsToDb", () =>
    saveCompareCardIdsToDb({
      scenario,
      runtime,
      items,
      sourceUrl: page.url()
    })
  );

  const addedNmIds = await stepRunner.runStep("addManualCompareCards", () =>
    addManualCompareCards(page, result.runId)
  );

  const comparisonRequest = await stepRunner.runStep(
    "reserveCompareCardsForComparison",
    () =>
      reserveCompareCardsForComparison({
        runId: result.runId,
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
        runId: result.runId,
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
    ...result,
    comparisonRequestId: comparisonRequest.comparisonRequestId,
    markedForComparisonCount: comparisonRequest.markedCount,
    reportId: reportSaveResult.reportId,
    savedReportItems: reportSaveResult.savedItems,
    savedChartPoints: chartSaveResult.savedChartPoints
  };
}
