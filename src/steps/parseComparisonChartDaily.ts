import type { Page } from "playwright";
import type { ParsedExistingComparisonReport } from "./parseExistingComparisonList.js";

export type ComparisonChartMetric = {
  name: string;
  code: string;
  apiField: string;
  unit: string | null;
};

export const COMPARISON_CHART_METRICS: ComparisonChartMetric[] = [
  { name: "Показы", code: "shows", apiField: "viewCount", unit: "шт" },
  { name: "Переходы в карточку", code: "card_visits", apiField: "openCard", unit: "шт" },
  { name: "CTR", code: "ctr", apiField: "CTR", unit: "%" },
  {
    name: "Добавления в корзину",
    code: "cart_additions",
    apiField: "addToCart",
    unit: "шт"
  },
  {
    name: "Конверсия в корзину",
    code: "cart_conversion",
    apiField: "openToCart",
    unit: "%"
  },
  { name: "Заказы", code: "orders", apiField: "orders", unit: "шт" },
  {
    name: "Заказали на сумму",
    code: "ordered_amount",
    apiField: "ordersSum",
    unit: "₽"
  },
  {
    name: "Конверсия в заказ",
    code: "order_conversion",
    apiField: "cartToOrder",
    unit: "%"
  },
  { name: "Выкупы", code: "buyout_count", apiField: "buyoutCount", unit: "шт" },
  { name: "Выкупили на сумму", code: "buyout_amount", apiField: "buyoutSum", unit: "₽" },
  {
    name: "Процент выкупа",
    code: "buyout_percent",
    apiField: "buyoutPercent",
    unit: "%"
  },
  { name: "Отмены", code: "cancel_count", apiField: "cancelCount", unit: "шт" },
  {
    name: "Медианная цена покупателя",
    code: "median_buyer_price",
    apiField: "medianPrice",
    unit: "₽"
  },
  { name: "Отменили на сумму", code: "cancel_amount", apiField: "cancelSum", unit: "₽" },
  { name: "Средняя позиция", code: "avg_position", apiField: "avgPosition", unit: null }
];

export type ParsedComparisonChartDailyPoint = {
  metricName: string;
  periodType: "quarter";
  granularity: "day";
  nmId: string;
  metricDate: string;
  valueNumeric: number | string | null;
  valueState: "actual" | "estimated" | "zero" | "missing" | "missing_rendered_as_zero";
  isBaselineZero: boolean;
  unit: string | null;
  source: "api_sales_funnel" | "svg_path";
  strokeColor: string;
  rawPayload: Record<string, unknown>;
};

export type ParsedComparisonChartDaily = {
  metricName: string;
  periodType: "quarter";
  granularity: "day";
  periodStart: string;
  periodEnd: string;
  points: ParsedComparisonChartDailyPoint[];
};

export type ParsedComparisonChartDailyBatch = {
  metricNames: string[];
  periodType: "quarter";
  granularity: "day";
  periodStart: string;
  periodEnd: string;
  points: ParsedComparisonChartDailyPoint[];
};

type SvgSeries = {
  strokeColor: string;
  values: Array<{
    dateIndexRatio: number;
    valueNumeric: number;
    isBaselineZero: boolean;
    rawPoint: { x: number; y: number };
  }>;
};

type SvgChartPayload = {
  metricName: string;
  periodText: string;
  unit: string | null;
  plotXMin: number;
  plotXMax: number;
  axisPairs: Array<{ value: number; y: number }>;
  series: SvgSeries[];
};

type WbHistoryReport = {
  ID: string;
  date: string;
  nms: Array<{
    nmID: number;
    nmName?: string;
    mainPhoto?: string;
    isDeleted?: boolean;
  }>;
  status: {
    available: boolean;
    date?: string;
  };
};

type SalesFunnelRow = {
  nmID: number;
  nmName: string;
  dt: string;
  openCard: number;
  addToCart: number;
  openToCart: number;
  orders: number;
  cartToOrder: number;
  ordersSum: number;
  buyoutCount: number;
  buyoutSum: number;
  buyoutPercent: number;
  cancelCount: number;
  cancelSum: number;
  avgPosition: number;
  CTR: number;
  viewCount: number;
  medianPrice: number;
};

type WbDetailReport = {
  ID?: string;
  salesFunnel: {
    byDay: SalesFunnelRow[];
    byWeek?: SalesFunnelRow[];
    byMonth?: SalesFunnelRow[];
  };
  commonParams?: unknown[];
  searchQueries?: unknown[];
};

type CapturedComparisonApiResponse = {
  url: string;
  status: number;
  requestBody: unknown;
  payload: unknown;
  capturedAt: string;
};

type ComparisonApiCapture = {
  historyResponses: CapturedComparisonApiResponse[];
  detailResponses: CapturedComparisonApiResponse[];
  pending: Set<Promise<void>>;
};

const CHART_COLORS = [
  "#8B3DFF",
  "#E83E8C",
  "#F59E0B",
  "#65C914",
  "#0EA5C6"
];

const COMPARISON_API_CAPTURE_KEY = Symbol("comparisonApiCapture");

function toIsoDate(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parsePeriodRange(periodText: string): { start: string; end: string } {
  const match = periodText.match(
    /Данные\s+за\s+период\s+с\s+(\d{2})\.(\d{2})\.(\d{4})\s+по\s+(\d{2})\.(\d{2})\.(\d{4})/u
  );

  if (match === null) {
    throw new Error(`schema_changed: could not parse chart period text "${periodText}"`);
  }

  return {
    start: toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])),
    end: toIsoDate(Number(match[4]), Number(match[5]), Number(match[6]))
  };
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function generateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);

  for (
    let currentDate = startDate;
    currentDate.getTime() <= endDate.getTime();
    currentDate = addDays(currentDate, 1)
  ) {
    dates.push(currentDate.toISOString().slice(0, 10));
  }

  return dates;
}

function getNmIds(report: ParsedExistingComparisonReport): string[] {
  return report.previewItems
    .map((item) => item.nmId)
    .filter((nmId): nmId is string => nmId !== null)
    .slice(0, 5);
}

function getNumericNmIds(report: ParsedExistingComparisonReport): number[] {
  return getNmIds(report)
    .map((nmId) => Number(nmId))
    .filter((nmId) => Number.isInteger(nmId));
}

function clampIndex(index: number, maxIndex: number): number {
  return Math.max(0, Math.min(maxIndex, index));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapDataPayload(value: unknown): unknown {
  if (isRecord(value) && "data" in value) {
    return value.data;
  }

  return value;
}

function getComparisonApiCapture(page: Page): ComparisonApiCapture {
  const pageWithCapture = page as Page & {
    [COMPARISON_API_CAPTURE_KEY]?: ComparisonApiCapture;
  };

  pageWithCapture[COMPARISON_API_CAPTURE_KEY] ??= {
    historyResponses: [],
    detailResponses: [],
    pending: new Set()
  };

  return pageWithCapture[COMPARISON_API_CAPTURE_KEY];
}

function parseMaybeJson(value: string | null): unknown {
  if (value === null || value.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function attachComparisonApiCapture(page: Page): void {
  const capture = getComparisonApiCapture(page);
  const pageWithCapture = page as Page & {
    __comparisonApiCaptureAttached?: boolean;
  };

  if (pageWithCapture.__comparisonApiCaptureAttached) {
    return;
  }

  pageWithCapture.__comparisonApiCaptureAttached = true;

  page.on("response", (response) => {
    const url = response.url();
    const isHistory = url.includes("/competitor-comparison/history");
    const isDetail = url.includes("/competitor-comparison/nms/detail");

    if (!isHistory && !isDetail) {
      return;
    }

    const pending = (async () => {
      if (response.status() < 200 || response.status() >= 300) {
        return;
      }

      try {
        const payload = unwrapDataPayload(await response.json());
        const capturedResponse: CapturedComparisonApiResponse = {
          url,
          status: response.status(),
          requestBody: parseMaybeJson(response.request().postData()),
          payload,
          capturedAt: new Date().toISOString()
        };

        if (isHistory) {
          capture.historyResponses.push(capturedResponse);
        }

        if (isDetail) {
          capture.detailResponses.push(capturedResponse);
        }
      } catch {
        // Non-JSON or unavailable bodies are ignored; the UI can still continue.
      }
    })();

    capture.pending.add(pending);
    void pending.finally(() => {
      capture.pending.delete(pending);
    });
  });
}

async function flushComparisonApiCapture(capture: ComparisonApiCapture): Promise<void> {
  const pending = [...capture.pending];

  if (pending.length === 0) {
    return;
  }

  await Promise.allSettled(pending);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCapturedApiResponse<T>(
  page: Page,
  finder: (capture: ComparisonApiCapture) => T | null,
  errorMessage: string
): Promise<T> {
  const capture = getComparisonApiCapture(page);
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    await flushComparisonApiCapture(capture);

    const found = finder(capture);

    if (found !== null) {
      return found;
    }

    await sleep(250);
  }

  throw new Error(errorMessage);
}

function minuteKey(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 16);
}

function sameNmSet(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort((a, b) => a - b);
  const rightSorted = [...right].sort((a, b) => a - b);

  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function findMatchingHistoryReport(
  historyReports: WbHistoryReport[],
  report: ParsedExistingComparisonReport,
  nmIds: number[]
): WbHistoryReport {
  const availableUntilKey = minuteKey(report.availableUntilAt);
  const sameNmsReports = historyReports.filter((historyReport) =>
    sameNmSet(
      historyReport.nms.map((item) => item.nmID),
      nmIds
    )
  );

  if (sameNmsReports.length === 0) {
    throw new Error("empty_result: WB history API did not return selected 5 SKU report");
  }

  if (availableUntilKey !== null) {
    const exactByAvailableUntil = sameNmsReports.filter(
      (historyReport) => minuteKey(historyReport.status.date) === availableUntilKey
    );

    if (exactByAvailableUntil.length === 1) {
      return exactByAvailableUntil[0];
    }
  }

  if (report.comparisonDate !== null) {
    const exactByDate = sameNmsReports.filter((historyReport) =>
      historyReport.date.startsWith(report.comparisonDate ?? "")
    );

    if (exactByDate.length === 1) {
      return exactByDate[0];
    }
  }

  if (sameNmsReports.length === 1) {
    return sameNmsReports[0];
  }

  throw new Error(
    `ambiguous_result: WB history API returned ${sameNmsReports.length} reports with the same 5 SKU`
  );
}

async function readVisibleComparisonPeriod(page: Page): Promise<{ start: string; end: string }> {
  const periodText = await page.evaluate<string>(String.raw`
    (() => {
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const periodRegex = /Данные за период с \d{2}\.\d{2}\.\d{4} по \d{2}\.\d{2}\.\d{4}/u;
      const periodText = Array.from(document.querySelectorAll("body *"))
        .map((element) => normalize(element.textContent))
        .map((text) => text.match(periodRegex)?.[0] || null)
        .find((text) => text !== null);

      if (!periodText) {
        throw new Error("schema_changed: chart period text was not found");
      }

      return periodText;
    })()
  `);

  return parsePeriodRange(periodText);
}

function normalizeMetricDate(value: string): string {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/u);

  if (isoMatch !== null) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const russianMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/u);

  if (russianMatch !== null) {
    return `${russianMatch[3]}-${russianMatch[2]}-${russianMatch[1]}`;
  }

  throw new Error(`schema_changed: unsupported sales funnel date "${value}"`);
}

function metricValueState(
  valueNumeric: number | string | null
): ParsedComparisonChartDailyPoint["valueState"] {
  if (valueNumeric === null) {
    return "missing";
  }

  return Number(valueNumeric) === 0 ? "zero" : "actual";
}

function numericMetricValue(row: SalesFunnelRow | undefined, apiField: string): number | null {
  if (row === undefined) {
    return null;
  }

  const value = (row as unknown as Record<string, unknown>)[apiField];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function exactIntegerMetricValue(
  row: SalesFunnelRow | undefined,
  apiField: string
): string | null {
  if (row === undefined) {
    return null;
  }

  const value = (row as unknown as Record<string, unknown>)[apiField];

  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) {
    return String(value);
  }

  if (typeof value === "string" && /^\d+$/u.test(value.trim())) {
    return value.trim();
  }

  throw new Error(`schema_changed: expected integer API value for ${apiField}, got ${String(value)}`);
}

function apiMetricValue(
  row: SalesFunnelRow | undefined,
  metric: ComparisonChartMetric
): number | string | null {
  if (metric.apiField === "viewCount") {
    return exactIntegerMetricValue(row, metric.apiField);
  }

  return numericMetricValue(row, metric.apiField);
}

function classifyApiValue(
  metric: ComparisonChartMetric,
  valueNumeric: number | string | null
): Pick<ParsedComparisonChartDailyPoint, "valueNumeric" | "valueState" | "isBaselineZero"> {
  if (
    valueNumeric !== null &&
    Number(valueNumeric) === 0 &&
    isMissingWhenRenderedAsZeroMetric(metric.name)
  ) {
    return {
      valueNumeric: null,
      valueState: "missing_rendered_as_zero",
      isBaselineZero: true
    };
  }

  return {
    valueNumeric,
    valueState: metricValueState(valueNumeric),
    isBaselineZero: false
  };
}

function isWbHistoryReportArray(value: unknown): value is WbHistoryReport[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.ID === "string" &&
        Array.isArray(item.nms) &&
        isRecord(item.status)
    )
  );
}

function isWbDetailReport(value: unknown): value is WbDetailReport {
  return (
    isRecord(value) &&
    isRecord(value.salesFunnel) &&
    Array.isArray(value.salesFunnel.byDay)
  );
}

function requestBodyRecord(
  response: CapturedComparisonApiResponse
): Record<string, unknown> | null {
  return isRecord(response.requestBody) ? response.requestBody : null;
}

function requestPeriodMatches(
  response: CapturedComparisonApiResponse,
  periodStart: string,
  periodEnd: string
): boolean {
  const requestBody = requestBodyRecord(response);

  if (requestBody === null || !isRecord(requestBody.period)) {
    return false;
  }

  return requestBody.period.start === periodStart && requestBody.period.end === periodEnd;
}

function requestIdMatches(
  response: CapturedComparisonApiResponse,
  comparisonId: string
): boolean {
  return requestBodyRecord(response)?.id === comparisonId;
}

async function waitForCapturedHistoryReport(
  page: Page,
  report: ParsedExistingComparisonReport,
  nmIds: number[]
): Promise<WbHistoryReport> {
  return waitForCapturedApiResponse(
    page,
    (capture) => {
      for (const response of [...capture.historyResponses].reverse()) {
        if (!isWbHistoryReportArray(response.payload)) {
          continue;
        }

        try {
          const match = findMatchingHistoryReport(response.payload, report, nmIds);
          return match;
        } catch {
          continue;
        }
      }

      return null;
    },
    "empty_result: selected comparison report was not captured from WB history API response"
  );
}

async function waitForCapturedDetailReport(
  page: Page,
  options: {
    comparisonId: string;
    periodStart: string;
    periodEnd: string;
  }
): Promise<{
  detail: WbDetailReport;
  response: CapturedComparisonApiResponse;
}> {
  return waitForCapturedApiResponse(
    page,
    (capture) => {
      for (const response of [...capture.detailResponses].reverse()) {
        if (
          !requestIdMatches(response, options.comparisonId) ||
          !requestPeriodMatches(response, options.periodStart, options.periodEnd) ||
          !isWbDetailReport(response.payload)
        ) {
          continue;
        }

        return {
          detail: response.payload,
          response
        };
      }

      return null;
    },
    "empty_result: selected quarter comparison report was not captured from WB detail API response"
  );
}

function isMissingWhenRenderedAsZeroMetric(metricName: string): boolean {
  return metricName === "Медианная цена покупателя" || metricName === "Средняя позиция";
}

function classifySvgValue(
  metricName: string,
  valueNumeric: number,
  isBaselineZero: boolean
): Pick<ParsedComparisonChartDailyPoint, "valueNumeric" | "valueState" | "isBaselineZero"> {
  if (isBaselineZero && isMissingWhenRenderedAsZeroMetric(metricName)) {
    return {
      valueNumeric: null,
      valueState: "missing_rendered_as_zero",
      isBaselineZero
    };
  }

  if (isBaselineZero) {
    return {
      valueNumeric: 0,
      valueState: "zero",
      isBaselineZero
    };
  }

  return {
    valueNumeric,
    valueState: "estimated",
    isBaselineZero
  };
}

function combineComparisonChartDaily(
  charts: ParsedComparisonChartDaily[]
): ParsedComparisonChartDailyBatch {
  if (charts.length === 0) {
    throw new Error("empty_result: no metric charts were parsed");
  }

  const [firstChart] = charts;
  const differentPeriod = charts.find(
    (chart) =>
      chart.periodStart !== firstChart.periodStart || chart.periodEnd !== firstChart.periodEnd
  );

  if (differentPeriod !== undefined) {
    throw new Error("schema_changed: metric charts have different period ranges");
  }

  return {
    metricNames: charts.map((chart) => chart.metricName),
    periodType: "quarter",
    granularity: "day",
    periodStart: firstChart.periodStart,
    periodEnd: firstChart.periodEnd,
    points: charts.flatMap((chart) => chart.points)
  };
}

async function selectComparisonChartMetric(
  page: Page,
  metric: ComparisonChartMetric
): Promise<void> {
  const metricTab = page
    .locator('span[role="presentation"]')
    .filter({ hasText: metric.name });
  const metricTabCount = await metricTab.count();

  if (metricTabCount !== 1) {
    throw new Error(
      `selector_changed: expected one chart metric "${metric.name}", got ${metricTabCount}`
    );
  }

  await metricTab.scrollIntoViewIfNeeded();
  await metricTab.click();

  await page.waitForFunction(
    String.raw`
      (() => {
        const metricName = ${JSON.stringify(metric.name)};
        const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const activeMetric = [...document.querySelectorAll('span[role="presentation"]')]
          .map((element) => ({
            text: normalize(element.textContent),
            className: String(element.className || "")
          }))
          .find((item) => item.text === metricName);
        const chartPaths = [...document.querySelectorAll("path.recharts-line-curve")];

        return Boolean(activeMetric?.className.includes("active")) &&
          chartPaths.length >= 5 &&
          chartPaths.every((path) => {
            const numbers = (path.getAttribute("d") || "").match(/-?[0-9]+(?:\.[0-9]+)?/g) || [];
            return numbers.length >= 2;
          });
      })()
    `,
    undefined,
    { timeout: 30_000 }
  );
}

async function parseActiveComparisonChartDaily(
  page: Page,
  report: ParsedExistingComparisonReport,
  metric: ComparisonChartMetric
): Promise<ParsedComparisonChartDaily> {
  const nmIds = getNmIds(report);

  if (nmIds.length !== 5) {
    throw new Error(`empty_result: expected 5 SKU for chart parsing, got ${nmIds.length}`);
  }

  const payload = await page.evaluate<SvgChartPayload>(String.raw`
    (() => {
      const metricName = ${JSON.stringify(metric.name)};
      const metricUnit = ${JSON.stringify(metric.unit)};
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const numberRegex = /-?[0-9]+(?:\.[0-9]+)?/g;
      const periodRegex = /Данные за период с \d{2}\.\d{2}\.\d{4} по \d{2}\.\d{2}\.\d{4}/u;
      const parseAxisValue = (text) => {
        const cleaned = normalize(text).replace(/\u00a0/g, " ");
        const match = cleaned.match(/-?[0-9]+(?:[,.][0-9]+)?/);

        if (match === null) {
          return null;
        }

        const multiplier = /млн/i.test(cleaned) ? 1000000 : /тыс/i.test(cleaned) ? 1000 : 1;
        return Number(match[0].replace(",", ".")) * multiplier;
      };
      const isAxisValueText = (text) => {
        const cleaned = normalize(text).replace(/\u00a0/g, " ");

        if (/^[0-9]{2}\.[0-9]{2}$/.test(cleaned)) {
          return false;
        }

        return /^-?[0-9]+(?:[,.][0-9]+)?(?:\s*(?:тыс\.?|млн\.?|₽|%))?$/i.test(cleaned);
      };
      const parsePathPoints = (d) => {
        const points = [];
        const commands = [...d.matchAll(/([MC])([^MC]*)/g)];

        for (const commandMatch of commands) {
          const command = commandMatch[1];
          const numbers = ((commandMatch[2] || "").match(numberRegex) || []).map(Number);

          if (command === "M" && numbers.length >= 2) {
            points.push({ x: numbers[0], y: numbers[1] });
          }

          if (command === "C") {
            for (let index = 0; index + 5 < numbers.length; index += 6) {
              points.push({ x: numbers[index + 4], y: numbers[index + 5] });
            }
          }
        }

        return points;
      };
      const linearValue = (y, axisPairs) => {
        const count = axisPairs.length;
        const sumY = axisPairs.reduce((sum, pair) => sum + pair.y, 0);
        const sumValue = axisPairs.reduce((sum, pair) => sum + pair.value, 0);
        const sumYValue = axisPairs.reduce((sum, pair) => sum + pair.y * pair.value, 0);
        const sumY2 = axisPairs.reduce((sum, pair) => sum + pair.y * pair.y, 0);
        const slope = (count * sumYValue - sumY * sumValue) / (count * sumY2 - sumY * sumY);
        const intercept = (sumValue - slope * sumY) / count;
        const value = slope * y + intercept;

        return Math.max(0, Number(value.toFixed(4)));
      };

      const svg = Array.from(document.querySelectorAll("svg"))
        .map((node) => ({
          node,
          rect: node.getBoundingClientRect(),
          lineSeriesCount: node.querySelectorAll("path.recharts-line-curve").length
        }))
        .find((item) => item.rect.width > 300 && item.rect.height > 250 && item.lineSeriesCount >= 5);

      if (svg === undefined) {
        throw new Error("empty_result: comparison chart SVG was not found");
      }

      const periodText = Array.from(document.querySelectorAll("body *"))
        .map((element) => normalize(element.textContent))
        .map((text) => text.match(periodRegex)?.[0] || null)
        .find((text) => text !== null);

      if (periodText === undefined) {
        throw new Error("schema_changed: chart period text was not found");
      }

      const horizontalGridLines = Array.from(svg.node.querySelectorAll("line"))
        .map((line) => ({
          x1: Number(line.getAttribute("x1")),
          x2: Number(line.getAttribute("x2")),
          y: Number(line.getAttribute("y1")),
          stroke: line.getAttribute("stroke")
        }))
        .filter((line) => line.stroke === "#ccc" && Number.isFinite(line.y) && Math.abs(line.x2 - line.x1) > 100)
        .sort((left, right) => right.y - left.y);
      const axisValues = [...new Set(Array.from(svg.node.querySelectorAll("text"))
        .map((text) => normalize(text.textContent || ""))
        .filter((text) => isAxisValueText(text))
        .map((text) => parseAxisValue(text))
        .filter((value) => value !== null))]
        .sort((left, right) => left - right);
      const axisPairs = axisValues
        .slice(0, horizontalGridLines.length)
        .map((value, index) => ({ value, y: horizontalGridLines[index].y }));

      if (axisPairs.length < 2) {
        throw new Error("schema_changed: chart Y axis scale was not found");
      }

      const plotXMin = Math.min(...horizontalGridLines.map((line) => line.x1));
      const plotXMax = Math.max(...horizontalGridLines.map((line) => line.x2));

      if (!Number.isFinite(plotXMin) || !Number.isFinite(plotXMax) || plotXMin === plotXMax) {
        throw new Error("schema_changed: chart X axis scale was not found");
      }

      const zeroAxisY = axisPairs.find((pair) => pair.value === 0)?.y ?? null;
      const series = Array.from(svg.node.querySelectorAll("path.recharts-line-curve"))
        .map((path) => {
          const rawPoints = parsePathPoints(path.getAttribute("d") || "");
          return {
            strokeColor: path.getAttribute("stroke") || "",
            values: rawPoints.map((point) => ({
              dateIndexRatio: (point.x - plotXMin) / (plotXMax - plotXMin),
              valueNumeric: linearValue(point.y, axisPairs),
              isBaselineZero: zeroAxisY !== null && Math.abs(point.y - zeroAxisY) < 0.001,
              rawPoint: point
            }))
          };
        })
        .filter((item) => item.values.length > 0);

      if (series.length === 0) {
        throw new Error("empty_result: chart series were not found");
      }

      return {
        metricName,
        periodText,
        unit: metricUnit,
        plotXMin,
        plotXMax,
        axisPairs,
        series
      };
    })()
  `);
  const { start, end } = parsePeriodRange(payload.periodText);
  const dates = generateDates(start, end);

  if (payload.series.length !== nmIds.length) {
    throw new Error(
      `schema_changed: expected ${nmIds.length} chart series, got ${payload.series.length}`
    );
  }

  const points = payload.series.flatMap((series, seriesIndex) => {
    const seenDates = new Map<string, ParsedComparisonChartDailyPoint>();

    for (const value of series.values) {
      const dateIndex = clampIndex(
        Math.round(value.dateIndexRatio * (dates.length - 1)),
        dates.length - 1
      );
      const metricDate = dates[dateIndex];
      const classifiedValue = classifySvgValue(
        payload.metricName,
        value.valueNumeric,
        value.isBaselineZero
      );

      seenDates.set(metricDate, {
        metricName: payload.metricName,
        periodType: "quarter" as const,
        granularity: "day" as const,
        nmId: nmIds[seriesIndex],
        metricDate,
        valueNumeric: classifiedValue.valueNumeric,
        valueState: classifiedValue.valueState,
        isBaselineZero: classifiedValue.isBaselineZero,
        unit: payload.unit,
        source: "svg_path" as const,
        strokeColor: series.strokeColor,
        rawPayload: {
          x: value.rawPoint.x,
          y: value.rawPoint.y,
          dateIndex,
          isBaselineZero: classifiedValue.isBaselineZero,
          valueState: classifiedValue.valueState,
          parser: "recharts_svg_path_endpoint_v2",
          axisPairs: payload.axisPairs,
          plotXMin: payload.plotXMin,
          plotXMax: payload.plotXMax
        }
      });
    }

    return [...seenDates.values()].sort((left, right) =>
      left.metricDate.localeCompare(right.metricDate)
    );
  });

  return {
    metricName: payload.metricName,
    periodType: "quarter",
    granularity: "day",
    periodStart: start,
    periodEnd: end,
    points
  };
}

export async function parseComparisonChartDailyFromApi(
  page: Page,
  report: ParsedExistingComparisonReport
): Promise<ParsedComparisonChartDailyBatch> {
  const nmIds = getNumericNmIds(report);

  if (nmIds.length !== 5) {
    throw new Error(`empty_result: expected 5 SKU for chart API parsing, got ${nmIds.length}`);
  }

  const { start, end } = await readVisibleComparisonPeriod(page);
  const dates = generateDates(start, end);
  const historyReport = await waitForCapturedHistoryReport(page, report, nmIds);
  const capturedDetail = await waitForCapturedDetailReport(page, {
    comparisonId: historyReport.ID,
    periodStart: start,
    periodEnd: end
  });
  const { detail } = capturedDetail;
  const selectedNmIds = new Set(nmIds);
  const rowsByNmIdAndDate = new Map<string, SalesFunnelRow>();

  for (const row of detail.salesFunnel.byDay) {
    if (!selectedNmIds.has(row.nmID)) {
      continue;
    }

    rowsByNmIdAndDate.set(`${row.nmID}:${normalizeMetricDate(row.dt)}`, row);
  }

  if (rowsByNmIdAndDate.size === 0) {
    throw new Error("empty_result: WB detail API returned no by-day rows for selected SKU");
  }

  const points = COMPARISON_CHART_METRICS.flatMap((metric) =>
    nmIds.flatMap((nmId, nmIndex) =>
      dates.map((metricDate) => {
        const row = rowsByNmIdAndDate.get(`${nmId}:${metricDate}`);
        const classifiedValue = classifyApiValue(metric, apiMetricValue(row, metric));

        return {
          metricName: metric.name,
          periodType: "quarter" as const,
          granularity: "day" as const,
          nmId: String(nmId),
          metricDate,
          valueNumeric: classifiedValue.valueNumeric,
          valueState: classifiedValue.valueState,
          isBaselineZero: classifiedValue.isBaselineZero,
          unit: metric.unit,
          source: "api_sales_funnel" as const,
          strokeColor: CHART_COLORS[nmIndex] ?? "",
          rawPayload: {
            parser: "wb_competitor_comparison_nms_detail_v3",
            sourceMode: "captured_browser_response",
            apiEndpoint: capturedDetail.response.url,
            apiField: metric.apiField,
            comparisonId: historyReport.ID,
            historyDate: historyReport.date,
            historyAvailableUntil: historyReport.status.date ?? null,
            capturedAt: capturedDetail.response.capturedAt,
            requestBody: capturedDetail.response.requestBody,
            rowFound: row !== undefined,
            apiRow: row ?? null
          }
        };
      })
    )
  );

  return {
    metricNames: COMPARISON_CHART_METRICS.map((metric) => metric.name),
    periodType: "quarter",
    granularity: "day",
    periodStart: start,
    periodEnd: end,
    points
  };
}

export async function parseComparisonChartDaily(
  page: Page,
  report: ParsedExistingComparisonReport,
  metric: ComparisonChartMetric
): Promise<ParsedComparisonChartDaily> {
  await selectComparisonChartMetric(page, metric);
  return parseActiveComparisonChartDaily(page, report, metric);
}

export function combineParsedComparisonChartDaily(
  charts: ParsedComparisonChartDaily[]
): ParsedComparisonChartDailyBatch {
  return combineComparisonChartDaily(charts);
}
