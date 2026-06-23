import type { Page } from "playwright";

export async function startCompareCards(page: Page): Promise<void> {
  const modeSelector = page.getByRole("button", {
    name: "Ввести вручную",
    exact: true
  });

  if (await modeSelector.isVisible().catch(() => false)) {
    return;
  }

  const compareButton = page.getByRole("button", {
    name: "Сравнить карточки",
    exact: true
  });

  await compareButton.waitFor({ state: "visible", timeout: 30_000 });
  await compareButton.click();

  await modeSelector.waitFor({ state: "visible", timeout: 30_000 });
}
