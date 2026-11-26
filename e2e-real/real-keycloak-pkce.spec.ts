import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type BrowserUserCredentials = {
  username: string;
  password: string;
};

function loadBrowserUser(): BrowserUserCredentials {
  const path = process.env.COMPILECARE_BROWSER_TEST_USER_FILE;
  if (!path) {
    throw new Error("COMPILECARE_BROWSER_TEST_USER_FILE must point to the ephemeral CI user credentials file.");
  }

  const credentials = JSON.parse(readFileSync(path, "utf8")) as Partial<BrowserUserCredentials>;
  if (!credentials.username || !credentials.password) {
    throw new Error("The ephemeral browser test user file is incomplete.");
  }

  return {
    username: credentials.username,
    password: credentials.password
  };
}

test("real Keycloak Authorization Code + PKCE sign-in loads persisted tenant workspaces", async ({ page }) => {
  const credentials = loadBrowserUser();
  const hospitalRequests: Array<{ tenantId: string; hasBearerToken: boolean }> = [];

  // Capture only non-sensitive request evidence. Never retain or print the
  // bearer token, authorization code, username, password or OIDC callback URL.
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== "http://localhost:8081" || url.pathname !== "/api/v1/hospitals") {
      return;
    }

    const headers = request.headers();
    hospitalRequests.push({
      tenantId: headers["x-tenant-id"] ?? "",
      hasBearerToken: /^Bearer\s+\S+$/i.test(headers.authorization ?? "")
    });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL(url =>
    url.origin === "http://keycloak.localhost:8082" &&
    url.pathname.endsWith("/protocol/openid-connect/auth")
  );
  await expect(page.locator("#kc-form-login")).toBeVisible();
  await page.locator("#username").fill(credentials.username);
  await page.locator("#password").fill(credentials.password);
  await page.locator("#kc-login").click();

  await page.waitForURL(url =>
    url.origin === "http://localhost:8080" &&
    url.pathname === "/"
  );
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const tenantSelect = page.getByLabel("Tenant");
  await expect(tenantSelect.locator("option")).toHaveCount(3);
  await expect(tenantSelect.locator("option").filter({ hasText: "CI Tenant A" })).toHaveCount(1);
  await expect(tenantSelect.locator("option").filter({ hasText: "CI Tenant B" })).toHaveCount(1);

  const tenantAId = await tenantSelect.locator("option").filter({ hasText: "CI Tenant A" }).getAttribute("value");
  const tenantBId = await tenantSelect.locator("option").filter({ hasText: "CI Tenant B" }).getAttribute("value");
  expect(tenantAId).toBeTruthy();
  expect(tenantBId).toBeTruthy();

  // HospitalAdmin in tenant A can register patients and work with facilities.
  await tenantSelect.selectOption(tenantAId!);
  await expect(page.locator("#hospital-select option:checked")).toHaveText(/CI Hospital A/);
  await expect(page.getByRole("link", { name: "Patient registration" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Facilities" })).toBeVisible();

  await expect.poll(
    () => hospitalRequests.some(item => item.tenantId === tenantAId && item.hasBearerToken)
  ).toBe(true);

  // The same Keycloak subject has only FacilityViewer in tenant B. The selected
  // tenant changes the hospital dataset and removes patient-registration access.
  await tenantSelect.selectOption(tenantBId!);
  await expect(page.locator("#hospital-select option:checked")).toHaveText(/CI Hospital B/);
  await expect(page.getByRole("link", { name: "Facilities" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Patient registration" })).toHaveCount(0);

  await expect.poll(
    () => hospitalRequests.some(item => item.tenantId === tenantBId && item.hasBearerToken)
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
