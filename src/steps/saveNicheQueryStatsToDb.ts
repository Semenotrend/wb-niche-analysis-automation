import {
  getAutomationStorage,
  type SaveNicheQueryStatsOptions,
  type SaveNicheQueryStatsResult,
  type SaveStepLogsOptions
} from "../core/storage.js";

export type { SaveNicheQueryStatsOptions, SaveNicheQueryStatsResult };

export async function saveNicheQueryStatsToDb(
  options: SaveNicheQueryStatsOptions
): Promise<SaveNicheQueryStatsResult> {
  return getAutomationStorage().saveNicheQueryStats(options);
}

export async function saveNicheQueryStatsStepLogs(
  options: SaveStepLogsOptions
): Promise<void> {
  return getAutomationStorage().saveNicheQueryStatsStepLogs(options);
}
