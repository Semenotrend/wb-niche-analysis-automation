import type { DoctorCheckResult } from "../types.js";

export async function runBrowserChecks(): Promise<DoctorCheckResult[]> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: "ru-RU",
        timezoneId: "Europe/Moscow"
      });
      await context.close();
    } finally {
      await browser.close();
    }

    return [
      {
        id: "browser.chromium",
        label: "Playwright Chromium",
        status: "ok"
      }
    ];
  } catch (error) {
    return [
      {
        id: "browser.chromium",
        label: "Playwright Chromium",
        status: "fail",
        details: error instanceof Error ? error.message : String(error),
        fixCommand: "pnpm run playwright:install"
      }
    ];
  }
}
