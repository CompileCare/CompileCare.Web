import { expect, test } from "@playwright/test";

test("keyboard users can reach sign-in with a visible focus indicator", async ({ page }) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  const signIn = page.getByRole("button", { name: "Sign in" });
  await page.keyboard.press("Tab");

  // The skip link is intentionally the first keyboard stop in the shell.
  await expect(skipLink).toBeFocused();
  const outlineStyle = await skipLink.evaluate(element => getComputedStyle(element).outlineStyle);
  expect(outlineStyle).not.toBe("none");

  await page.keyboard.press("Tab");
  await expect(signIn).toBeFocused();
});

test("workspace does not overflow at narrow tablet and mobile widths", async ({ page }) => {
  for (const width of [768, 375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }));

    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test("skip link moves keyboard focus to the main workspace landmark", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  const main = page.getByRole("main");
  await expect(main).toBeFocused();
  await expect(main).toHaveAttribute("id", "workspace-main");
});

test("public workspace exposes a single main landmark and one level-one heading", async ({ page }) => {
  await page.goto("/");

  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(main.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("public workspace controls and images expose accessible names and labels", async ({ page }) => {
  await page.goto("/");

  const unnamedControls = await page.locator("button, a[href]").evaluateAll(elements =>
    elements
      .filter(element =>
        !element.getAttribute("aria-label") &&
        !element.getAttribute("aria-labelledby") &&
        !element.getAttribute("title") &&
        !(element.textContent ?? "").trim()
      )
      .map(element => element.outerHTML.slice(0, 180))
  );
  expect(unnamedControls, "interactive controls must have an accessible name").toEqual([]);

  const unlabeledFields = await page.locator("input, select, textarea").evaluateAll(elements =>
    elements
      .filter(element =>
        !((element as HTMLInputElement).labels?.length) &&
        !element.getAttribute("aria-label") &&
        !element.getAttribute("aria-labelledby")
      )
      .map(element => element.outerHTML.slice(0, 180))
  );
  expect(unlabeledFields, "form fields must have an associated label").toEqual([]);

  await expect(page.locator("img:not([alt])"), "images must declare alternative text").toHaveCount(0);
});

test("forced-colors preference preserves visible focus on navigation and an interactive control", async ({ page, browserName }) => {
  test.skip(
    browserName !== "chromium",
    "Playwright forced-colors emulation is Chromium-only; native Windows High Contrast remains a manual acceptance check."
  );
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");

  const forcedColorsActive = await page.evaluate(() =>
    window.matchMedia("(forced-colors: active)").matches
  );
  expect(forcedColorsActive).toBe(true);

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  const signIn = page.getByRole("button", { name: "Sign in" });

  // The skip link is the first keyboard stop in the shell.
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();

  const skipLinkStyle = await skipLink.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor
    };
  });
  expect(skipLinkStyle.outlineStyle).not.toBe("none");
  expect(skipLinkStyle.outlineWidth).toBeGreaterThan(0);
  expect(skipLinkStyle.outlineColor).not.toBe("rgba(0, 0, 0, 0)");

  // Verify the same forced-colors focus treatment reaches a real action control.
  await page.keyboard.press("Tab");
  await expect(signIn).toBeFocused();

  const signInStyle = await signIn.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor
    };
  });
  expect(signInStyle.outlineStyle).not.toBe("none");
  expect(signInStyle.outlineWidth).toBeGreaterThan(0);
  expect(signInStyle.outlineColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("reduced-motion preference suppresses nonessential transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const transitionDurations = await page.locator("body *").evaluateAll(elements =>
    elements.map(element => {
      const duration = getComputedStyle(element).transitionDuration.split(",")[0].trim();
      return Number.parseFloat(duration) || 0;
    })
  );

  expect(Math.max(0, ...transitionDurations)).toBeLessThanOrEqual(0.001);
});
