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
  NICHE_REPORT_FLOW_STEPS,
  runNicheReportFlow
} from "../flows/nicheReportFlow.js";

async function main(): Promise<void> {
  const [scenarios, runtime] = await Promise.all([
    loadScenarioConfigs(),
    loadRuntimeConfig()
  ]);

  const { browser, page } = await openBrowserSession({
    headless: process.env.HEADLESS !== "false",
    storageStatePath: AUTH_STATE_PATH,
    viewport: runtime.viewport
  });

  try {
    for (const [index, scenario] of scenarios.entries()) {
      console.log(
        `[niche-report] ${index + 1}/${scenarios.length} ${scenario.category} / ${scenario.subject}`
      );

      const stepRunner = createStepRunner({
        totalSteps: NICHE_REPORT_FLOW_STEPS,
        pacing: createPacing(runtime)
      });

      const report = await runNicheReportFlow({
        page,
        scenario,
        runtime,
        stepRunner
      });

      console.log(`[niche-report] saved ${report.metrics.length} metrics`);

      console.log(`id=${report.snapshot.wbSubjectId}:`);
      for (const stepLog of stepRunner.getStepLogs()) {
        console.log(`${stepLog.name} ${stepLog.durationMs}ms`);
      }
      console.log(
        `total ${stepRunner
          .getStepLogs()
          .reduce((sum, stepLog) => sum + stepLog.durationMs, 0)}ms`
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error("[niche-report] Flow failed.");
  console.error(error);
  process.exitCode = 1;
});
