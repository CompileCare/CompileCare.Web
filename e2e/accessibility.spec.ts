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
