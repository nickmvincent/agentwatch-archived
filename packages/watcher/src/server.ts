/**
 * Watcher server that handles real-time monitoring of AI coding agents.
 *
 * Responsibilities:
 * - Process scanning (detect running Claude/Codex/Gemini sessions)
 * - Repository status monitoring
 * - Port scanning
 * - Hook capture (session lifecycle, tool usage)
 * - Real-time WebSocket broadcasts
 */

import type { AgentProcess, ListeningPort, RepoStatus } from "@agentwatch/core";
import { EventBus } from "@agentwatch/core";
import {
  DataStore,
  HookStore,
  PortScanner,
  ProcessLogger,
  ProcessScanner,
  RepoScanner,
  SessionStore
} from "@agentwatch/monitor";
import {
  repoToDict,
  agentToDict,
  portToDict,
  hookSessionToDict,
  toolUsageToDict
} from "@agentwatch/shared-api";

import { type WatcherConfig, loadConfig } from "./config";
import { ConnectionManager } from "./connection-manager";
import { PidFile } from "./pid-file";
import { SessionLogger } from "./session-logger";
import { createWatcherApp, websocket } from "./api";
import { managedSessionToDict } from "./routes/managed-sessions";

export interface WatcherServerOptions {
  config?: WatcherConfig;
  host?: string;
  port?: number;
}

export class WatcherServer {
  private config: WatcherConfig;
  private store: DataStore;
  private hookStore: HookStore;
  private sessionStore: SessionStore;
  private eventBus: EventBus;
  private processScanner: ProcessScanner | null = null;
  private repoScanner: RepoScanner | null = null;
  private portScanner: PortScanner | null = null;
  private sessionLogger: SessionLogger;
  private processLogger: ProcessLogger;
  private connectionManager: ConnectionManager;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private startedAt = 0;

  // State tracking for change detection
  private previousAgentPids: Set<number> = new Set();
  private previousPorts: Set<number> = new Set();

  constructor(options: WatcherServerOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.store = new DataStore();
    this.hookStore = new HookStore();
    this.sessionStore = new SessionStore();
    this.eventBus = new EventBus();
    this.sessionLogger = new SessionLogger(this.config.watcher.logDir);
    this.processLogger = new ProcessLogger();
    this.connectionManager = new ConnectionManager();

    // Subscribe EventBus to WebSocket broadcasts
    // Broadcasts unified agentwatch_event alongside legacy types
    this.eventBus.subscribe((event) => {
      this.connectionManager.broadcast({
        type: "agentwatch_event",
        event
      });
    });

    this.sessionStore.setCallback((session) => {
      // Legacy broadcast
      this.connectionManager.broadcast({
        type: "managed_session_update",
        session: managedSessionToDict(session)
      });

      // Emit unified event
      const action =
        session.status === "running"
          ? "start"
          : session.status === "completed" || session.status === "failed"
            ? "end"
            : "update";
      this.eventBus.emit({
        category: "managed_session",
        action,
        entityId: session.id,
        description: `Managed session ${action}: ${session.prompt.slice(0, 50)}${session.prompt.length > 50 ? "..." : ""}`,
        details: {
          status: session.status,
          agent: session.agent,
          cwd: session.cwd
        },
        source: "watcher"
      });
    });

    // Set up store callbacks for broadcasts
    this.store.setCallbacks({
      onReposChange: (repos) => {
        // Legacy broadcast
        this.connectionManager.broadcast({
          type: "repos_update",
          repos: repos.map((r) => repoToDict(r))
        });
        // Note: Repo events are high-frequency; emit sparingly (e.g., on dirty→clean transitions)
        // For now, skip per-update events for repos to avoid noise
      },
      onAgentsChange: (agents) => {
        // Legacy broadcast
        this.connectionManager.broadcast({
          type: "agents_update",
          agents: agents.map((a) => agentToDict(a))
        });

        // Detect new and ended agents
        const currentPids = new Set(agents.map((a) => a.pid));
        const agentMap = new Map(agents.map((a) => [a.pid, a]));

        // Emit events for newly discovered agents
        for (const agent of agents) {
          if (!this.previousAgentPids.has(agent.pid)) {
            this.eventBus.emit({
              category: "process",
              action: "discover",
              entityId: String(agent.pid),
              description: `Agent discovered: ${agent.label}`,
              details: {
                label: agent.label,
                cwd: agent.cwd,
                exe: agent.exe
              },
              source: "scanner"
            });
          }
        }

        // Emit events for ended agents
        for (const pid of this.previousAgentPids) {
          if (!currentPids.has(pid)) {
            this.eventBus.emit({
              category: "process",
              action: "end",
              entityId: String(pid),
              description: `Agent ended: PID ${pid}`,
              source: "scanner"
            });
          }
        }

        this.previousAgentPids = currentPids;

        // Align managed sessions with live PIDs
        this.sessionStore.markStaleSessions(currentPids);

        // Log process snapshots
        this.processLogger.logProcesses(agentMap);
      },
      onPortsChange: (ports) => {
        // Legacy broadcast
        this.connectionManager.broadcast({
          type: "ports_update",
          ports: ports.map((p) => portToDict(p))
        });

        // Detect new and closed ports
        const currentPorts = new Set(ports.map((p) => p.port));

        // Emit events for newly opened ports
        for (const port of ports) {
          if (!this.previousPorts.has(port.port)) {
            this.eventBus.emit({
              category: "port",
              action: "start",
              entityId: String(port.port),
              description: `Port opened: ${port.port} (${port.protocol || "unknown"})`,
              details: {
                port: port.port,
                protocol: port.protocol,
                agentPid: port.agentPid
              },
              source: "scanner"
            });
          }
        }

        // Emit events for closed ports
        for (const port of this.previousPorts) {
          if (!currentPorts.has(port)) {
            this.eventBus.emit({
              category: "port",
              action: "end",
              entityId: String(port),
              description: `Port closed: ${port}`,
              source: "scanner"
            });
          }
        }

        this.previousPorts = currentPorts;
      }
    });

    // Set up hook store callbacks
    this.hookStore.setCallbacks({
      onSessionChange: (session) => {
        // Legacy broadcast
        this.connectionManager.broadcast({
          type: "hook_session_update",
          session: hookSessionToDict(session)
        });

        // Emit unified event
        const action = session.endTime ? "end" : "start";
        this.eventBus.emit({
          category: "hook_session",
          action,
          entityId: session.sessionId,
          description: `Hook session ${action}: ${session.cwd}`,
          details: {
            cwd: session.cwd,
            toolCount: session.toolCount,
            permissionMode: session.permissionMode
          },
          source: "hook"
        });
      },
      onToolUsage: (usage) => {
        // Legacy broadcast
        this.connectionManager.broadcast({
          type: "hook_tool_complete",
          usage: toolUsageToDict(usage)
        });

        // Emit unified event
        this.eventBus.emit({
          category: "tool_usage",
          action: usage.error ? "update" : "create",
          entityId: usage.toolUseId,
          description: `Tool ${usage.toolName}: ${usage.error ? "failed" : "completed"}`,
          details: {
            sessionId: usage.sessionId,
            toolName: usage.toolName,
            durationMs: usage.durationMs,
            success: usage.success,
            error: usage.error
          },
          source: "hook"
        });
      }
    });
  }

  async run(host?: string, port?: number): Promise<void> {
    if (this.started) return;

    const bindHost = host ?? this.config.watcher.host;
    const bindPort = port ?? this.config.watcher.port;

    // Mark any previously "running" sessions as stale on startup
    // (handles case where watcher restarted and processes have exited)
    // Use 0ms threshold to immediately mark all PID-less sessions as stale
    this.sessionStore.markStaleSessions(new Set(), 0);

    // Start scanners
    this.startScanners();

    // Start EventBus lifecycle
    this.eventBus.start();

    // Create HTTP server
    const app = createWatcherApp({
      store: this.store,
      hookStore: this.hookStore,
      sessionLogger: this.sessionLogger,
      sessionStore: this.sessionStore,
      connectionManager: this.connectionManager,
      eventBus: this.eventBus,
      config: this.config,
      startedAt: Date.now(),
      rescanRepos: () => this.repoScanner?.rescan(),
      shutdown: () => this.stop()
    });

    this.server = Bun.serve({
      hostname: bindHost,
      port: bindPort,
      fetch: app.fetch,
      websocket
    });

    this.started = true;
    this.startedAt = Date.now();

    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(
      () => {
        this.sessionLogger.rotateLogs();
        this.hookStore.cleanupOldData();
        this.sessionStore.cleanup();
      },
      60 * 60 * 1000
    );

    console.log(`Watcher listening on http://${bindHost}:${bindPort}`);

    // Keep running
    await new Promise(() => {});
  }

  private startScanners(): void {
    // Process scanner
    this.processScanner = new ProcessScanner(this.store, {
      refreshSeconds: 2
    });
    this.processScanner.start();

    // Repo scanner
    this.repoScanner = new RepoScanner(this.store, {
      roots: this.config.roots,
      refreshFastSeconds: this.config.repo.refreshFastSeconds,
      refreshSlowSeconds: this.config.repo.refreshSlowSeconds
    });
    this.repoScanner.start();

    // Port scanner
    this.portScanner = new PortScanner(this.store);
    this.portScanner.start();
  }

  private stopScanners(): void {
    this.processScanner?.stop();
    this.repoScanner?.stop();
    this.portScanner?.stop();
    this.processScanner = null;
    this.repoScanner = null;
    this.portScanner = null;
  }

  stop(): void {
    if (!this.started) return;

    this.stopScanners();
    this.eventBus.stop();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.server?.stop();
    this.server = null;
    this.started = false;

    this.sessionLogger.closeAll();

    console.log("Watcher stopped");
    process.exit(0);
  }

  get isRunning(): boolean {
    return this.started;
  }
}
