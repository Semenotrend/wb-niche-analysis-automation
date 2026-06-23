import type {
  SqliteReport,
  SqliteReportCompareCard,
  SqliteReportMetric,
  SqliteReportRun,
  SqliteReportSearchQuery
} from "./report.js";

function formatNumber(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatMetricValue(metric: SqliteReportMetric): string {
  const value =
    metric.valueText ??
    (metric.valueNumeric === null
      ? "-"
      : `${formatNumber(metric.valueNumeric)}${metric.unit ? ` ${metric.unit}` : ""}`);

  if (metric.deltaValue === null) {
    return value;
  }

  const sign = metric.deltaValue > 0 ? "+" : "";
  const delta = `${sign}${formatNumber(metric.deltaValue)}${
    metric.deltaUnit ? ` ${metric.deltaUnit}` : ""
  }`;

  return `${value} (${delta})`;
}

function formatRuns(runs: SqliteReportRun[]): string[] {
  if (runs.length === 0) {
    return ["Runs", "- no runs found"];
  }

  return [
    "Runs",
    ...runs.map((run) => {
      const duration = run.durationMs === null ? "-" : `${run.durationMs}ms`;
      return `- ${run.scenarioName}: ${run.status}, ${duration}, ${run.createdAt}`;
    })
  ];
}

function formatMetrics(metrics: SqliteReportMetric[]): string[] {
  if (metrics.length === 0) {
    return ["Metrics", "- no niche metrics found"];
  }

  return [
    "Metrics",
    ...metrics.map(
      (metric) => `- ${metric.metricName}: ${formatMetricValue(metric)}`
    )
  ];
}

function formatSearchQueries(searchQueries: SqliteReportSearchQuery[]): string[] {
  if (searchQueries.length === 0) {
    return ["Top search queries", "- no search queries found"];
  }

  return [
    "Top search queries",
    ...searchQueries.map(
      (query) =>
        `${query.rankPosition}. ${query.queryText} — ${formatNumber(
          query.queryCount
        )}, cart ${formatNumber(query.cartConversionPct)}%, order ${formatNumber(
          query.orderConversionPct
        )}%`
    )
  ];
}

function formatCompareCards(compareCards: SqliteReportCompareCard[]): string[] {
  if (compareCards.length === 0) {
    return ["Compare cards", "- no compare card recommendations found"];
  }

  return [
    "Compare cards",
    ...compareCards.map((card) => `${card.rankPosition}. ${card.nmId}`)
  ];
}

export function formatSqliteReport(report: SqliteReport): string {
  if (
    report.runs.length === 0 &&
    report.latestSnapshot === null &&
    report.compareCards.length === 0
  ) {
    return [
      "SQLite report",
      report.databasePath,
      "",
      "No SQLite data found.",
      "",
      "Run:",
      "  HEADLESS=false pnpm run niche-report:sqlite",
      "  HEADLESS=false pnpm run niche-query-stats:sqlite",
      "  HEADLESS=false pnpm run compare-cards:sqlite"
    ].join("\n");
  }

  const lines = ["SQLite report", report.databasePath, "", ...formatRuns(report.runs)];

  if (report.latestSnapshot) {
    lines.push(
      "",
      "Latest niche",
      `${report.latestSnapshot.categoryName} / ${report.latestSnapshot.subjectName}`,
      `Subject ID: ${report.latestSnapshot.wbSubjectId ?? "-"}`,
      `Snapshot date: ${report.latestSnapshot.snapshotDate}`,
      `Period: ${report.latestSnapshot.periodType}, ${report.latestSnapshot.periodStart}..${report.latestSnapshot.periodEnd}`
    );
  } else {
    lines.push("", "Latest niche", "- no niche snapshot found");
  }

  lines.push(
    "",
    ...formatMetrics(report.metrics),
    "",
    ...formatSearchQueries(report.searchQueries),
    "",
    ...formatCompareCards(report.compareCards)
  );

  return lines.join("\n");
}
