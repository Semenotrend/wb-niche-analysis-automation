import type { Page } from "playwright";

export async function selectRecommendationsBySubject(page: Page): Promise<void> {
  const subjectInput = page.getByPlaceholder("Выберите предмет", {
    exact: true
  });

  if (await subjectInput.isVisible().catch(() => false)) {
    return;
  }

  const modeSelector = page.getByRole("button", {
    name: "Ввести вручную",
    exact: true
  });

  await modeSelector.waitFor({ state: "visible", timeout: 30_000 });
  await modeSelector.click();

  const recommendationsBySubject = page.getByRole("radio", {
    name: "Выбрать из рекомендаций по предмету",
    exact: true
  });

  await recommendationsBySubject.waitFor({ state: "visible", timeout: 30_000 });
  await recommendationsBySubject.click();

  await subjectInput.waitFor({ state: "visible", timeout: 30_000 });
}
