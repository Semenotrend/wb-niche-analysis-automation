import type { Page } from "playwright";

export async function openNicheCard(
  page: Page,
  category: string,
  subject: string
): Promise<void> {
  const nicheName = `${category} / ${subject}`;
  const nicheRow = page.getByRole("button", {
    name: nicheName,
    exact: true
  });

  await nicheRow.waitFor({ state: "visible", timeout: 60_000 });
  await nicheRow.click();

  await page.waitForURL(/\/platform-analytics\/niche-analysis\/item/, {
    timeout: 60_000,
    waitUntil: "domcontentloaded"
  });

  await page.getByText("К Аналитике площадки", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000
  });

  await page.getByRole("heading", { name: subject, exact: true }).waitFor({
    state: "visible",
    timeout: 30_000
  });
}
