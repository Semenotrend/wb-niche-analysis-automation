import pg from "pg";

const { Client } = pg;

export const DEFAULT_DATABASE_URL =
  "postgresql://wb_niche:wb_niche_local@127.0.0.1:7777/wb_niche_analysis";

export type DbClient = pg.Client;

export async function withDbClient<T>(
  callback: (client: DbClient) => Promise<T>
): Promise<T> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
  });

  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
