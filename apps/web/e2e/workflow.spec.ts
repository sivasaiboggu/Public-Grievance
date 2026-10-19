import { test, expect } from "@playwright/test";

test("citizen submits; GRO reviews; citizen sees the same record", async ({browser}) => {
  const citizenContext = await browser.newContext();
  const citizen = await citizenContext.newPage();
  await citizen.goto("/");
  await citizen.getByRole("button", {name: "New citizen? Create account"}).click();
  await citizen.getByLabel("Your name").fill("E2E citizen");
  await citizen.getByLabel("Email", {exact: true}).fill(`citizen.${Date.now()}@example.com`);
  await citizen.getByLabel("Password", {exact: true}).fill("e2e-citizen-password-only");
  await citizen.getByRole("button", {name: "Create account and sign in"}).click();
  await expect(citizen.getByRole("heading", {name: "Your civic complaints"})).toBeVisible();
  await citizen.getByLabel("Title", {exact: true}).fill("Pothole outside college gate");
  await citizen.getByLabel("Describe the problem").fill("There is a visible pothole beside the public road outside the college gate.");
  await citizen.getByLabel("Location / landmark").fill("College main gate, left side");
  await citizen.getByLabel("Latitude", {exact: true}).fill("9.85");
  await citizen.getByLabel("Longitude", {exact: true}).fill("76.9");
  await citizen.getByRole("button", {name: "Submit complaint", exact: true}).click();
  await expect(citizen.locator(".tracking")).toContainText("GG-");
  const tracking = (await citizen.locator(".tracking").innerText()).trim();
  await expect(citizen.getByText("Disabled · manual officer review", {exact: true})).toBeVisible();

  const officerContext = await browser.newContext();
  const officer = await officerContext.newPage();
  await officer.goto("/");
  await officer.getByLabel("Email", {exact: true}).fill("gro.e2e@example.com");
  await officer.getByLabel("Password", {exact: true}).fill("e2e-local-only-password");
  await officer.getByRole("button", {name: "Sign in", exact: true}).click();
  await expect(officer.getByRole("heading", {name: "Complaint review desk"})).toBeVisible();
  await officer.getByLabel("Tracking ID", {exact: true}).fill(tracking);
  await officer.getByRole("button", {name: "Look up", exact: true}).click();
  await officer.getByLabel("Reason / update").fill("Accepted for inspection by the municipal roads team.");
  await officer.getByRole("button", {name: "Save officer update"}).click();
  await expect(officer.getByRole("status")).toHaveText("Officer update saved.");
  await citizen.getByRole("button", {name: "Refresh record"}).click();
  await expect(citizen.locator(".timeline")).toContainText("Accepted for inspection by the municipal roads team.");
  await expect(citizen.locator(".reports .badge")).toHaveText("under review");
  await citizen.screenshot({path: "test-results/citizen-updated.png", fullPage: true});
  await officer.screenshot({path: "test-results/officer-updated.png", fullPage: true});
  await citizenContext.close(); await officerContext.close();
});

test("sign-in page fits a phone viewport", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/");
  await expect(page.getByRole("heading", {name: "Sign in", exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({path: "test-results/mobile-web-signin.png", fullPage: true});
});
