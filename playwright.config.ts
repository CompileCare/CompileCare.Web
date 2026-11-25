import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "VITE_OIDC_AUTHORITY=https://identity.test VITE_OIDC_CLIENT_ID=compilecare-web VITE_OIDC_REDIRECT_URI=http://127.0.0.1:4174/auth/callback VITE_API_BASE_URL=https://api.test npm run dev -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
