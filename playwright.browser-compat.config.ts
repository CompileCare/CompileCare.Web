import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

const browserName = process.env.PLAYWRIGHT_BROWSER;
const supportedBrowsers = ["chromium", "firefox", "webkit"] as const;

if (!supportedBrowsers.some(browser => browser === browserName)) {
  throw new Error("PLAYWRIGHT_BROWSER must be one of: chromium, firefox, webkit.");
}

export default defineConfig({
  ...baseConfig,
  testDir: "./e2e",
  testMatch: ["accessibility.spec.ts"],
  use: {
    ...(baseConfig.use ?? {}),
    browserName: browserName as (typeof supportedBrowsers)[number]
  }
});
