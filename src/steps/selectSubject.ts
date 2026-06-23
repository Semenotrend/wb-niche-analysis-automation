import type { Page } from "playwright";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function selectSubject(page: Page, subject: string): Promise<void> {
  const subjectField = page
    .locator('[class*="Filed-multi-select"]')
    .filter({ has: page.getByText("Предмет", { exact: true }) });

  const subjectInput = subjectField.locator("input");

  await subjectInput.waitFor({ state: "visible", timeout: 30_000 });
  await subjectInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(subject, { delay: 50 });

  const exactSubject = new RegExp(`^${escapeRegex(subject)}$`);
  const dropdown = page
    .locator('[class*="_rt-select-list"]')
    .filter({ hasText: subject });

  await dropdown.waitFor({ state: "visible", timeout: 30_000 });

  const subjectOption = dropdown
    .locator('[class*="_rt-item__content_"]')
    .filter({ hasText: exactSubject });

  await subjectOption.waitFor({ state: "visible", timeout: 30_000 });

  const subjectCheckbox = subjectOption
    .locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]')
    .locator('input[type="checkbox"]');

  await subjectCheckbox.check({ force: true });

  await page.waitForFunction(
    ({ subjectText }) => {
      const lists = [...document.querySelectorAll('[class*="_rt-select-list"]')];
      const list = lists.find((element) =>
        (element.textContent || "").includes(subjectText)
      );

      return [...(list?.querySelectorAll('input[type="checkbox"]') ?? [])].some(
        (input) => (input as HTMLInputElement).checked
      );
    },
    { subjectText: subject },
    { timeout: 30_000 }
  );

  await subjectField.getByText(subject, { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000
  });

  await subjectInput.press("Escape");
  await page.locator('[class*="Select-dropdown"]').waitFor({
    state: "hidden",
    timeout: 30_000
  });
}
