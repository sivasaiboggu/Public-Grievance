import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ARTIFACT_DIR = "C:/Users/HP/.gemini/antigravity-ide/brain/a3be4d53-bc74-488f-9ebf-1ffd4eb07a25/scratch";
const LOCAL_DIR = "test-results/audit";

fs.mkdirSync(LOCAL_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function saveScreenshot(page, filename) {
  const localPath = path.join(LOCAL_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  try {
    await page.screenshot({ path: localPath });
  } catch (e) {
    console.warn(`Retry standard screenshot for ${filename}:`, e.message);
    await page.screenshot({ path: localPath });
  }
  fs.copyFileSync(localPath, artifactPath);
  console.log(`Saved screenshot: ${filename}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Audit Sign-in across viewports
    const viewports = [
      { name: "desktop_1440", width: 1440, height: 900 },
      { name: "desktop_1024", width: 1024, height: 768 },
      { name: "tablet_768", width: 768, height: 1024 },
      { name: "mobile_390", width: 390, height: 844 },
      { name: "mobile_360", width: 360, height: 780 },
    ];

    for (const vp of viewports) {
      // Light Mode
      const contextLight = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: "light",
      });
      const pageLight = await contextLight.newPage();
      await pageLight.goto("http://127.0.0.1:3000");
      await pageLight.waitForSelector(".auth-container");
      await pageLight.waitForTimeout(300);
      await saveScreenshot(pageLight, `signin_${vp.name}_light.png`);
      await contextLight.close();

      // Dark Mode
      const contextDark = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: "dark",
      });
      const pageDark = await contextDark.newPage();
      await pageDark.goto("http://127.0.0.1:3000");
      await pageDark.waitForSelector(".auth-container");
      await pageDark.waitForTimeout(300);
      await saveScreenshot(pageDark, `signin_${vp.name}_dark.png`);
      await contextDark.close();
    }

    // 2. Test Citizen Sign-in and Workspace Flow
    const citizenContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
    });
    const citizenPage = await citizenContext.newPage();
    await citizenPage.goto("http://127.0.0.1:3000");

    await citizenPage.selectOption('select[aria-label="Select test account"]', "citizen@grievancegrid.test");
    await citizenPage.click('button[type="submit"]');

    await citizenPage.waitForSelector("text=Citizen Reporting");
    console.log("Citizen sign-in successful!");
    await citizenPage.waitForTimeout(1000);
    await saveScreenshot(citizenPage, "citizen_workspace_desktop.png");

    await citizenContext.close();

    // 3. Test Officer Sign-in and Queue Flow
    const officerContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
    });
    const officerPage = await officerContext.newPage();
    await officerPage.goto("http://127.0.0.1:3000");

    await officerPage.selectOption('select[aria-label="Select test account"]', "officer@grievancegrid.test");
    await officerPage.click('button[type="submit"]');

    await officerPage.waitForSelector("text=Officer Review (GRO)");
    console.log("Officer sign-in successful!");
    await officerPage.waitForTimeout(1000);
    await saveScreenshot(officerPage, "officer_workspace_desktop.png");

    // Switch to Senior Dashboard
    await officerPage.click("text=Executive Metrics");
    await officerPage.waitForTimeout(600);
    await saveScreenshot(officerPage, "executive_metrics_desktop.png");

    // Switch to Field Operations
    await officerPage.click("text=Field Operations");
    await officerPage.waitForTimeout(600);
    await saveScreenshot(officerPage, "field_operations_desktop.png");

    // Switch to Administration
    await officerPage.click("text=Administration");
    await officerPage.waitForTimeout(600);
    await saveScreenshot(officerPage, "administration_desktop.png");

    await officerContext.close();

    // 4. Test Mobile Authenticated View (390px)
    const mobileAuthContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    const mobilePage = await mobileAuthContext.newPage();
    await mobilePage.goto("http://127.0.0.1:3000");

    await mobilePage.selectOption('select[aria-label="Select test account"]', "citizen@grievancegrid.test");
    await mobilePage.click('button[type="submit"]');

    await mobilePage.waitForSelector("text=Citizen Reporting");
    await mobilePage.waitForTimeout(1000);
    await saveScreenshot(mobilePage, "citizen_workspace_mobile_390.png");
    await mobileAuthContext.close();

    console.log("All visual audit checks completed successfully!");
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error("Audit error:", e);
  process.exit(1);
});
