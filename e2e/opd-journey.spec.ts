import { expect, test, type Page, type Route } from "@playwright/test";

const tenantId = "11000000-0000-4000-8000-000000000001";
const hospitalId = "22000000-0000-4000-8000-000000000001";
const departmentId = "33000000-0000-4000-8000-000000000001";
const patientId = "44000000-0000-4000-8000-000000000001";
const queueEntryId = "55000000-0000-4000-8000-000000000001";
const encounterId = "66000000-0000-4000-8000-000000000001";
const serviceItemId = "77000000-0000-4000-8000-000000000001";
const invoiceId = "88000000-0000-4000-8000-000000000001";
const paymentId = "99000000-0000-4000-8000-000000000001";
const hospitalPath = "/api/v1/hospitals/" + hospitalId;
const queuePath = hospitalPath + "/queue";
const encounterPath = hospitalPath + "/opd/encounters/" + encounterId;
const queueEncounterPath = hospitalPath + "/opd/queue/" + queueEntryId + "/encounter";
const invoicePath = hospitalPath + "/billing/invoices";
const visitInvoicePath = hospitalPath + "/billing/visits/" + queueEntryId + "/invoice";
const paymentsPath = invoicePath + "/" + invoiceId + "/payments";

const receptionPermissions = [
  "facility.read",
  "patient.read",
  "patient.register",
  "patient.duplicate.review",
  "patient.identifier.read",
  "patient.identifier.assign",
  "queue.read",
  "queue.manage"
];
const clinicalPermissions = [
  "facility.read",
  "queue.read",
  "patient.identity.read",
  "encounter.read",
  "encounter.manage",
  "encounter.sign",
  "encounter.amend"
];
const billingPermissions = [
  "facility.read",
  "queue.read",
  "billing.invoice.read",
  "billing.invoice.manage",
  "billing.payment.manage",
  "billing.catalogue.manage",
  "billing.report.read"
];

type State = {
  permissions: string[];
  patientRegistered: boolean;
  queueStatus: string;
  encounter: Record<string, unknown> | null;
  invoice: Record<string, unknown> | null;
  payments: Array<Record<string, unknown>>;
};

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
      id_token: "isolated-opd-e2e-id-token",
      access_token: "isolated-opd-e2e-access-token",
      token_type: "Bearer",
      scope: "openid profile",
      profile: { sub: "opd-journey-user", name: "OPD Journey Test User" },
      expires_at: 4102444800
    }
  });
}

async function installApi(page: Page, seedRegisteredPatient = false, initialQueueStatus = "Waiting") {
  const state: State = {
    permissions: receptionPermissions,
    patientRegistered: seedRegisteredPatient,
    queueStatus: initialQueueStatus,
    encounter: null,
    invoice: null,
    payments: []
  };

  const patient = {
    id: patientId,
    givenName: "Asha",
    middleName: "R.",
    familyName: "Patil",
    dateOfBirth: "1990-04-12",
    hospitalId,
    registeredAtUtc: "2026-11-25T08:55:00Z"
  };
  const visit = () => ({
    id: queueEntryId,
    hospitalId,
    departmentId,
    patientId,
    queueDateLocal: "2026-11-25",
    tokenNumber: 12,
    status: state.queueStatus,
    checkedInAtUtc: "2026-11-25T09:00:00Z",
    calledAtUtc: state.queueStatus === "Waiting" ? null : "2026-11-25T09:02:00Z",
    startedAtUtc: state.queueStatus === "InProgress" || state.queueStatus === "Completed" ? "2026-11-25T09:05:00Z" : null,
    completedAtUtc: state.queueStatus === "Completed" ? "2026-11-25T09:20:00Z" : null
  });
  const serviceItem = {
    id: serviceItemId,
    hospitalId,
    code: "OPD-CONSULT",
    name: "OPD Consultation",
    category: "Consultation",
    unitPrice: 500,
    isActive: true
  };
  const invoiceLine = {
    id: "aa000000-0000-4000-8000-000000000001",
    serviceCode: "OPD-CONSULT",
    description: "OPD Consultation",
    quantity: 1,
    unitPrice: 500,
    lineTotal: 500
  };
  const currentEncounter = () => state.encounter;
  const currentInvoice = () => state.invoice;

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
      const role = state.permissions.includes("encounter.read")
        ? "ClinicalUser"
        : state.permissions.includes("billing.invoice.read")
          ? "PatientRegistrar"
          : "HospitalAdmin";
      return json(route, {
        items: [{
          tenantId,
          tenantName: "CompileCare Demo Group",
          tenantSlug: "compilecare-demo",
          role,
          scopes: [{ scopeType: "Hospital", hospitalId, departmentId: null }],
          permissions: state.permissions
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

    if (method === "POST" && path === hospitalPath + "/patients/duplicate-candidates") {
      return json(route, {
        evaluated: true,
        evaluationMessage: "No candidate was returned by the hospital-local duplicate check.",
        candidates: [],
        hasMoreCandidates: false
      });
    }

    if (method === "POST" && path === hospitalPath + "/patients") {
      state.patientRegistered = true;
      return json(route, patient, 201);
    }

    if (method === "POST" && path === hospitalPath + "/patients/" + patientId + "/identifiers/mrn") {
      return json(route, {
        id: "bb000000-0000-4000-8000-000000000001",
        patientId,
        hospitalId,
        type: "MRN",
        value: "CC000001",
        assignedAtUtc: "2026-11-25T08:56:00Z"
      }, 200);
    }

    if (method === "GET" && path === hospitalPath + "/patients") {
      return json(route, {
        items: state.patientRegistered ? [patient] : [],
        page: 1,
        pageSize: 25,
        totalCount: state.patientRegistered ? 1 : 0,
        totalPages: state.patientRegistered ? 1 : 0
      });
    }

    if (method === "POST" && path === hospitalPath + "/queue/walk-ins") {
      state.queueStatus = "Waiting";
      return json(route, visit(), 201);
    }

    if (method === "GET" && path === queuePath) {
      return json(route, {
        items: state.patientRegistered ? [visit()] : [],
        page: 1,
        pageSize: 50,
        totalCount: state.patientRegistered ? 1 : 0,
        totalPages: state.patientRegistered ? 1 : 0
      });
    }

    if (method === "POST" && path === queuePath + "/" + queueEntryId + "/call") {
      state.queueStatus = "Called";
      return json(route, visit());
    }

    if (method === "POST" && path === queuePath + "/" + queueEntryId + "/start") {
      state.queueStatus = "InProgress";
      return json(route, visit());
    }

    if (method === "POST" && path === queuePath + "/" + queueEntryId + "/complete") {
      state.queueStatus = "Completed";
      return json(route, visit());
    }

    if (method === "GET" && path === queueEncounterPath) {
      if (!currentEncounter()) {
        return json(route, { title: "Encounter not found", detail: "No encounter exists for this queue entry.", status: 404 }, 404);
      }
      return json(route, currentEncounter());
    }

    if (method === "POST" && path === queueEncounterPath) {
      state.encounter = {
        id: encounterId,
        hospitalId,
        departmentId,
        patientId,
        queueEntryId,
        status: "InProgress",
        chiefComplaint: null,
        history: null,
        examination: null,
        assessment: null,
        plan: null,
        createdByIssuer: "https://identity.test",
        createdBySubject: "opd-journey-user",
        startedAtUtc: "2026-11-25T09:05:00Z",
        signedByIssuer: null,
        signedBySubject: null,
        signedAtUtc: null,
        closedAtUtc: null,
        cancellationReason: null,
        amendments: []
      };
      return json(route, state.encounter, 201);
    }

    if (method === "GET" && path === hospitalPath + "/patients/departments/" + departmentId + "/patients/" + patientId) {
      return json(route, patient);
    }

    if (method === "PUT" && path === encounterPath + "/note") {
      state.encounter = { ...(state.encounter ?? {}), ...(request.postDataJSON() as object) };
      return json(route, state.encounter);
    }

    if (method === "POST" && path === encounterPath + "/sign") {
      state.encounter = {
        ...(state.encounter ?? {}),
        status: "Signed",
        signedByIssuer: "https://identity.test",
        signedBySubject: "opd-journey-user",
        signedAtUtc: "2026-11-25T09:18:00Z"
      };
      return json(route, state.encounter);
    }

    if (method === "POST" && path === encounterPath + "/close") {
      state.encounter = { ...(state.encounter ?? {}), status: "Closed", closedAtUtc: "2026-11-25T09:19:00Z" };
      return json(route, state.encounter);
    }

    if (method === "GET" && path === hospitalPath + "/billing/service-items") {
      return json(route, [serviceItem]);
    }

    if (method === "GET" && path === visitInvoicePath) {
      if (!currentInvoice()) return json(route, { title: "Invoice not found", status: 404 }, 404);
      return json(route, currentInvoice());
    }

    if (method === "POST" && path === invoicePath) {
      state.invoice = {
        id: invoiceId,
        hospitalId,
        queueEntryId,
        patientId,
        invoiceNumber: "INV-OPD-0001",
        issuedAtUtc: "2026-11-25T09:20:00Z",
        status: "Issued",
        subtotal: 500,
        amountPaid: 0,
        balanceDue: 500,
        lines: [invoiceLine]
      };
      return json(route, state.invoice, 201);
    }

    if (method === "GET" && path === paymentsPath) {
      return json(route, state.payments);
    }

    if (method === "POST" && path === paymentsPath) {
      const body = request.postDataJSON() as { amount: number; method: string; reference: string | null };
      const payment = {
        id: paymentId,
        invoiceId,
        receiptNumber: "RCT-OPD-0001",
        amount: body.amount,
        method: body.method,
        reference: body.reference,
        paidAtUtc: "2026-11-25T09:22:00Z"
      };
      state.payments.push(payment);
      state.invoice = {
        ...(state.invoice ?? {}),
        status: body.amount === 500 ? "Paid" : "PartiallyPaid",
        amountPaid: body.amount,
        balanceDue: Math.max(0, 500 - body.amount)
      };
      return json(route, payment, 201);
    }

    if (method === "GET" && path === hospitalPath + "/billing/payments/" + paymentId + "/receipt") {
      const payment = state.payments[0];
      if (!payment) return json(route, { title: "Receipt not found", status: 404 }, 404);
      return json(route, {
        receiptNumber: payment.receiptNumber,
        invoiceNumber: "INV-OPD-0001",
        hospitalId,
        patientId,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        paidAtUtc: payment.paidAtUtc
      });
    }

    return json(route, {
      title: "Unexpected test API request",
      detail: method + " " + path + " is not mocked by this browser test",
      status: 501
    }, 501);
  });

  return {
    setPermissions: (permissions: string[]) => { state.permissions = permissions; }
  };
}

async function assertNoHorizontalOverflow(page: Page) {
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(375);
}

test("staff-assisted OPD journey connects patient registration, walk-in, clinical sign-off and billing", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installSession(page);
  const api = await installApi(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Reception workspace" })).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.getByLabel("Given name *").fill("Asha");
  await page.getByLabel("Middle name").fill("R.");
  await page.getByLabel("Family name").fill("Patil");
  await page.getByLabel("Date of birth (if known)").fill("1990-04-12");
  await page.getByRole("button", { name: "Check for possible duplicates" }).click();
  await expect(page.getByText("Duplicate review completed")).toBeVisible();
  await page.getByRole("checkbox", { name: /I reviewed the result/ }).check();
  await page.getByRole("button", { name: "Register patient" }).click();
  await expect(page.getByText(/MRN CC000001 was assigned/)).toBeVisible();

  await page.getByLabel("Patient name").fill("Asha");
  await page.getByRole("button", { name: "Search patients" }).click();
  await expect(page.locator(".patient-result-selectable")).toHaveCount(1);
  await expect(page.locator(".patient-result-selectable").getByText("Asha R. Patil")).toBeVisible();
  await page.locator(".patient-result-selectable").click();

  await page.getByRole("button", { name: "Add to queue" }).click();
  await expect(page.locator(".token-card")).toContainText("12");
  await assertNoHorizontalOverflow(page);
  await expect(page.getByRole("button", { name: "Call" })).toBeVisible();
  await page.getByRole("button", { name: "Call" }).click();
  await expect(page.getByRole("button", { name: "Start consultation" })).toBeVisible();
  await page.getByRole("button", { name: "Start consultation" }).click();
  await expect(page.locator(".queue-status-inprogress")).toBeVisible();

  api.setPermissions(clinicalPermissions);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Clinical workspace" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Refresh clinical queue" }).click();
  await page.getByRole("button", { name: /Open encounter for queue token \d+/ }).click();
  await expect(page.getByRole("heading", { name: "Consultation note" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.getByRole("checkbox", { name: /I have verified the patient identity/ }).check();
  await page.getByLabel("Chief complaint *").fill("Intermittent headache");
  await page.getByLabel("Assessment *").fill("Assessment recorded for test journey");
  await page.getByRole("button", { name: "Review and sign" }).click();
  await expect(page.getByText("Encounter signed. The original note is now read-only.")).toBeVisible();
  await page.getByRole("button", { name: "Close encounter" }).click();
  await expect(page.getByText("Encounter closed.")).toBeVisible();

  api.setPermissions(receptionPermissions);
  await page.reload();
  await page.getByRole("button", { name: "Refresh queue" }).click();
  await expect(page.getByRole("button", { name: "Complete" })).toBeVisible();
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.locator(".queue-status-completed")).toBeVisible();

  api.setPermissions(billingPermissions);
  await page.reload();
  await expect(page.getByRole("heading", { name: "OPD billing and settlement" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Load billable visits" }).click();
  await page.getByLabel("In-progress or completed visit").selectOption(queueEntryId);
  await page.getByRole("spinbutton", { name: "Quantity for OPD Consultation" }).fill("1");
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await expect(page.getByRole("heading", { name: "INV-OPD-0001" })).toBeVisible();
  await page.getByLabel("Amount (INR)").fill("500");
  await page.getByLabel("Method").selectOption("UPI");
  await page.getByLabel("Reference (optional)").fill("OPD-JOURNEY-UPI");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Invoice fully settled.")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await expect(page.locator(".invoice-status")).toHaveText("Paid");
});

test("reception patient search supports keyboard selection with a visible focus indicator", async ({ page }) => {
  await installSession(page);
  await installApi(page, true);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Reception workspace" })).toBeVisible();
  await page.getByLabel("Patient name").fill("Asha");
  const searchButton = page.getByRole("button", { name: "Search patients" });
  await searchButton.click();

  const patientResult = page.locator(".patient-result-selectable");
  await expect(patientResult).toHaveCount(1);
  await page.keyboard.press("Tab");

  await expect(patientResult).toBeFocused();
  const focus = await patientResult.evaluate(element => ({
    style: getComputedStyle(element).outlineStyle,
    width: getComputedStyle(element).outlineWidth
  }));
  expect(focus.style).toBe("solid");
  expect(focus.width).toBe("3px");

  await page.keyboard.press("Enter");
  await expect(patientResult).toHaveAttribute("aria-pressed", "true");
  await expect(patientResult).toHaveClass(/patient-result-active/);
});

test("ClinicalUser can open an OPD encounter from the clinical queue using keyboard navigation", async ({ page }) => {
  await installSession(page);
  const api = await installApi(page, true, "InProgress");
  api.setPermissions(clinicalPermissions);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Clinical workspace" })).toBeVisible();

  const refreshButton = page.getByRole("button", { name: "Refresh clinical queue" });
  await refreshButton.click();
  const openEncounterButton = page.getByRole("button", { name: /Open encounter for queue token \d+/ });
  await expect(openEncounterButton).toBeVisible();
  await page.keyboard.press("Tab");

  await expect(openEncounterButton).toBeFocused();
  const focus = await openEncounterButton.evaluate(element => ({
    style: getComputedStyle(element).outlineStyle,
    width: getComputedStyle(element).outlineWidth
  }));
  expect(focus.style).toBe("solid");
  expect(focus.width).toBe("3px");

  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Consultation note" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /I have verified the patient identity/ })).toBeVisible();
});

test("reception can call a waiting token and start consultation using the keyboard", async ({ page }) => {
  await installSession(page);
  await installApi(page, true, "Waiting");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Reception workspace" })).toBeVisible();
  await page.getByRole("link", { name: "Queue" }).click();

  const department = page.locator("#queue-department");
  await expect(department).toBeVisible();
  await department.selectOption(departmentId);
  await page.getByRole("button", { name: "Refresh queue" }).click();

  const call = page.getByRole("button", { name: "Call" });
  await expect(call).toBeVisible();
  await call.focus();
  await expect(call).toBeFocused();
  const callFocus = await call.evaluate(element => getComputedStyle(element).outlineWidth);
  expect(callFocus).toBe("3px");
  await page.keyboard.press("Enter");
  await expect(page.locator(".queue-status-called")).toBeVisible();

  const start = page.getByRole("button", { name: "Start consultation" });
  await expect(start).toBeVisible();
  await start.focus();
  await expect(start).toBeFocused();
  const startFocus = await start.evaluate(element => getComputedStyle(element).outlineWidth);
  expect(startFocus).toBe("3px");
  await page.keyboard.press("Enter");
  await expect(page.locator(".queue-status-inprogress")).toBeVisible();
});

test("reception can complete duplicate review and patient MRN registration using the keyboard", async ({ page }) => {
  await installSession(page);
  await installApi(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Reception workspace" })).toBeVisible();

  const givenName = page.getByLabel("Given name *");
  await givenName.focus();
  await page.keyboard.type("Asha");
  const middleName = page.getByLabel("Middle name");
  await middleName.focus();
  await page.keyboard.type("R.");
  const familyName = page.getByLabel("Family name");
  await familyName.focus();
  await page.keyboard.type("Patil");
  const dateOfBirth = page.getByLabel("Date of birth (if known)");
  await dateOfBirth.focus();
  await page.keyboard.type("1990-04-12");

  const duplicateCheck = page.getByRole("button", { name: "Check for possible duplicates" });
  await duplicateCheck.focus();
  const focus = await duplicateCheck.evaluate(element => ({
    style: getComputedStyle(element).outlineStyle,
    width: getComputedStyle(element).outlineWidth
  }));
  expect(focus.style).toBe("solid");
  expect(focus.width).toBe("3px");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Duplicate review completed")).toBeVisible();

  const acknowledgment = page.getByRole("checkbox", { name: /I reviewed the result/ });
  await acknowledgment.focus();
  await page.keyboard.press("Space");
  await expect(acknowledgment).toBeChecked();

  const register = page.getByRole("button", { name: "Register patient" });
  await register.focus();
  await expect(register).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText(/MRN CC000001 was assigned/)).toBeVisible();
});

test("hospital overview stays readable without horizontal overflow on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installSession(page);
  const api = await installApi(page, true);
  api.setPermissions([
    ...receptionPermissions,
    "appointment.read",
    "billing.report.read"
  ]);

  // The shared OPD fixture handles authentication, hospital context and queue
  // requests. Add only the dashboard-specific read endpoints for this scenario.
  await page.route("https://api.test/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === hospitalPath + "/appointments") {
      return json(route, { items: [], page: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
    }
    if (request.method() === "GET" && url.pathname === hospitalPath + "/billing/reports/daily-collection") {
      return json(route, {
        businessDate: "2026-11-26",
        timeZoneId: "Asia/Kolkata",
        totalCollected: 2500,
        byMethod: { Cash: 1500, UPI: 1000 },
        paymentCount: 5
      });
    }
    return route.fallback();
  });

  await page.goto("/#overview");
  await expect(page.getByRole("heading", { name: "Today at a glance" })).toBeVisible();
  await expect(page.getByText("₹2,500")).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    mainWidth: document.querySelector("main")?.getBoundingClientRect().width ?? 0,
    sidebarWidth: document.querySelector("aside")?.getBoundingClientRect().width ?? 0,
    metricColumns: getComputedStyle(document.querySelector(".overview-metrics")!).gridTemplateColumns
  }));

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.mainWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.sidebarWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.metricColumns.trim().split(/\\s+/)).toHaveLength(1);
});
