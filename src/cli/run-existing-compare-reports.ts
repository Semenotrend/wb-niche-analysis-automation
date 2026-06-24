import {
  AUTH_STATE_PATH,
  openBrowserSession
} from "../core/browser.js";
import { loadRuntimeConfig } from "../core/config.js";
import { createPacing } from "../core/pacing.js";
import { createStepRunner } from "../core/stepRunner.js";
import {
  IMPLEMENTED_EXISTING_COMPARE_REPORTS_STEPS,
  runExistingCompareReportsFlow
} from "../flows/existingCompareReportsFlow.js";
import { saveExistingCompareReportStepLogs } from "../steps/saveExistingCompareReportToDb.js";

async function main(): Promise<void> {
  const runtime = await loadRuntimeConfig();

  const { browser, page } = await openBrowserSession({
    headless: process.env.HEADLESS !== "false",
    storageStatePath: AUTH_STATE_PATH,
    viewport: runtime.viewport
  });

  try {
    console.log("[existing-compare-reports] reading existing WB card comparisons");

    const stepRunner = createStepRunner({
      totalSteps: IMPLEMENTED_EXISTING_COMPARE_REPORTS_STEPS,
      pacing: createPacing(runtime)
    });

    const result = await runExistingCompareReportsFlow({
      page,
      runtime,
      stepRunner
    });

    await saveExistingCompareReportStepLogs({
      runId: result.runId,
      stepLogs: stepRunner.getStepLogs()
    });

    console.log(
      [
        `[existing-compare-reports] saved ${result.savedReports} report rows`,
        `${result.savedItems} card rows`,
        `${result.savedChartPoints ?? 0} chart daily rows`,
        "opened comparison report",
        `run_id=${result.runId}`,
        `report_id=${result.reportId}`
      ].join(" ")
    );
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error("[existing-compare-reports] Flow failed.");
  console.error(error);
  process.exitCode = 1;
});
