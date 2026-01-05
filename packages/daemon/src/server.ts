/**
 * Daemon server that orchestrates all background services.
 */

import type { AgentProcess, ListeningPort, RepoStatus } from "@agentwatch/core";
import {
  DataStore,
  HookStore,
  PortScanner,
  ProcessLogger,
  ProcessScanner,
  RepoScanner,
  SessionStore,
  PredictionStore
} from "@agentwatch/monitor";

import { type AppState, createApp, websocket } from "./api";
import { logAuditEvent } from "./audit-log";
import { type Config, loadConfig } from "./config";
import { ConnectionManager } from "./connection-manager";
import { PidFile } from "./pid-file";
import { SessionLogger } from "./session-logger";

import { CostLimitsChecker, CostTracker } from "./cost";
import { NotificationHub } from "./notifications/hub";
// Hook enhancement services
import { RuleEngine } from "./rules";
// Transcript index
import {
  type TranscriptIndex,
  isIncrementalUpdateDue,
  loadTranscriptIndex,
  updateTranscriptIndex
} from "./transcript-index";
import { ProcessRunner } from "./process-runner";

export interface DaemonServerOptions {
  config?: Config;
  host?: string;
  port?: number;
}

export class DaemonServer {
  private config: Config;
  private store: DataStore;
  private hookStore: HookStore;
  private processScanner: ProcessScanner | null = null;
  private repoScanner: RepoScanner | null = null;
  private portScanner: PortScanner | null = null;
  private sessionLogger: SessionLogger;
  private sessionStore: SessionStore;
  private processLogger: ProcessLogger;
  private connectionManager: ConnectionManager;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private startedAt = 0;

  // Hook enhancement services
  private ruleEngine: RuleEngine;
  private costTracker: CostTracker;
  private costLimitsChecker: CostLimitsChecker;
  private notificationHub: NotificationHub;

  // Transcript index for fast discovery
  private transcriptIndex: TranscriptIndex;
  private transcriptUpdateInterval: ReturnType<typeof setInterval> | null =
    null;

  // Command Center services
  private predictionStore: PredictionStore;
  private processRunner: ProcessRunner;

  constructor(options: DaemonServerOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.store = new DataStore();
    this.hookStore = new HookStore();
    this.sessionLogger = new SessionLogger(this.config.daemon.logDir);
    this.sessionStore = new SessionStore();
    this.processLogger = new ProcessLogger();
    this.connectionManager = new ConnectionManager();

    // Initialize hook enhancement services
    this.ruleEngine = new RuleEngine();
    this.costTracker = new CostTracker();
    this.costLimitsChecker = new CostLimitsChecker(
      this.config.hookEnhancements.costControls,
      this.costTracker
    );
    this.notificationHub = new NotificationHub(
      this.config.hookEnhancements.notificationHub
    );

    // Load transcript index
    this.transcriptIndex = loadTranscriptIndex();

    // Initialize Command Center services
    this.predictionStore = new PredictionStore();
    this.processRunner = new ProcessRunner(this.sessionStore);

    // Set up store callbacks for broadcasts
    this.store.setCallbacks({
      onReposChange: (repos) => {
        this.connectionManager.broadcast({
          type: "repos_update",
          repos: repos.map(this.repoToDict)
        });
      },
      onAgentsChange: (agents) => {
        this.connectionManager.broadcast({
          type: "agents_update",
          agents: agents.map(this.agentToDict)
        });

        // Log process snapshots
        const agentMap = new Map(agents.map((a) => [a.pid, a]));
        this.processLogger.logProcesses(agentMap);

        // Clean up dead sessions and orphaned wrapper states when agents change
        this.cleanupDeadState();
      },
      onPortsChange: (ports) => {
        this.connectionManager.broadcast({
          type: "ports_update",
          ports: ports.map(this.portToDict)
        });
      }
    });

    // Set up hook store callbacks
    this.hookStore.setCallbacks({
      onSessionChange: (session) => {
        this.connectionManager.broadcast({
          type: "hook_session_update",
          session: {
            session_id: session.sessionId,
            transcript_path: session.transcriptPath,
            cwd: session.cwd,
            start_time: session.startTime,
            end_time: session.endTime ?? null,
            permission_mode: session.permissionMode,
            source: session.source,
            tool_count: session.toolCount,
            last_activity: session.lastActivity,
            awaiting_user: session.awaitingUser,
            tools_used: session.toolsUsed,
            active: session.endTime === undefined,
            commits: session.commits
          }
        });
      },
      onToolUsage: (usage) => {
        this.connectionManager.broadcast({
          type: "hook_tool_complete",
          usage: {
            tool_use_id: usage.toolUseId,
            tool_name: usage.toolName,
            tool_input: usage.toolInput,
            timestamp: usage.timestamp,
            session_id: usage.sessionId,
            cwd: usage.cwd,
            success: usage.success ?? null,
            duration_ms: usage.durationMs ?? null,
            tool_response: usage.toolResponse ?? null,
            error: usage.error ?? null
          }
        });
      }
    });

    // Set up managed session store callbacks for audit logging
    this.sessionStore.setCallback((session) => {
      // Determine if this is a start, end, or update
      const isEnded = session.endedAt !== undefined;
      const durationMs = isEnded
        ? session.endedAt! - session.startedAt
        : Date.now() - session.startedAt;
      const durationSec = Math.round(durationMs / 1000);

      if (isEnded) {
        // Session ended
        logAuditEvent(
          "managed_session",
          "end",
          session.id,
          `Managed session ${session.status}: ${session.agent} (${durationSec}s, exit ${session.exitCode ?? "?"})`,
          {
            agent: session.agent,
            prompt: session.prompt,
            cwd: session.cwd,
            pid: session.pid,
            status: session.status,
            exitCode: session.exitCode,
            durationMs
          },
          "api"
        );
      } else if (session.pid === undefined) {
        // New session (no PID yet)
        logAuditEvent(
          "managed_session",
          "start",
          session.id,
          `Managed session started: ${session.agent} - "${session.prompt.slice(0, 50)}${session.prompt.length > 50 ? "..." : ""}"`,
          {
            agent: session.agent,
            prompt: session.prompt,
            cwd: session.cwd
          },
          "api"
        );
      }
      // Note: PID updates are not logged separately to avoid noise
    });
  }

  private repoToDict(repo: RepoStatus): Record<string, unknown> {
    return {
      repo_id: repo.repoId,
      path: repo.path,
      name: repo.name,
      branch: repo.branch,
      dirty:
        repo.stagedCount > 0 ||
        repo.unstagedCount > 0 ||
        repo.untrackedCount > 0,
      staged: repo.stagedCount,
      unstaged: repo.unstagedCount,
      untracked: repo.untrackedCount,
      conflict: repo.specialState.conflict,
      rebase: repo.specialState.rebase,
      merge: repo.specialState.merge,
      cherry_pick: repo.specialState.cherryPick,
      revert: repo.specialState.revert,
      ahead: repo.upstream.ahead ?? 0,
      behind: repo.upstream.behind ?? 0,
      upstream_name: repo.upstream.upstreamName ?? null,
      last_error: repo.health.lastError ?? null,
      timed_out: repo.health.timedOut,
      last_scan_time: repo.lastScanTime,
      last_change_time: repo.lastChangeTime
    };
  }

  private agentToDict(agent: AgentProcess): Record<string, unknown> {
    return {
      pid: agent.pid,
      label: agent.label,
      cmdline: agent.cmdline,
      exe: agent.exe,
      cpu_pct: agent.cpuPct,
      rss_kb: agent.rssKb,
      threads: agent.threads,
      cwd: agent.cwd,
      repo_path: agent.repoPath,
      start_time: agent.startTime,
      heuristic_state: agent.heuristicState
        ? {
            state: agent.heuristicState.state,
            cpu_pct_recent: agent.heuristicState.cpuPctRecent,
            quiet_seconds: agent.heuristicState.quietSeconds
          }
        : null,
      wrapper_state: agent.wrapperState
        ? {
            state: agent.wrapperState.state,
            awaiting_user: agent.wrapperState.awaitingUser,
            last_output_time: agent.wrapperState.lastOutputTime,
            cmdline: agent.wrapperState.cmdline,
            cwd: agent.wrapperState.cwd,
            label: agent.wrapperState.label,
            start_time: agent.wrapperState.startTime
          }
        : null,
      sandboxed: agent.sandboxed ?? false,
      sandbox_type: agent.sandboxType ?? null
    };
  }

  private portToDict(port: ListeningPort): Record<string, unknown> {
    return {
      port: port.port,
      pid: port.pid,
      process_name: port.processName,
      cmdline: port.cmdline,
      bind_address: port.bindAddress,
      protocol: port.protocol,
      agent_pid: port.agentPid,
      agent_label: port.agentLabel,
      first_seen: port.firstSeen,
      cwd: port.cwd
    };
  }

  private startScanners(): void {
    // Create scanners with config
    this.repoScanner = new RepoScanner(this.store, {
      roots: this.config.roots,
      ignoreDirs: ["node_modules", ".git", "vendor", "build", "dist"],
      refreshFastSeconds: this.config.repo.refreshFastSeconds,
      refreshSlowSeconds: this.config.repo.refreshSlowSeconds,
      includeUntracked: this.config.repo.includeUntracked,
      showClean: this.config.repo.showClean
    });

    this.processScanner = new ProcessScanner(this.store, {
      matchers: this.config.agents.matchers.map((m) => ({
        label: m.label,
        type: m.type as "cmd_regex" | "exe_prefix" | "exe_suffix",
        pattern: m.pattern
      })),
      refreshSeconds: this.config.agents.refreshSeconds
    });

    this.portScanner = new PortScanner(this.store, {
      refreshSeconds: 2,
      minPort: 1024
    });

    this.repoScanner.start();
    this.processScanner.start();
    this.portScanner.start();
  }

  private stopScanners(): void {
    if (this.repoScanner) {
      this.repoScanner.stop();
      this.repoScanner = null;
    }
    if (this.processScanner) {
      this.processScanner.stop();
      this.processScanner = null;
    }
    if (this.portScanner) {
      this.portScanner.stop();
      this.portScanner = null;
    }
    if (this.sessionLogger) {
      this.sessionLogger.closeAll();
    }
  }

  /**
   * Clean up dead sessions and orphaned wrapper states.
   * Called automatically when agents change.
   */
  private cleanupDeadState(): void {
    // Get current live agents for session matching
    const liveAgents = this.store.getAgentsForSessionMatching();

    // Match sessions to agents by cwd (populates PIDs)
    this.hookStore.matchSessionsToAgents(liveAgents);

    // Clean up sessions for dead processes
    const endedSessions = this.hookStore.cleanupDeadSessions(liveAgents);

    // Broadcast session ends
    for (const sessionId of endedSessions) {
      const session = this.hookStore.getSession(sessionId);
      if (session) {
        this.connectionManager.broadcast({
          type: "hook_session_end",
          session: {
            session_id: session.sessionId,
            transcript_path: session.transcriptPath,
            cwd: session.cwd,
            start_time: session.startTime,
            end_time: session.endTime ?? null,
            permission_mode: session.permissionMode,
            source: session.source,
            tool_count: session.toolCount,
            last_activity: session.lastActivity,
            awaiting_user: session.awaitingUser,
            tools_used: session.toolsUsed,
            active: false,
            commits: session.commits
          }
        });
      }
    }

    // Clean up orphaned wrapper states
    this.store.cleanupOrphanedWrapperStates();
  }

  run(host?: string, port?: number): void {
    const bindHost = host ?? this.config.daemon.host;
    const bindPort = port ?? this.config.daemon.port;

    this.startedAt = Date.now();
    this.startScanners();

    const appState: AppState = {
      store: this.store,
      hookStore: this.hookStore,
      sessionLogger: this.sessionLogger,
      sessionStore: this.sessionStore,
      connectionManager: this.connectionManager,
      config: this.config,
      startedAt: this.startedAt,
      shutdown: () => this.shutdown(),
      // Hook enhancement services
      ruleEngine: this.ruleEngine,
      costTracker: this.costTracker,
      costLimitsChecker: this.costLimitsChecker,
      notificationHub: this.notificationHub,
      // Process logger for snapshots
      processLogger: this.processLogger,
      // Transcript index
      transcriptIndex: this.transcriptIndex,
      updateTranscriptIndex: async () => {
        const result = await updateTranscriptIndex(this.transcriptIndex);
        this.transcriptIndex = result.index;
        return result;
      },
      // Command Center services
      predictionStore: this.predictionStore,
      processRunner: this.processRunner
    };

    const app = createApp(appState);

    this.server = Bun.serve({
      hostname: bindHost,
      port: bindPort,
      fetch: app.fetch,
      websocket
    });

    this.started = true;
    console.log(`Daemon listening on http://${bindHost}:${bindPort}`);
    console.log(`  → For web UI with hot reload, also run: bun run dev:web`);

    // Audit log daemon start
    logAuditEvent(
      "daemon",
      "start",
      `daemon:${process.pid}`,
      `Daemon started on ${bindHost}:${bindPort}`,
      {
        pid: process.pid,
        host: bindHost,
        port: bindPort,
        configRoots: this.config.roots
      },
      "daemon"
    );

    // Start periodic cleanup of old data (every hour)
    this.cleanupInterval = setInterval(
      () => {
        this.hookStore.cleanupOldData(30);
        this.hookStore.rotateLogs();
        this.processLogger.rotateLogs();
        this.sessionLogger.rotateLogs();
      },
      60 * 60 * 1000
    );

    // Run initial cleanup
    this.hookStore.cleanupOldData(30);
    this.hookStore.rotateLogs();
    this.processLogger.rotateLogs();
    this.sessionLogger.rotateLogs();

    // Start periodic transcript index updates (every 5 minutes)
    this.transcriptUpdateInterval = setInterval(
      async () => {
        if (isIncrementalUpdateDue(this.transcriptIndex)) {
          try {
            const result = await updateTranscriptIndex(this.transcriptIndex);
            this.transcriptIndex = result.index;
          } catch (err) {
            console.error("[transcript-index] Update failed:", err);
          }
        }
      },
      5 * 60 * 1000 // 5 minutes
    );

    // Run initial transcript index update (async, don't block startup)
    updateTranscriptIndex(this.transcriptIndex, { forceFullScan: true })
      .then((result) => {
        this.transcriptIndex = result.index;
        console.log(
          `[transcript-index] Initial scan: ${Object.keys(result.index.entries).length} transcripts indexed`
        );
      })
      .catch((err) =>
        console.error("[transcript-index] Initial scan failed:", err)
      );

    // Handle shutdown signals
    const shutdown = () => {
      console.log("\nShutting down...");
      this.stop();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  stop(): void {
    // Audit log daemon stop (before cleanup to ensure it's recorded)
    if (this.started) {
      const uptime = Date.now() - this.startedAt;
      logAuditEvent(
        "daemon",
        "end",
        `daemon:${process.pid}`,
        `Daemon stopped after ${Math.round(uptime / 1000)}s`,
        {
          pid: process.pid,
          uptimeMs: uptime,
          uptimeSeconds: Math.round(uptime / 1000)
        },
        "daemon"
      );
    }

    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.transcriptUpdateInterval) {
      clearInterval(this.transcriptUpdateInterval);
      this.transcriptUpdateInterval = null;
    }

    if (this.server) {
      this.server.stop();
      this.server = null;
    }

    this.stopScanners();
    this.started = false;
  }

  private shutdown(): void {
    this.stop();
    process.exit(0);
  }

  async startBackground(
    host?: string,
    port?: number,
    pidFile?: string
  ): Promise<number> {
    const pidPath = pidFile ?? this.config.daemon.pidFile;
    const pf = new PidFile(pidPath);

    if (pf.isRunning()) {
      console.error(`Daemon already running (pid ${pf.read()})`);
      return 1;
    }

    // For Bun, we don't fork - instead we use Bun.spawn
    const subprocess = Bun.spawn(
      [
        "bun",
        "run",
        import.meta.path,
        "--daemon",
        `--host=${host ?? this.config.daemon.host}`,
        `--port=${port ?? this.config.daemon.port}`
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "ignore", "ignore"]
      }
    );

    // Wait briefly to check if it started
    await new Promise((r) => setTimeout(r, 500));

    if (pf.isRunning()) {
      console.log(`Daemon started (pid ${pf.read()})`);
      return 0;
    }

    console.error("Daemon failed to start");
    return 1;
  }

  get isStarted(): boolean {
    return this.started;
  }
}

export function daemonStatus(pidFile: string): number {
  const pf = new PidFile(pidFile);
  const pid = pf.getRunningPid();

  if (pid) {
    console.log(`Daemon running (pid ${pid})`);
    return 0;
  } else {
    console.log("Daemon not running");
    return 1;
  }
}

export async function daemonStop(pidFile: string): Promise<number> {
  const pf = new PidFile(pidFile);

  if (!pf.isRunning()) {
    console.log("Daemon not running");
    return 1;
  }

  const pid = pf.read();
  console.log(`Stopping daemon (pid ${pid})...`);

  if (await pf.stopRunning()) {
    console.log("Daemon stopped");
    return 0;
  } else {
    console.error("Failed to stop daemon");
    return 1;
  }
}
