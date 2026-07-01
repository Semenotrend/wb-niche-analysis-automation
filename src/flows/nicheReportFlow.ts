import type { Page } from "playwright";
import type { RuntimeConfig, ScenarioConfig } from "../core/config.js";
import { InvalidNicheUrlError } from "../core/incidents.js";
import { createStepRunner, type StepRunner } from "../core/stepRunner.js";
import { createPacing } from "../core/pacing.js";
import {
  IMPLEMENTED_NICHE_UI_FALLBACK_STEPS,
  runNicheUiFallbackFlow
} from "./nicheUiFallbackFlow.js";
import { openNicheReportByUrl } from "../steps/openNicheReportByUrl.js";
import { parseNicheReport, type ParsedNicheReport } from "../steps/parseNicheReport.js";
import {
  saveNicheReportStepLogs,
  saveNicheReportToDb
} from "../steps/saveNicheReportToDb.js";
import { setNichePeriod } from "../steps/setNichePeriodMonth.js";

export const NICHE_REPORT_FLOW_STEPS = 4;

export async function runNicheReportFlow(options: {
  page: Page;
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  stepRunner: StepRunner;
}): Promise<ParsedNicheReport> {
  const { page, scenario, runtime, stepRunner } = options;
  let fallbackUsed = false;
  let parsedReport: ParsedNicheReport | null = null;

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

  await stepRunner.runStep("setNichePeriod", () =>
    setNichePeriod(page, scenario.period)
  );
  await stepRunner.runStep("parseNicheReport", async () => {
    parsedReport = await parseNicheReport(page, scenario);
  });
  const saveResult = await stepRunner.runStep("saveNicheReportToDb", async () => {
    if (parsedReport === null) {
      throw new Error("parser: parsed report is missing before save");
    }

    return saveNicheReportToDb({
      scenario,
      runtime,
      report: parsedReport,
      fallbackUsed
    });
  });

  await saveNicheReportStepLogs({
    runId: saveResult.runId,
    stepLogs: stepRunner.getStepLogs()
  });

  if (parsedReport === null) {
    throw new Error("parser: parsed report is missing after flow");
  }

  return parsedReport;
}
