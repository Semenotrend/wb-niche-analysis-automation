import {
  AUTH_STATE_PATH,
  openBrowserSession
} from "../core/browser.js";
import {
  loadRuntimeConfig,
  loadScenarioConfigs
} from "../core/config.js";
import { createPacing } from "../core/pacing.js";
import { createStepRunner } from "../core/stepRunner.js";
import {
  IMPLEMENTED_COMPARE_CARDS_NEXT_STEPS,
  runCompareCardsNextFlow
} from "../flows/compareCardsNextFlow.js";
import { saveCompareCardsNextStepLogs } from "../steps/saveCompareCardIdsToDb.js";

function readSourceRunId(): string | null {
  const value = process.env.SOURCE_RUN_ID?.trim();
  return value === undefined || value === "" ? null : value;
}

async function main(): Promise<void> {
  const [scenarios, runtime] = await Promise.all([
    loadScenarioConfigs(),
    loadRuntimeConfig()
  ]);
  const sourceRunId = readSourceRunId();

  const { browser, page } = await openBrowserSession({
    headless: process.env.HEADLESS !== "false",
    storageStatePath: AUTH_STATE_PATH,
    viewport: runtime.viewport
  });

  try {
    for (const [index, scenario] of scenarios.entries()) {
      console.log(
        `[compare-cards-next] ${index + 1}/${scenarios.length} ${scenario.category} / ${scenario.subject}`
      );

      if (sourceRunId !== null) {
        console.log(`[compare-cards-next] source_run_id=${sourceRunId}`);
      }

      const stepRunner = createStepRunner({
        totalSteps: IMPLEMENTED_COMPARE_CARDS_NEXT_STEPS,
        pacing: createPacing(runtime)
      });

      const result = await runCompareCardsNextFlow({
        page,
        scenario,
        runtime,
        stepRunner,
        sourceRunId
      });

      await saveCompareCardsNextStepLogs({
        runId: result.runId,
        stepLogs: stepRunner.getStepLogs()
      });

      console.log(
        [
          `[compare-cards-next] selected ${result.selectedNmIds.length} cards`,
          `source_run_id=${result.sourceRunId}`,
          `available_before=${result.sourceAvailableBeforeRun}`,
          `nm_ids=${result.selectedNmIds.join(",")}`
        ].join(" ")
      );
      console.log(
        `[compare-cards-next] submitted ${result.markedForComparisonCount} cards comparison_request_id=${result.comparisonRequestId}`
      );
      console.log(
        [
          `[compare-cards-next] collected submitted report run_id=${result.runId}`,
          `report_id=${result.reportId}`,
          `${result.savedReportItems} card rows`,
          `${result.savedChartPoints} chart daily rows`
        ].join(" ")
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error("[compare-cards-next] Flow failed.");
  console.error(error);
  process.exitCode = 1;
});
