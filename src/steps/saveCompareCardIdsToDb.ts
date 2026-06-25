import {
  getAutomationStorage,
  type CreateCompareCardsNextRunOptions,
  type CreateCompareCardsNextRunResult,
  type MarkRunFailedOptions,
  type MarkCompareCardsComparisonSubmittedOptions,
  type ReserveCompareCardsForComparisonOptions,
  type ReserveCompareCardsForComparisonResult,
  type SaveCompareCardIdsOptions,
  type SaveCompareCardIdsResult,
  type SaveStepLogsOptions
} from "../core/storage.js";

export type {
  CreateCompareCardsNextRunOptions,
  CreateCompareCardsNextRunResult,
  MarkRunFailedOptions,
  MarkCompareCardsComparisonSubmittedOptions,
  ReserveCompareCardsForComparisonOptions,
  ReserveCompareCardsForComparisonResult,
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

export async function saveCompareCardsNextStepLogs(
  options: SaveStepLogsOptions
): Promise<void> {
  return getAutomationStorage().saveCompareCardsNextStepLogs(options);
}

export async function markCompareCardsNextRunFailed(
  options: MarkRunFailedOptions
): Promise<void> {
  return getAutomationStorage().markCompareCardsNextRunFailed(options);
}

export async function createCompareCardsNextRun(
  options: CreateCompareCardsNextRunOptions
): Promise<CreateCompareCardsNextRunResult> {
  return getAutomationStorage().createCompareCardsNextRun(options);
}

export async function reserveCompareCardsForComparison(
  options: ReserveCompareCardsForComparisonOptions
): Promise<ReserveCompareCardsForComparisonResult> {
  return getAutomationStorage().reserveCompareCardsForComparison(options);
}

export async function markCompareCardsComparisonSubmitted(
  options: MarkCompareCardsComparisonSubmittedOptions
): Promise<void> {
  return getAutomationStorage().markCompareCardsComparisonSubmitted(options);
}
