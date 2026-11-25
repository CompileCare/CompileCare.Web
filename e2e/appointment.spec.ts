import { expect, test, type Page, type Route } from "@playwright/test";

const tenantId = "12000000-0000-4000-8000-000000000001";
const hospitalId = "23000000-0000-4000-8000-000000000001";
const departmentId = "34000000-0000-4000-8000-000000000001";
const patientId = "45000000-0000-4000-8000-000000000001";
const sessionId = "56000000-0000-4000-8000-000000000001";
const appointmentId = "67000000-0000-4000-8000-000000000001";
const queueEntryId = "78000000-0000-4000-8000-000000000001";
const hospitalPath = "/api/v1/hospitals/" + hospitalId;
const appointmentPath = hospitalPath + "/appointments";
const availabilityPath = hospitalPath + "/availability-sessions";
const queueEntry = {
  id: queueEntryId,
  hospitalId,
  departmentId,
  queueDateLocal: "2026-11-25",
  tokenNumber: 21,
  status: "Waiting",
  checkedInAtUtc: "2026-11-25T10:00:00Z",
  calledAtUtc: null,
  startedAtUtc: null,
  completedAtUtc: null
};

const permissions = [
  "facility.read",
  "patient.read",
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
      id_token: "isolated-appointment-e2e-id-token",
      access_token: "isolated-appointment-e2e-access-token",
      token_type: "Bearer",
      scope: "openid profile",
      profile: { sub: "appointment-cashier", name: "Appointment Test User" },
      expires_at: 4102444800
    }
  });
}

test("reception searches a patient, books an appointment and checks in to the server-issued queue token", async ({ page }) => {
  await installSession(page);
  let appointmentCreated = false;
  let checkedIn = false;
  let bookingAttempts = 0;
  let slotReads = 0;
  const now = new Date(Date.now() + 60 * 60 * 1000);
  const startsAtUtc = now.toISOString();
  const firstSlotEndUtc = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const secondSlotStartUtc = firstSlotEndUtc;
  const endsAtUtc = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

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
          role: "PatientRegistrar",
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
        items: [{
          id: patientId,
          givenName: "Asha",
          middleName: "R.",
          familyName: "Patil",
          dateOfBirth: "1990-04-12",
          hospitalId,
          registeredAtUtc: "2026-11-25T08:55:00Z"
        }],
        page: 1,
        pageSize: 25,
        totalCount: 1,
        totalPages: 1
      });
    }

    if (method === "GET" && path === availabilityPath) {
      const localDate = url.searchParams.get("date") ?? "2026-11-25";
      return json(route, {
        items: [{
          id: sessionId,
          hospitalId,
          departmentId,
          providerStaffId: "89000000-0000-4000-8000-000000000001",
          localDate,
          startsAtUtc,
          endsAtUtc,
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
      slotReads += 1;
      if (slotReads === 1) {
        return json(route, [{ startsAtUtc, endsAtUtc: firstSlotEndUtc, isAvailable: true }]);
      }
      return json(route, [
        { startsAtUtc, endsAtUtc: firstSlotEndUtc, isAvailable: false },
        { startsAtUtc: secondSlotStartUtc, endsAtUtc, isAvailable: true }
      ]);
    }

    if (method === "POST" && path === appointmentPath) {
      const body = request.postDataJSON() as {
        availabilitySessionId: string;
        patientId: string;
        slotStartsAtUtc: string;
        reason: string | null;
      };
      bookingAttempts += 1;
      if (bookingAttempts === 1) {
        return json(route, {
          type: "https://compilecare.in/problems/slot-unavailable",
          title: "Appointment slot unavailable",
          detail: "The selected slot was just booked by another patient.",
          status: 409
        }, 409);
      }
      appointmentCreated = true;
      return json(route, {
        id: appointmentId,
        hospitalId,
        departmentId,
        patientId: body.patientId,
        providerStaffId: "89000000-0000-4000-8000-000000000001",
        availabilitySessionId: body.availabilitySessionId,
        slotStartsAtUtc: body.slotStartsAtUtc,
        slotEndsAtUtc: body.slotStartsAtUtc === startsAtUtc ? firstSlotEndUtc : endsAtUtc,
        status: "Booked",
        reason: body.reason,
        createdAtUtc: new Date().toISOString(),
        rescheduledFromAppointmentId: null
      }, 201);
    }

    if (method === "POST" && path === appointmentPath + "/" + appointmentId + "/check-in") {
      checkedIn = true;
      return json(route, queueEntry);
    }

    if (method === "GET" && path === hospitalPath + "/queue") {
      return json(route, {
        items: checkedIn ? [queueEntry] : [],
        page: 1,
        pageSize: 50,
        totalCount: checkedIn ? 1 : 0,
        totalPages: checkedIn ? 1 : 0
      });
    }

    return json(route, {
      title: "Unexpected test API request",
      detail: method + " " + path + " is not mocked by the appointment browser test",
      status: 501
    }, 501);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Reception workspace" })).toBeVisible();
  await page.getByLabel("Patient name").fill("Asha");
  await page.getByRole("button", { name: "Search patients" }).click();
  const patientResult = page.locator(".patient-result-selectable");
  await expect(patientResult).toHaveCount(1);
  await expect(patientResult.getByText("Asha R. Patil")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(patientResult).toBeFocused();
  const patientFocus = await patientResult.evaluate(element => getComputedStyle(element).outlineWidth);
  expect(patientFocus).toBe("3px");
  await page.keyboard.press("Enter");
  await expect(patientResult).toHaveAttribute("aria-pressed", "true");

  const findAvailability = page.getByRole("button", { name: "Find available appointments" });
  await findAvailability.focus();
  await page.keyboard.press("Enter");
  const providerAvailability = page.getByLabel("Provider availability");
  await expect(providerAvailability).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(providerAvailability).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  const slots = page.getByRole("group", { name: "Available appointment slots" });
  await expect(slots.getByRole("button")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(slots.getByRole("button").first()).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.locator(".booking-review").getByText("Review appointment")).toBeVisible();
  const visitReason = page.getByLabel("Visit reason (optional)");
  await page.keyboard.press("Tab");
  await expect(visitReason).toBeFocused();
  await page.keyboard.type("Initial consultation");
  const confirmBooking = page.getByRole("button", { name: "Confirm appointment" });
  await page.keyboard.press("Tab");
  await expect(confirmBooking).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText(/That time was just booked or is no longer available/)).toBeVisible();
  await expect(slots.getByRole("button")).toHaveCount(2);
  await expect(slots.getByRole("button").nth(0)).toBeDisabled();
  await expect(slots.getByRole("button").nth(1)).toBeEnabled();
  await slots.getByRole("button").nth(1).focus();
  await page.keyboard.press("Enter");
  await confirmBooking.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator(".arrival-success").getByText("Appointment confirmed")).toBeVisible();
  expect(bookingAttempts).toBe(2);
  expect(appointmentCreated).toBe(true);

  const checkInButton = page.getByRole("button", { name: "Check in patient" });
  await checkInButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".token-card")).toContainText("21");
  await expect(page.locator(".token-card")).toContainText("Waiting");
  expect(checkedIn).toBe(true);
});
