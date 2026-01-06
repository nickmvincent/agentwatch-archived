import { type Page, expect, test } from "@playwright/test";
import {
  TABS,
  elementScreenshot,
  ensureScreenshotDir,
  fullPageScreenshot,
  navigateToTab,
  screenshot,
  waitForStable
} from "./screenshot-utils";

// Helper to check if element exists and is visible
async function isVisible(
  page: Page,
  selector: string,
  timeout = 2000
): Promise<boolean> {
  try {
    return await page.locator(selector).first().isVisible({ timeout });
  } catch {
    return false;
  }
}

// Helper to click if visible
async function clickIfVisible(page: Page, selector: string): Promise<boolean> {
  if (await isVisible(page, selector)) {
    await page.locator(selector).first().click();
    await waitForStable(page);
    return true;
  }
  return false;
}

// Dashboard screenshot tests - comprehensive documentation of all UI states
test.describe("Dashboard Screenshots", () => {
  test.beforeAll(() => {
    ensureScreenshotDir();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForStable(page);
  });

  // ============================================================
  // SECTION 1: INITIAL LOAD & HEADER
  // ============================================================
  test.describe("1. Initial Load & Header", () => {
    test("01 - Dashboard initial load", async ({ page }) => {
      await screenshot(
        page,
        "01-dashboard-initial-load",
        "Dashboard on first load showing Agents tab"
      );
    });

    test("02 - Header area", async ({ page }) => {
      await screenshot(
        page,
        "02-header-area",
        "Header with connection status and controls"
      );
    });

    test("03 - Tab bar with badges", async ({ page }) => {
      await screenshot(
        page,
        "03-tab-bar",
        "Tab bar with navigation tabs and count badges"
      );
    });

    test("04a - Pause button - click to pause", async ({ page }) => {
      // Look for pause button with various possible labels
      const pauseSelectors = [
        'button:has-text("⏸")',
        'button:has-text("Pause")',
        'button[title*="pause" i]',
        'button[aria-label*="pause" i]'
      ];
      for (const sel of pauseSelectors) {
        if (await clickIfVisible(page, sel)) {
          await screenshot(
            page,
            "04a-paused-state",
            "Dashboard in paused state (updates frozen)"
          );
          break;
        }
      }
    });

    test("04b - Resume button - click to resume", async ({ page }) => {
      // First pause, then resume
      await clickIfVisible(page, 'button:has-text("⏸")');
      const resumeSelectors = [
        'button:has-text("▶")',
        'button:has-text("Resume")',
        'button[title*="resume" i]'
      ];
      for (const sel of resumeSelectors) {
        if (await clickIfVisible(page, sel)) {
          await screenshot(
            page,
            "04b-resumed-state",
            "Dashboard after resuming updates"
          );
          break;
        }
      }
    });

    test("05 - Help modal with keyboard shortcuts", async ({ page }) => {
      await page.keyboard.press("?");
      await waitForStable(page);
      await screenshot(page, "05-help-modal", "Keyboard shortcuts help modal");
      await page.keyboard.press("Escape");
    });

    test("06 - Connection status indicator", async ({ page }) => {
      // Screenshot focusing on connection status
      await screenshot(
        page,
        "06-connection-status",
        "WebSocket connection status indicator"
      );
    });
  });

  // ============================================================
  // SECTION 2: AGENTS TAB
  // ============================================================
  test.describe("2. Agents Tab", () => {
    test("10 - Agents tab overview", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      await screenshot(
        page,
        "10-agents-tab-overview",
        "Agents tab showing running agents"
      );
    });

    test("11 - Agents empty state", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      // Always screenshot - will show empty or populated state
      await screenshot(page, "11-agents-state", "Agents tab current state");
    });

    test("12 - Agent filter - typing search", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const filterInput = page
        .locator(
          'input[placeholder*="filter" i], input[placeholder*="search" i]'
        )
        .first();
      if (await filterInput.isVisible()) {
        await filterInput.fill("claude");
        await waitForStable(page);
        await screenshot(
          page,
          "12-agents-filtered",
          'Agents filtered by search term "claude"'
        );
        await filterInput.fill("");
      }
    });

    test("13a - Agent grouping - enable", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      if (await clickIfVisible(page, 'button:has-text("Group")')) {
        await screenshot(
          page,
          "13a-agents-grouped",
          "Agents grouped by type/label"
        );
      }
    });

    test("13b - Agent grouping - collapsed group", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      await clickIfVisible(page, 'button:has-text("Group")');
      // Try to collapse a group
      const groupHeader = page
        .locator('[class*="group"], tr:has-text("▼"), tr:has-text("▶")')
        .first();
      if (await groupHeader.isVisible()) {
        await groupHeader.click();
        await waitForStable(page);
        await screenshot(
          page,
          "13b-agents-group-collapsed",
          "Agent group collapsed"
        );
      }
    });

    test("14a - Agent sorting - by PID", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      if (await clickIfVisible(page, 'th:has-text("PID")')) {
        await screenshot(page, "14a-agents-sorted-pid", "Agents sorted by PID");
      }
    });

    test("14b - Agent sorting - by Uptime", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      if (await clickIfVisible(page, 'th:has-text("Uptime")')) {
        await screenshot(
          page,
          "14b-agents-sorted-uptime",
          "Agents sorted by uptime"
        );
      }
    });

    test("15 - Agent row hover state", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const row = page.locator("table tbody tr").first();
      if (await row.isVisible()) {
        await row.hover();
        await waitForStable(page);
        await screenshot(
          page,
          "15-agent-row-hover",
          "Agent row on hover (highlighted)"
        );
      }
    });

    test("16 - Agent detail modal - Overview tab", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const row = page.locator("table tbody tr").first();
      if (await row.isVisible()) {
        await row.click();
        await waitForStable(page);
        await screenshot(
          page,
          "16-agent-modal-overview",
          "Agent detail modal - Overview tab"
        );
        await page.keyboard.press("Escape");
      }
    });

    test("17 - Agent detail modal - Output tab", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const row = page.locator("table tbody tr").first();
      if (await row.isVisible()) {
        await row.click();
        await waitForStable(page);
        if (await clickIfVisible(page, 'button:has-text("Output")')) {
          await screenshot(
            page,
            "17-agent-modal-output",
            "Agent detail modal - Output/console tab"
          );
        }
        await page.keyboard.press("Escape");
      }
    });

    test("18 - Agent detail modal - Tools tab", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const row = page.locator("table tbody tr").first();
      if (await row.isVisible()) {
        await row.click();
        await waitForStable(page);
        if (await clickIfVisible(page, 'button:has-text("Tools")')) {
          await screenshot(
            page,
            "18-agent-modal-tools",
            "Agent detail modal - Tools statistics"
          );
        }
        await page.keyboard.press("Escape");
      }
    });

    test("19 - Agent detail modal - Timeline tab", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const row = page.locator("table tbody tr").first();
      if (await row.isVisible()) {
        await row.click();
        await waitForStable(page);
        if (await clickIfVisible(page, 'button:has-text("Timeline")')) {
          await screenshot(
            page,
            "19-agent-modal-timeline",
            "Agent detail modal - Tool timeline"
          );
        }
        await page.keyboard.press("Escape");
      }
    });

    test("20 - Agent detail modal - Signal buttons", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const row = page.locator("table tbody tr").first();
      if (await row.isVisible()) {
        await row.click();
        await waitForStable(page);
        await screenshot(
          page,
          "20-agent-modal-signals",
          "Agent modal with Interrupt/EOF/Kill buttons"
        );
        await page.keyboard.press("Escape");
      }
    });

    test("21 - Agent state - WORKING", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      // Look for working state indicator (green dot or WORKING text)
      const workingAgent = page
        .locator(
          'tr:has-text("WORKING"), tr:has(.bg-green), tr:has([class*="green"])'
        )
        .first();
      if (await workingAgent.isVisible()) {
        await workingAgent.hover();
        await screenshot(
          page,
          "21-agent-state-working",
          "Agent in WORKING state (green indicator)"
        );
      }
    });

    test("22 - Agent state - WAITING", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const waitingAgent = page
        .locator(
          'tr:has-text("WAITING"), tr:has-text("waiting"), tr:has(.bg-yellow), tr:has([class*="yellow"])'
        )
        .first();
      if (await waitingAgent.isVisible()) {
        await waitingAgent.hover();
        await screenshot(
          page,
          "22-agent-state-waiting",
          "Agent in WAITING state (yellow indicator)"
        );
      }
    });

    test("23 - Agent state - STALLED", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const stalledAgent = page
        .locator(
          'tr:has-text("STALLED"), tr:has-text("stalled"), tr:has(.bg-red), tr:has([class*="red"])'
        )
        .first();
      if (await stalledAgent.isVisible()) {
        await stalledAgent.hover();
        await screenshot(
          page,
          "23-agent-state-stalled",
          "Agent in STALLED state (red indicator)"
        );
      }
    });

    test("24 - Agent awaiting user input", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const awaitingAgent = page
        .locator(
          'tr:has-text("awaiting"), tr:has-text("Awaiting"), tr:has-text("👤")'
        )
        .first();
      if (await awaitingAgent.isVisible()) {
        await awaitingAgent.hover();
        await screenshot(
          page,
          "24-agent-awaiting-user",
          "Agent awaiting user input indicator"
        );
      }
    });
  });

  // ============================================================
  // SECTION 3: HOOK DATA IN AGENTS TAB
  // (Hooks functionality is now integrated into Agents tab)
  // ============================================================
  test.describe("3. Hook Data in Agents Tab", () => {
    test("30 - Agents with hook timeline section", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      // Hook timeline is now shown below the agents table
      await screenshot(
        page,
        "30-agents-hook-timeline",
        "Agents tab with hook timeline section"
      );
    });

    test("31 - Hook timeline activity feed", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      // Look for Hook Timeline section
      if (await clickIfVisible(page, 'button:has-text("Hook Timeline")')) {
        await screenshot(
          page,
          "31-hook-timeline-feed",
          "Hook timeline activity feed"
        );
      }
    });

    test("32 - Hook enhancements section", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      if (await clickIfVisible(page, 'button:has-text("Hook Enhancements")')) {
        await screenshot(
          page,
          "32-hook-enhancements",
          "Hook enhancements feature grid"
        );
      }
    });

    test("33 - Hook token/cost summary", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      // Look for token or cost display in the hook timeline section
      const tokenDisplay = page
        .locator(':has-text("tokens"), :has-text("Token"), :has-text("cost")')
        .first();
      if (await tokenDisplay.isVisible()) {
        await screenshot(
          page,
          "33-hook-token-summary",
          "Token/cost usage summary"
        );
      }
    });
  });

  // ============================================================
  // SECTION 4: PROJECTS TAB (includes git status)
  // ============================================================
  test.describe("4. Projects Tab", () => {
    test("40 - Projects tab overview", async ({ page }) => {
      await navigateToTab(page, TABS.PROJECTS);
      await screenshot(
        page,
        "40-projects-tab-overview",
        "Projects tab showing project cards with git status"
      );
    });

    test("41 - Projects with git status", async ({ page }) => {
      await navigateToTab(page, TABS.PROJECTS);
      await screenshot(
        page,
        "41-projects-git-status",
        "Project cards with git status per path"
      );
    });

    test("42 - Project dirty repo indicator", async ({ page }) => {
      await navigateToTab(page, TABS.PROJECTS);
      const dirtyRepo = page
        .locator(
          ':has-text("dirty"), :has-text("modified"), [class*="yellow"], [class*="warning"]'
        )
        .first();
      if (await dirtyRepo.isVisible()) {
        await dirtyRepo.hover();
        await screenshot(
          page,
          "42-project-dirty-repo",
          "Project with dirty repository"
        );
      }
    });

    test("43 - Project sync status", async ({ page }) => {
      await navigateToTab(page, TABS.PROJECTS);
      const syncStatus = page
        .locator(
          ':has-text("↑"), :has-text("↓"), :has-text("ahead"), :has-text("behind")'
        )
        .first();
      if (await syncStatus.isVisible()) {
        await syncStatus.hover();
        await screenshot(
          page,
          "43-project-sync-status",
          "Project git sync status (ahead/behind)"
        );
      }
    });

    test("44 - Projects empty state", async ({ page }) => {
      await navigateToTab(page, TABS.PROJECTS);
      const emptyState = page.locator(
        ':has-text("No projects"), :has-text("no projects")'
      );
      if (await emptyState.first().isVisible()) {
        await screenshot(page, "44-projects-empty", "Projects tab empty state");
      }
    });
  });

  // ============================================================
  // SECTION 5: PORTS TAB (hidden by default, no keyboard shortcut)
  // These tests are skipped since Ports tab must be enabled in Settings first
  // ============================================================
  test.describe("5. Ports Tab", () => {
    test.skip("Ports tab is hidden by default - enable in Settings to test");
  });

  // ============================================================
  // SECTION 6: CONTRIB/SHARE TAB
  // ============================================================
  test.describe("6. Contrib/Share Tab", () => {
    test("60 - Contrib tab overview", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      await screenshot(
        page,
        "60-contrib-tab-overview",
        "Contrib/Share tab overview"
      );
    });

    test("61 - Contrib session list", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      await screenshot(
        page,
        "61-contrib-session-list",
        "Available sessions for sharing"
      );
    });

    test("62 - Contrib session selected", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      // Click first session/checkbox
      const sessionItem = page
        .locator(
          '[class*="cursor-pointer"], input[type="checkbox"], tr[class*="hover"]'
        )
        .first();
      if (await sessionItem.isVisible()) {
        await sessionItem.click();
        await waitForStable(page);
        await screenshot(
          page,
          "62-contrib-session-selected",
          "Session selected for export"
        );
      }
    });

    test("63 - Contrib redaction options", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      // Look for redaction settings section
      const redactSection = page.locator(
        ':has-text("Redact"), :has-text("Sanitiz"), :has-text("Options")'
      );
      if (await redactSection.first().isVisible()) {
        await screenshot(
          page,
          "63-contrib-redaction-options",
          "Redaction/sanitization options"
        );
      }
    });

    test("64 - Contrib redaction checkboxes", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      // Find checkbox area
      const checkboxArea = page.locator('input[type="checkbox"]').first();
      if (await checkboxArea.isVisible()) {
        await screenshot(
          page,
          "64-contrib-checkboxes",
          "Redaction option checkboxes"
        );
      }
    });

    test("65 - Contrib destination selector", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      const destSection = page.locator(
        ':has-text("Destination"), :has-text("Export to"), select, [class*="dropdown"]'
      );
      if (await destSection.first().isVisible()) {
        await screenshot(
          page,
          "65-contrib-destination",
          "Export destination selection"
        );
      }
    });

    test("66 - Contrib preview panel", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      // Select a session first
      const sessionItem = page.locator('[class*="cursor-pointer"]').first();
      if (await sessionItem.isVisible()) {
        await sessionItem.click();
        await waitForStable(page);
        // Look for preview area
        const preview = page.locator(
          ':has-text("Preview"), [class*="preview"]'
        );
        if (await preview.first().isVisible()) {
          await screenshot(page, "66-contrib-preview", "Session preview panel");
        }
      }
    });

    test("67 - Contrib diff view - Changes mode", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      await clickIfVisible(page, '[class*="cursor-pointer"]'); // Select session
      if (await clickIfVisible(page, 'button:has-text("Changes")')) {
        await screenshot(
          page,
          "67-contrib-diff-changes",
          "Diff view - Changes only"
        );
      }
    });

    test("68 - Contrib diff view - Full Diff mode", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      await clickIfVisible(page, '[class*="cursor-pointer"]');
      if (await clickIfVisible(page, 'button:has-text("Full Diff")')) {
        await screenshot(
          page,
          "68-contrib-diff-full",
          "Diff view - Full diff mode"
        );
      }
    });

    test("69 - Contrib diff view - Original mode", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      await clickIfVisible(page, '[class*="cursor-pointer"]');
      if (await clickIfVisible(page, 'button:has-text("Original")')) {
        await screenshot(
          page,
          "69-contrib-diff-original",
          "Diff view - Original content"
        );
      }
    });

    test("6A - Contrib attestation checkboxes", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      const attestation = page.locator(
        ':has-text("rights"), :has-text("reviewed"), :has-text("attest")'
      );
      if (await attestation.first().isVisible()) {
        await screenshot(
          page,
          "6A-contrib-attestation",
          "Attestation checkboxes for export"
        );
      }
    });

    test("6B - Contrib build/export button", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      const buildBtn = page.locator(
        'button:has-text("Build"), button:has-text("Export"), button:has-text("Share")'
      );
      if (await buildBtn.first().isVisible()) {
        await screenshot(
          page,
          "6B-contrib-export-button",
          "Build/Export button"
        );
      }
    });

    test("6C - Contrib chat viewer modal", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      // Try to open chat viewer
      const viewBtn = page
        .locator(
          'button:has-text("View"), button:has-text("Chat"), button:has-text("Preview")'
        )
        .first();
      if (await viewBtn.isVisible()) {
        await viewBtn.click();
        await waitForStable(page);
        // Check if modal opened
        const modal = page.locator('[class*="modal"], [role="dialog"]');
        if (await modal.first().isVisible()) {
          await screenshot(page, "6C-contrib-chat-viewer", "Chat viewer modal");
          await page.keyboard.press("Escape");
        }
      }
    });
  });

  // ============================================================
  // SECTION 7: DOCS TAB
  // ============================================================
  test.describe("7. Documentation Tab", () => {
    test("70 - Docs tab overview", async ({ page }) => {
      await navigateToTab(page, TABS.DOCS);
      await screenshot(page, "70-docs-tab-overview", "In-app documentation");
    });

    test("71 - Docs full page", async ({ page }) => {
      await navigateToTab(page, TABS.DOCS);
      await fullPageScreenshot(page, "71-docs-full");
    });

    test("72 - Docs navigation/sections", async ({ page }) => {
      await navigateToTab(page, TABS.DOCS);
      // If there are doc sections, try clicking one
      const docSection = page
        .locator(
          'a:has-text("Hook"), a:has-text("API"), button:has-text("Guide")'
        )
        .first();
      if (await docSection.isVisible()) {
        await docSection.click();
        await waitForStable(page);
        await screenshot(
          page,
          "72-docs-section",
          "Documentation section content"
        );
      }
    });
  });

  // ============================================================
  // SECTION 8: SETTINGS TAB (includes Activity section)
  // ============================================================
  test.describe("8. Settings Tab", () => {
    test("90 - Settings tab overview", async ({ page }) => {
      await navigateToTab(page, TABS.SETTINGS);
      await screenshot(
        page,
        "90-settings-tab-overview",
        "Settings and configuration"
      );
    });

    test("91 - Settings tab visibility toggles", async ({ page }) => {
      await navigateToTab(page, TABS.SETTINGS);
      const tabSection = page.locator(
        ':has-text("Tab Visibility"), :has-text("Show/Hide"), :has-text("Visible Tabs")'
      );
      if (await tabSection.first().isVisible()) {
        await screenshot(
          page,
          "91-settings-tab-visibility",
          "Tab visibility toggles"
        );
      }
    });

    test("92 - Settings notifications config", async ({ page }) => {
      await navigateToTab(page, TABS.SETTINGS);
      const notifSection = page.locator(
        ':has-text("Notification"), :has-text("Alert"), :has-text("notify")'
      );
      if (await notifSection.first().isVisible()) {
        await screenshot(
          page,
          "92-settings-notifications",
          "Notification configuration"
        );
      }
    });

    test("93 - Settings daemon config (legacy)", async ({ page }) => {
      await navigateToTab(page, TABS.SETTINGS);
      const daemonSection = page.locator(
        ':has-text("Daemon"), :has-text("daemon"), :has-text("Server")'
      );
      if (await daemonSection.first().isVisible()) {
        await screenshot(
          page,
          "93-settings-daemon",
          "Legacy daemon configuration"
        );
      }
    });

    test("94 - Settings toggle interaction", async ({ page }) => {
      await navigateToTab(page, TABS.SETTINGS);
      // Find a toggle and hover
      const toggle = page
        .locator(
          'input[type="checkbox"], [role="switch"], button[class*="toggle"]'
        )
        .first();
      if (await toggle.isVisible()) {
        await toggle.hover();
        await screenshot(
          page,
          "94-settings-toggle-hover",
          "Settings toggle on hover"
        );
      }
    });

    test("95 - Settings full page", async ({ page }) => {
      await navigateToTab(page, TABS.SETTINGS);
      await fullPageScreenshot(page, "95-settings-full");
    });
  });

  // ============================================================
  // SECTION 9: STATES & INDICATORS
  // ============================================================
  test.describe("9. States & Indicators", () => {
    test("S1 - Paused indicator visible", async ({ page }) => {
      // Pause the dashboard
      await clickIfVisible(page, 'button:has-text("⏸")');
      await clickIfVisible(page, 'button:has-text("Pause")');
      // Look for paused indicator (often yellow)
      const pausedIndicator = page.locator(
        '[class*="yellow"], [class*="paused"], :has-text("Paused")'
      );
      if (await pausedIndicator.first().isVisible()) {
        await screenshot(
          page,
          "S1-paused-indicator",
          "Paused state indicator (yellow)"
        );
      }
      // Resume
      await clickIfVisible(page, 'button:has-text("▶")');
      await clickIfVisible(page, 'button:has-text("Resume")');
    });

    test("S2 - Connection lost state", async ({ page }) => {
      // We can't easily simulate connection loss, but screenshot current connection state
      await screenshot(
        page,
        "S2-connection-state",
        "Connection status indicator"
      );
    });

    test("S3 - Loading state", async ({ page }) => {
      // Refresh to potentially catch loading state
      await page.reload();
      // Try to catch loading spinner
      await screenshot(page, "S3-loading-state", "Loading/refresh state");
      await waitForStable(page);
    });
  });

  // ============================================================
  // SECTION 10: TAB TRANSITIONS
  // ============================================================
  test.describe("10. Tab Transitions", () => {
    test("T1 - All tabs via keyboard", async ({ page }) => {
      // Updated tab names after consolidation (keys 1-7)
      const tabNames = [
        "agents", // includes hooks
        "projects", // includes repos/git status
        "conversations",
        "analytics",
        "share", // contrib
        "docs",
        "settings" // includes activity
      ];
      for (let i = 0; i < tabNames.length; i++) {
        await page.keyboard.press(String(i + 1));
        await waitForStable(page);
        await screenshot(
          page,
          `T1-tab-${i + 1}-${tabNames[i]}`,
          `Tab ${i + 1}: ${tabNames[i]}`
        );
      }
    });

    test("T2 - Tab click navigation", async ({ page }) => {
      // Click on each tab button (7 tabs after consolidation)
      const tabs = page.locator('[role="tab"], button[class*="tab"]');
      const count = await tabs.count();
      for (let i = 0; i < Math.min(count, 7); i++) {
        await tabs.nth(i).click();
        await waitForStable(page);
      }
      await screenshot(
        page,
        "T2-tab-click-final",
        "After clicking through all tabs"
      );
    });
  });

  // ============================================================
  // SECTION 11: MODALS & OVERLAYS
  // ============================================================
  test.describe("11. Modals & Overlays", () => {
    test("M1 - Help modal", async ({ page }) => {
      await page.keyboard.press("?");
      await waitForStable(page);
      await screenshot(page, "M1-help-modal", "Help/keyboard shortcuts modal");
      await page.keyboard.press("Escape");
    });

    test("M2 - Agent detail modal", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      const row = page.locator("table tbody tr").first();
      if (await row.isVisible()) {
        await row.click();
        await waitForStable(page);
        await screenshot(page, "M2-agent-detail-modal", "Agent detail modal");
        await page.keyboard.press("Escape");
      }
    });

    test("M3 - Modal close with Escape", async ({ page }) => {
      await page.keyboard.press("?");
      await waitForStable(page);
      await page.keyboard.press("Escape");
      await waitForStable(page);
      await screenshot(
        page,
        "M3-modal-closed",
        "After closing modal with Escape"
      );
    });
  });

  // ============================================================
  // SECTION 12: FULL PAGE SCREENSHOTS
  // ============================================================
  test.describe("12. Full Page Screenshots", () => {
    test("F1 - Agents full", async ({ page }) => {
      await navigateToTab(page, TABS.AGENTS);
      await fullPageScreenshot(page, "F1-agents-full");
    });

    test("F2 - Projects full", async ({ page }) => {
      await navigateToTab(page, TABS.PROJECTS);
      await fullPageScreenshot(page, "F2-projects-full");
    });

    test("F3 - Analytics full", async ({ page }) => {
      await navigateToTab(page, TABS.ANALYTICS);
      await fullPageScreenshot(page, "F3-analytics-full");
    });

    test("F4 - Contrib full", async ({ page }) => {
      await navigateToTab(page, TABS.CONTRIB);
      await fullPageScreenshot(page, "F4-contrib-full");
    });

    test("F5 - Settings full", async ({ page }) => {
      await navigateToTab(page, TABS.SETTINGS);
      await fullPageScreenshot(page, "F5-settings-full");
    });
  });
});
