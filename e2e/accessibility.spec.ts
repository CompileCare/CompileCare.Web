import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const tenantId = "14000000-0000-4000-8000-000000000001";
const hospitalId = "25000000-0000-4000-8000-000000000001";
const departmentId = "36000000-0000-4000-8000-000000000001";
const patientId = "47000000-0000-4000-8000-000000000001";
const sessionId = "58000000-0000-4000-8000-000000000001";
const hospitalPath = "/api/v1/hospitals/" + hospitalId;
const availabilityPath = hospitalPath + "/availability-sessions";

const permissions = [
  "facility.read",
  "patient.read",
  "patient.register",
  "patient.duplicate.review",
  "patient.identifier.read",
  "patient.identifier.assign",
  "availability.read",
  "appointment.read",
  "appointment.manage",
  "queue.read",
  "queue.manage"
];

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "http://127.0.0.1:4174" },
    body: JSON.stringify(body)
  });
}

async function installSession(page: Page) {
  await page.addInitScript(({ storageKey, storedUser }) => {
    sessionStorage.setItem(storageKey, JSON.stringify(storedUser));
  }, {
    storageKey: "oidc.user:https://identity.test:compilecare-web",
    storedUser: {
      id_token: "synthetic-accessibility-id-token",
      access_token: "synthetic-accessibility-access-token",
      token_type: "Bearer",
      scope: "openid profile",
      profile: { sub: "accessibility-review-user", name: "Accessibility Review User" },
      expires_at: 4102444800
    }
  });
}

async function scan(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const violations = results.violations.map(item => ({
    id: item.id,
    impact: item.impact,
    description: item.description,
    nodes: item.nodes.map(node => ({
      target: node.target,
      summary: node.failureSummary
    }))
  }));

  expect(violations, state + " has WCAG accessibility violations:\n" + JSON.stringify(violations, null, 2)).toEqual([]);
}

test("reception and appointment workspace meets WCAG 2.1 A/AA checks at desktop and mobile widths", async ({ page }) => {
  await installSession(page);

  const patient = {
    id: patientId,
    givenName: "Asha",
    middleName: "R.",
    familyName: "Patil",
    dateOfBirth: "1990-04-12",
    hospitalId,
    registeredAtUtc: "2026-11-25T08:55:00Z"
  };
  const sessionStart = new Date(Date.now() + 60 * 60 * 1000);
  const slotStart = sessionStart.toISOString();
  const slotEnd = new Date(sessionStart.getTime() + 30 * 60 * 1000).toISOString();

  await page.route("https://api.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:4174",
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-allow-headers": "Authorization, Content-Type, X-Tenant-ID"
        }
      });
    }

    if (method === "GET" && path === "/api/v1/me/tenant-contexts") {
      return json(route, {
        items: [{
          tenantId,
          tenantName: "CompileCare Demo Group",
          tenantSlug: "compilecare-demo",
          role: "HospitalAdmin",
          scopes: [{ scopeType: "Hospital", hospitalId, departmentId: null }],
          permissions
        }],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (method === "GET" && path === "/api/v1/hospitals") {
      return json(route, {
        items: [{ id: hospitalId, name: "CompileCare Demo Hospital", code: "DEMO01" }],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (method === "GET" && path === hospitalPath + "/departments") {
      return json(route, {
        items: [{ id: departmentId, hospitalId, name: "Medicine", code: "MED" }],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (method === "GET" && path === hospitalPath + "/patients") {
      return json(route, {
        items: [patient],
        page: 1,
        pageSize: 25,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (method === "GET" && path === availabilityPath) {
      return json(route, {
        items: [{
          id: sessionId,
          hospitalId,
          departmentId,
          providerStaffId: "89000000-0000-4000-8000-000000000001",
          localDate: url.searchParams.get("date") ?? "2026-11-25",
          startsAtUtc: slotStart,
          endsAtUtc: slotEnd,
          slotDurationMinutes: 30,
          timeZoneId: "Asia/Kolkata",
          createdAtUtc: new Date().toISOString()
        }],
        page: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (method === "GET" && path === availabilityPath + "/" + sessionId + "/slots") {
      return json(route, [{ startsAtUtc: slotStart, endsAtUtc: slotEnd, isAvailable: true }]);
    }

    return json(route, { title: "Unexpected test API request", status: 501 }, 501);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Reception workspace" })).toBeVisible();
  await scan(page, "Reception landing / registration");

  await page.getByLabel("Patient name").fill("Asha");
  await page.getByRole("button", { name: "Search patients" }).click();
  await expect(page.locator(".patient-result-selectable")).toHaveCount(1);
  await page.locator(".patient-result-selectable").click();

  await page.getByRole("button", { name: "Find available appointments" }).click();
  await page.getByLabel("Provider availability").selectOption(sessionId);
  await page.getByRole("group", { name: "Available appointment slots" }).getByRole("button").click();
  await expect(page.locator(".booking-review")).toBeVisible();
  await scan(page, "Appointment slot and booking review");

  await page.setViewportSize({ width: 390, height: 844 });
  await scan(page, "Responsive mobile reception and appointment workspace");
});
