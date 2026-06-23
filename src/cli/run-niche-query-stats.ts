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
  NICHE_QUERY_STATS_FLOW_STEPS,
  runNicheQueryStatsFlow
} from "../flows/nicheQueryStatsFlow.js";
import { saveNicheQueryStatsStepLogs } from "../steps/saveNicheQueryStatsToDb.js";

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
      totalSteps: NICHE_QUERY_STATS_FLOW_STEPS,
      pacing: createPacing(runtime)
    });

    const result = await runNicheQueryStatsFlow({
      page,
      scenario,
      runtime,
      stepRunner
    });

    await saveNicheQueryStatsStepLogs({
      runId: result.runId,
      stepLogs: stepRunner.getStepLogs()
    });

    console.log(
      `[niche-query-stats] saved ${result.savedCount} search queries snapshot_id=${result.snapshotId} run_id=${result.runId}`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error("[niche-query-stats] Flow failed.");
  console.error(error);
  process.exitCode = 1;
});
