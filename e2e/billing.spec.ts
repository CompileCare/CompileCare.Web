import { expect, test, type Page, type Route } from "@playwright/test";

const tenantId = "10000000-0000-4000-8000-000000000001";
const hospitalId = "20000000-0000-4000-8000-000000000001";
const departmentId = "30000000-0000-4000-8000-000000000001";
const queueEntryId = "40000000-0000-4000-8000-000000000001";
const patientId = "50000000-0000-4000-8000-000000000001";
const serviceItemId = "60000000-0000-4000-8000-000000000001";
const invoiceId = "70000000-0000-4000-8000-000000000001";
const paymentId = "80000000-0000-4000-8000-000000000001";
const hospitalPath = "/api/v1/hospitals/" + hospitalId;
const visitInvoicePath = hospitalPath + "/billing/visits/" + queueEntryId + "/invoice";
const invoicePath = hospitalPath + "/billing/invoices";
const paymentsPath = invoicePath + "/" + invoiceId + "/payments";
const receiptPath = hospitalPath + "/billing/payments/" + paymentId + "/receipt";

const billingPermissions = [
  "billing.invoice.read",
  "billing.invoice.manage",
  "billing.payment.manage",
  "billing.catalogue.manage",
  "billing.report.read"
];

type FakePayment = {
  id: string;
  invoiceId: string;
  receiptNumber: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAtUtc: string;
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "http://127.0.0.1:4174" },
    body: JSON.stringify(body)
  });
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ storageKey, storedUser }) => {
    sessionStorage.setItem(storageKey, JSON.stringify(storedUser));
    const printableWindow = window as Window & { __compileCarePrintCount?: number };
    printableWindow.__compileCarePrintCount = 0;
    window.print = () => {
      printableWindow.__compileCarePrintCount = (printableWindow.__compileCarePrintCount ?? 0) + 1;
    };
  }, {
    storageKey: "oidc.user:https://identity.test:compilecare-web",
    storedUser: {
      id_token: "isolated-e2e-id-token",
      access_token: "isolated-e2e-access-token",
      token_type: "Bearer",
      scope: "openid profile",
      profile: {
        sub: "e2e-billing-cashier",
        name: "E2E Billing Cashier"
      },
      expires_at: 4102444800
    }
  });
}

async function installApiMocks(page: Page, permissions: string[] = billingPermissions) {
  let invoice: Record<string, unknown> | null = null;
  const payments: FakePayment[] = [];
  const serviceItem = {
    id: serviceItemId,
    hospitalId,
    code: "OPD-CONSULT",
    name: "OPD Consultation",
    category: "Consultation",
    unitPrice: 500,
    isActive: true
  };
  const visit = {
    id: queueEntryId,
    hospitalId,
    departmentId,
    queueDateLocal: "2026-11-25",
    tokenNumber: 12,
    status: "Completed",
    checkedInAtUtc: "2026-11-25T09:00:00Z",
    calledAtUtc: "2026-11-25T09:02:00Z",
    startedAtUtc: "2026-11-25T09:05:00Z",
    completedAtUtc: "2026-11-25T09:20:00Z"
  };

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

    if (method === "GET" && path === hospitalPath + "/billing/service-items") {
      return json(route, [serviceItem]);
    }

    if (method === "GET" && path === hospitalPath + "/queue") {
      return json(route, {
        items: [visit],
        page: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (path === visitInvoicePath && method === "GET") {
      if (!invoice) {
        return json(route, { title: "Visit invoice not found", detail: "Invoice not found", status: 404 }, 404);
      }
      return json(route, invoice);
    }

    if (path === invoicePath && method === "POST") {
      invoice = {
        id: invoiceId,
        hospitalId,
        queueEntryId,
        patientId,
        invoiceNumber: "INV-E2E-0001",
        issuedAtUtc: "2026-11-25T09:21:00Z",
        status: "Issued",
        subtotal: 500,
        amountPaid: 0,
        balanceDue: 500,
        lines: [{
          id: "90000000-0000-4000-8000-000000000001",
          serviceCode: "OPD-CONSULT",
          description: "OPD Consultation",
          quantity: 1,
          unitPrice: 500,
          lineTotal: 500
        }]
      };
      return json(route, invoice, 201);
    }

    if (path === paymentsPath && method === "GET") {
      return json(route, payments);
    }

    if (path === paymentsPath && method === "POST") {
      const body = request.postDataJSON() as { amount: number; method: string; reference: string | null };
      const payment: FakePayment = {
        id: paymentId,
        invoiceId,
        receiptNumber: "RCT-E2E-0001",
        amount: body.amount,
        method: body.method,
        reference: body.reference,
        paidAtUtc: "2026-11-25T09:22:00Z"
      };
      payments.push(payment);
      invoice = {
        ...(invoice ?? {}),
        status: body.amount === 500 ? "Paid" : "PartiallyPaid",
        amountPaid: body.amount,
        balanceDue: Math.max(0, 500 - body.amount)
      };
      return json(route, payment, 201);
    }

    if (path === receiptPath && method === "GET") {
      const payment = payments.find(item => item.id === paymentId);
      if (!payment) return json(route, { title: "Receipt not found", status: 404 }, 404);
      return json(route, {
        receiptNumber: payment.receiptNumber,
        invoiceNumber: "INV-E2E-0001",
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
}

test("cashier issues an invoice, records payment, reloads and reprints the receipt", async ({ page }) => {
  await installAuthenticatedSession(page);
  await installApiMocks(page);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Billing" })).toBeVisible();
  await page.getByRole("link", { name: "Billing" }).click();

  await expect(page.getByRole("heading", { name: "OPD billing and settlement" })).toBeVisible();
  await expect(page.getByText("OPD Consultation")).toBeVisible();

  await page.getByRole("button", { name: "Load billable visits" }).click();
  await page.getByLabel("In-progress or completed visit").selectOption(queueEntryId);
  await page.getByRole("spinbutton", { name: "Quantity for OPD Consultation" }).fill("1");
  await page.getByRole("button", { name: "Issue invoice" }).click();

  await expect(page.getByRole("heading", { name: "INV-E2E-0001" })).toBeVisible();
  await page.getByLabel("Amount (INR)").fill("500");
  await page.getByLabel("Method").selectOption("UPI");
  await page.getByLabel("Reference (optional)").fill("E2E-UPI-001");
  await page.getByRole("button", { name: "Record payment" }).click();

  await expect(page.getByText("Invoice fully settled.")).toBeVisible();
  await expect(page.locator(".billing-receipt").getByText("RCT-E2E-0001")).toBeVisible();
  await expect(page.locator(".invoice-status")).toHaveText("Paid");

  await page.reload();
  await expect(page.getByRole("link", { name: "Billing" })).toBeVisible();
  await page.getByRole("link", { name: "Billing" }).click();
  await page.getByRole("button", { name: "Load billable visits" }).click();
  await page.getByLabel("In-progress or completed visit").selectOption(queueEntryId);

  await expect(page.getByRole("heading", { name: "INV-E2E-0001" })).toBeVisible();
  await expect(page.locator(".invoice-status")).toHaveText("Paid");
  await expect(page.getByRole("heading", { name: "Payment history" })).toBeVisible();
  await expect(page.getByText("RCT-E2E-0001")).toBeVisible();
  await expect(page.getByRole("button", { name: "Issue invoice" })).toHaveCount(0);

  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(page.getByText("PAYMENT RECEIPT")).toBeVisible();
  await expect(page.getByText("Reference: E2E-UPI-001")).toBeVisible();
  await page.getByRole("button", { name: "Print receipt" }).click();
  const printCount = await page.evaluate(() =>
    (window as Window & { __compileCarePrintCount?: number }).__compileCarePrintCount ?? 0
  );
  expect(printCount).toBe(1);
});

test("a membership without billing permissions does not expose the billing workspace", async ({ page }) => {
  await installAuthenticatedSession(page);
  await installApiMocks(page, ["queue.read"]);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hospital workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Billing" })).toHaveCount(0);
  await expect(page.locator("#billing")).toHaveCount(0);
});
