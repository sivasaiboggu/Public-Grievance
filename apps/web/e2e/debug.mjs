import { chromium } from "@playwright/test";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("requestfailed", (req) =>
    console.log("REQ FAILED:", req.url(), req.failure()?.errorText)
  );
  page.on("response", (res) => {
    if (res.status() >= 400) {
      console.log("HTTP ERROR:", res.status(), res.url());
    }
  });

  await page.goto("http://127.0.0.1:3000");
  await page.selectOption('select[aria-label="Select test account"]', "citizen@grievancegrid.test");
  const emailVal = await page.inputValue('input[name="email"]');
  const passVal = await page.inputValue('input[name="password"]');
  console.log("Inputs populated:", { emailVal, passVal });

  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const errorEl = await page.$('[role="alert"]');
  if (errorEl) {
    console.log("ALERT TEXT:", await errorEl.innerText());
  }
  const bodyText = await page.innerText("body");
  console.log("Has Citizen Reporting?", bodyText.includes("Citizen Reporting"));
  await page.screenshot({ path: "test-results/debug_signin.png" });
  await browser.close();
})();
