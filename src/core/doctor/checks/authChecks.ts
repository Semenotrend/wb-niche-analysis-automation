import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DoctorCheckResult, DoctorContext } from "../types.js";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  );
}

export async function runAuthChecks(
  context: DoctorContext
): Promise<DoctorCheckResult[]> {
  const authPath = join(context.projectRoot, ".auth", "wb.json");

  if (!await exists(authPath)) {
    return [
      {
        id: "auth.storage_state",
        label: "Auth state .auth/wb.json",
        status: "fail",
        details: "WB Partners session file is missing.",
        fixCommand: "pnpm run login"
      }
    ];
  }

  try {
    JSON.parse(await readFile(authPath, "utf-8")) as unknown;
  } catch (error) {
    return [
      {
        id: "auth.storage_state",
        label: "Auth state .auth/wb.json",
        status: "fail",
        details: `Session file is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
        fixCommand: "pnpm run login"
      }
    ];
  }

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    try {
      const browserContext = await browser.newContext({
        storageState: authPath
      });
      await browserContext.close();
    } finally {
      await browser.close();
    }

    return [
      {
        id: "auth.storage_state",
        label: "Auth state .auth/wb.json",
        status: "ok"
      }
    ];
  } catch (error) {
    return [
      {
        id: "auth.storage_state",
        label: "Auth state .auth/wb.json",
        status: "fail",
        details: error instanceof Error ? error.message : String(error),
        fixCommand: "pnpm run login"
      }
    ];
  }
}
