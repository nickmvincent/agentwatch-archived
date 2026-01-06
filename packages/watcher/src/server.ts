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

  constructor(options: WatcherServerOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.store = new DataStore();
    this.hookStore = new HookStore();
    this.sessionStore = new SessionStore();
    this.sessionLogger = new SessionLogger(this.config.watcher.logDir);
    this.processLogger = new ProcessLogger();
    this.connectionManager = new ConnectionManager();

    // Set up store callbacks for broadcasts
    this.store.setCallbacks({
      onReposChange: (repos) => {
        this.connectionManager.broadcast({
          type: "repos_update",
          repos: repos.map((r) => repoToDict(r))
        });
      },
      onAgentsChange: (agents) => {
        this.connectionManager.broadcast({
          type: "agents_update",
          agents: agents.map((a) => agentToDict(a))
        });

        // Align managed sessions with live PIDs when we have data
        if (agents.length > 0) {
          this.sessionStore.markStaleSessions(
            new Set(agents.map((a) => a.pid))
          );
        }

        // Log process snapshots
        const agentMap = new Map(agents.map((a) => [a.pid, a]));
        this.processLogger.logProcesses(agentMap);
      },
      onPortsChange: (ports) => {
        this.connectionManager.broadcast({
          type: "ports_update",
          ports: ports.map((p) => portToDict(p))
        });
      }
    });

    // Set up hook store callbacks
    this.hookStore.setCallbacks({
      onSessionChange: (session) => {
        this.connectionManager.broadcast({
          type: "hook_session_update",
          session: hookSessionToDict(session)
        });
      },
      onToolUsage: (usage) => {
        this.connectionManager.broadcast({
          type: "hook_tool_complete",
          usage: toolUsageToDict(usage)
        });
      }
    });
  }

  async run(host?: string, port?: number): Promise<void> {
    if (this.started) return;

    const bindHost = host ?? this.config.watcher.host;
    const bindPort = port ?? this.config.watcher.port;

    // Start scanners
    this.startScanners();

    // Create HTTP server
    const app = createWatcherApp({
      store: this.store,
      hookStore: this.hookStore,
      sessionLogger: this.sessionLogger,
      sessionStore: this.sessionStore,
      connectionManager: this.connectionManager,
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
