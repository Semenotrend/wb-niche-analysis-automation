import type { Page } from "playwright";

export async function selectComparisonQuarterPeriod(page: Page): Promise<void> {
  const quarterButton = page.getByRole("button", {
    name: "Квартал",
    exact: true
  });
  const quarterCount = await quarterButton.count();

  if (quarterCount !== 1) {
    throw new Error(`selector_changed: expected one Quarter button, got ${quarterCount}`);
  }

  await quarterButton.click();

  await page
    .getByRole("button", { name: "Квартал", exact: true })
    .waitFor({ state: "visible", timeout: 30_000 });

  await page.getByText(/Данные за период с .* по .*/u).waitFor({
    state: "visible",
    timeout: 30_000
  });
}
