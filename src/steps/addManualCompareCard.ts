import type { Page } from "playwright";
import { withDbClient } from "../core/db.js";
import { startCompareCards } from "./startCompareCards.js";

export const MANUAL_COMPARE_CARD_LIMIT = 5;

type ManualCompareCardRow = {
  rank_position: number;
  nm_id: string;
};

async function loadManualCompareCardIds(
  runId: string,
  limit: number
): Promise<string[]> {
  const rows = await withDbClient(async (client) => {
    const result = await client.query<ManualCompareCardRow>(
      `
        SELECT rank_position, nm_id::text AS nm_id
        FROM wb_analytics.compare_card_recommendations
        WHERE run_id = $1
        ORDER BY rank_position
        LIMIT $2
      `,
      [runId, limit]
    );

    return result.rows;
  });

  if (rows.length < limit) {
    throw new Error(
      `empty_result: expected ${limit} compare card IDs in DB for manual add, got ${rows.length}`
    );
  }

  const nmIds = rows.map((row) => row.nm_id);
  const uniqueNmIds = new Set(nmIds);

  if (uniqueNmIds.size !== nmIds.length) {
    throw new Error("schema_changed: manual compare card IDs contain duplicates");
  }

  return nmIds;
}

function assertValidNmId(nmId: string): void {
  if (!/^\d+$/.test(nmId)) {
    throw new Error(`schema_changed: invalid manual compare card ID "${nmId}"`);
  }
}

async function addOneManualCompareCard(page: Page, nmId: string): Promise<void> {
  assertValidNmId(nmId);

  const manualInput = page.getByPlaceholder("Введите артикул WB");
  await manualInput.waitFor({ state: "visible", timeout: 30_000 });
  await manualInput.fill(nmId);
  await manualInput.press("Enter");

  const productLink = page
    .locator(`a[href*="/catalog/${nmId}/detail.aspx"]`)
    .first();
  await productLink.waitFor({ state: "visible", timeout: 60_000 });

  const productCard = productLink.locator(
    'xpath=ancestor::*[.//button[normalize-space()="Добавить"]][1]'
  );
  const addButton = productCard.getByRole("button", {
    name: "Добавить",
    exact: true
  });

  await addButton.waitFor({ state: "visible", timeout: 30_000 });
  await addButton.click();
  await page.waitForTimeout(500);
}

export async function addManualCompareCards(
  page: Page,
  runId: string,
  limit: number = MANUAL_COMPARE_CARD_LIMIT
): Promise<void> {
  const nmIds = await loadManualCompareCardIds(runId, limit);
  const addedNmIds = new Set<string>();

  await page.reload({ waitUntil: "domcontentloaded" });

  if (/login|passport|auth/i.test(page.url())) {
    throw new Error(
      "auth_expired: WB Partners session is missing or expired. Run `pnpm run login`."
    );
  }

  await page.getByText("Сравнение карточек", { exact: true }).waitFor({
    state: "visible",
    timeout: 60_000
  });

  await startCompareCards(page);

  for (const nmId of nmIds) {
    if (addedNmIds.has(nmId)) {
      throw new Error(`schema_changed: duplicate manual compare card ID "${nmId}"`);
    }

    await addOneManualCompareCard(page, nmId);
    addedNmIds.add(nmId);
  }
}
