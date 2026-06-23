import type { Page } from "playwright";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchAndSelectCompareSubject(
  page: Page,
  subject: string
): Promise<void> {
  const subjectInput = page.getByPlaceholder("Выберите предмет", {
    exact: true
  });

  await subjectInput.waitFor({ state: "visible", timeout: 30_000 });
  await subjectInput.click();
  await subjectInput.press("ControlOrMeta+A");
  await subjectInput.press("Backspace");
  await subjectInput.type(subject, { delay: 50 });

  const subjectOption = page.getByRole("radio", {
    name: subject,
    exact: true
  });

  await subjectOption.waitFor({ state: "visible", timeout: 30_000 });
  await subjectOption.click();

  await page
    .getByText(new RegExp(`по предмету [«"]${escapeRegex(subject)}[»"]`))
    .waitFor({ state: "visible", timeout: 30_000 });

  const applyButton = page.getByRole("button", {
    name: "Применить",
    exact: true
  });

  await applyButton.waitFor({ state: "visible", timeout: 30_000 });
  await applyButton.click();

  await page.getByText("Показать топ карточек", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000
  });
}
