import { defineConfig } from "@playwright/test";

// This suite connects to the already-running isolated Docker stack. Unlike the
// normal UI regression suite, it does not mock Keycloak or HeapCare.Api.
const supportedBrowsers = ["chromium", "firefox", "webkit"] as const;
const selectedBrowser = process.env.PLAYWRIGHT_BROWSER ?? "chromium";

if (!supportedBrowsers.some(browser => browser === selectedBrowser)) {
  throw new Error("PLAYWRIGHT_BROWSER must be one of: chromium, firefox, webkit.");
}

export default defineConfig({
  testDir: "./e2e-real",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 25_000 },
  reporter: [["list"]],
  outputDir: "test-results-real-oidc",
  use: {
    baseURL: "http://localhost:8080",
    browserName: selectedBrowser as (typeof supportedBrowsers)[number],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  }
});
