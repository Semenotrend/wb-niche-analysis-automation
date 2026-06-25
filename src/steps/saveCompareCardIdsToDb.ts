import {
  getAutomationStorage,
  type MarkCompareCardsUsedForComparisonOptions,
  type MarkCompareCardsUsedForComparisonResult,
  type SaveCompareCardIdsOptions,
  type SaveCompareCardIdsResult,
  type SaveStepLogsOptions
} from "../core/storage.js";

export type {
  MarkCompareCardsUsedForComparisonOptions,
  MarkCompareCardsUsedForComparisonResult,
  SaveCompareCardIdsOptions,
  SaveCompareCardIdsResult
};

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

export async function markCompareCardsUsedForComparison(
  options: MarkCompareCardsUsedForComparisonOptions
): Promise<MarkCompareCardsUsedForComparisonResult> {
  return getAutomationStorage().markCompareCardsUsedForComparison(options);
}
