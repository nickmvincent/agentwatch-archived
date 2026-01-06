/**
 * Monitoring and lifecycle routes.
 *
 * Provides endpoints for:
 * - Health checks and server status
 * - Browser lifecycle (heartbeat, shutdown)
 * - Watcher proxy
 *
 * @module routes/monitoring
 */

import type { Hono } from "hono";
import type { AnalyzerAppState } from "../api";

/**
 * Register monitoring and lifecycle routes.
 *
 * @param app - The Hono app instance
 * @param state - Analyzer app state
 */
export function registerMonitoringRoutes(
  app: Hono,
  state: AnalyzerAppState
): void {
  /**
   * GET /api/health
   *
   * Simple health check.
   *
   * @returns { status: "ok" }
   */
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  /**
   * GET /api/config
   *
   * Proxy config from watcher.
   *
   * @returns Watcher configuration or error
   */
  app.get("/api/config", async (c) => {
    try {
      const res = await fetch(`${state.watcherUrl}/api/config`);
      if (res.ok) {
        const config = await res.json();
        return c.json(config);
      }
      return c.json({ error: "Watcher not available" }, 503);
    } catch {
      return c.json({ error: "Watcher not available" }, 503);
    }
  });

  /**
   * PATCH /api/config
   *
   * Proxy config updates to watcher.
   */
  app.patch("/api/config", async (c) => {
    try {
      const body = await c.req.json();
      const res = await fetch(`${state.watcherUrl}/api/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return c.json(data, res.status);
    } catch {
      return c.json({ error: "Watcher not available" }, 503);
    }
  });

  /**
   * GET /api/config/raw
   *
   * Proxy raw config from watcher.
   */
  app.get("/api/config/raw", async (c) => {
    try {
      const res = await fetch(`${state.watcherUrl}/api/config/raw`);
      const data = await res.json();
      return c.json(data, res.status);
    } catch {
      return c.json({ error: "Watcher not available" }, 503);
    }
  });

  /**
   * PUT /api/config/raw
   *
   * Proxy raw config updates to watcher.
   */
  app.put("/api/config/raw", async (c) => {
    try {
      const body = await c.req.json();
      const res = await fetch(`${state.watcherUrl}/api/config/raw`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return c.json(data, res.status);
    } catch {
      return c.json({ error: "Watcher not available" }, 503);
    }
  });

  /**
   * GET /api/status
   *
   * Get analyzer server status including uptime.
   *
   * @returns {
   *   status: "ok",
   *   component: "analyzer",
   *   uptime_seconds: number,
   *   watcher_url: string
   * }
   */
  app.get("/api/status", (c) => {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - state.startedAt) / 1000)
    );
    return c.json({
      status: "ok",
      component: "analyzer",
      uptime_seconds: uptimeSeconds,
      watcher_url: state.watcherUrl
    });
  });

  /**
   * POST /api/heartbeat
   *
   * Browser lifecycle heartbeat.
   * Used to detect if the browser is still connected.
   *
   * @returns { status: "ok", timestamp: number }
   */
  app.post("/api/heartbeat", (c) => {
    return c.json({ status: "ok", timestamp: Date.now() });
  });

  /**
   * POST /api/shutdown
   *
   * Trigger graceful server shutdown.
   *
   * @returns { status: "ok" }
   */
  app.post("/api/shutdown", (c) => {
    setTimeout(() => state.shutdown?.(), 10);
    return c.json({ status: "ok" });
  });
}
