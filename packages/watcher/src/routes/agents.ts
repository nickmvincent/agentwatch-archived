/**
 * Agent monitoring and control routes.
 *
 * Provides endpoints for:
 * - Listing detected agent processes (Claude, Codex, Gemini, etc.)
 * - Getting details for specific agents
 * - Sending signals to agents (kill, suspend, continue)
 *
 * Agent detection is performed by the ProcessScanner which looks for
 * known agent executables and patterns in running processes.
 *
 * @module routes/agents
 */

import type { Hono } from "hono";
import type { DataStore } from "@agentwatch/monitor";
import { agentToDict } from "@agentwatch/shared-api";

/**
 * Signal name to POSIX signal mapping.
 * Used by the /api/agents/:pid/signal endpoint.
 */
const SIGNAL_MAP: Record<string, NodeJS.Signals> = {
  /** Send interrupt signal (like Ctrl+C) */
  interrupt: "SIGINT",
  /** Suspend the process (like Ctrl+Z) */
  suspend: "SIGTSTP",
  /** Resume a suspended process */
  continue: "SIGCONT",
  /** Request graceful termination */
  terminate: "SIGTERM",
  /** Force kill (cannot be caught) */
  kill: "SIGKILL"
};

/**
 * Register agent monitoring routes on a Hono app.
 *
 * @param app - The Hono app instance
 * @param store - DataStore containing agent process snapshots
 *
 * @example
 * ```typescript
 * const app = new Hono();
 * registerAgentRoutes(app, dataStore);
 * ```
 */
export function registerAgentRoutes(app: Hono, store: DataStore): void {
  /**
   * GET /api/agents
   *
   * List all detected agent processes.
   *
   * @returns Array of agent objects with pid, name, cwd, command, etc.
   */
  app.get("/api/agents", (c) => {
    const agents = store.snapshotAgents();
    return c.json(agents.map(agentToDict));
  });

  /**
   * GET /api/agents/:pid
   *
   * Get details for a specific agent by process ID.
   *
   * @param pid - Process ID (integer)
   * @returns Agent object or 404 if not found
   */
  app.get("/api/agents/:pid", (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agents = store.snapshotAgents();
    const agent = agents.find((a) => a.pid === pid);

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    return c.json(agentToDict(agent));
  });

  /**
   * POST /api/agents/:pid/kill
   *
   * Kill an agent process.
   *
   * @param pid - Process ID to kill
   * @body force - If true, send SIGKILL instead of SIGTERM
   * @returns { success: true } or 404 if process not found
   */
  app.post("/api/agents/:pid/kill", async (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const body = (await c.req.json().catch(() => ({}))) as { force?: boolean };
    const force = body.force ?? false;

    try {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
      return c.json({ success: true });
    } catch {
      return c.json({ error: "Process not found" }, 404);
    }
  });

  /**
   * POST /api/agents/:pid/signal
   *
   * Send a signal to an agent process.
   *
   * @param pid - Process ID to signal
   * @body signal - One of: interrupt, suspend, continue, terminate, kill
   * @returns { success: true } or error
   *
   * @example
   * ```bash
   * curl -X POST http://localhost:8420/api/agents/12345/signal \
   *   -H "Content-Type: application/json" \
   *   -d '{"signal": "suspend"}'
   * ```
   */
  app.post("/api/agents/:pid/signal", async (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const body = (await c.req.json().catch(() => ({}))) as { signal?: string };
    const signal = body.signal;

    if (!signal || !(signal in SIGNAL_MAP)) {
      if (signal === "eof") {
        return c.json(
          { error: "EOF requires stdin access (use wrapped mode)" },
          400
        );
      }
      return c.json(
        {
          error: `Invalid signal: ${signal}. Valid: ${Object.keys(SIGNAL_MAP).join(", ")}`
        },
        400
      );
    }

    try {
      process.kill(pid, SIGNAL_MAP[signal]);
      return c.json({ success: true });
    } catch {
      return c.json({ error: "Process not found" }, 404);
    }
  });

  /**
   * DELETE /api/agents/:pid
   *
   * Alias for /api/agents/:pid/kill (legacy compatibility).
   */
  app.delete("/api/agents/:pid", async (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const body = (await c.req.json().catch(() => ({}))) as { force?: boolean };
    const force = body.force ?? false;

    try {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
      return c.json({ success: true });
    } catch {
      return c.json({ error: "Process not found" }, 404);
    }
  });

  /**
   * GET /api/agents/:pid/output
   *
   * Placeholder endpoint for agent output (not yet implemented).
   */
  app.get("/api/agents/:pid/output", (c) => {
    return c.json(
      {
        lines: [],
        error: "Agent output capture not implemented in watcher"
      },
      501
    );
  });

  /**
   * POST /api/agents/:pid/input
   *
   * Send input to an agent's stdin.
   *
   * Note: This is only supported for agents started with `aw run` (wrapped mode).
   * Scanned processes don't have stdin access.
   *
   * @param pid - Process ID
   * @returns 501 Not Implemented for scanned processes
   */
  app.post("/api/agents/:pid/input", async (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agents = store.snapshotAgents();
    const agent = agents.find((a) => a.pid === pid);

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    return c.json(
      {
        success: false,
        error:
          "Input not supported for scanned processes. Use wrapped mode (aw run) for stdin access."
      },
      501
    );
  });
}
