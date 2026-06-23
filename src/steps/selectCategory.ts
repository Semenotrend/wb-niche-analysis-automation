import type { Page } from "playwright";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function selectCategory(page: Page, category: string): Promise<void> {
  const categoryField = page
    .locator('[class*="Filed-multi-select"]')
    .filter({ has: page.getByText("Категория", { exact: true }) });

  const categoryInput = categoryField.locator("input");

  await categoryInput.waitFor({ state: "visible", timeout: 30_000 });
  await categoryInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(category, { delay: 50 });

  const categoryOption = page
    .locator('[class*="_rt-item__content_"]')
    .filter({ hasText: new RegExp(`^${escapeRegex(category)}$`) });

  await categoryOption.waitFor({ state: "visible", timeout: 30_000 });

  const categoryCheckbox = categoryOption
    .locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]')
    .locator('input[type="checkbox"]');

  await categoryCheckbox.check({ force: true });

  await page.waitForFunction(
    ({ categoryText }) => {
      const lists = [...document.querySelectorAll('[class*="_rt-select-list"]')];
      const list = lists.find((element) =>
        (element.textContent || "").includes(categoryText)
      );

      return [...(list?.querySelectorAll('input[type="checkbox"]') ?? [])].some(
        (input) => (input as HTMLInputElement).checked
      );
    },
    { categoryText: category },
    { timeout: 30_000 }
  );

  await categoryField.getByText(category, { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000
  });

  await categoryInput.press("Escape");
  await page.locator('[class*="Select-dropdown"]').waitFor({
    state: "hidden",
    timeout: 30_000
  });
}
