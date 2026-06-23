import type { Page } from "playwright";
import type { RuntimeConfig, ScenarioConfig } from "../core/config.js";
import { InvalidNicheUrlError } from "../core/incidents.js";
import { createPacing } from "../core/pacing.js";
import { createStepRunner, type StepRunner } from "../core/stepRunner.js";
import {
  IMPLEMENTED_NICHE_UI_FALLBACK_STEPS,
  runNicheUiFallbackFlow
} from "./nicheUiFallbackFlow.js";
import { openNicheReportByUrl } from "../steps/openNicheReportByUrl.js";
import { parseNicheQueryStats } from "../steps/parseNicheQueryStats.js";
import {
  saveNicheQueryStatsToDb,
  type SaveNicheQueryStatsResult
} from "../steps/saveNicheQueryStatsToDb.js";
import { setNichePeriodMonth } from "../steps/setNichePeriodMonth.js";

export const NICHE_QUERY_STATS_FLOW_STEPS = 4;

export async function runNicheQueryStatsFlow(options: {
  page: Page;
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  stepRunner: StepRunner;
}): Promise<SaveNicheQueryStatsResult> {
  const { page, scenario, runtime, stepRunner } = options;
  let fallbackUsed = false;

  try {
    await stepRunner.runStep("openNicheReportByUrl", () =>
      openNicheReportByUrl(page, scenario.nicheReportUrl, scenario.subject).then(
        () => undefined
      )
    );
  } catch (error) {
    if (!scenario.fallbackEnabled || !(error instanceof InvalidNicheUrlError)) {
      throw error;
    }

    fallbackUsed = true;
    console.log(
      `[fallback] direct niche report url failed, running UI flow: ${error.message}`
    );

    const fallbackStepRunner = createStepRunner({
      totalSteps: IMPLEMENTED_NICHE_UI_FALLBACK_STEPS,
      pacing: createPacing(runtime)
    });

    await runNicheUiFallbackFlow({
      page,
      scenario,
      stepRunner: fallbackStepRunner
    });
  }

  await stepRunner.runStep("setNichePeriodMonth", () =>
    setNichePeriodMonth(page)
  );

  const report = await stepRunner.runStep("parseNicheQueryStats", () =>
    parseNicheQueryStats(page, scenario)
  );

  return stepRunner.runStep("saveNicheQueryStatsToDb", () =>
    saveNicheQueryStatsToDb({
      scenario,
      runtime,
      report,
      fallbackUsed
    })
  );
}
