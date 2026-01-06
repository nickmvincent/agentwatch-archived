import { defineConfig, devices } from "@playwright/test";

const testTarget = process.env.TEST_TARGET;
const isLegacyDashboard = testTarget === "web";
const isAnalyzer = testTarget === "analyzer";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "./e2e/test-results",
  fullyParallel: false, // Run sequentially for screenshot consistency
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for screenshot tests
  reporter: [["html"], ["list"]],
  // Increase timeouts for CI environments
  timeout: process.env.CI ? 60000 : 30000,
  expect: {
    timeout: process.env.CI ? 10000 : 5000
  },
  use: {
    trace: "on-first-retry",
    screenshot: "on",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    // Increase action timeout for CI
    actionTimeout: process.env.CI ? 15000 : 10000
  },
  projects: [
    {
      name: "pages",
      testMatch: /contrib-flow\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4321"
      }
    },
    {
      name: "watcher",
      testMatch: /dashboard.*\.spec\.ts|cross-app.*watcher.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:8420"
      }
    },
    {
      name: "analyzer",
      testMatch: /analyzer.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:8421"
      }
    },
    {
      name: "cross-app",
      testMatch: /cross-app\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"]
        // No baseURL - tests specify full URLs for cross-app testing
      }
    }
  ],
  webServer: isAnalyzer
    ? {
        command: "bun packages/cli/src/bin.ts analyze --headless --port 8421",
        port: 8421,
        reuseExistingServer: true,
        timeout: 30000
      }
    : isLegacyDashboard
      ? {
          // Legacy dashboard tests run against the deprecated daemon server.
          command: "bun run dev:daemon",
          port: 8420,
          reuseExistingServer: true,
          timeout: 30000
        }
      : {
          command: "cd pages && bun run preview",
          port: 4321,
          reuseExistingServer: !process.env.CI,
          timeout: 120000
        }
});
