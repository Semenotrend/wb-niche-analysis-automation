import type { Page } from "playwright";

export async function openFilters(page: Page): Promise<void> {
  const filtersButton = page
    .locator("button")
    .filter({ hasText: /^Фильтры\d*$/ });

  await filtersButton.waitFor({ state: "visible", timeout: 30_000 });
  await filtersButton.click();

  await page
    .locator('[class*="Drawer-sheet--header"]')
    .filter({ hasText: "Фильтры" })
    .waitFor({ state: "visible", timeout: 30_000 });

  await page.getByText("Категория", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000
  });
}
