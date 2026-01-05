import * as fs from "fs";
import * as path from "path";
import { type Page, expect } from "@playwright/test";

const SCREENSHOTS_DIR = path.join(process.cwd(), "e2e/screenshots");

// Ensure screenshots directory exists
export function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

// Take a screenshot with a descriptive name
export async function screenshot(
  page: Page,
  name: string,
  description?: string
) {
  ensureScreenshotDir();
  const filename = `${name.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  await page.screenshot({
    path: filepath,
    fullPage: false
  });

  // Log for documentation
  console.log(`📸 ${name}${description ? `: ${description}` : ""}`);

  return filepath;
}

// Take a full-page screenshot
export async function fullPageScreenshot(page: Page, name: string) {
  ensureScreenshotDir();
  const filename = `${name.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-full.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  await page.screenshot({
    path: filepath,
    fullPage: true
  });

  console.log(`📸 ${name} (full page)`);

  return filepath;
}

// Take a screenshot of a specific element
export async function elementScreenshot(
  page: Page,
  selector: string,
  name: string
) {
  ensureScreenshotDir();
  const filename = `${name.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  const element = page.locator(selector);
  await element.screenshot({ path: filepath });

  console.log(`📸 ${name} (element: ${selector})`);

  return filepath;
}

// Wait for stable content (no loading spinners, etc.)
export async function waitForStable(page: Page) {
  // Wait for network to be idle
  await page.waitForLoadState("networkidle");
  // Small delay for any animations
  await page.waitForTimeout(300);
}

/**
 * Wait for React client-only content to hydrate on the pages site.
 * Since pages uses client:only="react", the entire UI is rendered client-side
 * and may not be ready immediately after networkidle.
 */
export async function waitForPagesReady(page: Page, timeout = 30000) {
  // Capture console errors for debugging
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`Page error: ${err.message}`);
  });

  // Wait for DOMContentLoaded first
  await page.waitForLoadState("domcontentloaded");

  // Wait for astro-island to be present (the React mount point)
  await page.waitForSelector("astro-island", { timeout: 10000 });

  // Wait for React to hydrate - the h1 appears when React renders
  try {
    await page.waitForSelector('h1:has-text("Transcript Donation Lab")', {
      timeout
    });
  } catch (e) {
    // Log any captured errors for debugging
    if (errors.length > 0) {
      console.error("Console errors during page load:", errors);
    }
    // Also log the page content for debugging
    const html = await page.content();
    console.error("Page HTML (first 2000 chars):", html.substring(0, 2000));
    throw e;
  }

  // Also wait for file inputs which indicate the component is interactive
  await page.waitForSelector('input[type="file"]', { timeout: 5000 });
  // Final network idle check
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(200);
}

// Tab navigation helpers
// After consolidation: Hooks→Agents, Repos→Projects, Activity→Settings
// Ports hidden by default (accessible via Settings)
export const TABS = {
  AGENTS: "1", // includes hook timeline & enhancements
  PROJECTS: "2", // includes git status per path
  CONVERSATIONS: "3",
  ANALYTICS: "4",
  CONTRIB: "5", // Share tab
  DOCS: "6",
  SETTINGS: "7" // includes Activity section
} as const;

export async function navigateToTab(page: Page, tabKey: string) {
  await page.keyboard.press(tabKey);
  await waitForStable(page);
}

// Click and screenshot helper
export async function clickAndScreenshot(
  page: Page,
  selector: string,
  screenshotName: string,
  description?: string
) {
  await page.click(selector);
  await waitForStable(page);
  return screenshot(page, screenshotName, description);
}

// Type in input and screenshot
export async function typeAndScreenshot(
  page: Page,
  selector: string,
  text: string,
  screenshotName: string
) {
  await page.fill(selector, text);
  await waitForStable(page);
  return screenshot(page, screenshotName);
}

// Generate a screenshot manifest for documentation
export function generateManifest(
  screenshots: Array<{ name: string; path: string; description?: string }>
) {
  const manifestPath = path.join(SCREENSHOTS_DIR, "MANIFEST.md");

  let content = "# Dashboard Screenshots\n\n";
  content += `Generated: ${new Date().toISOString()}\n\n`;
  content += "## Screenshots\n\n";

  for (const s of screenshots) {
    const filename = path.basename(s.path);
    content += `### ${s.name}\n`;
    if (s.description) {
      content += `${s.description}\n\n`;
    }
    content += `![${s.name}](./${filename})\n\n`;
  }

  fs.writeFileSync(manifestPath, content);
  console.log(`📋 Manifest written to ${manifestPath}`);
}
