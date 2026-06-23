import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = resolve(currentDir, "../..");
export const SQLITE_DATABASE_PATH = process.env.SQLITE_DATABASE_PATH
  ? resolve(process.env.SQLITE_DATABASE_PATH)
  : join(PROJECT_ROOT, "sqlite", "data", "wb_niche_analysis.sqlite");
export const SQLITE_SCHEMA_PATH = join(PROJECT_ROOT, "sqlite", "schema", "init.sql");

export function ensureSqliteDataDir(): void {
  mkdirSync(dirname(SQLITE_DATABASE_PATH), { recursive: true });
}

export function openSqliteDatabase(): Database.Database {
  ensureSqliteDataDir();

  const db = new Database(SQLITE_DATABASE_PATH);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  return db;
}

export function assertSqliteSchemaReady(db: Database.Database): void {
  const row = db
    .prepare("SELECT value FROM app_metadata WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;

  if (row?.value !== "1") {
    throw new Error(
      `sqlite: schema is not initialized at ${SQLITE_DATABASE_PATH}. Run \`pnpm run sqlite:init\`.`
    );
  }
}
