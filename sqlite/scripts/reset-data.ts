import { SQLITE_DATABASE_PATH, openSqliteDatabase } from "../src/connection.js";

const db = openSqliteDatabase();

try {
  db.transaction(() => {
    db.prepare("DELETE FROM automation_step_logs").run();
    db.prepare("DELETE FROM wb_compare_card_recommendations").run();
    db.prepare("DELETE FROM wb_niche_dynamics_daily").run();
    db.prepare("DELETE FROM wb_niche_search_queries").run();
    db.prepare("DELETE FROM wb_niche_metrics").run();
    db.prepare("DELETE FROM wb_niche_snapshots").run();
    db.prepare("DELETE FROM automation_runs").run();
  })();

  console.log(`[sqlite:reset] cleared data in ${SQLITE_DATABASE_PATH}`);
} finally {
  db.close();
}
