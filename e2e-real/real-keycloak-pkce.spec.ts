import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type BrowserUserCredentials = {
  username: string;
  password: string;
};

type BrowserUserManifest = {
  users?: Record<string, BrowserUserCredentials>;
  tenantAId?: string;
  tenantBId?: string;
  hospitalAId?: string;
  hospitalBId?: string;
  departmentAId?: string;
  queueEntryId?: string;
  queueTokenNumber?: number;
  queueDateLocal?: string;
  patientFamilyName?: string;
  billingInvoiceNumber?: string;
  billingReceiptNumber?: string;
  appointmentDateLocal?: string;
  appointmentSessionId?: string;
  appointmentSlotStartsAtUtc?: string;
  appointmentPatientId?: string;
  appointmentPatientFamilyName?: string;
  clinicalQueueEntryId?: string;
  clinicalQueueTokenNumber?: number;
  clinicalQueueDateLocal?: string;
  clinicalPatientFamilyName?: string;
};

function loadBrowserUserManifest(): BrowserUserManifest {
  const path = process.env.HEAPCARE_BROWSER_TEST_USER_FILE;
  if (!path) {
    throw new Error("HEAPCARE_BROWSER_TEST_USER_FILE must point to the ephemeral CI user credentials file.");
  }
  return JSON.parse(readFileSync(path, "utf8")) as BrowserUserManifest;
}

function loadBrowserUserForRole(roleKey: string): BrowserUserCredentials {
  const path = process.env.HEAPCARE_BROWSER_TEST_USER_FILE;
  if (!path) {
    throw new Error("HEAPCARE_BROWSER_TEST_USER_FILE must point to the ephemeral CI user credentials file.");
  }

  const manifest = JSON.parse(readFileSync(path, "utf8")) as BrowserUserManifest;
  const credentials = manifest.users?.[roleKey];
  if (!credentials?.username || !credentials.password) {
    throw new Error("The ephemeral browser test file is missing the requested synthetic role identity.");
  }
  return credentials;
}

async function signInWithKeycloak(page: import("@playwright/test").Page, credentials: BrowserUserCredentials) {
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
}

function loadBrowserUser(): BrowserUserCredentials {
  const path = process.env.HEAPCARE_BROWSER_TEST_USER_FILE;
  if (!path) {
    throw new Error("HEAPCARE_BROWSER_TEST_USER_FILE must point to the ephemeral CI user credentials file.");
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
        hasBearerToken: (headers.authorization ?? "").startsWith("Bearer ")
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
  await expect(page.getByRole("link", { name: "Reception" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Find a registered patient" })).toHaveCount(0);

  await expect.poll(
    () => hospitalRequests.some(item => item.tenantId === tenantBId && item.hasBearerToken)
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});


const persistedRoleBrowserCases = [
  {
    name: "FacilityManager",
    key: "facility-manager",
    visible: ["Facilities"],
    hidden: ["Patient registration", "Reception", "Appointments", "Queue", "Billing", "Clinical workspace"]
  },
  {
    name: "PatientRegistrar",
    key: "patient-registrar",
    visible: ["Patient registration", "Reception", "Appointments", "Queue", "Billing"],
    hidden: ["Clinical workspace"]
  },
  {
    name: "ClinicalUser",
    key: "clinical-user",
    visible: ["Clinical workspace", "Facilities"],
    hidden: ["Patient registration", "Reception", "Appointments", "Queue", "Billing"]
  }
] as const;

for (const roleCase of persistedRoleBrowserCases) {
  test("real Keycloak Authorization Code + PKCE exposes the persisted " + roleCase.name + " workspace", async ({ page }) => {
    const credentials = loadBrowserUserForRole(roleCase.key);
    const hospitalRequests: Array<{ path: string; tenantId: string; hasBearerToken: boolean }> = [];
    const patientRequests: Array<{ method: string; path: string; tenantId: string; hasBearerToken: boolean }> = [];
    const queueRequests: Array<{ path: string; tenantId: string; hasBearerToken: boolean }> = [];
    const appointmentRequests: Array<{ method: string; path: string; tenantId: string; hasBearerToken: boolean }> = [];
    const queueResponses: number[] = [];

    // Record only request metadata. Never retain tokens, credentials, or patient data.
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin !== "http://localhost:8081") return;
      const headers = request.headers();
      const evidence = {
        path: url.pathname,
        tenantId: headers["x-tenant-id"] ?? "",
        hasBearerToken: (headers.authorization ?? "").startsWith("Bearer ")
      };
      if (url.pathname === "/api/v1/hospitals") hospitalRequests.push(evidence);
      if (url.pathname.includes("/queue")) queueRequests.push(evidence);
      if (url.pathname.includes("/patients")) {
        patientRequests.push({
          method: request.method(),
          path: url.pathname,
          ...evidence
        });
      }
      if (url.pathname.includes("/availability-sessions") || url.pathname.includes("/appointments")) {
        appointmentRequests.push({
          method: request.method(),
          path: url.pathname,
          ...evidence
        });
      }
    });

    page.on("response", response => {
      const url = new URL(response.url());
      if (url.origin === "http://localhost:8081" && url.pathname.includes("/queue")) {
        queueResponses.push(response.status());
      }
    });

    await signInWithKeycloak(page, credentials);

    const tenantSelect = page.locator("#tenant-select");
    await expect(tenantSelect.locator("option").filter({ hasText: "CI Tenant A" })).toHaveCount(1);
    const tenantAId = await tenantSelect.locator("option").filter({ hasText: "CI Tenant A" }).getAttribute("value");
    expect(tenantAId).toBeTruthy();
    await expect(page.locator("#hospital-select option:checked")).toHaveText(/CI Hospital A/);

    for (const label of roleCase.visible) {
      await expect(page.getByRole("link", { name: label }), roleCase.name + " should see " + label).toBeVisible();
    }
    for (const label of roleCase.hidden) {
      await expect(page.getByRole("link", { name: label }), roleCase.name + " must not see " + label).toHaveCount(0);
    }

    await expect.poll(
      () => hospitalRequests.some(item => item.tenantId === tenantAId && item.hasBearerToken)
    ).toBe(true);

    if (roleCase.name === "ClinicalUser") {
      // Local acceptance seeds an isolated in-progress OPD walk-in. This browser
      // journey verifies the live department queue, encounter and patient identity APIs.
      const manifest = loadBrowserUserManifest();
      expect(manifest.hospitalAId).toBeTruthy();
      expect(manifest.appointmentPatientId).toBeTruthy();
      expect(manifest.departmentAId).toBeTruthy();
      expect(manifest.queueEntryId).toBeTruthy();
      expect(manifest.queueTokenNumber).toBeTruthy();
      expect(manifest.queueDateLocal).toBeTruthy();
      expect(manifest.patientFamilyName).toBeTruthy();
      expect(manifest.clinicalQueueEntryId).toBeTruthy();
      expect(manifest.clinicalQueueTokenNumber).toBeTruthy();
      expect(manifest.clinicalQueueDateLocal).toBeTruthy();
      expect(manifest.clinicalPatientFamilyName).toBeTruthy();

      await page.getByRole("link", { name: "Clinical workspace" }).click();
      await page.locator("#clinical-department").selectOption(manifest.departmentAId!);
      await page.locator("#clinical-queue-date").fill(manifest.queueDateLocal!);
      const refreshClinicalQueue = page.getByRole("button", { name: "Refresh clinical queue" });
      await expect(refreshClinicalQueue).toBeEnabled();
      const queueResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname.includes("/queue") &&
        response.request().method() === "GET"
      );
      await refreshClinicalQueue.click();
      await expect(page.getByRole("article", {
        name: "Clinical queue token " + manifest.queueTokenNumber
      })).toBeVisible();
      const liveQueueResponse = await queueResponse;
      expect(liveQueueResponse.status()).toBe(200);

      const openEncounter = page.getByRole("button", {
        name: "Open encounter for queue token " + manifest.queueTokenNumber
      });
      await expect(openEncounter).toBeEnabled();
      await openEncounter.click();
      await expect(page.getByRole("heading", { name: "Consultation note" })).toBeVisible();
      await expect(page.locator(".clinical-patient-banner"))
        .toContainText("HeapCare Scope " + manifest.patientFamilyName);
      await expect(page.locator(".clinical-patient-banner"))
        .toContainText("Date of birth: 1990-01-02");

      await page.getByLabel("I have verified the patient identity before documenting").check();
      await expect(page.locator("#clinical-chief")).toBeVisible();
      await expect(page.locator("#clinical-assessment")).toBeVisible();
      // The browser acceptance deliberately does not enter clinical content.
      // Signing must remain unavailable while required note fields are empty.
      await expect(page.getByRole("button", { name: "Review and sign" })).toBeDisabled();

      // Re-open a separate CI-only encounter that the Local API fixture has
      // drafted, signed, closed and amended through the real ClinicalUser token.
      // The original empty encounter above remains untouched and unsigned.
      await page.keyboard.press("Tab");
      await page.locator("#clinical-queue-date").fill(manifest.clinicalQueueDateLocal!);
      const signedQueueResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname.includes("/queue") &&
        response.request().method() === "GET"
      );
      await refreshClinicalQueue.click();
      expect((await signedQueueResponse).status()).toBe(200);

      await expect(page.getByRole("article", {
        name: "Clinical queue token " + manifest.clinicalQueueTokenNumber
      })).toBeVisible();
      const openSignedEncounter = page.getByRole("button", {
        name: "Open encounter for queue token " + manifest.clinicalQueueTokenNumber
      });
      await expect(openSignedEncounter).toBeEnabled();

      const signedEncounterResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname.endsWith(
          "/opd/queue/" + manifest.clinicalQueueEntryId + "/encounter"
        ) &&
        response.request().method() === "GET"
      );
      await openSignedEncounter.click();
      expect((await signedEncounterResponse).status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Consultation note" })).toBeVisible();
      await expect(page.locator(".clinical-patient-banner"))
        .toContainText("CI Synthetic " + manifest.clinicalPatientFamilyName);
      await expect(page.locator(".clinical-patient-banner"))
        .toContainText("Date of birth: 1991-05-14");
      await page.getByLabel("I have verified the patient identity before documenting").check();

      await expect(page.locator("#clinical-chief")).toHaveValue("CI synthetic encounter fixture");
      await expect(page.locator("#clinical-history")).toHaveValue("Automated acceptance placeholder; no real patient history.");
      await expect(page.locator("#clinical-examination")).toHaveValue("Automated acceptance placeholder; no clinical findings recorded.");
      await expect(page.locator("#clinical-assessment")).toHaveValue("Synthetic CI assessment placeholder only.");
      await expect(page.locator("#clinical-plan")).toHaveValue("Synthetic CI plan placeholder only; not a care instruction.");
      await expect(page.locator("#clinical-chief")).toBeDisabled();
      await expect(page.locator("#clinical-assessment")).toBeDisabled();
      await expect(page.getByRole("button", { name: "Review and sign" })).toHaveCount(0);
      const amendmentPanel = page.locator(".amendment-panel");
      await expect(amendmentPanel).toContainText("Amendment history");
      await expect(amendmentPanel).toContainText("Synthetic CI amendment");
      await expect(amendmentPanel).toContainText("Synthetic amendment fixture only; not a clinical instruction.");
      await expect(amendmentPanel.getByRole("button", { name: "Add append-only amendment" })).toBeVisible();

      expect(queueRequests.some(item => item.tenantId === tenantAId && item.hasBearerToken)).toBe(true);
      expect(patientRequests.some(item =>
        item.method === "GET" &&
        item.path.includes("/patients/departments/" + manifest.departmentAId + "/patients/") &&
        item.tenantId === tenantAId && item.hasBearerToken
      )).toBe(true);
    } else if (roleCase.name === "PatientRegistrar") {
      // The Local acceptance harness issues and fully settles a synthetic OPD
      // invoice using this real persisted PatientRegistrar identity.
      const manifest = loadBrowserUserManifest();
      expect(manifest.departmentAId).toBeTruthy();
      expect(manifest.queueEntryId).toBeTruthy();
      expect(manifest.queueDateLocal).toBeTruthy();
      expect(manifest.billingInvoiceNumber).toBeTruthy();
      expect(manifest.billingReceiptNumber).toBeTruthy();
      expect(manifest.appointmentDateLocal).toBeTruthy();
      expect(manifest.appointmentSessionId).toBeTruthy();
      expect(manifest.appointmentSlotStartsAtUtc).toBeTruthy();
      expect(manifest.appointmentPatientId).toBeTruthy();
      expect(manifest.appointmentPatientFamilyName).toBeTruthy();

      // Book and check in a separate synthetic appointment patient through the
      // real PatientRegistrar browser session and the live API.
      await page.getByRole("link", { name: "Reception" }).click();
      // The API performs a partial match against individual name fields;
      // search by the unique synthetic family name, not the combined display name.
      await page.locator("#patient-search").fill(manifest.appointmentPatientFamilyName!);
      const patientSearchResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname === "/api/v1/hospitals/" + manifest.hospitalAId + "/patients" &&
        response.request().method() === "GET"
      );
      await page.getByRole("button", { name: "Search patients" }).click();
      expect((await patientSearchResponse).status()).toBe(200);
      const appointmentPatientResult = page.getByRole("group", { name: "Patient search results" })
        .getByRole("button").filter({ hasText: manifest.appointmentPatientFamilyName! });
      await expect(appointmentPatientResult).toHaveCount(1);
      await appointmentPatientResult.click();

      await page.getByRole("link", { name: "Appointments" }).click();
      await expect(page.getByRole("heading", { name: "Book a consultation" })).toBeVisible();
      await page.locator("#appointment-department").selectOption(manifest.departmentAId!);
      await page.locator("#appointment-date").fill(manifest.appointmentDateLocal!);

      const availabilityResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname === "/api/v1/hospitals/" + manifest.hospitalAId + "/availability-sessions" &&
        response.request().method() === "GET"
      );
      await page.getByRole("button", { name: "Find available appointments" }).click();
      expect((await availabilityResponse).status()).toBe(200);
      const slotsResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname.endsWith("/availability-sessions/" + manifest.appointmentSessionId + "/slots") &&
        response.request().method() === "GET"
      );
      // Selecting the session triggers the slot lookup. Register the response
      // wait before the select change to avoid racing a fast local API response.
      await page.locator("#availability-session").selectOption(manifest.appointmentSessionId!);
      expect((await slotsResponse).status()).toBe(200);

      const slotLabel = new Date(manifest.appointmentSlotStartsAtUtc!).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata"
      });
      const availableSlot = page.getByRole("group", { name: "Available appointment slots" })
        .getByRole("button", { name: slotLabel + ", Available" });
      await expect(availableSlot).toBeEnabled();
      await availableSlot.click();
      await page.locator("#appointment-reason").fill("Synthetic browser acceptance");
      const bookingResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname === "/api/v1/hospitals/" + manifest.hospitalAId + "/appointments" &&
        response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "Confirm appointment" }).click();
      const bookedResponse = await bookingResponse;
      expect(bookedResponse.status()).toBe(201);
      await expect(page.locator(".arrival-success")).toContainText("Appointment confirmed");
      await expect(page.locator(".arrival-success")).toContainText("Booked");

      const checkInResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname.includes("/appointments/") && new URL(response.url()).pathname.endsWith("/check-in") &&
        response.request().method() === "POST"
      );
      await page.locator(".arrival-success").getByRole("button", { name: "Check in patient" }).click();
      const checkedInResponse = await checkInResponse;
      expect(checkedInResponse.status()).toBe(200);
      await expect(page.locator(".token-card")).toBeVisible();
      await expect(page.locator(".token-card")).toContainText("Waiting");

      expect(appointmentRequests.some(item =>
        item.method === "GET" &&
        item.path.endsWith("/availability-sessions") &&
        item.tenantId === tenantAId && item.hasBearerToken
      )).toBe(true);
      expect(appointmentRequests.some(item =>
        item.method === "POST" &&
        item.path.endsWith("/appointments") &&
        item.tenantId === tenantAId && item.hasBearerToken
      )).toBe(true);
      expect(appointmentRequests.some(item =>
        item.method === "POST" &&
        item.path.includes("/appointments/") && item.path.endsWith("/check-in") &&
        item.tenantId === tenantAId && item.hasBearerToken
      )).toBe(true);

      // Continue into the settled synthetic OPD billing and receipt journey.
      await page.getByRole("link", { name: "Billing" }).click();
      await expect(page.getByRole("heading", { name: "OPD billing and settlement" })).toBeVisible();
      await page.locator("#billing-department").selectOption(manifest.departmentAId!);
      await page.locator("#billing-date").fill(manifest.queueDateLocal!);

      const queueResponse = page.waitForResponse(response =>
        new URL(response.url()).origin === "http://localhost:8081" &&
        new URL(response.url()).pathname.endsWith("/queue") &&
        response.request().method() === "GET"
      );
      await page.getByRole("button", { name: "Load billable visits" }).click();
      const liveQueueResponse = await queueResponse;
      expect(liveQueueResponse.status()).toBe(200);

      const visitSelect = page.locator("#billing-visit");
      await expect(visitSelect).toBeEnabled();
      await visitSelect.selectOption(manifest.queueEntryId!);
      const invoicePanel = page.locator(".billing-invoice");
      await expect(invoicePanel).toContainText(manifest.billingInvoiceNumber!);
      await expect(invoicePanel.locator(".invoice-status")).toHaveText("Paid");
      await expect(page.getByRole("button", { name: "View receipt" })).toHaveCount(2);

      // Billing visit selection and invoice rendering must not expose patient identity.
      await expect(visitSelect).not.toContainText(manifest.patientFamilyName ?? "");
      await page.getByRole("button", { name: "View receipt" }).last().click();
      const receiptPanel = page.locator(".billing-receipt");
      await expect(receiptPanel).toContainText(manifest.billingReceiptNumber!);
      await expect(receiptPanel).toContainText(manifest.billingInvoiceNumber!);
      await expect(receiptPanel.getByRole("button", { name: "Print receipt" })).toBeVisible();

      expect(queueRequests.some(item => item.tenantId === tenantAId && item.hasBearerToken)).toBe(true);
    }
  });
}


test("real Keycloak Authorization Code + PKCE grants only the persisted PlatformOperator control plane", async ({ page }) => {
  const credentials = loadBrowserUserForRole("platform");
  const platformRequests: Array<{ path: string; hasBearerToken: boolean }> = [];

  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== "http://localhost:8081") return;
    const headers = request.headers();
    if (url.pathname.startsWith("/api/v1/platform/")) {
      platformRequests.push({
        path: url.pathname,
        hasBearerToken: (headers.authorization ?? "").startsWith("Bearer ")
      });
    }
  });

  await signInWithKeycloak(page, credentials);

  await expect(page.getByRole("link", { name: "Tenant lifecycle" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tenant lifecycle administration" })).toBeVisible();
  await expect(page.getByText(
    "Platform operator access is active. Use Platform tenants to provision and manage customer tenants."
  )).toBeVisible();

  for (const label of [
    "Reception",
    "Patient registration",
    "Appointments",
    "Staff",
    "Queue",
    "Billing",
    "Facilities",
    "Memberships"
  ]) {
    await expect(page.getByRole("link", { name: label })).toHaveCount(0);
  }

  await expect(page.getByRole("button", { name: "Create tenant" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registered tenants" })).toBeVisible();
  await expect.poll(
    () => platformRequests.some(item =>
      item.path === "/api/v1/platform/operator/status" && item.hasBearerToken
    )
  ).toBe(true);
  await expect.poll(
    () => platformRequests.some(item =>
      item.path === "/api/v1/platform/tenants" && item.hasBearerToken
    )
  ).toBe(true);
});
