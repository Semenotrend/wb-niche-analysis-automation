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

export async function loadScenarioConfig(): Promise<ScenarioConfig> {
  return readJson<ScenarioConfig>(join(PROJECT_ROOT, "config", "scenario.json"));
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  return readJson<RuntimeConfig>(join(PROJECT_ROOT, "config", "runtime.json"));
}
