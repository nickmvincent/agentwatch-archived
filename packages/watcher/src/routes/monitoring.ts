/**
 * System monitoring routes for repos and ports.
 *
 * Provides endpoints for:
 * - Repository status monitoring (git status, changes)
 * - Port scanning (listening services)
 * - Health checks and server status
 *
 * @module routes/monitoring
 */

import type { Hono } from "hono";
import type { DataStore } from "@agentwatch/monitor";
import { repoToDict, portToDict } from "@agentwatch/shared-api";

export interface MonitoringRouteOptions {
  /** DataStore containing snapshots */
  store: DataStore;
  /** Server start timestamp (ms) */
  startedAt: number;
  /** Callback to trigger shutdown */
  shutdown?: () => void;
  /** Trigger immediate repo rescan */
  rescanRepos?: () => void;
}

/**
 * Register system monitoring routes.
 *
 * @param app - The Hono app instance
 * @param options - Configuration options
 */
export function registerMonitoringRoutes(
  app: Hono,
  options: MonitoringRouteOptions
): void {
  const { store, startedAt, shutdown } = options;

  // =========== Health & Status ===========

  /**
   * GET /api/health
   *
   * Simple health check endpoint.
   *
   * @returns { status: "ok" }
   */
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  /**
   * GET /api/status
   *
   * Get watcher server status including uptime and counts.
   *
   * @returns Server status object
   */
  app.get("/api/status", (c) => {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - startedAt) / 1000)
    );
    return c.json({
      status: "ok",
      component: "watcher",
      agent_count: store.snapshotAgents().length,
      repo_count: store.snapshotRepos().length,
      uptime_seconds: uptimeSeconds
    });
  });

  /**
   * POST /api/shutdown
   *
   * Trigger a graceful server shutdown.
   *
   * @returns { status: "ok" }
   */
  app.post("/api/shutdown", (c) => {
    setTimeout(() => shutdown?.(), 10);
    return c.json({ status: "ok" });
  });

  // =========== Repositories ===========

  /**
   * GET /api/repos
   *
   * List monitored git repositories.
   *
   * By default, only shows repos with changes (staged, unstaged, untracked)
   * or in special states (conflict, rebase, merge).
   *
   * @query show_clean - If "true", include repos with no changes
   * @returns Array of repository status objects
   *
   * @example
   * ```bash
   * # Show only repos with changes
   * curl http://localhost:8420/api/repos
   *
   * # Show all repos including clean ones
   * curl http://localhost:8420/api/repos?show_clean=true
   * ```
   */
  app.get("/api/repos", (c) => {
    const showClean = c.req.query("show_clean") === "true";
    let repos = store.snapshotRepos();

    if (!showClean) {
      repos = repos.filter(
        (r) =>
          r.stagedCount > 0 ||
          r.unstagedCount > 0 ||
          r.untrackedCount > 0 ||
          r.specialState.conflict ||
          r.specialState.rebase ||
          r.specialState.merge
      );
    }

    return c.json(repos.map(repoToDict));
  });

  /**
   * POST /api/repos/rescan
   *
   * Trigger an immediate repository rescan.
   *
   * @returns { status: "ok", message: "Rescan triggered" }
   */
  app.post("/api/repos/rescan", (c) => {
    try {
      options.rescanRepos?.();
    } catch {
      // Ignore errors from scanner
    }
    return c.json({ status: "ok", message: "Rescan triggered" });
  });

  // =========== Ports ===========

  /**
   * GET /api/ports
   *
   * List listening ports on the system.
   *
   * @returns Array of port objects with process info
   */
  app.get("/api/ports", (c) => {
    const ports = store.snapshotPorts();
    return c.json(ports.map(portToDict));
  });

  /**
   * GET /api/ports/:port
   *
   * Get details for a specific listening port.
   *
   * @param port - Port number (integer)
   * @returns Port object or 404 if not listening
   */
  app.get("/api/ports/:port", (c) => {
    const portNum = Number.parseInt(c.req.param("port"), 10);
    const ports = store.snapshotPorts();
    const port = ports.find((p) => p.port === portNum);

    if (!port) {
      return c.json({ error: "Port not found" }, 404);
    }

    return c.json(portToDict(port));
  });
}
