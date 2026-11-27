import { expect, test, type Page, type Route } from "@playwright/test";

const tenantId = "13000000-0000-4000-8000-000000000001";
const hospitalId = "24000000-0000-4000-8000-000000000001";

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": route.request().headers()["origin"] ?? "http://127.0.0.1:4174" },
    body: JSON.stringify(body)
  });
}

async function installShortLivedSession(page: Page) {
  await page.addInitScript(({ storageKey, storedUser }) => {
    sessionStorage.setItem(storageKey, JSON.stringify(storedUser));
  }, {
    storageKey: "oidc.user:https://identity.test:compilecare-web",
    storedUser: {
      id_token: "synthetic-id-token",
      access_token: "expiring-access-token",
      refresh_token: "synthetic-refresh-token",
      token_type: "Bearer",
      scope: "openid profile",
      profile: {
        sub: "session-renewal-user",
        name: "Session Renewal Test User"
      },
      expires_at: Math.floor(Date.now() / 1000) + 30
    }
  });
}

test("OIDC silently renews a short-lived session and uses the renewed token for API calls", async ({ page }) => {
  await installShortLivedSession(page);
  let refreshGrantCount = 0;
  const apiAuthorizationHeaders: string[] = [];

  await page.route("https://identity.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/.well-known/openid-configuration") {
      return json(route, {
        issuer: "https://identity.test",
        authorization_endpoint: "https://identity.test/connect/authorize",
        token_endpoint: "https://identity.test/connect/token",
        userinfo_endpoint: "https://identity.test/connect/userinfo",
        end_session_endpoint: "https://identity.test/connect/endsession",
        jwks_uri: "https://identity.test/.well-known/jwks",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["none"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"]
      });
    }

    if (request.method() === "POST" && url.pathname === "/connect/token") {
      const form = new URLSearchParams(request.postData() ?? "");
      expect(form.get("grant_type")).toBe("refresh_token");
      expect(form.get("refresh_token")).toBe("synthetic-refresh-token");
      refreshGrantCount += 1;
      return json(route, {
        access_token: "renewed-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "renewed-refresh-token",
        scope: "openid profile"
      });
    }

    if (request.method() === "GET" && url.pathname === "/.well-known/jwks") {
      return json(route, { keys: [] });
    }

    return json(route, { error: "unexpected identity-provider request" }, 404);
  });

  await page.route("https://api.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": request.headers()["origin"] ?? "http://127.0.0.1:4174",
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-allow-headers": "Authorization, Content-Type, X-Tenant-ID"
        }
      });
    }

    apiAuthorizationHeaders.push(request.headers()["authorization"] ?? "");

    if (request.method() === "GET" && url.pathname === "/api/v1/me/tenant-contexts") {
      return json(route, {
        items: [{
          tenantId,
          tenantName: "HeapCare Demo Group",
          tenantSlug: "heapcare-demo",
          role: "PatientRegistrar",
          scopes: [{ scopeType: "Hospital", hospitalId, departmentId: null }],
          permissions: ["facility.read", "patient.read", "patient.register", "patient.duplicate.review"]
        }],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/hospitals") {
      return json(route, {
        items: [{ id: hospitalId, name: "HeapCare Demo Hospital", code: "DEMO01" }],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/hospitals/" + hospitalId + "/departments") {
      return json(route, {
        items: [],
        page: 1,
        pageSize: 100,
        totalCount: 0,
        totalPages: 0
      });
    }

    return json(route, { title: "Unexpected test API request", status: 501 }, 501);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Reception workspace" })).toBeVisible();
  await expect(page.getByText("Session Renewal Test User")).toBeVisible();

  await expect.poll(() => refreshGrantCount, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(
    () => apiAuthorizationHeaders.some(value => value === "Bearer renewed-access-token"),
    { timeout: 15_000 }
  ).toBe(true);

  await expect(page.getByText("Your sign-in session expired. Sign in again to continue.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});


test("shows a safe reauthentication warning then returns to sign-in when the access token expires", async ({ page }) => {
  await page.clock.install({ time: new Date() });
  await installShortLivedSession(page);
  let refreshGrantCount = 0;

  await page.route("https://identity.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/.well-known/openid-configuration") {
      return json(route, {
        issuer: "https://identity.test",
        authorization_endpoint: "https://identity.test/connect/authorize",
        token_endpoint: "https://identity.test/connect/token",
        userinfo_endpoint: "https://identity.test/connect/userinfo",
        jwks_uri: "https://identity.test/.well-known/jwks",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["none"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"]
      });
    }

    if (request.method() === "POST" && url.pathname === "/connect/token") {
      const form = new URLSearchParams(request.postData() ?? "");
      expect(form.get("grant_type")).toBe("refresh_token");
      refreshGrantCount += 1;
      return json(route, {
        error: "invalid_grant",
        error_description: "The synthetic refresh token has been revoked."
      }, 400);
    }

    return json(route, { error: "unexpected identity-provider request" }, 404);
  });

  await page.route("https://api.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": request.headers()["origin"] ?? "http://127.0.0.1:4174",
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-allow-headers": "Authorization, Content-Type, X-Tenant-ID"
        }
      });
    }

    if (request.method() === "GET" && url.pathname === "/api/v1/me/tenant-contexts") {
      return json(route, {
        items: [{
          tenantId,
          tenantName: "HeapCare Demo Group",
          tenantSlug: "heapcare-demo",
          role: "PatientRegistrar",
          scopes: [{ scopeType: "Hospital", hospitalId, departmentId: null }],
          permissions: ["facility.read", "patient.read"]
        }],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (request.method() === "GET" && url.pathname === "/api/v1/hospitals") {
      return json(route, {
        items: [{ id: hospitalId, name: "HeapCare Demo Hospital", code: "DEMO01" }],
        page: 1,
        pageSize: 100,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (request.method() === "GET" && url.pathname === "/api/v1/hospitals/" + hospitalId + "/departments") {
      return json(route, { items: [], page: 1, pageSize: 100, totalCount: 0, totalPages: 0 });
    }

    return json(route, { title: "Unexpected test API request", status: 501 }, 501);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Reception workspace" })).toBeVisible();
  await expect(page.getByText("Session Renewal Test User")).toBeVisible();
  await expect.poll(() => refreshGrantCount, { timeout: 15_000 }).toBeGreaterThan(0);

  await expect(page.getByRole("alert")).toContainText(
    "Your session could not be renewed. Sign in again to continue."
  );
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("Your sign-in session expired. Sign in again to continue.")).toHaveCount(0);

  await page.clock.fastForward(31_000);
  await expect(page.getByRole("alert")).toContainText(
    "Your sign-in session expired. Sign in again to continue."
  );
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});
