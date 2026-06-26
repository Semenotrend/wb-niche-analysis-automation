import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PROJECT_ROOT } from "./browser.js";

export type DelayRange = [number, number];

export type ScenarioConfig = {
  category: string;
  subject: string;
  period: string;
  topBy: string;
  nicheReportUrl: string;
  fallbackEnabled: boolean;
};

type RawScenarioNicheConfig = {
  category?: unknown;
  subject?: unknown;
  period?: unknown;
  topBy?: unknown;
  nicheReportUrl?: unknown;
  fallbackEnabled?: unknown;
};

type RawScenarioConfig = RawScenarioNicheConfig & {
  niches?: unknown;
};

export type RuntimeConfig = {
  delays: {
    beforeActionMs: DelayRange;
    betweenStepsMs: DelayRange;
    afterNavigationMs: DelayRange;
    typingDelayMs: DelayRange;
  };
  timeouts: {
    defaultMs: number;
    navigationMs: number;
    resultMs: number;
  };
  viewport: {
    width: number;
    height: number;
  };
};

async function readJson<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  value: unknown,
  fieldName: string,
  options: { allowEmpty?: boolean } = {}
): string {
  if (typeof value !== "string") {
    throw new Error(`config: scenario.${fieldName} must be a string`);
  }

  if (!options.allowEmpty && value.trim() === "") {
    throw new Error(`config: scenario.${fieldName} must not be empty`);
  }

  return value;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`config: scenario.${fieldName} must be a boolean`);
  }

  return value;
}

function normalizeScenario(
  rawNiche: RawScenarioNicheConfig,
  defaults: RawScenarioNicheConfig,
  fieldPrefix: string
): ScenarioConfig {
  return {
    category: readString(
      rawNiche.category ?? defaults.category,
      `${fieldPrefix}category`
    ),
    subject: readString(rawNiche.subject ?? defaults.subject, `${fieldPrefix}subject`),
    period: readString(rawNiche.period ?? defaults.period, `${fieldPrefix}period`),
    topBy: readString(rawNiche.topBy ?? defaults.topBy, `${fieldPrefix}topBy`),
    nicheReportUrl: readString(
      rawNiche.nicheReportUrl ?? defaults.nicheReportUrl ?? "",
      `${fieldPrefix}nicheReportUrl`,
      { allowEmpty: true }
    ),
    fallbackEnabled: readBoolean(
      rawNiche.fallbackEnabled ?? defaults.fallbackEnabled,
      `${fieldPrefix}fallbackEnabled`
    )
  };
}

function normalizeScenarioConfigs(raw: RawScenarioConfig): ScenarioConfig[] {
  if (Array.isArray(raw.niches)) {
    if (raw.niches.length === 0) {
      throw new Error("config: scenario.niches must contain at least one item");
    }

    return raw.niches.map((niche, index) => {
      if (!isRecord(niche)) {
        throw new Error(`config: scenario.niches[${index}] must be an object`);
      }

      return normalizeScenario(niche, raw, `niches[${index}].`);
    });
  }

  return [normalizeScenario(raw, raw, "")];
}

function selectScenarioByEnv(scenarios: ScenarioConfig[]): ScenarioConfig[] {
  const rawIndex = process.env.SCENARIO_INDEX?.trim();

  if (rawIndex === undefined || rawIndex === "") {
    return scenarios;
  }

  if (!/^\d+$/.test(rawIndex)) {
    throw new Error("config: SCENARIO_INDEX must be a zero-based integer");
  }

  const index = Number(rawIndex);

  if (index < 0 || index >= scenarios.length) {
    throw new Error(
      `config: SCENARIO_INDEX ${index} is out of range for ${scenarios.length} scenarios`
    );
  }

  return [scenarios[index]];
}

export async function loadScenarioConfig(): Promise<ScenarioConfig> {
  const scenarios = await loadScenarioConfigs();
  return scenarios[0];
}

export async function loadScenarioConfigs(): Promise<ScenarioConfig[]> {
  const rawScenario = await readJson<RawScenarioConfig>(
    join(PROJECT_ROOT, "config", "scenario.json")
  );

  return selectScenarioByEnv(normalizeScenarioConfigs(rawScenario));
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  return readJson<RuntimeConfig>(join(PROJECT_ROOT, "config", "runtime.json"));
}
