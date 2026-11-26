import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  // Full HTML reports are for local QA/Antigravity runs only.
  // CI keeps its lightweight console reporter.
  reporter: isCI
    ? [["list"]]
    : [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }]
      ],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    trace: "retain-on-failure",
    // Capture every test locally for the Antigravity QA report.
    // CI captures screenshots only when a test fails.
    screenshot: isCI ? "only-on-failure" : "on",
    video: "retain-on-failure"
  },
  webServer: {
    command: "VITE_OIDC_AUTHORITY=https://identity.test VITE_OIDC_CLIENT_ID=compilecare-web VITE_OIDC_REDIRECT_URI=http://127.0.0.1:4174/auth/callback VITE_API_BASE_URL=https://api.test npm run dev -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !isCI,
    timeout: 30_000
  }
});
