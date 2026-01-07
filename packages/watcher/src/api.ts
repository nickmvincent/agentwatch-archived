/**
 * Watcher API - Real-time monitoring server for AI coding agents.
 *
 * This is the main entry point for the Watcher HTTP/WebSocket server.
 * Routes are organized into modular files under `routes/`:
 *
 * - `routes/agents.ts` - Agent process monitoring and control
 * - `routes/hooks.ts` - Hook session capture and statistics
 * - `routes/monitoring.ts` - Health checks, repos, ports
 * - `routes/config.ts` - Watcher and Claude settings
 * - `routes/sandbox.ts` - Docker sandbox status and permission presets
 * - `routes/managed-sessions.ts` - Managed sessions launched via `aw run`
 *
 * ## Endpoints Overview
 *
 * ### Health & Status
 * - `GET /api/health` - Simple health check
 * - `GET /api/status` - Server status with uptime
 * - `POST /api/shutdown` - Trigger graceful shutdown
 *
 * ### Agents
 * - `GET /api/agents` - List detected agent processes
 * - `GET /api/agents/:pid` - Get agent details
 * - `POST /api/agents/:pid/kill` - Kill agent process
 * - `POST /api/agents/:pid/signal` - Send signal to agent
 *
 * ### Repositories
 * - `GET /api/repos` - List git repositories with status
 * - `POST /api/repos/rescan` - Trigger immediate rescan
 *
 * ### Ports
 * - `GET /api/ports` - List listening ports
 * - `GET /api/ports/:port` - Get port details
 *
 * ### Hook Sessions
 * - `GET /api/hooks/sessions` - List hook sessions
 * - `GET /api/hooks/sessions/:id` - Get session with tools
 * - `GET /api/hooks/sessions/:id/timeline` - Get tool timeline
 * - `GET /api/hooks/sessions/:id/commits` - Get session commits
 *
 * ### Hook Statistics
 * - `GET /api/hooks/tools/stats` - Aggregated tool statistics
 * - `GET /api/hooks/tools/recent` - Recent tool usages
 * - `GET /api/hooks/stats/daily` - Daily aggregated stats
 * - `GET /api/hooks/commits` - Recent git commits
 *
 * ### Hook Event Handlers (called by Claude Code)
 * - `POST /api/hooks/session-start`
 * - `POST /api/hooks/session-end`
 * - `POST /api/hooks/pre-tool-use`
 * - `POST /api/hooks/post-tool-use`
 * - `POST /api/hooks/stop`
 * - `POST /api/hooks/notification`
 * - `POST /api/hooks/permission-request`
 * - `POST /api/hooks/user-prompt-submit`
 *
 * ### Configuration
 * - `GET /api/config` - Get watcher configuration
 * - `GET /api/claude/settings` - Read Claude settings.json
 * - `PUT /api/claude/settings` - Replace Claude settings
 * - `PATCH /api/claude/settings` - Merge Claude settings
 *
 * ### Sandbox
 * - `GET /api/sandbox/status` - Docker/image/script installation status
 * - `GET /api/sandbox/presets` - List permission presets
 * - `GET /api/sandbox/presets/:id` - Get specific preset
 * - `POST /api/sandbox/presets/:id/apply` - Apply preset to Claude settings
 * - `GET /api/sandbox/current` - Current sandbox configuration
 *
 * ### WebSocket
 * - `GET /ws` - Real-time updates (agents, repos, ports, sessions)
 *
 * @module api
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket, serveStatic } from "hono/bun";

import type { EventBus } from "@agentwatch/core";
import {
  type DataStore,
  type HookStore,
  type SessionStore,
  PredictionStore
} from "@agentwatch/monitor";
import {
  repoToDict,
  agentToDict,
  portToDict,
  hookSessionToDict
} from "@agentwatch/shared-api";

import type { WatcherConfig } from "./config";
import type { ConnectionManager } from "./connection-manager";
import type { SessionLogger } from "./session-logger";
import { HookNotifier } from "./notifications";

// Import modular routes
import {
  registerAgentRoutes,
  registerAgentMetadataRoutes,
  registerHookSessionRoutes,
  registerHookStatsRoutes,
  registerHookEventRoutes,
  registerMonitoringRoutes,
  registerConfigRoutes,
  registerClaudeSettingsRoutes,
  registerSandboxRoutes,
  registerProjectRoutes,
  registerManagedSessionRoutes,
  registerConversationMetadataRoutes,
  registerEnrichmentRoutes,
  registerPredictionRoutes
} from "./routes";

const { upgradeWebSocket, websocket } = createBunWebSocket();

/** Export websocket handler for Bun.serve */
export { websocket };

/**
 * State required by the Watcher API.
 *
 * This is passed to createWatcherApp and provides access to:
 * - Data stores for agents, repos, ports, and hook sessions
 * - Session logging for audit trails
 * - Connection management for WebSocket broadcasts
 * - Configuration and lifecycle callbacks
 */
export interface WatcherAppState {
  /** In-memory store for agents, repos, and ports */
  store: DataStore;
  /** Hook session and tool usage tracking */
  hookStore: HookStore;
  /** Session logging to disk */
  sessionLogger: SessionLogger;
  /** Managed session store */
  sessionStore: SessionStore;
  /** WebSocket connection manager */
  connectionManager: ConnectionManager;
  /** Unified event bus for all agentwatch events */
  eventBus?: EventBus;
  /** Current watcher configuration */
  config: WatcherConfig;
  /** Server start timestamp (milliseconds) */
  startedAt: number;
  /** Callback to trigger graceful shutdown */
  shutdown?: () => void;
  /** Trigger immediate repo rescan */
  rescanRepos?: () => void;
}

/**
 * Create the Watcher Hono application.
 *
 * @param state - Application state and dependencies
 * @returns Configured Hono app instance
 *
 * @example
 * ```typescript
 * const app = createWatcherApp({
 *   store: new DataStore(),
 *   hookStore: new HookStore(),
 *   sessionLogger: new SessionLogger("/path/to/logs"),
 *   connectionManager: new ConnectionManager(),
 *   config: loadConfig(),
 *   startedAt: Date.now(),
 *   shutdown: () => process.exit(0)
 * });
 *
 * Bun.serve({
 *   port: 8420,
 *   fetch: app.fetch,
 *   websocket
 * });
 * ```
 */
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

  // =========== Register Modular Routes ===========

  // Health, status, repos, ports
  registerMonitoringRoutes(app, {
    store: state.store,
    startedAt: state.startedAt,
    shutdown: state.shutdown,
    rescanRepos: state.rescanRepos
  });

  // Agent monitoring and control
  registerAgentRoutes(app, state.store);

  // Agent metadata
  registerAgentMetadataRoutes(app, state.store);

  // Watcher configuration
  registerConfigRoutes(app, state.config);

  // Claude settings management
  registerClaudeSettingsRoutes(app);

  // Docker sandbox status and permission presets
  registerSandboxRoutes(app);

  // Projects (shared config with analyzer)
  registerProjectRoutes(app, state.store);

  // Conversation metadata (naming)
  registerConversationMetadataRoutes(app);

  // Enrichments (annotations)
  registerEnrichmentRoutes(app);

  // Hook sessions and timeline
  registerHookSessionRoutes(app, state.hookStore);

  // Hook statistics
  registerHookStatsRoutes(app, state.hookStore);

  // Managed sessions (aw run)
  const predictionStore = new PredictionStore();
  registerManagedSessionRoutes(app, state.sessionStore, { predictionStore });

  // Predictions and calibration (Command Center)
  registerPredictionRoutes(app, predictionStore);

  // Hook event handlers (called by Claude Code)
  // Create notifier if notifications are enabled
  const notifier = state.config.notifications.enable
    ? new HookNotifier({
        enable: state.config.notifications.enable,
        hookAwaitingInput: state.config.notifications.hookAwaitingInput,
        hookSessionEnd: state.config.notifications.hookSessionEnd,
        hookToolFailure: state.config.notifications.hookToolFailure,
        hookLongRunning: state.config.notifications.hookLongRunning,
        longRunningThresholdSeconds:
          state.config.notifications.longRunningThresholdSeconds
      })
    : undefined;
  registerHookEventRoutes(
    app,
    state.hookStore,
    state.connectionManager,
    notifier,
    state.config.notifications
  );

  // =========== Recent Events (from EventBus buffer) ===========
  if (state.eventBus) {
    const eventBus = state.eventBus;

    // GET /api/events/recent - Get recent events from in-memory buffer
    app.get("/api/events/recent", (c) => {
      const limit = Number(c.req.query("limit")) || 50;
      const category = c.req.query("category") as any;
      const action = c.req.query("action") as any;
      const since = c.req.query("since");

      const events = eventBus.getRecent({
        limit,
        category: category || undefined,
        action: action || undefined,
        since: since || undefined
      });

      return c.json({ events });
    });

    // GET /api/events/stats - Get EventBus buffer statistics
    app.get("/api/events/stats", (c) => {
      return c.json(eventBus.getStats());
    });
  }

  // =========== WebSocket ===========
  app.get(
    "/ws",
    upgradeWebSocket(() => ({
      onOpen: (_event, ws) => {
        state.connectionManager.connect(ws);

        // Send current state to new connection
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
        // Handle client messages (currently just ping/pong)
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
