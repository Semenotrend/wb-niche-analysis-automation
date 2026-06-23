import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DoctorCheckResult, DoctorContext } from "../types.js";

const SQLITE_TABLES = [
  "automation_runs",
  "automation_step_logs",
  "wb_niche_snapshots",
  "wb_niche_metrics",
  "wb_niche_search_queries",
  "wb_niche_dynamics_daily",
  "wb_compare_card_recommendations"
];

const POSTGRES_TABLES = [
  ["automation", "runs"],
  ["automation", "step_logs"],
  ["wb_analytics", "niche_snapshots"],
  ["wb_analytics", "niche_metrics"],
  ["wb_analytics", "niche_search_queries"],
  ["wb_analytics", "niche_dynamics_daily"],
  ["wb_analytics", "compare_card_recommendations"]
] as const;

const DEFAULT_DATABASE_URL =
  "postgresql://wb_niche:wb_niche_local@127.0.0.1:7777/wb_niche_analysis";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  );
}

async function runSqliteStorageChecks(
  context: DoctorContext
): Promise<DoctorCheckResult[]> {
  const databasePath = process.env.SQLITE_DATABASE_PATH
    ? resolve(process.env.SQLITE_DATABASE_PATH)
    : join(context.projectRoot, "sqlite", "data", "wb_niche_analysis.sqlite");
  const results: DoctorCheckResult[] = [];

  if (!await exists(databasePath)) {
    return [
      {
        id: "storage.sqlite.file",
        label: "SQLite database file",
        status: "fail",
        details: `${databasePath} does not exist.`,
        fixCommand: "pnpm run sqlite:init"
      }
    ];
  }

  results.push({
    id: "storage.sqlite.file",
    label: "SQLite database file",
    status: "ok",
    details: databasePath
  });

  try {
    const sqliteModule = await import("better-sqlite3");
    const Database = sqliteModule.default;
    const db = new Database(databasePath, {
      readonly: true,
      fileMustExist: true
    });

    try {
      const meta = db
        .prepare("SELECT value FROM app_metadata WHERE key = 'schema_version'")
        .get() as { value: string } | undefined;

      if (meta?.value === "1") {
        results.push({
          id: "storage.sqlite.schema",
          label: "SQLite schema version 1",
          status: "ok"
        });
      } else {
        results.push({
          id: "storage.sqlite.schema",
          label: "SQLite schema version 1",
          status: "fail",
          details: `Expected schema_version=1, got ${meta?.value ?? "missing"}.`,
          fixCommand: "pnpm run sqlite:init"
        });
      }

      const existingTables = new Set(
        (
          db
            .prepare(
              `
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
              `
            )
            .all() as Array<{ name: string }>
        ).map((row) => row.name)
      );
      const missingTables = SQLITE_TABLES.filter(
        (tableName) => !existingTables.has(tableName)
      );

      results.push({
        id: "storage.sqlite.tables",
        label: "SQLite tables",
        status: missingTables.length === 0 ? "ok" : "fail",
        details:
          missingTables.length === 0
            ? `${SQLITE_TABLES.length} required tables found.`
            : `Missing tables: ${missingTables.join(", ")}.`,
        fixCommand: missingTables.length === 0 ? undefined : "pnpm run sqlite:init"
      });
    } finally {
      db.close();
    }
  } catch (error) {
    results.push({
      id: "storage.sqlite.open",
      label: "SQLite open/read",
      status: "fail",
      details: error instanceof Error ? error.message : String(error),
      fixCommand: "pnpm run sqlite:init"
    });
  }

  return results;
}

async function runPostgresStorageChecks(): Promise<DoctorCheckResult[]> {
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const results: DoctorCheckResult[] = [];

  if (!process.env.DATABASE_URL) {
    results.push({
      id: "storage.postgres.url",
      label: "Postgres DATABASE_URL",
      status: "warn",
      details: "DATABASE_URL is not set; using default local Postgres URL."
    });
  } else {
    results.push({
      id: "storage.postgres.url",
      label: "Postgres DATABASE_URL",
      status: "ok",
      details: "DATABASE_URL is set."
    });
  }

  try {
    const pgModule = await import("pg");
    const { Client } = pgModule.default;
    const client = new Client({
      connectionString: databaseUrl
    });

    await client.connect();

    try {
      const result = await client.query<{
        table_schema: string;
        table_name: string;
      }>(
        `
          SELECT table_schema, table_name
          FROM information_schema.tables
          WHERE table_schema IN ('automation', 'wb_analytics')
        `
      );
      const existingTables = new Set(
        result.rows.map((row) => `${row.table_schema}.${row.table_name}`)
      );
      const missingTables = POSTGRES_TABLES.filter(
        ([schemaName, tableName]) => !existingTables.has(`${schemaName}.${tableName}`)
      ).map(([schemaName, tableName]) => `${schemaName}.${tableName}`);

      results.push({
        id: "storage.postgres.connect",
        label: "Postgres connection",
        status: "ok"
      });
      results.push({
        id: "storage.postgres.tables",
        label: "Postgres tables",
        status: missingTables.length === 0 ? "ok" : "fail",
        details:
          missingTables.length === 0
            ? `${POSTGRES_TABLES.length} required tables found.`
            : `Missing tables: ${missingTables.join(", ")}.`,
        fixCommand:
          missingTables.length === 0
            ? undefined
            : "bash database/scripts/apply-migrations.sh"
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    results.push({
      id: "storage.postgres.connect",
      label: "Postgres connection",
      status: "fail",
      details: error instanceof Error ? error.message : String(error),
      fixCommand: "docker compose -f database/docker-compose.yml up -d"
    });
  }

  return results;
}

export async function runStorageChecks(
  context: DoctorContext
): Promise<DoctorCheckResult[]> {
  if (context.storageDriver === "sqlite") {
    return runSqliteStorageChecks(context);
  }

  return runPostgresStorageChecks();
}
