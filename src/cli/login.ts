import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { AUTH_STATE_PATH, ensureAuthDir, openBrowserSession, SELLER_URL } from "../core/browser.js";

async function main(): Promise<void> {
  await ensureAuthDir();

  const { browser, context, page } = await openBrowserSession({ headless: false });

  try {
    console.log(`[login] Opening ${SELLER_URL}`);
    await page.goto(SELLER_URL, { waitUntil: "domcontentloaded" });

    console.log("[login] Complete WB Partners login in the opened browser window.");
    console.log("[login] When the seller cabinet is loaded, return here and press Enter.");

    const rl = createInterface({ input, output });
    await rl.question("[login] Press Enter to save session...");
    rl.close();

    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await context.storageState({ path: AUTH_STATE_PATH });

    console.log(`[login] Session saved: ${AUTH_STATE_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error("[login] Failed to save WB session.");
  console.error(error);
  process.exitCode = 1;
});
