/**
 * Watcher API routes.
 *
 * Handles:
 * - /api/health, /api/status, /api/shutdown
 * - /api/agents/* - Process monitoring
 * - /api/repos - Repository status
 * - /api/ports - Port monitoring
 * - /api/hooks/* - Hook capture endpoints
 * - /ws - WebSocket for real-time updates
 * - Static files for web UI
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket, serveStatic } from "hono/bun";
import type { ServerWebSocket } from "bun";

import type { DataStore, HookStore } from "@agentwatch/monitor";
import {
  repoToDict,
  agentToDict,
  portToDict,
  hookSessionToDict,
  toolUsageToDict,
  toolStatsToDict,
  dailyStatsToDict,
  gitCommitToDict,
  extractCommitHash,
  extractCommitMessage
} from "@agentwatch/shared-api";

import type { WatcherConfig } from "./config";
import type { ConnectionManager } from "./connection-manager";
import type { SessionLogger } from "./session-logger";

const { upgradeWebSocket } = createBunWebSocket();

export interface WatcherAppState {
  store: DataStore;
  hookStore: HookStore;
  sessionLogger: SessionLogger;
  connectionManager: ConnectionManager;
  config: WatcherConfig;
  startedAt: number;
  shutdown?: () => void;
}

export function createWatcherApp(state: WatcherAppState): Hono {
  const app = new Hono();

  // Request logging (enable with DEBUG=1)
  if (process.env.DEBUG) {
    app.use("*", logger());
  }

  // CORS for browser access
  app.use(
    "/api/*",
    cors({
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8421"
      ],
      credentials: true
    })
  );

  // Health check
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.get("/api/status", (c) => {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - state.startedAt) / 1000)
    );
    return c.json({
      status: "ok",
      component: "watcher",
      agent_count: state.store.snapshotAgents().length,
      repo_count: state.store.snapshotRepos().length,
      uptime_seconds: uptimeSeconds
    });
  });

  app.post("/api/shutdown", (c) => {
    setTimeout(() => state.shutdown?.(), 10);
    return c.json({ status: "ok" });
  });

  // =========== Agents ===========
  app.get("/api/agents", (c) => {
    const agents = state.store.snapshotAgents();
    return c.json(agents.map(agentToDict));
  });

  app.get("/api/agents/:pid", (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agents = state.store.snapshotAgents();
    const agent = agents.find((a) => a.pid === pid);

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    return c.json(agentToDict(agent));
  });

  // =========== Config ===========
  app.get("/api/config", (c) => {
    const cfg = state.config;
    return c.json({
      roots: cfg.roots,
      repo: {
        refresh_fast_seconds: cfg.repo.refreshFastSeconds,
        refresh_slow_seconds: cfg.repo.refreshSlowSeconds,
        include_untracked: cfg.repo.includeUntracked,
        show_clean: cfg.repo.showClean
      },
      watcher: {
        host: cfg.watcher.host,
        port: cfg.watcher.port,
        log_dir: cfg.watcher.logDir
      }
    });
  });

  // =========== Repos ===========
  app.get("/api/repos", (c) => {
    const showClean = c.req.query("show_clean") === "true";
    let repos = state.store.snapshotRepos();

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

  app.post("/api/repos/rescan", (c) => {
    // Trigger a rescan - the RepoScanner will pick this up
    // For now just acknowledge the request
    return c.json({ status: "ok", message: "Rescan triggered" });
  });

  // =========== Ports ===========
  app.get("/api/ports", (c) => {
    const ports = state.store.snapshotPorts();
    return c.json(ports.map(portToDict));
  });

  // =========== Hook Sessions ===========
  app.get("/api/hooks/sessions", (c) => {
    const active = c.req.query("active") === "true";
    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);

    const sessions = active
      ? state.hookStore.getActiveSessions()
      : state.hookStore.getAllSessions(limit);

    return c.json(sessions.map(hookSessionToDict));
  });

  app.get("/api/hooks/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const session = state.hookStore.getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const toolUsages = state.hookStore.getSessionToolUsages(sessionId);

    return c.json({
      ...hookSessionToDict(session),
      tool_usages: toolUsages.map(toolUsageToDict)
    });
  });

  app.get("/api/hooks/sessions/:id/timeline", (c) => {
    const sessionId = c.req.param("id");
    const toolUsages = state.hookStore.getSessionToolUsages(sessionId);
    return c.json(toolUsages.map(toolUsageToDict));
  });

  // =========== Hook Stats ===========
  app.get("/api/hooks/tools/stats", (c) => {
    const stats = state.hookStore.getToolStats();
    return c.json(stats.map(toolStatsToDict));
  });

  app.get("/api/hooks/tools/recent", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    // Get recent tool usages across all sessions
    const allSessions = state.hookStore.getAllSessions(100);
    const recentUsages: any[] = [];

    for (const session of allSessions) {
      const usages = state.hookStore.getSessionToolUsages(session.sessionId);
      recentUsages.push(...usages);
    }

    // Sort by timestamp descending and limit
    recentUsages.sort((a, b) => b.timestamp - a.timestamp);
    return c.json(recentUsages.slice(0, limit).map(toolUsageToDict));
  });

  app.get("/api/hooks/stats/daily", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "30", 10);
    const stats = state.hookStore.getDailyStats(limit);
    return c.json(stats.map(dailyStatsToDict));
  });

  app.get("/api/hooks/commits", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const commits = state.hookStore.getAllCommits(limit);
    return c.json(commits.map(gitCommitToDict));
  });

  app.get("/api/hooks/sessions/:id/commits", (c) => {
    const sessionId = c.req.param("id");
    const commits = state.hookStore.getAllCommits(100);
    const sessionCommits = commits.filter(
      (commit) => commit.sessionId === sessionId
    );
    return c.json(sessionCommits.map(gitCommitToDict));
  });

  // =========== Hook Event Handlers ===========
  // These are called by Claude Code hooks

  app.post("/api/hooks/session-start", async (c) => {
    const body = await c.req.json();
    const {
      session_id: sessionId,
      transcript_path: transcriptPath,
      cwd,
      permission_mode: permissionMode = "default",
      source = "startup"
    } = body;

    if (!sessionId || !cwd) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    state.hookStore.sessionStart(
      sessionId,
      transcriptPath ?? "",
      cwd,
      permissionMode,
      source
    );

    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/session-end", async (c) => {
    const body = await c.req.json();
    const { session_id: sessionId } = body;

    if (!sessionId) {
      return c.json({ error: "Missing session_id" }, 400);
    }

    state.hookStore.sessionEnd(sessionId);

    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/pre-tool-use", async (c) => {
    const body = await c.req.json();
    const {
      session_id: sessionId,
      tool_name: toolName,
      tool_input: toolInput,
      tool_use_id: toolUseId
    } = body;

    if (!sessionId || !toolName) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Record the tool usage start
    state.hookStore.recordPreToolUse(
      sessionId,
      toolUseId ?? `${sessionId}-${Date.now()}`,
      toolName,
      toolInput,
      body.cwd ?? ""
    );

    // Update session activity
    state.hookStore.updateSessionAwaiting(sessionId, false);

    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/post-tool-use", async (c) => {
    const body = await c.req.json();
    const {
      session_id: sessionId,
      tool_name: toolName,
      tool_use_id: toolUseId,
      tool_response: toolResponse,
      error,
      input_tokens: inputTokens,
      output_tokens: outputTokens
    } = body;

    if (!sessionId || !toolName) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Update tool usage with result
    state.hookStore.recordPostToolUse(
      toolUseId ?? `${sessionId}-recent`,
      toolResponse,
      error
    );

    // Update session token counts
    if (inputTokens || outputTokens) {
      state.hookStore.updateSessionTokens(
        sessionId,
        inputTokens ?? 0,
        outputTokens ?? 0,
        0 // estimatedCostUsd - computed by daemon from model pricing
      );
    }

    // Check for git commit
    if (toolName === "Bash" && toolResponse) {
      const commitHash = extractCommitHash(toolResponse);
      if (commitHash) {
        const message = extractCommitMessage(toolResponse);
        state.hookStore.recordCommit(
          sessionId,
          commitHash,
          message,
          body.cwd ?? ""
        );
      }
    }

    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/stop", async (c) => {
    // Stop hook - just acknowledge
    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/subagent-stop", async (c) => {
    // Subagent stop hook - just acknowledge
    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/notification", async (c) => {
    // Notification hook - relay to connected clients
    const body = await c.req.json();
    state.connectionManager.broadcast({
      type: "notification",
      ...body
    });
    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/permission-request", async (c) => {
    // Permission request - just allow for now
    return c.json({ result: "allow" });
  });

  app.post("/api/hooks/user-prompt-submit", async (c) => {
    const body = await c.req.json();
    const { session_id: sessionId } = body;

    if (sessionId) {
      state.hookStore.updateSessionAwaiting(sessionId, false);
    }

    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/pre-compact", async (c) => {
    // Pre-compact hook - just acknowledge
    return c.json({ result: "continue" });
  });

  // =========== WebSocket ===========
  app.get(
    "/ws",
    upgradeWebSocket((c) => ({
      onOpen: (_event, ws) => {
        state.connectionManager.connect(ws);

        // Send current state
        ws.send(
          JSON.stringify({
            type: "init",
            agents: state.store.snapshotAgents().map(agentToDict),
            repos: state.store.snapshotRepos().map(repoToDict),
            ports: state.store.snapshotPorts().map(portToDict),
            sessions: state.hookStore.getActiveSessions().map(hookSessionToDict)
          })
        );
      },
      onClose: (_event, ws) => {
        state.connectionManager.disconnect(ws);
      },
      onMessage: (event, ws) => {
        // Handle client messages if needed
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          // Ignore invalid messages
        }
      }
    }))
  );

  // =========== Static File Serving ===========
  // Look for built web UI in multiple locations
  const staticDirs = [
    join(process.cwd(), "web", "dist", "watcher"),
    join(process.cwd(), "web", "dist"),
    "/usr/share/agentwatch/web/watcher",
    join(homedir(), ".agentwatch", "web", "watcher")
  ];

  for (const staticDir of staticDirs) {
    const indexPath = join(staticDir, "index.html");
    if (existsSync(indexPath)) {
      // Serve static assets
      app.use("/assets/*", serveStatic({ root: staticDir }));

      // Serve index.html for root
      app.get("/", serveStatic({ path: indexPath }));

      // SPA fallback - serve index.html for all non-API routes
      app.get("*", async (c) => {
        const path = c.req.path;
        if (path.startsWith("/api/") || path === "/ws") {
          return c.notFound();
        }
        const file = Bun.file(indexPath);
        return new Response(file, {
          headers: { "Content-Type": "text/html" }
        });
      });

      break;
    }
  }

  return app;
}

export function watcherWebsocket(connectionManager: ConnectionManager) {
  return {
    open(ws: ServerWebSocket) {
      // Connection opened
    },
    message(ws: ServerWebSocket, message: string | ArrayBuffer | Uint8Array) {
      // Handle message
    },
    close(ws: ServerWebSocket) {
      // Connection closed
    }
  };
}
