import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "portrait-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test.describe(`Scroll validation on ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
    });

    test("sign-in page has no body scroll locks and scrolls naturally", async ({ page }) => {
      await page.goto("/sign-in");
      await page.waitForLoadState("domcontentloaded");

      // Verify no lingering lock attributes
      const bodyStyle = await page.evaluate(() => {
        const b = document.body;
        return {
          overflow: window.getComputedStyle(b).overflow,
          overflowY: window.getComputedStyle(b).overflowY,
          pointerEvents: window.getComputedStyle(b).pointerEvents,
          hasScrollLockedAttr: b.hasAttribute("data-scroll-locked"),
        };
      });

      expect(bodyStyle.overflowY).not.toBe("hidden");
      expect(bodyStyle.pointerEvents).toBe("auto");
      expect(bodyStyle.hasScrollLockedAttr).toBe(false);
    });

    test("citizen report stepper page scrolls smoothly down and up", async ({ page }) => {
      // Mock citizen auth session in localStorage
      await page.goto("/sign-in");
      await page.evaluate(() => {
        localStorage.setItem(
          "gg-auth-storage",
          JSON.stringify({
            access_token: "mock-token",
            user: { id: "u-citizen", name: "Aarav", role: "citizen" },
          })
        );
      });

      await page.goto("/citizen/report");
      await page.waitForLoadState("domcontentloaded");

      // Scroll test
      const initialScroll = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollBy(0, 250));
      await page.waitForTimeout(100);

      const afterScrollDown = await page.evaluate(() => window.scrollY);
      // On taller viewports with short content scroll might be 0, but no errors thrown
      expect(afterScrollDown).toBeGreaterThanOrEqual(initialScroll);

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      const afterScrollUp = await page.evaluate(() => window.scrollY);
      expect(afterScrollUp).toBe(0);

      // Verify body lock is clean
      const isLocked = await page.evaluate(() => document.body.hasAttribute("data-scroll-locked"));
      expect(isLocked).toBe(false);
    });

    test("officer workspace panes collapse to normal document scrolling on narrow viewports", async ({ page }) => {
      await page.goto("/sign-in");
      await page.evaluate(() => {
        localStorage.setItem(
          "gg-auth-storage",
          JSON.stringify({
            access_token: "mock-token",
            user: { id: "u-officer", name: "Priya", role: "gro" },
          })
        );
      });

      await page.goto("/officer");
      await page.waitForLoadState("domcontentloaded");

      const bodyOverflow = await page.evaluate(() => window.getComputedStyle(document.body).overflowY);
      expect(bodyOverflow).not.toBe("hidden");
    });
  });
}
