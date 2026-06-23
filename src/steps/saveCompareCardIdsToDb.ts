import type { RuntimeConfig, ScenarioConfig } from "../core/config.js";
import { withDbClient, type DbClient } from "../core/db.js";
import type { StepExecutionLog } from "../core/stepRunner.js";
import type { ParsedCompareCardId } from "./parseCompareCardIds.js";

export type SaveCompareCardIdsOptions = {
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  items: ParsedCompareCardId[];
  sourceUrl: string;
};

export type SaveCompareCardIdsResult = {
  runId: string;
  savedCount: number;
};

function getRunDurationMs(stepLogs: StepExecutionLog[]): number {
  return stepLogs.reduce((sum, stepLog) => sum + stepLog.durationMs, 0);
}

async function insertRun(
  client: DbClient,
  options: SaveCompareCardIdsOptions
): Promise<string> {
  const result = await client.query<{ run_id: string }>(
    `
      INSERT INTO automation.runs (
        scenario_name,
        scenario_config,
        runtime_config,
        status,
        started_at,
        finished_at
      )
      VALUES ('compare_cards', $1::jsonb, $2::jsonb, 'success', now(), now())
      RETURNING run_id
    `,
    [
      JSON.stringify({
        ...options.scenario,
        sourceUrl: options.sourceUrl,
        parsedCardIds: options.items.length
      }),
      JSON.stringify(options.runtime)
    ]
  );

  return result.rows[0].run_id;
}

async function insertStepLogs(
  client: DbClient,
  runId: string,
  stepLogs: StepExecutionLog[]
): Promise<void> {
  for (const stepLog of stepLogs) {
    await client.query(
      `
        INSERT INTO automation.step_logs (
          run_id,
          step_index,
          step_total,
          step_name,
          status,
          started_at,
          finished_at,
          duration_ms,
          incident_type,
          error_message,
          meta
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        runId,
        stepLog.index,
        stepLog.total,
        stepLog.name,
        stepLog.status,
        stepLog.startedAt,
        stepLog.finishedAt,
        stepLog.durationMs,
        stepLog.incidentType ?? null,
        stepLog.errorMessage ?? null,
        JSON.stringify({ source: "compareCardsFlow" })
      ]
    );
  }
}

export async function saveCompareCardIdsToDb(
  options: SaveCompareCardIdsOptions
): Promise<SaveCompareCardIdsResult> {
  const uniqueNmIds = new Set(options.items.map((item) => item.nmId));

  if (uniqueNmIds.size !== options.items.length) {
    throw new Error("schema_changed: parsed compare card IDs contain duplicates");
  }

  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const runId = await insertRun(client, options);

      for (const item of options.items) {
        await client.query(
          `
            INSERT INTO wb_analytics.compare_card_recommendations (
              run_id,
              rank_position,
              nm_id,
              subject_name,
              top_by,
              source_url
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            runId,
            item.rankPosition,
            item.nmId,
            options.scenario.subject,
            options.scenario.topBy,
            item.productUrl
          ]
        );
      }

      await client.query("COMMIT");

      return {
        runId,
        savedCount: options.items.length
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveCompareCardStepLogs(options: {
  runId: string;
  stepLogs: StepExecutionLog[];
}): Promise<void> {
  await withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `
          UPDATE automation.runs
          SET duration_ms = $2
          WHERE run_id = $1
        `,
        [options.runId, getRunDurationMs(options.stepLogs)]
      );
      await insertStepLogs(client, options.runId, options.stepLogs);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
