import type { Page } from "playwright";

export const COMPARE_CARD_ID_LIMIT = 50;

export type ParsedCompareCardId = {
  rankPosition: number;
  nmId: string;
  productUrl: string;
};

function normalizeProductUrl(href: string): string {
  return href.startsWith("http") ? href : `https://www.wildberries.ru${href}`;
}

async function collectVisibleCardIds(page: Page): Promise<ParsedCompareCardId[]> {
  const items = await page.evaluate<ParsedCompareCardId[]>(`
    (() => {
      const links = [
        ...document.querySelectorAll(
          '[class*="Recommended-cards__list"] a[href*="/catalog/"][href*="/detail.aspx"]'
        )
      ];

      const deduped = new Map();

      for (const link of links) {
        const href = link.getAttribute("href") || "";
        const match = href.match(/\\/catalog\\/(\\d+)\\/detail\\.aspx/);

        if (match === null) {
          continue;
        }

        const nmId = match[1];
        const productUrl = href.startsWith("http")
          ? href
          : "https://www.wildberries.ru" + href;

        if (!deduped.has(nmId)) {
          deduped.set(nmId, productUrl);
        }
      }

      return [...deduped.entries()].map(([nmId, productUrl], index) => ({
        rankPosition: index + 1,
        nmId,
        productUrl
      }));
    })()
  `);

  return items.map((item) => ({
    rankPosition: item.rankPosition,
    nmId: item.nmId,
    productUrl: normalizeProductUrl(item.productUrl)
  }));
}

async function scrollRecommendedCards(page: Page): Promise<boolean> {
  return page.evaluate(`
    (() => {
      const list = document.querySelector('[class*="Recommended-cards__list"]');

      if (list === null) {
        return false;
      }

      const previousScrollTop = list.scrollTop;
      list.scrollTop += Math.floor(list.clientHeight * 0.9);

      return list.scrollTop !== previousScrollTop;
    })()
  `);
}

export async function parseCompareCardIds(
  page: Page
): Promise<ParsedCompareCardId[]> {
  await page.getByRole("button", { name: "Добавить", exact: true }).first().waitFor({
    state: "visible",
    timeout: 60_000
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const items = await collectVisibleCardIds(page);

    if (items.length >= COMPARE_CARD_ID_LIMIT) {
      return items.slice(0, COMPARE_CARD_ID_LIMIT).map((item, index) => ({
        ...item,
        rankPosition: index + 1
      }));
    }

    const scrolled = await scrollRecommendedCards(page);

    if (!scrolled) {
      break;
    }

    await page.waitForTimeout(500);
  }

  const items = await collectVisibleCardIds(page);

  throw new Error(
    `empty_result: expected ${COMPARE_CARD_ID_LIMIT} unique compare card IDs, got ${items.length}`
  );
}
