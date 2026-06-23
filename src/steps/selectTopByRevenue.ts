import type { Page } from "playwright";

export async function selectTopByRevenue(
  page: Page,
  topBy: string
): Promise<void> {
  const topByInputIds: Record<string, string> = {
    "По выручке": "itemRevenue"
  };

  const topByInputId = topByInputIds[topBy];

  if (topByInputId === undefined) {
    throw new Error(`selector_changed: unsupported top selector "${topBy}"`);
  }

  const loadedCards = page.getByRole("button", {
    name: "Добавить",
    exact: true
  });

  if ((await loadedCards.count()) > 0) {
    return;
  }

  const topOption = page.locator(`label[for="${topByInputId}"]`);

  if (!(await topOption.isVisible().catch(() => false))) {
    const topSelector = page.getByRole("button", {
      name: "Показать топ карточек",
      exact: true
    });

    await topSelector.waitFor({
      state: "visible",
      timeout: 30_000
    });
    await topSelector.click();
    await page.waitForTimeout(800);
  }

  await topOption.waitFor({ state: "visible", timeout: 30_000 });
  await topOption.click();

  const cardsLoadedAutomatically = await loadedCards
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (cardsLoadedAutomatically) {
    return;
  }

  const selectedTopSelector = page.getByRole("button", {
    name: topBy,
    exact: true
  });
  const applyButton = page.getByRole("button", {
    name: "Применить",
    exact: true
  });

  await applyButton.waitFor({ state: "visible", timeout: 2_000 }).catch(async () => {
    await selectedTopSelector.waitFor({ state: "visible", timeout: 30_000 });
    await selectedTopSelector.click();
  });

  await applyButton.waitFor({ state: "visible", timeout: 30_000 });
  await applyButton.click();

  await loadedCards.first().waitFor({
    state: "visible",
    timeout: 60_000
  });
}
