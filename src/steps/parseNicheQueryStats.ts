import type { Page } from "playwright";
import type {
  NicheSearchQuery,
  NicheSnapshot
} from "./parseNicheReport.js";
import type { ScenarioConfig } from "../core/config.js";

type DeltaDirection = "up" | "down" | "neutral" | "unknown" | null;

type RawSearchRow = {
  cells: string[];
  cartConversionDeltaDirection: DeltaDirection;
  orderConversionDeltaDirection: DeltaDirection;
  text: string;
};

type RawQueryStatsPage = {
  sourceUrl: string;
  periodLine: string;
  searchRows: RawSearchRow[];
};

export type ParsedNicheQueryStats = {
  snapshot: NicheSnapshot;
  searchQueries: NicheSearchQuery[];
};

const PARSER_VERSION = "v1";
const SEARCH_QUERY_TARGET_ROWS = 50;
const SEARCH_QUERY_MAX_LOAD_MORE_CLICKS = 20;

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

function parseSearchQueries(rows: RawSearchRow[]): NicheSearchQuery[] {
  return rows
    .filter((row) => row.cells.length >= 4)
    .map((row, index) => {
      const cart = parsePercentPair(
        row.cells[2],
        row.cartConversionDeltaDirection
      );
      const order = parsePercentPair(
        row.cells[3],
        row.orderConversionDeltaDirection
      );

      return {
        rankPosition: index + 1,
        queryText: row.cells[0],
        queryCount: parseNumber(row.cells[1]),
        cartConversionPct: cart.value,
        cartConversionDeltaPct: cart.delta,
        cartConversionDeltaDirection: row.cartConversionDeltaDirection,
        orderConversionPct: order.value,
        orderConversionDeltaPct: order.delta,
        orderConversionDeltaDirection: row.orderConversionDeltaDirection,
        rawText: row.text
      };
    });
}

async function getSearchQueryTableState(page: Page): Promise<{
  dataRowCount: number;
  hasShowMore: boolean;
}> {
  return page.evaluate(`(() => {
    const clean = value => (value || "").replace(/\\s+/g, " ").trim();

    const table = [...document.querySelectorAll("table")].find((candidate) =>
      clean(candidate.textContent).includes("Конверсия из поиска в заказ")
    );

    const dataRowCount = [...(table?.querySelectorAll("tr") ?? [])]
      .slice(1)
      .filter(
        (row) =>
          [...row.querySelectorAll("th,td")]
            .map((cell) => clean(cell.textContent))
            .filter(Boolean).length >= 4
      ).length;

    const hasShowMore = [...document.querySelectorAll("button")].some(
      (button) => clean(button.textContent) === "Показать ещё"
    );

    return { dataRowCount, hasShowMore };
  })()`);
}

async function loadAllSearchQueries(page: Page): Promise<void> {
  await page.waitForFunction(
    `() =>
      [...document.querySelectorAll("table")].some((candidate) =>
        (candidate.textContent ?? "").includes("Конверсия из поиска в заказ")
      )`,
    undefined,
    { timeout: 30_000 }
  );

  await page.evaluate(`(() => {
    const table = [...document.querySelectorAll("table")].find((candidate) =>
      (candidate.textContent ?? "").includes("Конверсия из поиска в заказ")
    );

    table?.scrollIntoView({ block: "center" });
  })()`);

  for (let attempt = 0; attempt < SEARCH_QUERY_MAX_LOAD_MORE_CLICKS; attempt += 1) {
    const state = await getSearchQueryTableState(page);

    if (state.dataRowCount >= SEARCH_QUERY_TARGET_ROWS || !state.hasShowMore) {
      return;
    }

    const beforeCount = state.dataRowCount;
    const showMoreButton = page.getByRole("button", {
      name: "Показать ещё",
      exact: true
    });

    await showMoreButton.scrollIntoViewIfNeeded();
    await showMoreButton.click();

    await page.waitForFunction(
      `({ beforeCount: previousCount, targetRows }) => {
        const clean = value => (value || "").replace(/\\s+/g, " ").trim();

        const table = [...document.querySelectorAll("table")].find((candidate) =>
          clean(candidate.textContent).includes("Конверсия из поиска в заказ")
        );

        const dataRowCount = [...(table?.querySelectorAll("tr") ?? [])]
          .slice(1)
          .filter(
            (row) =>
              [...row.querySelectorAll("th,td")]
                .map((cell) => clean(cell.textContent))
                .filter(Boolean).length >= 4
          ).length;

        const hasShowMore = [...document.querySelectorAll("button")].some(
          (button) => clean(button.textContent) === "Показать ещё"
        );

        return dataRowCount > previousCount || dataRowCount >= targetRows || !hasShowMore;
      }`,
      {
        beforeCount,
        targetRows: SEARCH_QUERY_TARGET_ROWS
      },
      { timeout: 15_000 }
    );
  }

  const finalState = await getSearchQueryTableState(page);

  throw new Error(
    `parser: search queries were not fully loaded rows=${finalState.dataRowCount}, target=${SEARCH_QUERY_TARGET_ROWS}`
  );
}

async function collectQueryStatsPage(page: Page): Promise<RawQueryStatsPage> {
  return page.evaluate<RawQueryStatsPage>(`(() => {
    const clean = value => (value || "").replace(/\\s+/g, " ").trim();
    const bodyText = clean(document.body.textContent);
    const strictPeriodLine = bodyText.match(
      /Данные за период [сc] \\d{2}\\.\\d{2}\\.\\d{4} по \\d{2}\\.\\d{2}\\.\\d{4} показаны в сравнении с предыдущим аналогичным периодом [сc] \\d{2}\\.\\d{2}\\.\\d{4} по \\d{2}\\.\\d{2}\\.\\d{4}/
    )?.[0];
    const periodStartIndex = bodyText.indexOf("Данные за период");
    const periodLine =
      strictPeriodLine ??
      (periodStartIndex >= 0 ? bodyText.slice(periodStartIndex, periodStartIndex + 250) : "");

    const table = [...document.querySelectorAll("table")].find((candidate) =>
      clean(candidate.textContent).includes("Конверсия из поиска в заказ")
    );

    const cellDeltaDirection = cell => {
      if (!cell) {
        return null;
      }

      const classText = [
        cell.getAttribute("class") ?? "",
        ...[...cell.querySelectorAll("[class]")].map(
          (child) => child.getAttribute("class") ?? ""
        )
      ].join(" ");

      if (/scheme-danger|Text--red|Dynamic-badge-view--red/.test(classText)) {
        return "down";
      }

      if (/scheme-success|successTextColor|Text--green|Dynamic-badge-view--green/.test(classText)) {
        return "up";
      }

      if (/scheme-generic|scheme-neutral|Text--gray|Text--grey/.test(classText)) {
        return "neutral";
      }

      return "unknown";
    };

    const searchRows = [...(table?.querySelectorAll("tr") ?? [])]
      .slice(1)
      .map((row) => {
        const cells = [...row.querySelectorAll("th,td")];
        const cellTexts = cells
          .map((cell) => clean(cell.textContent))
          .filter(Boolean);

        return {
          cells: cellTexts,
          cartConversionDeltaDirection: cellDeltaDirection(cells[2]),
          orderConversionDeltaDirection: cellDeltaDirection(cells[3]),
          text: clean(row.textContent)
        };
      })
      .filter((row) => row.cells.length >= 4);

    return {
      sourceUrl: location.href,
      periodLine,
      searchRows
    };
  })()`);
}

export async function parseNicheQueryStats(
  page: Page,
  scenario: ScenarioConfig
): Promise<ParsedNicheQueryStats> {
  await loadAllSearchQueries(page);

  const rawPage = await collectQueryStatsPage(page);

  if (!rawPage.periodLine) {
    throw new Error("parser: period line not found");
  }

  const period = parsePeriodLine(rawPage.periodLine);
  const searchQueries = parseSearchQueries(rawPage.searchRows);

  if (searchQueries.length === 0) {
    throw new Error("parser: search queries not found");
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
    searchQueries
  };
}
