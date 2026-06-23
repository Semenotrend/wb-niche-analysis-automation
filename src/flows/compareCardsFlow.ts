import type { Page } from "playwright";
import type { RuntimeConfig, ScenarioConfig } from "../core/config.js";
import type { StepRunner } from "../core/stepRunner.js";
import { addManualCompareCards } from "../steps/addManualCompareCard.js";
import { openCompareCardsPage } from "../steps/openCompareCardsPage.js";
import { parseCompareCardIds } from "../steps/parseCompareCardIds.js";
import { searchAndSelectCompareSubject } from "../steps/searchAndSelectCompareSubject.js";
import { selectRecommendationsBySubject } from "../steps/selectRecommendationsBySubject.js";
import { selectTopByRevenue } from "../steps/selectTopByRevenue.js";
import {
  saveCompareCardIdsToDb,
  type SaveCompareCardIdsResult
} from "../steps/saveCompareCardIdsToDb.js";
import { startCompareCards } from "../steps/startCompareCards.js";

export const IMPLEMENTED_COMPARE_CARDS_STEPS = 8;

export async function runCompareCardsFlow(options: {
  page: Page;
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  stepRunner: StepRunner;
}): Promise<SaveCompareCardIdsResult> {
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

  await stepRunner.runStep("addManualCompareCards", () =>
    addManualCompareCards(page, result.runId)
  );

  return result;
}
