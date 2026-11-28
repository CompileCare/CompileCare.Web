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
};

function loadBrowserUserManifest(): BrowserUserManifest {
  const path = process.env.HEAPCARE_BROWSER_TEST_USER_FILE;
  if (!path) {
    throw new Error("HEAPCARE_BROWSER_TEST_USER_FILE must point to the ephemeral CI user credentials file.");
  }

  return JSON.parse(readFileSync(path, "utf8")) as BrowserUserManifest;
}

async function signInWithKeycloak(
  page: import("@playwright/test").Page,
  credentials: BrowserUserCredentials
): Promise<void> {
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

const authenticatedRoleCases = [
  { name: "HospitalAdmin", identity: "shared", tenant: "tenantAId" },
  { name: "FacilityManager", identity: "facility-manager", tenant: "tenantAId" },
  { name: "FacilityViewer", identity: "shared", tenant: "tenantBId" },
  { name: "PatientRegistrar", identity: "patient-registrar", tenant: "tenantAId" },
  { name: "ClinicalUser", identity: "clinical-user", tenant: "tenantAId" },
  { name: "PlatformOperator", identity: "platform" }
] as const;

for (const roleCase of authenticatedRoleCases) {
  test("real Keycloak " + roleCase.name + " workspace meets the authenticated shell accessibility baseline", async ({ page, browserName }) => {
    const manifest = loadBrowserUserManifest();
    const credentials = manifest.users?.[roleCase.identity];
    expect(credentials?.username, roleCase.name + " synthetic username must be provisioned").toBeTruthy();
    expect(credentials?.password, roleCase.name + " synthetic password must be provisioned").toBeTruthy();

    await signInWithKeycloak(page, credentials!);

    if ("tenant" in roleCase) {
      const tenantId = manifest[roleCase.tenant];
      expect(tenantId, roleCase.name + " tenant fixture must be provisioned").toBeTruthy();
      const tenantSelect = page.locator("#tenant-select");
      await expect(tenantSelect).toBeVisible();
      await expect(tenantSelect.locator("option[value='" + tenantId + "']")).toHaveCount(1);
      await tenantSelect.selectOption(tenantId!);
      await expect(tenantSelect).toHaveValue(tenantId!);

      const hospitalId = roleCase.tenant === "tenantAId" ? manifest.hospitalAId : manifest.hospitalBId;
      expect(hospitalId, roleCase.name + " hospital fixture must be provisioned").toBeTruthy();
      await expect(page.locator("#hospital-select")).toHaveValue(hospitalId!);
    }

    const documentLanguage = await page.locator("html").getAttribute("lang");
    expect(documentLanguage?.trim(), roleCase.name + " document must declare its content language").toBeTruthy();

    const duplicateIds = await page.locator("[id]").evaluateAll(elements => {
      const counts = new Map<string, number>();
      for (const element of elements) {
        const id = element.id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
    });
    expect(duplicateIds, roleCase.name + " document IDs must be unique").toEqual([]);

    const brokenAriaReferences = await page.locator("[aria-labelledby], [aria-describedby]").evaluateAll(elements =>
      elements.flatMap(element =>
        ["aria-labelledby", "aria-describedby"].flatMap(attribute => {
          const value = element.getAttribute(attribute);
          if (!value) return [];
          return value.split(/\s+/).filter(Boolean)
            .filter(id => !document.getElementById(id))
            .map(id => attribute + " references missing #" + id);
        })
      )
    );
    expect(
      brokenAriaReferences,
      roleCase.name + " ARIA label and description references must resolve"
    ).toEqual([]);

    const brokenLabelTargets = await page.locator("label[for]").evaluateAll(elements =>
      elements
        .filter(element => {
          const targetId = element.getAttribute("for");
          return !targetId || !document.getElementById(targetId);
        })
        .map(element => element.outerHTML.slice(0, 180))
    );
    expect(
      brokenLabelTargets,
      roleCase.name + " explicit form label targets must resolve"
    ).toEqual([]);

    const main = page.getByRole("main");
    const missingImageAlt = await main.locator("img:visible:not([alt])").evaluateAll(elements =>
      elements.map(element => element.outerHTML.slice(0, 180))
    );
    expect(
      missingImageAlt,
      roleCase.name + " visible images must declare alt text (empty is allowed for decorative images)"
    ).toEqual([]);

    await expect(main).toHaveCount(1);
    await expect(main).toHaveAttribute("id", "workspace-main");
    await expect(main.locator("h1")).toHaveCount(1);

    // Playwright forced-colors emulation is Chromium-only. The native
    // Windows High Contrast and real assistive-technology checks remain
    // separate manual acceptance items.
    if (browserName === "chromium") {
      await page.emulateMedia({ forcedColors: "active" });
      const forcedColorsActive = await page.evaluate(() =>
        window.matchMedia("(forced-colors: active)").matches
      );
      expect(forcedColorsActive).toBe(true);
    }

    // The skip link must be the first keyboard stop after OIDC sign-in.
    // Check its forced-colors focus style, then verify activation moves focus
    // to main. This executes for each persisted Keycloak role below.
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();

    if (browserName === "chromium") {
      const focusStyle = await skipLink.evaluate(element => {
        const style = window.getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineColor: style.outlineColor
        };
      });
      expect(focusStyle.outlineStyle).not.toBe("none");
      expect(focusStyle.outlineWidth).toBeGreaterThan(0);
      expect(focusStyle.outlineColor).not.toBe("rgba(0, 0, 0, 0)");
    }

    await page.keyboard.press("Enter");
    await expect(main).toBeFocused();

    // Continue keyboard navigation into the authenticated shell. The Sign out
    // action is present for every persisted role; it must be reachable without
    // a pointer and retain a visible forced-colors focus indicator.
    const signOut = page.getByRole("button", { name: "Sign out" });
    let signOutFocused = false;
    for (let index = 0; index < 40 && !signOutFocused; index += 1) {
      await page.keyboard.press("Tab");
      signOutFocused = await signOut.evaluate(element => element === document.activeElement);
    }
    expect(signOutFocused, roleCase.name + " Sign out action must be reachable by keyboard").toBe(true);

    const signOutFocusStyle = await signOut.evaluate(element => {
      const style = window.getComputedStyle(element);
      return {
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        outlineColor: style.outlineColor
      };
    });
    expect(signOutFocusStyle.focusVisible, roleCase.name + " Sign out action must expose keyboard focus").toBe(true);
    if (browserName === "chromium") {
      expect(signOutFocusStyle.outlineStyle).not.toBe("none");
      expect(signOutFocusStyle.outlineWidth).toBeGreaterThan(0);
      expect(signOutFocusStyle.outlineColor).not.toBe("rgba(0, 0, 0, 0)");
    }

    // Check the authenticated workspace at the same narrow widths used by the
    // public shell baseline; hidden modules must not force page-level overflow.
    for (const width of [768, 375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        )
      }));

      expect(
        dimensions.document,
        roleCase.name + " authenticated workspace has horizontal overflow at " + width + "px"
      ).toBeLessThanOrEqual(dimensions.viewport);
    }

    // Run semantic checks against the real authenticated workspace rendered for
    // this persisted role, not only the public shell or a mocked permission set.
    const unnamedControls = await main.locator("button:visible, a[href]:visible").evaluateAll(elements =>
      elements
        .filter(element =>
          !element.getAttribute("aria-label") &&
          !element.getAttribute("aria-labelledby") &&
          !element.getAttribute("title") &&
          !(element.textContent ?? "").trim() &&
          !element.querySelector("img[alt]")
        )
        .map(element => element.outerHTML.slice(0, 180))
    );
    expect(
      unnamedControls,
      roleCase.name + " authenticated workspace controls must expose accessible names"
    ).toEqual([]);

    const unlabeledFields = await main.locator("input:visible, select:visible, textarea:visible").evaluateAll(elements =>
      elements
        .filter(element =>
          !((element as HTMLInputElement).labels?.length) &&
          !element.getAttribute("aria-label") &&
          !element.getAttribute("aria-labelledby")
        )
        .map(element => element.outerHTML.slice(0, 180))
    );
    expect(
      unlabeledFields,
      roleCase.name + " authenticated workspace fields must expose programmatic labels"
    ).toEqual([]);
  });
}

// Exercise the persisted role-management workspace against the real Keycloak,
// API and PostgreSQL stack. The Local fixture creates this tenant-A administrator
// before Playwright starts and removes the entire environment after the run.
test("real Keycloak HospitalAdmin can create, edit and manage a custom tenant role", async ({ page }) => {
  const manifest = loadBrowserUserManifest();
  const credentials = manifest.users?.["tenant-a-admin"];
  const tenantId = manifest.tenantAId;

  expect(credentials?.username, "tenant administrator username must be provisioned").toBeTruthy();
  expect(credentials?.password, "tenant administrator password must be provisioned").toBeTruthy();
  expect(tenantId, "tenant A fixture must be provisioned").toBeTruthy();

  await signInWithKeycloak(page, credentials!);

  const tenantSelect = page.locator("#tenant-select");
  await expect(tenantSelect.locator("option[value='" + tenantId + "']")).toHaveCount(1);
  await tenantSelect.selectOption(tenantId!);
  await expect(tenantSelect).toHaveValue(tenantId!);

  const roleNavigation = page.getByRole("link", { name: "Roles & permissions" });
  await expect(roleNavigation).toBeVisible();
  await roleNavigation.click();
  await expect(page.locator("#tenant-roles").getByRole("heading", { name: "Roles and permissions" })).toBeVisible();
  await expect(page.locator("#tenant-roles").getByText("CI Identity Reader Custom")).toBeVisible();

  const roleName = "CI Browser Role Manager";
  await page.getByRole("button", { name: "Create custom role" }).click();
  await page.getByLabel("Role name *").fill(roleName);
  await page.getByLabel("Description *").fill("Created through the real Keycloak role workspace.");
  await page.getByLabel(/View facility structure/).check();
  await page.getByLabel("Reason for this change *").fill("Verify browser-based custom role creation.");
  await page.getByRole("button", { name: "Create role" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Custom role created." })
  ).toBeVisible();
  const roleCard = page.locator("article.tenant-role-card").filter({ hasText: roleName });
  await expect(roleCard).toBeVisible();
  await expect(roleCard.locator(".membership-status")).toHaveText("Active");

  await roleCard.getByRole("button", { name: "Edit role" }).click();
  await page.getByLabel(/Create and update facilities/).check();
  await page.getByLabel("Reason for this change *").fill("Verify browser-based custom role permission update.");
  await page.getByRole("button", { name: "Save role changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Role permissions updated." })
  ).toBeVisible();
  await expect(roleCard).toContainText("Create and update facilities");

  await roleCard.getByRole("button", { name: "Deactivate" }).click();
  let confirmation = roleCard.getByRole("group", {
    name: roleName + " lifecycle confirmation"
  });
  await confirmation.getByLabel("Reason *").fill("Verify browser-based custom role deactivation.");
  await confirmation.getByRole("button", { name: "Confirm deactivation" }).click();
  await expect(roleCard.locator(".membership-status")).toHaveText("Inactive");

  await roleCard.getByRole("button", { name: "Reactivate" }).click();
  confirmation = roleCard.getByRole("group", {
    name: roleName + " lifecycle confirmation"
  });
  await confirmation.getByLabel("Reason *").fill("Verify browser-based custom role reactivation.");
  await confirmation.getByRole("button", { name: "Confirm reactivation" }).click();
  await expect(roleCard.locator(".membership-status")).toHaveText("Active");
});
