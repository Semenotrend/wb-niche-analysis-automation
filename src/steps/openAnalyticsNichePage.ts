import type { Page } from "playwright";

export const NICHE_ANALYSIS_URL =
  "https://seller.wildberries.ru/platform-analytics/niche-analysis/main";

export async function openAnalyticsNichePage(page: Page): Promise<void> {
  await page.goto(NICHE_ANALYSIS_URL, { waitUntil: "domcontentloaded" });

  await page.getByText("Аналитика развития бизнеса", { exact: true }).waitFor({
    state: "visible",
    timeout: 60_000
  });

  await page.getByText("Анализ ниш", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000
  });
}
