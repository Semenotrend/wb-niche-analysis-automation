import type { Page } from "playwright";
import type { ScenarioConfig } from "../core/config.js";

export type NicheSnapshot = {
  snapshotDate: string;
  categoryName: string;
  subjectName: string;
  wbSubjectId: number;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  comparisonStart: string | null;
  comparisonEnd: string | null;
  sourceUrl: string;
  parserVersion: string;
};

export type NicheMetric = {
  metricCode: string;
  metricName: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  deltaValue: number | null;
  deltaUnit: string | null;
  deltaDirection: DeltaDirection;
};

export type NicheSearchQuery = {
  rankPosition: number;
  queryText: string;
  queryCount: number | null;
  cartConversionPct: number | null;
  cartConversionDeltaPct: number | null;
  cartConversionDeltaDirection: DeltaDirection;
  orderConversionPct: number | null;
  orderConversionDeltaPct: number | null;
  orderConversionDeltaDirection: DeltaDirection;
  rawText: string;
};

export type ParsedNicheReport = {
  snapshot: NicheSnapshot;
  metrics: NicheMetric[];
};

type RawBlock = {
  code: string;
  text: string;
  deltaDirection: DeltaDirection;
};

type RawNichePage = {
  sourceUrl: string;
  bodyText: string;
  periodLine: string;
  blocks: RawBlock[];
};

type DeltaDirection = "up" | "down" | "neutral" | "unknown" | null;

const PARSER_VERSION = "v1";
const DYNAMIC_MODE_RETRY_COUNT = 3;
const DYNAMIC_MODE_SETTLE_TIMEOUT_MS = 1_000;
const DYNAMIC_MODES = [
  {
    buttonText: "Заказы и выкупы",
    blocks: [
      { code: "ordered_qty", label: "Заказали" },
      { code: "bought_out_qty", label: "Выкупили" }
    ]
  },
  {
    buttonText: "Карточки товаров",
    blocks: [
      { code: "cards_with_orders_qty", label: "Карточек с заказами" },
      { code: "cards_with_buyouts_qty", label: "Карточек с выкупами" }
    ]
  },
  {
    buttonText: "Продавцы и бренды",
    blocks: [
      { code: "sellers_with_orders_qty", label: "Продавцов с заказами" },
      { code: "sellers_with_buyouts_qty", label: "Продавцов с выкупами" },
      { code: "brands_with_orders_qty", label: "Брендов с заказами" },
      { code: "brands_with_buyouts_qty", label: "Брендов с выкупами" }
    ]
  }
] as const;

const EXPECTED_DYNAMIC_METRIC_CODES = DYNAMIC_MODES.flatMap((mode) =>
  mode.blocks.map((block) => block.code)
);

type DynamicMode = (typeof DYNAMIC_MODES)[number];

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function parseDate(value: string): string {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);

  if (!match) {
    throw new Error(`parser: date not found in "${value}"`);
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[~₽%штднейдень]/gi, "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();

  if (normalized === "" || normalized === "-") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function signedDelta(value: number | null, direction: DeltaDirection): number | null {
  if (value === null) {
    return null;
  }

  if (direction === "down") {
    return -Math.abs(value);
  }

  if (direction === "up") {
    return Math.abs(value);
  }

  return value;
}

function parsePercentPair(rawText: string, deltaDirection: DeltaDirection): {
  value: number | null;
  delta: number | null;
} {
  const matches = [...rawText.matchAll(/(-?\d+(?:[.,]\d+)?)\s*%/g)];

  return {
    value: parseNumber(matches[0]?.[1]),
    delta: signedDelta(parseNumber(matches[1]?.[1]), deltaDirection)
  };
}

function parsePercentDelta(rawText: string, deltaDirection: DeltaDirection): number | null {
  const match = rawText.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  return signedDelta(parseNumber(match?.[1]), deltaDirection);
}

function parseNumberAfterLabel(rawText: string, label: string): number | null {
  const cleaned = cleanText(rawText);
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cleaned.match(new RegExp(`${escapedLabel}\\s*([~\\d\\s.,]+)`));
  return parseNumber(match?.[1]);
}

function metric(
  metricCode: string,
  metricName: string,
  rawText: string,
  valueNumeric: number | null,
  unit: string | null,
  deltaValue: number | null = null,
  deltaUnit: string | null = null,
  deltaDirection: DeltaDirection = null,
  valueText: string | null = null
): NicheMetric {
  return {
    metricCode,
    metricName,
    valueNumeric,
    valueText,
    unit,
    deltaValue,
    deltaUnit,
    deltaDirection
  };
}

function getBlock(blocks: RawBlock[], code: string): RawBlock {
  return (
    blocks.find((block) => block.code === code) ?? {
      code,
      text: "",
      deltaDirection: null
    }
  );
}

function parseMetrics(blocks: RawBlock[]): NicheMetric[] {
  const result: NicheMetric[] = [];

  const seasonality = getBlock(blocks, "seasonality_title");
  if (seasonality.text) {
    result.push(
      metric(
        "seasonality_title",
        "Сезонность",
        seasonality.text,
        null,
        null,
        null,
        null,
        null,
        seasonality.text
      )
    );
  }

  const monopolization = getBlock(blocks, "monopolization");
  if (monopolization.text) {
    const pair = parsePercentPair(monopolization.text, monopolization.deltaDirection);
    result.push(
      metric(
        "monopolization_sellers_pct",
        "Монополизация",
        monopolization.text,
        pair.value,
        "%",
        pair.delta,
        "%",
        monopolization.deltaDirection
      )
    );
  }

  const stock = getBlock(blocks, "stock_remains");
  if (stock.text) {
    result.push(
      metric(
        "avg_stock_qty",
        "Среднее количество остатков",
        stock.text,
        parseNumberAfterLabel(stock.text, "Среднее количество остатков, шт"),
        "шт"
      )
    );
  }

  const turnover = getBlock(blocks, "turnover");
  if (turnover.text) {
    result.push(
      metric(
        "turnover_days",
        "Оборачиваемость",
        turnover.text,
        parseNumberAfterLabel(turnover.text, "Оборачиваемость за неделю"),
        "дней"
      )
    );
  }

  const availability = getBlock(blocks, "availability");
  if (availability.text) {
    const valueText = cleanText(availability.text.replace("Доступность", ""));
    result.push(
      metric(
        "availability_status",
        "Доступность",
        availability.text,
        null,
        null,
        null,
        null,
        null,
        valueText
      )
    );
  }

  const rating = getBlock(blocks, "rating");
  if (rating.text) {
    result.push(
      metric(
        "avg_rating",
        "Средний рейтинг",
        rating.text,
        parseNumberAfterLabel(rating.text, "Средний рейтинг по отзывам"),
        null
      )
    );
  }

  const reviews = getBlock(blocks, "reviews");
  if (reviews.text) {
    result.push(
      metric(
        "avg_reviews_count",
        "Среднее количество отзывов",
        reviews.text,
        parseNumberAfterLabel(reviews.text, "В среднем отзывов в карточке, шт"),
        "шт"
      )
    );
  }

  const avgCheck = getBlock(blocks, "avg_check");
  if (avgCheck.text) {
    const pair = parsePercentPair(avgCheck.text, avgCheck.deltaDirection);
    result.push(
      metric(
        "avg_check_rub",
        "Средний чек",
        avgCheck.text,
        parseNumberAfterLabel(avgCheck.text, "Средний чек"),
        "₽",
        pair.delta,
        "%",
        avgCheck.deltaDirection
      )
    );
  }

  const buyout = getBlock(blocks, "buyout_pct");
  if (buyout.text) {
    const pair = parsePercentPair(buyout.text, buyout.deltaDirection);
    result.push(
      metric(
        "buyout_pct",
        "Процент выкупа",
        buyout.text,
        pair.value,
        "%",
        pair.delta,
        "%",
        buyout.deltaDirection
      )
    );
  }

  const revenue = getBlock(blocks, "revenue");
  if (revenue.text) {
    const pair = parsePercentPair(revenue.text, revenue.deltaDirection);
    result.push(
      metric(
        "revenue_rub",
        "Выручка",
        revenue.text,
        parseNumberAfterLabel(revenue.text, "Выручка"),
        "₽",
        pair.delta,
        "%",
        revenue.deltaDirection
      )
    );
  }

  const ordered = getBlock(blocks, "ordered_qty");
  if (ordered.text) {
    result.push(
      metric(
        "ordered_qty",
        "Заказали",
        ordered.text,
        parseNumberAfterLabel(ordered.text, "Заказали"),
        "шт",
        parsePercentDelta(ordered.text, ordered.deltaDirection),
        "%",
        ordered.deltaDirection
      )
    );
  }

  const boughtOut = getBlock(blocks, "bought_out_qty");
  if (boughtOut.text) {
    result.push(
      metric(
        "bought_out_qty",
        "Выкупили",
        boughtOut.text,
        parseNumberAfterLabel(boughtOut.text, "Выкупили"),
        "шт",
        parsePercentDelta(boughtOut.text, boughtOut.deltaDirection),
        "%",
        boughtOut.deltaDirection
      )
    );
  }

  const cardsWithOrders = getBlock(blocks, "cards_with_orders_qty");
  if (cardsWithOrders.text) {
    result.push(
      metric(
        "cards_with_orders_qty",
        "Карточек с заказами",
        cardsWithOrders.text,
        parseNumberAfterLabel(cardsWithOrders.text, "Карточек с заказами"),
        "шт",
        parsePercentDelta(cardsWithOrders.text, cardsWithOrders.deltaDirection),
        "%",
        cardsWithOrders.deltaDirection
      )
    );
  }

  const cardsWithBuyouts = getBlock(blocks, "cards_with_buyouts_qty");
  if (cardsWithBuyouts.text) {
    result.push(
      metric(
        "cards_with_buyouts_qty",
        "Карточек с выкупами",
        cardsWithBuyouts.text,
        parseNumberAfterLabel(cardsWithBuyouts.text, "Карточек с выкупами"),
        "шт",
        parsePercentDelta(cardsWithBuyouts.text, cardsWithBuyouts.deltaDirection),
        "%",
        cardsWithBuyouts.deltaDirection
      )
    );
  }

  const sellersWithOrders = getBlock(blocks, "sellers_with_orders_qty");
  if (sellersWithOrders.text) {
    result.push(
      metric(
        "sellers_with_orders_qty",
        "Продавцов с заказами",
        sellersWithOrders.text,
        parseNumberAfterLabel(sellersWithOrders.text, "Продавцов с заказами"),
        "шт",
        parsePercentDelta(sellersWithOrders.text, sellersWithOrders.deltaDirection),
        "%",
        sellersWithOrders.deltaDirection
      )
    );
  }

  const sellersWithBuyouts = getBlock(blocks, "sellers_with_buyouts_qty");
  if (sellersWithBuyouts.text) {
    result.push(
      metric(
        "sellers_with_buyouts_qty",
        "Продавцов с выкупами",
        sellersWithBuyouts.text,
        parseNumberAfterLabel(sellersWithBuyouts.text, "Продавцов с выкупами"),
        "шт",
        parsePercentDelta(sellersWithBuyouts.text, sellersWithBuyouts.deltaDirection),
        "%",
        sellersWithBuyouts.deltaDirection
      )
    );
  }

  const brandsWithOrders = getBlock(blocks, "brands_with_orders_qty");
  if (brandsWithOrders.text) {
    result.push(
      metric(
        "brands_with_orders_qty",
        "Брендов с заказами",
        brandsWithOrders.text,
        parseNumberAfterLabel(brandsWithOrders.text, "Брендов с заказами"),
        "шт",
        parsePercentDelta(brandsWithOrders.text, brandsWithOrders.deltaDirection),
        "%",
        brandsWithOrders.deltaDirection
      )
    );
  }

  const brandsWithBuyouts = getBlock(blocks, "brands_with_buyouts_qty");
  if (brandsWithBuyouts.text) {
    result.push(
      metric(
        "brands_with_buyouts_qty",
        "Брендов с выкупами",
        brandsWithBuyouts.text,
        parseNumberAfterLabel(brandsWithBuyouts.text, "Брендов с выкупами"),
        "шт",
        parsePercentDelta(brandsWithBuyouts.text, brandsWithBuyouts.deltaDirection),
        "%",
        brandsWithBuyouts.deltaDirection
      )
    );
  }

  return result;
}

function parsePeriodLine(periodLine: string): {
  periodStart: string;
  periodEnd: string;
  comparisonStart: string | null;
  comparisonEnd: string | null;
} {
  const matches = [...periodLine.matchAll(/\d{2}\.\d{2}\.\d{4}/g)].map(
    (match) => match[0]
  );

  if (matches.length < 2) {
    throw new Error(`parser: period line is invalid: ${periodLine}`);
  }

  return {
    periodStart: parseDate(matches[0]),
    periodEnd: parseDate(matches[1]),
    comparisonStart: matches[2] ? parseDate(matches[2]) : null,
    comparisonEnd: matches[3] ? parseDate(matches[3]) : null
  };
}

function parseSubjectId(sourceUrl: string): number {
  const rawId = new URL(sourceUrl).searchParams.get("id");
  const subjectId = rawId === null ? NaN : Number(rawId);

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    throw new Error(`parser: invalid subject id in url: ${sourceUrl}`);
  }

  return subjectId;
}

async function waitForDynamicSection(page: Page): Promise<void> {
  await page.waitForFunction(
    `() => (document.body.textContent || "").includes("Динамика по предмету")`,
    undefined,
    { timeout: 30_000 }
  );
}

async function scrollDynamicSectionIntoView(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const title = [...document.querySelectorAll("h1,h2,h3,div,span")].find(
      (element) => (element.textContent ?? "").replace(/\s+/g, " ").trim() === "Динамика по предмету"
    );

    title?.scrollIntoView({ block: "center" });
  })()`);
}

async function clickDynamicModeButton(page: Page, buttonText: string): Promise<void> {
  await page.waitForFunction(
    `expectedText => {
      const clean = value => (value || "").replace(/\\s+/g, " ").trim();

      return [...document.querySelectorAll("button,[role='button'],div,span")].some(
        element => clean(element.textContent) === expectedText
      );
    }`,
    buttonText,
    { timeout: 30_000 }
  );

  const clicked = await page.evaluate(
    `(() => {
      const expectedText = ${JSON.stringify(buttonText)};
      const clean = value => (value || "").replace(/\\s+/g, " ").trim();

      const candidates = [...document.querySelectorAll("button,[role='button'],div,span")]
        .map(element => {
          const rect = element.getBoundingClientRect();

          return {
            element,
            text: clean(element.textContent),
            area: rect.width * rect.height,
            tagName: element.tagName
          };
        })
        .filter(candidate => candidate.text === expectedText)
        .sort((left, right) => {
          if (left.tagName === "BUTTON" && right.tagName !== "BUTTON") {
            return -1;
          }

          if (left.tagName !== "BUTTON" && right.tagName === "BUTTON") {
            return 1;
          }

          return left.area - right.area;
        });

      const candidate = candidates[0];
      const button = candidate?.element.closest("button") || candidate?.element;

      if (!button || typeof button.click !== "function") {
        return {
          clicked: false,
          candidates: candidates.slice(0, 5).map(({ text, area, tagName }) => ({
            text,
            area,
            tagName
          }))
        };
      }

      button.scrollIntoView({ block: "center", inline: "center" });
      button.click();
      return {
        clicked: true,
        candidates: candidates.slice(0, 5).map(({ text, area, tagName }) => ({
          text,
          area,
          tagName
          }))
      };
    })()`
  ) as { clicked: boolean; candidates: Array<{ text: string; area: number; tagName: string }> };

  if (!clicked.clicked) {
    throw new Error(
      `parser: dynamic mode button not found: ${buttonText}; candidates=${JSON.stringify(clicked.candidates)}`
    );
  }

  await page.waitForTimeout(DYNAMIC_MODE_SETTLE_TIMEOUT_MS);
}

async function waitForDynamicModeReady(page: Page, mode: DynamicMode): Promise<void> {
  await page.waitForFunction(
    `expectedLabels => {
      const clean = value => (value || "").replace(/\\s+/g, " ").trim();

      const texts = [...document.querySelectorAll("div,span,p")]
        .map(element => clean(element.textContent))
        .filter(text => text.includes("%"));

      return expectedLabels.every(label =>
        texts.some(text => text.startsWith(label))
      );
    }`,
    mode.blocks.map((block) => block.label),
    { timeout: 20_000 }
  );
}

async function collectActiveDynamicBlocks(
  page: Page,
  mode: DynamicMode
): Promise<RawBlock[]> {
  return page.evaluate<RawBlock[]>(
    `(() => {
      const activeMode = ${JSON.stringify(mode)};
      const clean = value => (value || "").replace(/\\s+/g, " ").trim();

      const deltaDirection = element => {
        if (!element) {
          return null;
        }

        const classText = [
          element.getAttribute("class") ?? "",
          ...[...element.querySelectorAll("[class]")].map(
            (child) => child.getAttribute("class") ?? ""
          )
        ].join(" ");

        if (/Dynamic-badge-view--red|Dynamic-badge-view__icon--red|Text--red/.test(classText)) {
          return "down";
        }

        if (
          /Dynamic-badge-view--green|Dynamic-badge-view__icon--green|Text--green|successTextColor/.test(
            classText
          )
        ) {
          return "up";
        }

        if (/Dynamic-badge-view--gray|Dynamic-badge-view--grey|Text--gray|Text--grey/.test(classText)) {
          return "neutral";
        }

        return "unknown";
      };

      const result = [];

      for (const definition of activeMode.blocks) {
        const candidates = [...document.querySelectorAll("div,span,p")]
          .map(element => {
            const rect = element.getBoundingClientRect();

            return {
              element,
              text: clean(element.textContent),
              area: rect.width * rect.height
            };
          })
          .filter(
            ({ text }) =>
              text.startsWith(definition.label) &&
              text.includes("%") &&
              text.length < 140
          )
          .sort((left, right) => left.text.length - right.text.length || left.area - right.area);

        const candidate = candidates[0];

        if (candidate) {
          result.push({
            code: definition.code,
            text: candidate.text,
            deltaDirection: deltaDirection(candidate.element)
          });
        }
      }

      return result;
    })()`
  );
}

async function collectDynamicModeWithRetry(
  page: Page,
  mode: DynamicMode
): Promise<RawBlock[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DYNAMIC_MODE_RETRY_COUNT; attempt += 1) {
    try {
      await waitForDynamicSection(page);
      await scrollDynamicSectionIntoView(page);
      await clickDynamicModeButton(page, mode.buttonText);
      await waitForDynamicModeReady(page, mode);

      const blocks = await collectActiveDynamicBlocks(page, mode);
      const missingLabels = mode.blocks
        .filter((expectedBlock) =>
          !blocks.some((block) => block.code === expectedBlock.code && block.text)
        )
        .map((block) => block.label);

      if (missingLabels.length === 0) {
        return blocks;
      }

      throw new Error(
        `parser: dynamic mode "${mode.buttonText}" missing metrics: ${missingLabels.join(", ")}`
      );
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(DYNAMIC_MODE_SETTLE_TIMEOUT_MS);
    }
  }

  throw new Error(
    `parser: dynamic mode "${mode.buttonText}" was not collected after ${DYNAMIC_MODE_RETRY_COUNT} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function assertDynamicBlocksComplete(blocks: RawBlock[]): void {
  const missingCodes = EXPECTED_DYNAMIC_METRIC_CODES.filter(
    (code) => !blocks.some((block) => block.code === code && block.text)
  );

  if (missingCodes.length > 0) {
    throw new Error(
      `parser: dynamic metrics are incomplete, missing=${missingCodes.join(", ")}`
    );
  }
}

function assertDynamicMetricsParsed(metrics: NicheMetric[]): void {
  const missingCodes = EXPECTED_DYNAMIC_METRIC_CODES.filter(
    (code) => !metrics.some((metricItem) => metricItem.metricCode === code)
  );

  if (missingCodes.length > 0) {
    throw new Error(
      `parser: parsed dynamic metrics are incomplete, missing=${missingCodes.join(", ")}`
    );
  }
}

function assertSeasonalityMetricParsed(metrics: NicheMetric[]): void {
  const seasonalityMetric = metrics.find(
    (metricItem) => metricItem.metricCode === "seasonality_title"
  );

  if (!seasonalityMetric?.valueText) {
    throw new Error("parser: seasonality title not found");
  }
}

async function collectDynamicModeBlocks(page: Page): Promise<RawBlock[]> {
  const result: RawBlock[] = [];

  for (const mode of DYNAMIC_MODES) {
    result.push(...await collectDynamicModeWithRetry(page, mode));
  }

  assertDynamicBlocksComplete(result);

  await clickDynamicModeButton(page, "Заказы и выкупы").catch(() => undefined);
  return result;
}

export async function parseNicheReport(
  page: Page,
  scenario: ScenarioConfig
): Promise<ParsedNicheReport> {
  const dynamicBlocks = await collectDynamicModeBlocks(page);

  const rawPage = await page.evaluate<RawNichePage>(`(() => {
    const clean = value => (value || "").replace(/\\s+/g, " ").trim();

    const deltaDirection = element => {
      if (!element) {
        return null;
      }

      const classText = [
        element.getAttribute("class") ?? "",
        ...[...element.querySelectorAll("[class]")].map((child) => child.getAttribute("class") ?? "")
      ].join(" ");

      if (/Dynamic-badge-view--red|Dynamic-badge-view__icon--red|Text--red/.test(classText)) {
        return "down";
      }

      if (
        /Dynamic-badge-view--green|Dynamic-badge-view__icon--green|Text--green|successTextColor/.test(
          classText
        )
      ) {
        return "up";
      }

      if (/Dynamic-badge-view--gray|Dynamic-badge-view--grey|Text--gray|Text--grey/.test(classText)) {
        return "neutral";
      }

      return "unknown";
    };

    const blockBySelector = (code, selector) => {
      const element = document.querySelector(selector);

      return {
        code,
        text: clean(element?.textContent),
        deltaDirection: deltaDirection(element)
      };
    };

    const blockByElement = (code, element) => ({
      code,
      text: clean(element?.textContent),
      deltaDirection: deltaDirection(element)
    });

    const seasonalityBlock = () => {
      const isSeasonalityTitle = text =>
        text.length > "Сезонность".length &&
        text.length <= 80 &&
        /сезонность$/i.test(text) &&
        text !== "Сезонность";

      const heading = [...document.querySelectorAll("h1,h2,h3,h4")]
        .map(element => ({
          element,
          text: clean(element.textContent)
        }))
        .find(({ text }) => isSeasonalityTitle(text));

      if (heading) {
        return blockByElement("seasonality_title", heading.element);
      }

      const description = [...document.querySelectorAll("div,span,p")]
        .find(element =>
          clean(element.textContent).startsWith(
            "Сезонность показывает изменение спроса"
          )
        );

      let parent = description?.parentElement ?? null;

      for (let depth = 0; parent && depth < 6; depth += 1) {
        const candidate = [...parent.querySelectorAll("h1,h2,h3,h4,div,span")]
          .map(element => ({
            element,
            text: clean(element.textContent)
          }))
          .filter(({ text }) => isSeasonalityTitle(text))
          .sort((left, right) => left.text.length - right.text.length)[0];

        if (candidate) {
          return blockByElement("seasonality_title", candidate.element);
        }

        parent = parent.parentElement;
      }

      const fallbackCandidate = bodyText.match(
        /([А-ЯЁ][А-ЯЁа-яё -]{2,80} сезонность)/
      )?.[1];

      return {
        code: "seasonality_title",
        text: clean(fallbackCandidate),
        deltaDirection: null
      };
    };

    const allBySelector = selector => [...document.querySelectorAll(selector)];

    const bodyText = clean(document.body.textContent);
    const strictPeriodLine = bodyText.match(
      /Данные за период [сc] \d{2}\.\d{2}\.\d{4} по \d{2}\.\d{2}\.\d{4} показаны в сравнении с предыдущим аналогичным периодом [сc] \d{2}\.\d{2}\.\d{4} по \d{2}\.\d{2}\.\d{4}/
    )?.[0];
    const periodStartIndex = bodyText.indexOf("Данные за период");
    const periodLine =
      strictPeriodLine ??
      (periodStartIndex >= 0 ? bodyText.slice(periodStartIndex, periodStartIndex + 250) : "");

    const turnoverBlocks = allBySelector(
      '[class*="Turnover-and-grades__block"]'
    );
    const ratingBlocks = allBySelector(
      '[class*="Average-ratings-and-reviews__block"]'
    );

    return {
      sourceUrl: location.href,
      bodyText,
      periodLine,
      blocks: [
        seasonalityBlock(),
        blockBySelector("monopolization", '[class*="Monopolization__"]'),
        blockBySelector("stock_remains", '[class*="Stock-remains__"]'),
        blockByElement("turnover", turnoverBlocks[0]),
        blockByElement("availability", turnoverBlocks[1]),
        blockByElement("rating", ratingBlocks[0]),
        blockByElement("reviews", ratingBlocks[1]),
        blockBySelector("avg_check", '[class*="Average-check__"]'),
        blockBySelector("buyout_pct", '[class*="Redemption-percentage__"]'),
        blockBySelector("revenue", '[class*="Revenue__"]')
      ]
    };
  })()`);

  if (!rawPage.periodLine) {
    throw new Error("parser: period line not found");
  }

  const period = parsePeriodLine(rawPage.periodLine);
  const blocks = [...rawPage.blocks, ...dynamicBlocks];
  const metrics = parseMetrics(blocks);
  assertSeasonalityMetricParsed(metrics);
  assertDynamicMetricsParsed(metrics);

  if (metrics.length === 0) {
    throw new Error(`parser: report data is incomplete metrics=${metrics.length}`);
  }

  return {
    snapshot: {
      snapshotDate: new Date().toISOString().slice(0, 10),
      categoryName: scenario.category,
      subjectName: scenario.subject,
      wbSubjectId: parseSubjectId(rawPage.sourceUrl),
      periodType: scenario.period,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      comparisonStart: period.comparisonStart,
      comparisonEnd: period.comparisonEnd,
      sourceUrl: rawPage.sourceUrl,
      parserVersion: PARSER_VERSION
    },
    metrics
  };
}
