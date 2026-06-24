import type { Page } from "playwright";

export const COMPARE_CARDS_URL =
  "https://seller.wildberries.ru/platform-analytics/cards-comparison";

async function assertNoSuspiciousActivity(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(
    () => ""
  );

  if (
    /Что-то не так|Подозрительная активность|captcha-support|suspicious activity/iu.test(
      bodyText
    )
  ) {
    throw new Error(
      "captcha: WB showed suspicious activity screen. Wait for automatic retry or refresh manually before running automation again."
    );
  }
}

export async function openCompareCardsPage(page: Page): Promise<void> {
  await page.goto(COMPARE_CARDS_URL, { waitUntil: "domcontentloaded" });

  if (/login|passport|auth/i.test(page.url())) {
    throw new Error(
      "auth_expired: WB Partners session is missing or expired. Run `pnpm run login`."
    );
  }

  await assertNoSuspiciousActivity(page);

  await page.getByText("Сравнение карточек", { exact: true }).waitFor({
    state: "visible",
    timeout: 60_000
  });
}
