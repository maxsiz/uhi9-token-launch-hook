import { defineConfig, devices } from "@playwright/test";
import { loadEnvLocal } from "./e2e/env";

// Load throwaway test key (.env.local) before workers fork, and force injected() (not the dev mock).
loadEnvLocal();
delete process.env.NEXT_PUBLIC_DEV_BURNER_ADDRESS;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./e2e/global-setup.ts",
  timeout: 240_000, // real on-chain txs on Unichain Sepolia
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
