import type { Page } from "playwright";
import type { ParsedExistingComparisonReport } from "./parseExistingComparisonList.js";

function firstNonNull<T>(items: Array<T | null | undefined>): T | null {
  for (const item of items) {
    if (item !== null && item !== undefined) {
      return item;
    }
  }

  return null;
}

export async function openVisibleComparisonReport(
  page: Page,
  report: ParsedExistingComparisonReport
): Promise<void> {
  const firstNmId = firstNonNull(report.previewItems.map((item) => item.nmId));

  if (firstNmId === null) {
    throw new Error("empty_result: selected comparison report has no SKU to open");
  }

  const row = page
    .getByRole("button")
    .filter({ hasText: report.availableUntilText })
    .filter({ hasText: firstNmId });
  const rowCount = await row.count();

  if (rowCount !== 1) {
    throw new Error(
      `selector_changed: expected one visible comparison row, got ${rowCount}`
    );
  }

  await row.click();

  await page.getByRole("button", { name: "История сравнений", exact: true }).waitFor({
    state: "visible",
    timeout: 30_000
  });
}
