import { defineConfig } from "playwright/test";

export default defineConfig({
  timeout: 60_000,
  use: {
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 60_000
  }
});
