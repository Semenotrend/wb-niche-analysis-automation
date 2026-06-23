import type { Page } from "playwright";

export async function resetFiltersIfActive(page: Page): Promise<void> {
  const activeFiltersButton = page
    .locator("button")
    .filter({ hasText: /^Фильтры[1-9]\d*$/ });

  if ((await activeFiltersButton.count()) === 0) {
    return;
  }

  const resetButton = page
    .locator("button")
    .filter({ hasText: /^Сбросить$/ });

  await resetButton.waitFor({ state: "visible", timeout: 30_000 });
  await resetButton.click();

  await page.waitForFunction(() => {
    const fields = [...document.querySelectorAll('[class*="Filed-multi-select"]')];

    const getFieldInputValues = (label: string) => {
      const field = fields.find((element) =>
        (element.textContent || "").includes(label)
      );

      return [...(field?.querySelectorAll("input") ?? [])].map((input) =>
        input.value.trim()
      );
    };

    const categoryValues = getFieldInputValues("Категория");
    const subjectValues = getFieldInputValues("Предмет");

    return (
      categoryValues.length > 0 &&
      subjectValues.length > 0 &&
      categoryValues.every((value) => value === "") &&
      subjectValues.every((value) => value === "")
    );
  });
}
