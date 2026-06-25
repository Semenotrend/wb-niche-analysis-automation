import type { RuntimeConfig, ScenarioConfig } from "./config.js";
import type { StepExecutionLog } from "./stepRunner.js";
import type { ParsedCompareCardId } from "../steps/parseCompareCardIds.js";
import type { ParsedNicheQueryStats } from "../steps/parseNicheQueryStats.js";
import type { ParsedNicheReport } from "../steps/parseNicheReport.js";
import { createPostgresStorage } from "./postgresStorage.js";

export type SaveNicheReportOptions = {
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  report: ParsedNicheReport;
  fallbackUsed: boolean;
};

export type SaveNicheReportResult = {
  runId: string;
  snapshotId: string;
};

export type SaveNicheQueryStatsOptions = {
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  report: ParsedNicheQueryStats;
  fallbackUsed: boolean;
};

export type SaveNicheQueryStatsResult = {
  runId: string;
  snapshotId: string;
  savedCount: number;
};

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

export type MarkCompareCardsUsedForComparisonOptions = {
  runId: string;
  nmIds: string[];
  sourceUrl: string;
};

export type MarkCompareCardsUsedForComparisonResult = {
  comparisonRequestId: string;
  markedCount: number;
};

export type SaveStepLogsOptions = {
  runId: string;
  stepLogs: StepExecutionLog[];
};

export type AutomationStorage = {
  saveNicheReport(options: SaveNicheReportOptions): Promise<SaveNicheReportResult>;
  saveNicheReportStepLogs(options: SaveStepLogsOptions): Promise<void>;
  saveNicheQueryStats(
    options: SaveNicheQueryStatsOptions
  ): Promise<SaveNicheQueryStatsResult>;
  saveNicheQueryStatsStepLogs(options: SaveStepLogsOptions): Promise<void>;
  saveCompareCardIds(
    options: SaveCompareCardIdsOptions
  ): Promise<SaveCompareCardIdsResult>;
  saveCompareCardStepLogs(options: SaveStepLogsOptions): Promise<void>;
  loadManualCompareCardIds(runId: string, limit: number): Promise<string[]>;
  markCompareCardsUsedForComparison(
    options: MarkCompareCardsUsedForComparisonOptions
  ): Promise<MarkCompareCardsUsedForComparisonResult>;
};

export function getAutomationStorage(): AutomationStorage {
  return createPostgresStorage();
}
