import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", timeout: 60000, fullyParallel: false, workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {baseURL: "http://localhost:3000", trace: "retain-on-failure"},
});
