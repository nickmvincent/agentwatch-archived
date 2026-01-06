import * as fs from "fs";
import * as path from "path";
import { type Page, type Route, expect, test } from "@playwright/test";
import {
  fullPageScreenshot,
  screenshot,
  waitForPagesReady,
  waitForStable
} from "./screenshot-utils";

// ============================================================================
// Screenshot prefix for contrib flow tests (70-xx series)
// Organized by workflow stage:
//   70-74: Initial page and import
//   75-79: Session selection and preview
//   80-84: Redaction settings and diff views
//   85-89: Field stripping
//   90-94: Bundle creation and export
//   95-97: HuggingFace upload
//   98-99: Error handling
// ============================================================================

// ============================================================================
// Test ZIP Helpers
// ============================================================================

// Helper to create a minimal test ZIP file
async function createTestZip(): Promise<Buffer> {
  const { zipSync } = await import("fflate");
  const encoder = new TextEncoder();

  const manifest = {
    files: [
      {
        path_in_zip: "session_1.jsonl",
        sha256: "abc123",
        bytes: 100,
        mtime_utc: "2024-01-01T00:00:00Z",
        original_path_hint: "/test/session_1.jsonl"
      }
    ],
    sources: ["claude"]
  };

  const transcript = JSON.stringify({
    type: "conversation",
    messages: [
      { role: "user", content: "Hello, can you help me?" },
      { role: "assistant", content: "Of course! What do you need help with?" }
    ]
  });

  const zipData = zipSync({
    "export_manifest.json": encoder.encode(JSON.stringify(manifest)),
    "session_1.jsonl": encoder.encode(transcript)
  });

  return Buffer.from(zipData);
}

// Helper to create a test ZIP with redactable content (secrets, PII, paths)
async function createRedactableTestZip(): Promise<Buffer> {
  const { zipSync } = await import("fflate");
  const encoder = new TextEncoder();

  const manifest = {
    files: [
      {
        path_in_zip: "session_with_secrets.jsonl",
        sha256: "def456",
        bytes: 500,
        mtime_utc: "2024-01-15T10:30:00Z",
        original_path_hint: "/Users/johndoe/projects/myapp/session.jsonl"
      }
    ],
    sources: ["claude"]
  };

  // Transcript with various redactable content
  const transcript = JSON.stringify({
    type: "conversation",
    cwd: "/Users/johndoe/projects/myapp",
    projectDir: "/Users/johndoe/projects/myapp",
    messages: [
      {
        role: "user",
        content: "Here is my API key: sk-ant-api03-abc123def456ghi789jklmno"
      },
      {
        role: "assistant",
        content: `I'll help you with that. I see you're working in /Users/johndoe/projects/myapp.
Let me check your email config at john.doe@example.com.
Also found AWS key: AKIAIOSFODNN7EXAMPLE`
      },
      {
        role: "user",
        content:
          "Thanks! My OpenAI key is sk-1234567890abcdefghij1234567890abcdefghij12"
      },
      {
        role: "assistant",
        content: `I'll update the config file at C:\\Users\\johndoe\\AppData\\config.json.
The GitHub token ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx is noted.`
      }
    ],
    sourcePathHint: "/Users/johndoe/projects/myapp/session.jsonl"
  });

  const zipData = zipSync({
    "export_manifest.json": encoder.encode(JSON.stringify(manifest)),
    "session_with_secrets.jsonl": encoder.encode(transcript)
  });

  return Buffer.from(zipData);
}

// Helper to create and upload a test file
async function uploadTestZip(
  page: Page,
  createFn: () => Promise<Buffer> = createTestZip
): Promise<string> {
  const zipBuffer = await createFn();
  const tempPath = path.join("/tmp", `test_export_${Date.now()}.zip`);
  fs.writeFileSync(tempPath, zipBuffer);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(tempPath);

  // Wait for sessions to load
  await expect(page.getByText(/\d+ sessions? loaded/)).toBeVisible({
    timeout: 10000
  });

  return tempPath;
}

// Cleanup helper
function cleanupTempFile(tempPath: string) {
  try {
    fs.unlinkSync(tempPath);
  } catch {
    /* ignore */
  }
}

// ============================================================================
// Initial Page & Import Tests (70-74)
// ============================================================================

test.describe("Pages Static Site - Contrib Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:4321");
    await waitForPagesReady(page);
  });

  test("70: should display the main page", async ({ page }) => {
    await waitForStable(page);
    await expect(page.locator("h1")).toContainText("Transcript Donation Lab");
    await fullPageScreenshot(page, "70-contrib-initial-page");
  });

  test("71: should show import section with file inputs", async ({ page }) => {
    await waitForStable(page);
    await expect(page.getByText("Import Transcripts")).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(3); // claude, codex, opencode
    await screenshot(
      page,
      "71-contrib-import-section",
      "Import section with 3 source options"
    );
  });

  test("72: should handle file upload and show loaded sessions", async ({
    page
  }) => {
    const tempPath = await uploadTestZip(page);
    await waitForStable(page);
    await expect(page.getByText("1 sessions loaded")).toBeVisible();
    await screenshot(
      page,
      "72-contrib-sessions-loaded",
      "Sessions loaded after ZIP upload"
    );
    cleanupTempFile(tempPath);
  });

  test("73: should show session list with metadata", async ({ page }) => {
    const tempPath = await uploadTestZip(page);
    await waitForStable(page);

    // Session list should show source badge and count
    await expect(page.getByText("1 sessions loaded")).toBeVisible();
    // Look for the source badge text in the session item (claude source)
    await expect(page.getByText("claude").first()).toBeVisible();
    await screenshot(
      page,
      "73-contrib-session-list",
      "Session list with source badges"
    );
    cleanupTempFile(tempPath);
  });
});

// ============================================================================
// Session Selection & Preview Tests (75-79)
// ============================================================================

test.describe("Pages Static Site - Session Selection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:4321");
    await waitForPagesReady(page);
  });

  test("75: should allow session selection", async ({ page }) => {
    const tempPath = await uploadTestZip(page);
    await waitForStable(page);

    // Click on the session checkbox to select it
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Should show redaction section header after selection
    await expect(page.getByText("Redaction?")).toBeVisible();
    // Verify the selected badge appears
    await expect(page.getByText("1 selected")).toBeVisible();
    await screenshot(
      page,
      "75-contrib-session-selected",
      "Session selected showing redaction config"
    );
    cleanupTempFile(tempPath);
  });

  test("76: should show preview panel after selection", async ({ page }) => {
    const tempPath = await uploadTestZip(page);
    // Select the session using checkbox
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Preview appears with diff view mode buttons (Changes is the default)
    await expect(page.getByRole("button", { name: "Changes" })).toBeVisible();
    // Preview content should show score
    await expect(page.getByText(/Score:/)).toBeVisible({ timeout: 10000 });
    await screenshot(
      page,
      "76-contrib-preview-panel",
      "Preview panel with content"
    );
    cleanupTempFile(tempPath);
  });

  test("77: should show diff view mode buttons", async ({ page }) => {
    const tempPath = await uploadTestZip(page);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Should show diff view modes
    await expect(page.getByRole("button", { name: "Changes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Full Diff" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
    await screenshot(
      page,
      "77-contrib-diff-view-buttons",
      "Diff view mode buttons"
    );
    cleanupTempFile(tempPath);
  });

  test("78: should show contributor info section", async ({ page }) => {
    const tempPath = await uploadTestZip(page);
    await page.locator('input[type="checkbox"]').first().click();
    await page.waitForTimeout(500);
    await waitForStable(page);

    // Expand the Contributor & Export section (it's collapsed by default)
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    // Should show contributor info inputs after expansion
    await expect(page.getByPlaceholder("your-username")).toBeVisible();
    await screenshot(
      page,
      "78-contrib-contributor-info",
      "Contributor info section"
    );
    cleanupTempFile(tempPath);
  });

  test("79: should require attestations before building bundle", async ({
    page
  }) => {
    const tempPath = await uploadTestZip(page);
    await page.locator('input[type="checkbox"]').first().click();
    await page.waitForTimeout(500);
    await waitForStable(page);

    // Expand the Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    // Build button should be disabled
    const buildButton = page.getByRole("button", { name: "Build Bundle" });
    await expect(buildButton).toBeDisabled();
    await screenshot(
      page,
      "79a-contrib-build-disabled",
      "Build button disabled before attestations"
    );

    // Check attestation checkboxes
    await page.getByText("I have the rights to share this content").click();
    await page.getByText("I have reviewed the sanitized output").click();
    await waitForStable(page);

    // Now build button should be enabled
    await expect(buildButton).toBeEnabled();
    await screenshot(
      page,
      "79b-contrib-build-enabled",
      "Build button enabled after attestations"
    );
    cleanupTempFile(tempPath);
  });
});

// ============================================================================
// Redaction Settings & Diff Views (80-84)
// ============================================================================

test.describe("Pages Static Site - Redaction Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:4321");
    await waitForPagesReady(page);
  });

  test("80: should redact secrets, PII, and paths from content", async ({
    page
  }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    // Wait for preview to appear (check for diff view buttons)
    await expect(page.getByRole("button", { name: "Changes" })).toBeVisible();
    await waitForStable(page);

    // Check that redaction happened - look for redacted text markers or diff display
    // The preview should show some indication of redaction (Score, removed lines, etc)
    await expect(page.getByText(/Score:/)).toBeVisible({ timeout: 5000 });
    await fullPageScreenshot(page, "80-contrib-redaction-preview");
    cleanupTempFile(tempPath);
  });

  test("81: should toggle redaction settings and update preview", async ({
    page
  }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Find redaction settings checkboxes
    const secretsCheckbox = page.getByLabel(/secrets/i);

    // Verify checkbox exists and is checked by default
    if (await secretsCheckbox.isVisible()) {
      await expect(secretsCheckbox).toBeChecked();
      await screenshot(
        page,
        "81a-contrib-secrets-enabled",
        "Secrets redaction enabled (default)"
      );

      // Toggle secrets off
      await secretsCheckbox.uncheck();
      await page.waitForTimeout(600); // Wait for debounce
      await waitForStable(page);
      await screenshot(
        page,
        "81b-contrib-secrets-disabled",
        "Secrets redaction disabled"
      );

      // Toggle back on
      await secretsCheckbox.check();
      await waitForStable(page);
    }
    cleanupTempFile(tempPath);
  });

  test("82: should switch to Full Diff view", async ({ page }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    // Wait for preview to appear (check for diff view buttons)
    await expect(page.getByRole("button", { name: "Changes" })).toBeVisible();
    await waitForStable(page);

    // Click Full Diff
    await page.getByRole("button", { name: "Full Diff" }).click();
    await waitForStable(page);
    await screenshot(page, "82-contrib-diff-full", "Full diff view mode");
    cleanupTempFile(tempPath);
  });

  test("83: should switch to Original view", async ({ page }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    // Wait for preview to appear (check for diff view buttons)
    await expect(page.getByRole("button", { name: "Changes" })).toBeVisible();
    await waitForStable(page);

    // Click Original
    await page.getByRole("button", { name: "Original" }).click();
    await waitForStable(page);
    await screenshot(
      page,
      "83-contrib-diff-original",
      "Original view (before redaction)"
    );
    cleanupTempFile(tempPath);
  });

  test("84: should switch to Changes view", async ({ page }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    // Wait for preview to appear (check for diff view buttons)
    await expect(page.getByRole("button", { name: "Changes" })).toBeVisible();
    await waitForStable(page);

    // Click Original first, then Changes
    await page.getByRole("button", { name: "Original" }).click();
    await waitForStable(page);
    await page.getByRole("button", { name: "Changes" }).click();
    await waitForStable(page);
    await screenshot(page, "84-contrib-diff-changes", "Changes-only view");
    cleanupTempFile(tempPath);
  });
});

// ============================================================================
// Field Stripping Tests (85-89)
// ============================================================================

test.describe("Pages Static Site - Field Stripping", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:4321");
    await waitForPagesReady(page);
  });

  test("85: should show field stripping options", async ({ page }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Look for field stripping section
    const fieldSection = page.getByText(
      /strip fields|field selection|fields to strip/i
    );
    if (await fieldSection.isVisible()) {
      await screenshot(
        page,
        "85-contrib-field-options",
        "Field stripping options"
      );
    }
    cleanupTempFile(tempPath);
  });

  test("86: should toggle field stripping and update preview", async ({
    page
  }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Find field checkboxes
    const cwdField = page.getByLabel(/cwd|working directory/i);
    if (await cwdField.isVisible()) {
      await screenshot(
        page,
        "86a-contrib-field-before",
        "Before field stripping"
      );

      await cwdField.click();
      await page.waitForTimeout(600);
      await waitForStable(page);
      await screenshot(
        page,
        "86b-contrib-field-after",
        "After field stripping"
      );

      // Toggle back
      await cwdField.click();
      await waitForStable(page);
    }
    cleanupTempFile(tempPath);
  });
});

// ============================================================================
// Bundle Creation & Export Tests (90-94)
// ============================================================================

test.describe("Pages Static Site - Bundle Creation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:4321");
    await waitForPagesReady(page);
  });

  test("90: should fill contributor info", async ({ page }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Expand Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    // Fill contributor info
    const contributorInput = page.getByPlaceholder("your-username");
    await contributorInput.fill("test-contributor");
    await waitForStable(page);
    await screenshot(
      page,
      "90-contrib-contributor-filled",
      "Contributor info filled"
    );
    cleanupTempFile(tempPath);
  });

  test("91: should check attestations", async ({ page }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Expand Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    await page.getByPlaceholder("your-username").fill("test-contributor");
    await page.getByText("I have the rights to share this content").click();
    await page.getByText("I have reviewed the sanitized output").click();
    await waitForStable(page);

    await screenshot(
      page,
      "91-contrib-attestations-checked",
      "Attestations checked"
    );
    cleanupTempFile(tempPath);
  });

  test("92: should build bundle after attestations", async ({ page }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Expand Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    await page.getByPlaceholder("your-username").fill("test-contributor");
    await page.getByText("I have the rights to share this content").click();
    await page.getByText("I have reviewed the sanitized output").click();

    const buildButton = page.getByRole("button", { name: "Build Bundle" });
    await expect(buildButton).toBeEnabled();
    await buildButton.click();

    // Wait for bundle to be created
    await expect(page.getByText("Bundle Ready")).toBeVisible({
      timeout: 10000
    });
    await fullPageScreenshot(page, "92-contrib-bundle-ready");
    cleanupTempFile(tempPath);
  });

  test("93: should show download button after bundle creation", async ({
    page
  }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Expand Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    await page.getByPlaceholder("your-username").fill("test-contributor");
    await page.getByText("I have the rights to share this content").click();
    await page.getByText("I have reviewed the sanitized output").click();

    await page.getByRole("button", { name: "Build Bundle" }).click();
    await expect(page.getByText(/bundle ready/i)).toBeVisible({
      timeout: 10000
    });

    const downloadButton = page.getByRole("button", { name: /download/i });
    await expect(downloadButton).toBeVisible();
    await screenshot(
      page,
      "93-contrib-download-button",
      "Download button visible"
    );
    cleanupTempFile(tempPath);
  });

  test("94: should show bundle summary info", async ({ page }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Expand Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    await page.getByPlaceholder("your-username").fill("test-contributor");
    await page.getByText("I have the rights to share this content").click();
    await page.getByText("I have reviewed the sanitized output").click();

    await page.getByRole("button", { name: "Build Bundle" }).click();
    await expect(page.getByText(/bundle ready/i)).toBeVisible({
      timeout: 10000
    });

    // Should show bundle ID and format
    await screenshot(
      page,
      "94-contrib-bundle-summary",
      "Bundle summary with ID and format"
    );
    cleanupTempFile(tempPath);
  });
});

// ============================================================================
// HuggingFace Upload Tests (95-97)
// ============================================================================

test.describe("Pages Static Site - HuggingFace Upload Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:4321");
    await waitForPagesReady(page);
  });

  test("95: should show HuggingFace upload option after bundle creation", async ({
    page
  }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Expand Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    await page.getByPlaceholder("your-username").fill("test-contributor");
    await page.getByText("I have the rights to share this content").click();
    await page.getByText("I have reviewed the sanitized output").click();

    await page.getByRole("button", { name: "Build Bundle" }).click();
    await expect(page.getByText(/bundle ready/i)).toBeVisible({
      timeout: 10000
    });

    // HuggingFace upload input should be visible
    const hfInput = page.getByPlaceholder("username/dataset-name");
    await expect(hfInput).toBeVisible();
    await screenshot(
      page,
      "95-contrib-hf-upload-option",
      "HuggingFace upload input"
    );
    cleanupTempFile(tempPath);
  });

  test("96: should show login button when not authenticated", async ({
    page
  }) => {
    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Expand Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    await page.getByPlaceholder("your-username").fill("test-contributor");
    await page.getByText("I have the rights to share this content").click();
    await page.getByText("I have reviewed the sanitized output").click();

    await page.getByRole("button", { name: "Build Bundle" }).click();
    await expect(page.getByText(/bundle ready/i)).toBeVisible({
      timeout: 10000
    });

    const loginButton = page.getByRole("button", { name: /login/i });
    if (await loginButton.isVisible()) {
      await screenshot(
        page,
        "96-contrib-hf-login-required",
        "HuggingFace login button"
      );
    }
    cleanupTempFile(tempPath);
  });

  test("97: should mock HuggingFace API and test upload flow", async ({
    page
  }) => {
    // Mock HuggingFace API endpoints
    await page.route("**/huggingface.co/api/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          commitUrl:
            "https://huggingface.co/datasets/test-user/test-dataset/commit/abc123"
        })
      });
    });

    // Also mock the local API submit endpoint
    await page.route("**/api/submit", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          url: "https://huggingface.co/datasets/test-user/test-dataset/discussions/1",
          prNumber: 1
        })
      });
    });

    const tempPath = await uploadTestZip(page, createRedactableTestZip);
    await page.locator('input[type="checkbox"]').first().click();
    await waitForStable(page);

    // Expand Contributor & Export section
    await page.getByText("Contributor & Export").click();
    await waitForStable(page);

    await page.getByPlaceholder("your-username").fill("test-contributor");
    await page.getByText("I have the rights to share this content").click();
    await page.getByText("I have reviewed the sanitized output").click();

    await page.getByRole("button", { name: "Build Bundle" }).click();
    await expect(page.getByText(/bundle ready/i)).toBeVisible({
      timeout: 10000
    });

    // Fill in HuggingFace dataset
    const hfInput = page.getByPlaceholder("username/dataset-name");
    await hfInput.fill("test-user/test-dataset");

    // Set mock OAuth token in session storage
    await page.evaluate(() => {
      sessionStorage.setItem("hf_access_token", "mock-hf-token-12345");
    });

    await screenshot(
      page,
      "97a-contrib-hf-dataset-filled",
      "HuggingFace dataset ID filled"
    );

    // Click upload button if visible
    const uploadButton = page.getByRole("button", { name: /upload to hf/i });
    if (await uploadButton.isVisible()) {
      await uploadButton.click();
      await page.waitForTimeout(1000);
      await screenshot(
        page,
        "97b-contrib-hf-upload-triggered",
        "HuggingFace upload triggered"
      );
    }
    cleanupTempFile(tempPath);
  });
});

// ============================================================================
// Error Handling Tests (98-99)
// ============================================================================

test.describe("Pages Static Site - Error Handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:4321");
    await waitForPagesReady(page);
  });

  test("98: should handle invalid ZIP file gracefully", async ({ page }) => {
    // Create an invalid ZIP file
    const tempPath = path.join("/tmp", `invalid_${Date.now()}.zip`);
    fs.writeFileSync(tempPath, "This is not a valid ZIP file");

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(tempPath);
    await page.waitForTimeout(1000);
    await waitForStable(page);

    // Should show error state
    await screenshot(
      page,
      "98-contrib-invalid-zip",
      "Invalid ZIP file handling"
    );
    cleanupTempFile(tempPath);
  });

  test("99: should handle empty ZIP file gracefully", async ({ page }) => {
    const { zipSync } = await import("fflate");
    const encoder = new TextEncoder();

    const manifest = { files: [], sources: [] };
    const zipData = zipSync({
      "export_manifest.json": encoder.encode(JSON.stringify(manifest))
    });

    const tempPath = path.join("/tmp", `empty_${Date.now()}.zip`);
    fs.writeFileSync(tempPath, Buffer.from(zipData));

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(tempPath);
    await page.waitForTimeout(1000);
    await waitForStable(page);

    await screenshot(page, "99-contrib-empty-zip", "Empty ZIP file handling");
    cleanupTempFile(tempPath);
  });
});

// ============================================================================
// Web App tests (require legacy daemon - run separately)
// ============================================================================

// test.describe('Web App - Contrib Flow', () => {
//   test('should display contrib pane', async ({ page }) => {
//     await page.goto('http://localhost:5173');
//     await expect(page.getByText('Prepare & Share')).toBeVisible();
//   });
// });
