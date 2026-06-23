import { readFileSync } from "node:fs";
import {
  SQLITE_DATABASE_PATH,
  SQLITE_SCHEMA_PATH,
  ensureSqliteDataDir,
  openSqliteDatabase
} from "../src/connection.js";

ensureSqliteDataDir();

const db = openSqliteDatabase();

try {
  const schemaSql = readFileSync(SQLITE_SCHEMA_PATH, "utf-8");
  db.exec(schemaSql);
  console.log(`[sqlite:init] initialized ${SQLITE_DATABASE_PATH}`);
} finally {
  db.close();
}
