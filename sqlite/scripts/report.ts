import { SQLITE_DATABASE_PATH } from "../src/connection.js";
import { formatSqliteReport } from "../src/formatReport.js";
import { loadSqliteReport } from "../src/report.js";

try {
  const report = loadSqliteReport(SQLITE_DATABASE_PATH);
  console.log(formatSqliteReport(report));
} catch (error) {
  console.error("[sqlite:report] Failed to read SQLite report.");
  console.error(error);
  process.exitCode = 1;
}
