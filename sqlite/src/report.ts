import type Database from "better-sqlite3";
import { assertSqliteSchemaReady, openSqliteDatabase } from "./connection.js";

export type SqliteReportRun = {
  scenarioName: string;
  status: string;
  durationMs: number | null;
  createdAt: string;
};

export type SqliteReportSnapshot = {
  snapshotId: string;
  snapshotDate: string;
  categoryName: string;
  subjectName: string;
  wbSubjectId: number | null;
  periodType: string;
  periodStart: string;
  periodEnd: string;
};

export type SqliteReportMetric = {
  metricCode: string;
  metricName: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  deltaValue: number | null;
  deltaUnit: string | null;
  deltaDirection: string | null;
};

export type SqliteReportSearchQuery = {
  rankPosition: number;
  queryText: string;
  queryCount: number | null;
  cartConversionPct: number | null;
  orderConversionPct: number | null;
};

export type SqliteReportCompareCard = {
  rankPosition: number;
  nmId: number;
};

export type SqliteReport = {
  databasePath: string;
  runs: SqliteReportRun[];
  latestSnapshot: SqliteReportSnapshot | null;
  metrics: SqliteReportMetric[];
  searchQueries: SqliteReportSearchQuery[];
  compareCards: SqliteReportCompareCard[];
};

const IMPORTANT_METRIC_CODES = [
  "seasonality_title",
  "revenue_rub",
  "avg_check_rub",
  "buyout_pct",
  "ordered_qty",
  "bought_out_qty"
];

function mapRun(row: {
  scenario_name: string;
  status: string;
  duration_ms: number | null;
  created_at: string;
}): SqliteReportRun {
  return {
    scenarioName: row.scenario_name,
    status: row.status,
    durationMs: row.duration_ms,
    createdAt: row.created_at
  };
}

function mapSnapshot(row: {
  snapshot_id: string;
  snapshot_date: string;
  category_name: string;
  subject_name: string;
  wb_subject_id: number | null;
  period_type: string;
  period_start: string;
  period_end: string;
}): SqliteReportSnapshot {
  return {
    snapshotId: row.snapshot_id,
    snapshotDate: row.snapshot_date,
    categoryName: row.category_name,
    subjectName: row.subject_name,
    wbSubjectId: row.wb_subject_id,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end
  };
}

function loadLatestSnapshot(db: Database.Database): SqliteReportSnapshot | null {
  const row = db
    .prepare(
      `
        SELECT
          snapshot_id,
          snapshot_date,
          category_name,
          subject_name,
          wb_subject_id,
          period_type,
          period_start,
          period_end
        FROM wb_niche_snapshots
        ORDER BY created_at DESC
        LIMIT 1
      `
    )
    .get() as
    | {
        snapshot_id: string;
        snapshot_date: string;
        category_name: string;
        subject_name: string;
        wb_subject_id: number | null;
        period_type: string;
        period_start: string;
        period_end: string;
      }
    | undefined;

  return row ? mapSnapshot(row) : null;
}

function loadRuns(db: Database.Database): SqliteReportRun[] {
  const rows = db
    .prepare(
      `
        SELECT
          scenario_name,
          status,
          duration_ms,
          created_at
        FROM automation_runs
        ORDER BY created_at DESC
        LIMIT 5
      `
    )
    .all() as Array<{
    scenario_name: string;
    status: string;
    duration_ms: number | null;
    created_at: string;
  }>;

  return rows.map(mapRun);
}

function loadMetrics(
  db: Database.Database,
  snapshotId: string
): SqliteReportMetric[] {
  return db
    .prepare(
      `
        SELECT
          metric_code AS metricCode,
          metric_name AS metricName,
          value_numeric AS valueNumeric,
          value_text AS valueText,
          unit,
          delta_value AS deltaValue,
          delta_unit AS deltaUnit,
          delta_direction AS deltaDirection
        FROM wb_niche_metrics
        WHERE snapshot_id = ?
        ORDER BY
          CASE metric_code
            ${IMPORTANT_METRIC_CODES.map(
              (code, index) => `WHEN '${code}' THEN ${index}`
            ).join("\n            ")}
            ELSE 999
          END,
          metric_name
        LIMIT 10
      `
    )
    .all(snapshotId) as SqliteReportMetric[];
}

function loadSearchQueries(
  db: Database.Database,
  snapshotId: string
): SqliteReportSearchQuery[] {
  return db
    .prepare(
      `
        SELECT
          rank_position AS rankPosition,
          query_text AS queryText,
          query_count AS queryCount,
          cart_conversion_pct AS cartConversionPct,
          order_conversion_pct AS orderConversionPct
        FROM wb_niche_search_queries
        WHERE snapshot_id = ?
        ORDER BY rank_position
        LIMIT 10
      `
    )
    .all(snapshotId) as SqliteReportSearchQuery[];
}

function loadCompareCards(db: Database.Database): SqliteReportCompareCard[] {
  const latestRun = db
    .prepare(
      `
        SELECT run_id
        FROM automation_runs
        WHERE scenario_name = 'compare_cards'
        ORDER BY created_at DESC
        LIMIT 1
      `
    )
    .get() as { run_id: string } | undefined;

  if (!latestRun) {
    return [];
  }

  return db
    .prepare(
      `
        SELECT
          rank_position AS rankPosition,
          nm_id AS nmId
        FROM wb_compare_card_recommendations
        WHERE run_id = ?
        ORDER BY rank_position
        LIMIT 10
      `
    )
    .all(latestRun.run_id) as SqliteReportCompareCard[];
}

export function loadSqliteReport(databasePath: string): SqliteReport {
  const db = openSqliteDatabase();

  try {
    assertSqliteSchemaReady(db);

    const latestSnapshot = loadLatestSnapshot(db);

    return {
      databasePath,
      runs: loadRuns(db),
      latestSnapshot,
      metrics: latestSnapshot ? loadMetrics(db, latestSnapshot.snapshotId) : [],
      searchQueries: latestSnapshot
        ? loadSearchQueries(db, latestSnapshot.snapshotId)
        : [],
      compareCards: loadCompareCards(db)
    };
  } finally {
    db.close();
  }
}
