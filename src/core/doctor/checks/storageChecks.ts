import type { DoctorCheckResult } from "../types.js";

const POSTGRES_TABLES = [
  ["automation", "runs"],
  ["automation", "step_logs"],
  ["wb_analytics", "niche_snapshots"],
  ["wb_analytics", "niche_metrics"],
  ["wb_analytics", "niche_search_queries"],
  ["wb_analytics", "niche_dynamics_daily"],
  ["wb_analytics", "compare_card_comparison_requests"],
  ["wb_analytics", "compare_card_recommendations"]
] as const;

const DEFAULT_DATABASE_URL =
  "postgresql://wb_niche:wb_niche_local@127.0.0.1:7777/wb_niche_analysis";

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

export async function runStorageChecks(): Promise<DoctorCheckResult[]> {
  return runPostgresStorageChecks();
}
