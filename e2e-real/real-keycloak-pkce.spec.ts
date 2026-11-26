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
  const patientRequests: Array<{ method: string; path: string; tenantId: string; hasBearerToken: boolean }> = [];

  // Capture only non-sensitive request evidence. Never retain or print the
  // bearer token, authorization code, username, password or OIDC callback URL.
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== "http://localhost:8081") {
      return;
    }

    const headers = request.headers();
    const evidence = {
      tenantId: headers["x-tenant-id"] ?? "",
      hasBearerToken: /^Bearer\s+\S+$/i.test(headers.authorization ?? "")
    };

    if (url.pathname === "/api/v1/hospitals") {
      hospitalRequests.push(evidence);
    }

    if (url.pathname.includes("/patients")) {
      patientRequests.push({
        method: request.method(),
        path: url.pathname,
        ...evidence
      });
    }
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

  const tenantSelect = page.locator("#tenant-select");
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

  // Exercise reception registration against PostgreSQL. The tenant and hospital
  // were freshly provisioned for this CI run; these are synthetic test values.
  await page.getByRole("link", { name: "Patient registration" }).click();
  const uniqueGivenName = "CI" + Date.now().toString();
  await page.locator("#registration-given-name").fill(uniqueGivenName);
  await page.locator("#registration-middle-name").fill("Browser");
  await page.locator("#registration-family-name").fill("Acceptance");
  await page.locator("#registration-dob").fill("1990-02-03");
  await page.getByRole("button", { name: "Check for possible duplicates" }).click();
  await expect(page.getByText("Duplicate review completed")).toBeVisible();
  await page.getByRole("checkbox", { name: /I reviewed the result and followed the hospital identity-check procedure/ }).check();
  await page.getByRole("button", { name: "Register patient" }).click();
  await expect(page.locator(".registration-success")).toContainText(
    new RegExp("Patient " + uniqueGivenName + " Browser Acceptance was registered successfully")
  );

  await page.getByRole("link", { name: "Reception" }).click();
  await page.getByLabel("Patient name").fill(uniqueGivenName);
  await page.getByRole("button", { name: "Search patients" }).click();
  await expect(page.locator(".patient-result-selectable")).toHaveCount(1);
  await expect(page.locator(".patient-result-selectable")).toContainText(
    uniqueGivenName + " Browser Acceptance"
  );

  expect(patientRequests.some(item => item.method === "POST" &&
    item.path.endsWith("/patients/duplicate-candidates") &&
    item.tenantId === tenantAId && item.hasBearerToken)).toBe(true);
  expect(patientRequests.some(item => item.method === "POST" &&
    /\/patients$/.test(item.path) &&
    item.tenantId === tenantAId && item.hasBearerToken)).toBe(true);
  expect(patientRequests.some(item => item.method === "GET" &&
    item.path.endsWith("/patients") &&
    item.tenantId === tenantAId && item.hasBearerToken)).toBe(true);

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
