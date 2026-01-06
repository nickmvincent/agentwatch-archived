/**
 * Global setup for Playwright tests.
 * Ensures the legacy daemon is running for dashboard tests and screenshots directory exists.
 */

import * as fs from "fs";
import * as path from "path";

const SCREENSHOTS_DIR = path.join(process.cwd(), "e2e/screenshots");

async function globalSetup() {
  // Create screenshots directory
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    console.log("Created screenshots directory:", SCREENSHOTS_DIR);
  }

  // Check if legacy daemon is running (for dashboard tests)
  if (process.env.TEST_TARGET === "web") {
    try {
      const response = await fetch("http://localhost:8420/api/health");
      if (!response.ok) {
        console.warn(
          "Warning: Legacy daemon health check failed. Make sure the daemon is running."
        );
      } else {
        console.log("Legacy daemon is running and healthy.");
      }
    } catch (error) {
      console.warn("Warning: Could not connect to legacy daemon at localhost:8420");
      console.warn("Run: bun run dev:daemon OR aw daemon start");
    }
  }

  console.log("\nScreenshot tests will save to:", SCREENSHOTS_DIR);
  console.log("After tests complete, review screenshots in that directory.\n");
}

export default globalSetup;
