import type { Page } from "playwright";

export const COMPARE_CARDS_URL =
  "https://seller.wildberries.ru/platform-analytics/cards-comparison";

export async function openCompareCardsPage(page: Page): Promise<void> {
  await page.goto(COMPARE_CARDS_URL, { waitUntil: "domcontentloaded" });

  if (/login|passport|auth/i.test(page.url())) {
    throw new Error(
      "auth_expired: WB Partners session is missing or expired. Run `pnpm run login`."
    );
  }

  await page.getByText("Сравнение карточек", { exact: true }).waitFor({
    state: "visible",
    timeout: 60_000
  });
}
