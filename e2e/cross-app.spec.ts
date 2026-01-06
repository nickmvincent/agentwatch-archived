/**
 * Cross-App Navigation Tests
 *
 * Tests the integration between Watcher (port 8420) and Analyzer (port 8421):
 * - Watcher header shows "Open Analyzer" button with correct state
 * - Analyzer shows AgentStatusWidget connected to Watcher
 * - Cross-app links work correctly
 */

import { expect, test, type Page } from "@playwright/test";

// Mock watcher API responses
async function mockWatcherApi(page: Page) {
  await page.route("**/api/health", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" })
    });
  });

  await page.route("**/api/status", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        component: "watcher",
        uptime_seconds: 120
      })
    });
  });

  await page.route("**/api/agents", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          pid: 12345,
          label: "claude",
          cwd: "/tmp/test-project",
          cpu_pct: 15.5,
          rss_kb: 256000,
          start_time: Date.now() - 300000,
          heuristic_state: { state: "ACTIVE" }
        },
        {
          pid: 12346,
          label: "codex",
          cwd: "/tmp/another-project",
          cpu_pct: 5.2,
          rss_kb: 128000,
          start_time: Date.now() - 600000,
          heuristic_state: { state: "IDLE" }
        }
      ])
    });
  });

  await page.route("**/api/hooks/sessions**", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          session_id: "session-1",
          active: true,
          tool_count: 5,
          cwd: "/tmp/test-project",
          start_time: Date.now() - 300000,
          last_activity: Date.now() - 10000
        }
      ])
    });
  });

  await page.route("**/api/repos", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/api/ports", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/api/sandbox/status", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        docker: { installed: true, running: true, version: "24.0.5" },
        image: { exists: true, imageId: "abc123" },
        script: { installed: true, executable: true },
        ready: true
      })
    });
  });

  await page.route("**/api/config", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });
}

test.describe("Watcher UI - Cross-App Features", () => {
  test.beforeEach(async ({ page }) => {
    await mockWatcherApi(page);
  });

  test("WatcherHeader shows sandbox status indicator", async ({ page }) => {
    // This test would run against watcher on port 8420
    // For now, we verify the component renders with mocked data
    await page.goto("http://localhost:8420");

    // Should show sandbox ready indicator
    await expect(page.getByText("Sandbox Ready")).toBeVisible({ timeout: 10000 });
  });

  test("WatcherHeader shows Open Analyzer button", async ({ page }) => {
    await page.goto("http://localhost:8420");

    // Should have Open Analyzer button (may show "not running" if analyzer isn't up)
    const analyzerButton = page.getByRole("button", { name: /Analyzer/i });
    await expect(analyzerButton).toBeVisible({ timeout: 10000 });
  });

  test("Agents tab shows active sessions count", async ({ page }) => {
    await page.goto("http://localhost:8420");

    // Header should show session count
    await expect(page.getByText("1 sessions")).toBeVisible({ timeout: 10000 });

    // Should show agent count
    await expect(page.getByText("2 agents")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Analyzer UI - Watcher Integration", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the analyzer's calls to watcher
    await page.route("http://localhost:8420/api/**", async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname === "/api/health") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok" })
        });
      }

      if (url.pathname === "/api/status") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "ok",
            component: "watcher",
            uptime_seconds: 120
          })
        });
      }

      if (url.pathname === "/api/agents") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              pid: 12345,
              label: "claude",
              cwd: "/tmp/test-project",
              cpu_pct: 15.5,
              rss_kb: 256000,
              heuristic_state: { state: "ACTIVE" }
            }
          ])
        });
      }

      if (url.pathname.startsWith("/api/hooks/sessions")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              session_id: "session-1",
              active: true,
              tool_count: 5,
              cwd: "/tmp/test-project"
            }
          ])
        });
      }

      return route.fallback();
    });

    // Mock analyzer's own API
    await page.route("http://localhost:8421/api/**", async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname === "/api/health") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok" })
        });
      }

      if (url.pathname === "/api/heartbeat") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok", timestamp: Date.now() })
        });
      }

      if (url.pathname === "/api/transcripts") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ transcripts: [], total: 0 })
        });
      }

      if (url.pathname === "/api/enrichments") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ sessions: [], stats: { total: 0 } })
        });
      }

      if (url.pathname === "/api/projects") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([])
        });
      }

      if (url.pathname === "/api/config") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({})
        });
      }

      return route.fallback();
    });
  });

  test("AgentStatusWidget shows when watcher is connected", async ({ page }) => {
    await page.goto("http://localhost:8421");

    // Widget should appear in bottom-right corner
    // Shows agent activity indicator
    await expect(page.locator(".fixed.bottom-4.right-4")).toBeVisible({
      timeout: 10000
    });
  });

  test("AgentStatusWidget shows active agent count", async ({ page }) => {
    await page.goto("http://localhost:8421");

    // Should show the active agent indicator (green dot + count)
    const widget = page.locator(".fixed.bottom-4.right-4");
    await expect(widget).toBeVisible({ timeout: 10000 });

    // Should have green indicator for active agent
    await expect(widget.locator(".bg-green-400")).toBeVisible();
  });

  test("Watcher connection status shown in header", async ({ page }) => {
    await page.goto("http://localhost:8421");

    // Header should show connected status
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 10000 });
  });
});
