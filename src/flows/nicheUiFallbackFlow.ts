import type { Page } from "playwright";
import type { ScenarioConfig } from "../core/config.js";
import type { StepRunner } from "../core/stepRunner.js";
import { applyFilters } from "../steps/applyFilters.js";
import { openAnalyticsNichePage } from "../steps/openAnalyticsNichePage.js";
import { openFilters } from "../steps/openFilters.js";
import { openNicheCard } from "../steps/openNicheCard.js";
import { selectCategory } from "../steps/selectCategory.js";
import { selectSubject } from "../steps/selectSubject.js";
import { resetFiltersIfActive } from "../steps/resetFiltersIfActive.js";
import { setNichePeriod } from "../steps/setNichePeriodMonth.js";
import { setPeriodMonth } from "../steps/setPeriodMonth.js";

export const IMPLEMENTED_NICHE_UI_FALLBACK_STEPS = 9;

export async function runNicheUiFallbackFlow(options: {
  page: Page;
  scenario: ScenarioConfig;
  stepRunner: StepRunner;
}): Promise<void> {
  const { page, scenario, stepRunner } = options;

  await stepRunner.runStep("openAnalyticsNichePage", () =>
    openAnalyticsNichePage(page)
  );
  await stepRunner.runStep("setPeriodMonth", () => setPeriodMonth(page));
  await stepRunner.runStep("openFilters", () => openFilters(page));
  await stepRunner.runStep("resetFiltersIfActive", () =>
    resetFiltersIfActive(page)
  );
  await stepRunner.runStep("selectCategory", () =>
    selectCategory(page, scenario.category)
  );
  await stepRunner.runStep("selectSubject", () =>
    selectSubject(page, scenario.subject)
  );
  await stepRunner.runStep("applyFilters", () =>
    applyFilters(page, scenario.category, scenario.subject)
  );
  await stepRunner.runStep("openNicheCard", () =>
    openNicheCard(page, scenario.category, scenario.subject)
  );
  await stepRunner.runStep("setNichePeriod", () =>
    setNichePeriod(page, scenario.period)
  );
}
