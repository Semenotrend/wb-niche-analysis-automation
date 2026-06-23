import {
  getAutomationStorage,
  type SaveNicheReportOptions,
  type SaveNicheReportResult,
  type SaveStepLogsOptions
} from "../core/storage.js";

export type { SaveNicheReportOptions, SaveNicheReportResult };

export async function saveNicheReportToDb(
  options: SaveNicheReportOptions
): Promise<SaveNicheReportResult> {
  return getAutomationStorage().saveNicheReport(options);
}

export async function saveNicheReportStepLogs(
  options: SaveStepLogsOptions
): Promise<void> {
  return getAutomationStorage().saveNicheReportStepLogs(options);
}
