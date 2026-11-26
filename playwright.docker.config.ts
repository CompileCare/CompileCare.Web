import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  reporter: [["list"]],
  outputDir: "test-results-docker",
  use: {
    baseURL: process.env.CSP_TEST_BASE_URL ?? "http://127.0.0.1:8080",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  }
});
