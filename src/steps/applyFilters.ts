import type { Page } from "playwright";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function applyFilters(
  page: Page,
  category: string,
  subject: string
): Promise<void> {
  const applyButton = page
    .locator("button")
    .filter({ hasText: /^Применить$/ });

  await applyButton.waitFor({ state: "visible", timeout: 30_000 });
  await applyButton.click();

  await applyButton.waitFor({ state: "hidden", timeout: 30_000 });

  const nicheName = `${category} / ${subject}`;
  const nicheCell = page
    .locator("td")
    .filter({ hasText: new RegExp(`^${escapeRegex(nicheName)}$`) });

  await nicheCell.waitFor({ state: "visible", timeout: 60_000 });
}
