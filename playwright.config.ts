import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load the same env the app uses.
dotenv.config({ path: ".env.local" });

const PORT = 3000;
const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${PORT}`;
// When pointed at a deployed URL, don't spin up the local dev server.
const isLocal = baseURL.includes("localhost");

export default defineConfig({
  testDir: "./tests",
  // Serial: these tests mutate shared subscription state for a user and must
  // run in order within a file.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: isLocal
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
