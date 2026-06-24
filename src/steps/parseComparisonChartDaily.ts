import type { Page } from "playwright";
import type { ParsedExistingComparisonReport } from "./parseExistingComparisonList.js";

export type ComparisonChartMetric = {
  name: string;
  code: string;
  unit: string | null;
};

export const COMPARISON_CHART_METRICS: ComparisonChartMetric[] = [
  { name: "Показы", code: "shows", unit: "шт" },
  { name: "CTR", code: "ctr", unit: "%" },
  { name: "Конверсия в корзину", code: "cart_conversion", unit: "%" },
  { name: "Конверсия в заказ", code: "order_conversion", unit: "%" },
  { name: "Процент выкупа", code: "buyout_percent", unit: "%" },
  { name: "Медианная цена покупателя", code: "median_buyer_price", unit: "₽" },
  { name: "Средняя позиция", code: "avg_position", unit: null }
];

export type ParsedComparisonChartDailyPoint = {
  metricName: string;
  periodType: "quarter";
  granularity: "day";
  nmId: string;
  metricDate: string;
  valueNumeric: number;
  unit: string | null;
  source: "svg_path";
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

function clampIndex(index: number, maxIndex: number): number {
  return Math.max(0, Math.min(maxIndex, index));
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
    (metricName) => {
      const normalize = (value: string | null): string =>
        String(value || "").replace(/\s+/g, " ").trim();
      const activeMetric = Array.from(
        document.querySelectorAll('span[role="presentation"]')
      )
        .map((element) => ({
          text: normalize(element.textContent),
          className: String(element.className || "")
        }))
        .find((item) => item.text === metricName);
      const chartPaths = Array.from(document.querySelectorAll("path.recharts-line-curve"));

      return (
        Boolean(activeMetric?.className.includes("active")) &&
        chartPaths.length >= 5 &&
        chartPaths.every((path) => {
          const numbers = (path.getAttribute("d") || "").match(/-?[0-9]+(?:\.[0-9]+)?/g) || [];
          return numbers.length >= 2;
        })
      );
    },
    metric.name,
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

  const payload = await page.evaluate<
    SvgChartPayload,
    { metricName: string; metricUnit: string | null }
  >(({ metricName, metricUnit }) => {
      const normalize = (value: string | null): string =>
        String(value || "").replace(/\s+/g, " ").trim();
      const numberRegex = /-?[0-9]+(?:\.[0-9]+)?/g;
      const periodRegex = /Данные за период с \d{2}\.\d{2}\.\d{4} по \d{2}\.\d{2}\.\d{4}/u;
      const parseAxisValue = (text: string): number | null => {
        const cleaned = normalize(text).replace(/\u00a0/g, " ");
        const match = cleaned.match(/-?[0-9]+(?:[,.][0-9]+)?/);

        if (match === null) {
          return null;
        }

        const multiplier = /млн/i.test(cleaned) ? 1000000 : /тыс/i.test(cleaned) ? 1000 : 1;
        return Number(match[0].replace(",", ".")) * multiplier;
      };
      const isAxisValueText = (text: string): boolean => {
        const cleaned = normalize(text).replace(/\u00a0/g, " ");

        if (/^[0-9]{2}\.[0-9]{2}$/.test(cleaned)) {
          return false;
        }

        return /^-?[0-9]+(?:[,.][0-9]+)?(?:\s*(?:тыс\.?|млн\.?|₽|%))?$/i.test(cleaned);
      };
      const parsePathPoints = (d: string): Array<{ x: number; y: number }> => {
        const points: Array<{ x: number; y: number }> = [];
        const commands = [...d.matchAll(/([MC])([^MC]*)/g)];

        for (const commandMatch of commands) {
          const command = commandMatch[1];
          const numbers = ((commandMatch[2] ?? "").match(numberRegex) || []).map(Number);

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
      const linearValue = (
        y: number,
        axisPairs: Array<{ value: number; y: number }>
      ): number => {
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
        .find((text): text is string => text !== null);

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
        .filter((value): value is number => value !== null))]
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

      const series = Array.from(svg.node.querySelectorAll("path.recharts-line-curve"))
        .map((path) => {
          const rawPoints = parsePathPoints(path.getAttribute("d") || "");
          return {
            strokeColor: path.getAttribute("stroke") || "",
            values: rawPoints.map((point) => ({
              dateIndexRatio: (point.x - plotXMin) / (plotXMax - plotXMin),
              valueNumeric: linearValue(point.y, axisPairs),
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
    },
    { metricName: metric.name, metricUnit: metric.unit }
  );
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

      seenDates.set(metricDate, {
        metricName: payload.metricName,
        periodType: "quarter" as const,
        granularity: "day" as const,
        nmId: nmIds[seriesIndex],
        metricDate,
        valueNumeric: value.valueNumeric,
        unit: payload.unit,
        source: "svg_path" as const,
        strokeColor: series.strokeColor,
        rawPayload: {
          x: value.rawPoint.x,
          y: value.rawPoint.y,
          dateIndex,
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
