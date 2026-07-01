import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DoctorCheckResult, DoctorContext } from "../types.js";

type RawScenarioNicheConfig = {
  category?: unknown;
  subject?: unknown;
  period?: unknown;
  periods?: unknown;
  topBy?: unknown;
  nicheReportUrl?: unknown;
  fallbackEnabled?: unknown;
};

type RawScenarioConfig = RawScenarioNicheConfig & {
  niches?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, fieldName: string, allowEmpty = false): void {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  if (!allowEmpty && value.trim() === "") {
    throw new Error(`${fieldName} must not be empty`);
  }
}

function assertBoolean(value: unknown, fieldName: string): void {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }
}

function assertStringList(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (value.length === 0) {
    throw new Error(`${fieldName} must contain at least one item`);
  }

  for (const [index, item] of value.entries()) {
    assertString(item, `${fieldName}[${index}]`);
  }

  return value as string[];
}

function readPeriods(
  rawNiche: RawScenarioNicheConfig,
  defaults: RawScenarioNicheConfig,
  fieldPrefix: string
): string[] {
  const rawPeriods = rawNiche.periods ?? defaults.periods;

  if (rawPeriods !== undefined) {
    return assertStringList(rawPeriods, `${fieldPrefix}periods`);
  }

  const period = rawNiche.period ?? defaults.period;
  assertString(period, `${fieldPrefix}period`);
  return [period as string];
}

function normalizeScenario(
  rawNiche: RawScenarioNicheConfig,
  defaults: RawScenarioNicheConfig,
  fieldPrefix: string
): { nicheReportUrl: string; fallbackEnabled: boolean } {
  const category = rawNiche.category ?? defaults.category;
  const subject = rawNiche.subject ?? defaults.subject;
  const periods = readPeriods(rawNiche, defaults, fieldPrefix);
  const period =
    rawNiche.period ?? (rawNiche.periods === undefined ? defaults.period : undefined);
  const topBy = rawNiche.topBy ?? defaults.topBy;
  const nicheReportUrl = rawNiche.nicheReportUrl ?? defaults.nicheReportUrl ?? "";
  const fallbackEnabled = rawNiche.fallbackEnabled ?? defaults.fallbackEnabled;

  assertString(category, `${fieldPrefix}category`);
  assertString(subject, `${fieldPrefix}subject`);
  if (period !== undefined) {
    assertString(period, `${fieldPrefix}period`);

    if (!periods.includes(period as string)) {
      throw new Error(`${fieldPrefix}period must be included in ${fieldPrefix}periods`);
    }
  }
  assertString(topBy, `${fieldPrefix}topBy`);
  assertString(nicheReportUrl, `${fieldPrefix}nicheReportUrl`, true);
  assertBoolean(fallbackEnabled, `${fieldPrefix}fallbackEnabled`);

  return {
    nicheReportUrl: nicheReportUrl as string,
    fallbackEnabled: fallbackEnabled as boolean
  };
}

function validateScenarioConfig(raw: RawScenarioConfig): DoctorCheckResult[] {
  if (Array.isArray(raw.niches)) {
    if (raw.niches.length === 0) {
      throw new Error("scenario.niches must contain at least one item");
    }

    return raw.niches.flatMap((niche, index) => {
      if (!isRecord(niche)) {
        throw new Error(`scenario.niches[${index}] must be an object`);
      }

      const scenario = normalizeScenario(niche, raw, `niches[${index}].`);

      if (scenario.nicheReportUrl.trim() === "" && !scenario.fallbackEnabled) {
        return [
          {
            id: `config.scenario.niches.${index}.fallback`,
            label: `scenario.niches[${index}] fallback`,
            status: "warn",
            details:
              "nicheReportUrl is empty and fallbackEnabled is false; direct niche report flow may fail."
          } satisfies DoctorCheckResult
        ];
      }

      return [];
    });
  }

  const scenario = normalizeScenario(raw, raw, "scenario.");

  if (scenario.nicheReportUrl.trim() === "" && !scenario.fallbackEnabled) {
    return [
      {
        id: "config.scenario.fallback",
        label: "scenario fallback",
        status: "warn",
        details:
          "nicheReportUrl is empty and fallbackEnabled is false; direct niche report flow may fail."
      }
    ];
  }

  return [];
}

function validateRuntimeConfig(raw: unknown): void {
  if (!isRecord(raw)) {
    throw new Error("runtime config must be an object");
  }

  for (const fieldName of ["delays", "timeouts", "viewport"]) {
    if (!isRecord(raw[fieldName])) {
      throw new Error(`runtime.${fieldName} must be an object`);
    }
  }
}

export async function runConfigChecks(
  context: DoctorContext
): Promise<DoctorCheckResult[]> {
  const results: DoctorCheckResult[] = [];

  try {
    const rawScenario = JSON.parse(
      await readFile(join(context.projectRoot, "config", "scenario.json"), "utf-8")
    ) as RawScenarioConfig;
    const warnings = validateScenarioConfig(rawScenario);

    results.push({
      id: "config.scenario",
      label: "config/scenario.json",
      status: "ok"
    });
    results.push(...warnings);
  } catch (error) {
    results.push({
      id: "config.scenario",
      label: "config/scenario.json",
      status: "fail",
      details: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const rawRuntime = JSON.parse(
      await readFile(join(context.projectRoot, "config", "runtime.json"), "utf-8")
    ) as unknown;
    validateRuntimeConfig(rawRuntime);

    results.push({
      id: "config.runtime",
      label: "config/runtime.json",
      status: "ok"
    });
  } catch (error) {
    results.push({
      id: "config.runtime",
      label: "config/runtime.json",
      status: "fail",
      details: error instanceof Error ? error.message : String(error)
    });
  }

  return results;
}
