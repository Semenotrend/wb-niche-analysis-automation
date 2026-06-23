import { access, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = resolve(currentDir, "../..");
export const SELLER_URL = "https://seller.wildberries.ru/about-portal/ru/ru";
export const AUTH_STATE_PATH = join(PROJECT_ROOT, ".auth", "wb.json");

export type BrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export async function ensureAuthDir(): Promise<void> {
  await mkdir(dirname(AUTH_STATE_PATH), { recursive: true });
}

export async function openBrowserSession(options: {
  headless?: boolean;
  storageStatePath?: string;
  viewport?: {
    width: number;
    height: number;
  };
} = {}): Promise<BrowserSession> {
  if (options.storageStatePath !== undefined) {
    await access(options.storageStatePath).catch(() => {
      throw new Error(
        `auth_expired: storage state file is missing at ${options.storageStatePath}. Run \`pnpm run login\`.`
      );
    });
  }

  const browser = await chromium.launch({
    headless: options.headless ?? process.env.HEADLESS === "true"
  });

  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1440, height: 900 },
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    extraHTTPHeaders: {
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.5,en;q=0.4"
    },
    storageState: options.storageStatePath
  });

  const page = await context.newPage();

  return { browser, context, page };
}
