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

export type ReserveCompareCardsForComparisonOptions = {
  runId: string;
  recommendationsRunId?: string;
  nmIds: string[];
  sourceUrl: string;
};

export type ReserveCompareCardsForComparisonResult = {
  comparisonRequestId: string;
  markedCount: number;
};

export type MarkCompareCardsComparisonSubmittedOptions = {
  comparisonRequestId: string;
  sourceUrl: string;
};

export type CreateCompareCardsNextRunOptions = {
  scenario: ScenarioConfig;
  runtime: RuntimeConfig;
  sourceRunId?: string | null;
  sourceUrl: string;
  limit: number;
};

export type CreateCompareCardsNextRunResult = {
  runId: string;
  sourceRunId: string;
  availableCount: number;
};

export type SaveStepLogsOptions = {
  runId: string;
  stepLogs: StepExecutionLog[];
};

export type MarkRunFailedOptions = SaveStepLogsOptions & {
  error: unknown;
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
  saveCompareCardsNextStepLogs(options: SaveStepLogsOptions): Promise<void>;
  markCompareCardsNextRunFailed(options: MarkRunFailedOptions): Promise<void>;
  loadManualCompareCardIds(runId: string, limit: number): Promise<string[]>;
  createCompareCardsNextRun(
    options: CreateCompareCardsNextRunOptions
  ): Promise<CreateCompareCardsNextRunResult>;
  reserveCompareCardsForComparison(
    options: ReserveCompareCardsForComparisonOptions
  ): Promise<ReserveCompareCardsForComparisonResult>;
  markCompareCardsComparisonSubmitted(
    options: MarkCompareCardsComparisonSubmittedOptions
  ): Promise<void>;
};

export function getAutomationStorage(): AutomationStorage {
  return createPostgresStorage();
}
