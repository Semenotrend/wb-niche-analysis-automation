import { SQLITE_DATABASE_PATH, openSqliteDatabase } from "../src/connection.js";

const TABLES = [
  "automation_runs",
  "automation_step_logs",
  "wb_niche_snapshots",
  "wb_niche_metrics",
  "wb_niche_search_queries",
  "wb_niche_dynamics_daily",
  "wb_compare_card_recommendations"
] as const;

const db = openSqliteDatabase();

try {
  console.log(`[sqlite:inspect] database=${SQLITE_DATABASE_PATH}`);

  for (const tableName of TABLES) {
    const row = db
      .prepare(`SELECT COUNT(*) AS row_count FROM ${tableName}`)
      .get() as { row_count: number };

    console.log(`${tableName}: ${row.row_count}`);
  }
} finally {
  db.close();
}
