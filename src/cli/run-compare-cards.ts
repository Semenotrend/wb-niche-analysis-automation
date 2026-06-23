import {
  AUTH_STATE_PATH,
  openBrowserSession
} from "../core/browser.js";
import {
  loadRuntimeConfig,
  loadScenarioConfig
} from "../core/config.js";
import { createPacing } from "../core/pacing.js";
import { createStepRunner } from "../core/stepRunner.js";
import {
  IMPLEMENTED_COMPARE_CARDS_STEPS,
  runCompareCardsFlow
} from "../flows/compareCardsFlow.js";
import { saveCompareCardStepLogs } from "../steps/saveCompareCardIdsToDb.js";

async function main(): Promise<void> {
  const [scenario, runtime] = await Promise.all([
    loadScenarioConfig(),
    loadRuntimeConfig()
  ]);

  const { browser, page } = await openBrowserSession({
    headless: process.env.HEADLESS !== "false",
    storageStatePath: AUTH_STATE_PATH,
    viewport: runtime.viewport
  });

  try {
    const stepRunner = createStepRunner({
      totalSteps: IMPLEMENTED_COMPARE_CARDS_STEPS,
      pacing: createPacing(runtime)
    });

    const result = await runCompareCardsFlow({
      page,
      scenario,
      runtime,
      stepRunner
    });

    await saveCompareCardStepLogs({
      runId: result.runId,
      stepLogs: stepRunner.getStepLogs()
    });

    console.log(
      `[compare-cards] saved ${result.savedCount} unique card IDs to DB run_id=${result.runId}`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error("[compare-cards] Flow failed.");
  console.error(error);
  process.exitCode = 1;
});
