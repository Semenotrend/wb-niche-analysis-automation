import {
  getAutomationStorage,
  type SaveCompareCardIdsOptions,
  type SaveCompareCardIdsResult,
  type SaveStepLogsOptions
} from "../core/storage.js";

export type { SaveCompareCardIdsOptions, SaveCompareCardIdsResult };

export async function saveCompareCardIdsToDb(
  options: SaveCompareCardIdsOptions
): Promise<SaveCompareCardIdsResult> {
  return getAutomationStorage().saveCompareCardIds(options);
}

export async function saveCompareCardStepLogs(
  options: SaveStepLogsOptions
): Promise<void> {
  return getAutomationStorage().saveCompareCardStepLogs(options);
}
