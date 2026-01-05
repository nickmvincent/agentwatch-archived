/**
 * Hono API routes for agentwatch daemon.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync
} from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

import type {
  RepoStatus,
  AgentProcess,
  HookSession,
  ToolUsage,
  ToolStats,
  DailyStats,
  GitCommit,
  SessionSource,
  ListeningPort,
  RunPrediction,
  RunOutcome,
  CalibrationResult,
  CalibrationStats,
  Principle,
  PrinciplesFile
} from "@agentwatch/core";
import {
  TranscriptSanitizer,
  createSanitizer,
  residueCheck,
  DEFAULT_PATTERNS,
  parseTranscriptFile,
  scoreText,
  createBundle,
  prepareSessions,
  getDefaultFieldSelection,
  getFieldSchemasByCategory,
  FIELD_SCHEMAS,
  type ContribSession,
  type ContributorMeta,
  type RawSession,
  type PreparationConfig,
  type PreparationResult,
  type RedactionReport
} from "@agentwatch/core";
import {
  PatternManager,
  testPattern,
  testAllPatterns,
  validatePattern,
  getPatternDefinitions,
  generateSampleText,
  type PatternDefinition,
  type PatternTestResult,
  type PatternValidationResult
} from "@agentwatch/pre-share";
import {
  uploadToHuggingFace,
  validateHuggingFaceToken,
  checkDatasetAccess,
  checkHFCLIAuth,
  getHFCachedToken,
  getHFOAuthURL,
  exchangeHFOAuthCode,
  type HFOAuthConfig
} from "./huggingface";
import type {
  DataStore,
  HookStore,
  ProcessLogger,
  SessionStore,
  ProcessSnapshot,
  ProcessLifecycleEvent,
  ProcessLogSummary,
  ManagedSession
} from "@agentwatch/monitor";

import type { ConnectionManager } from "./connection-manager";
import type { SessionLogger } from "./session-logger";
import { saveConfig, type Config } from "./config";
import {
  checkTestGate,
  recordTestPass,
  clearTestPass,
  isGitCommit
} from "./security-gates";
import {
  analyzeSession,
  analyzeToolStats,
  analyzeRecentSessions,
  suggestionToDict,
  type Suggestion
} from "./suggestions";
import { notifications } from "./notifications";
import {
  discoverLocalTranscripts,
  readTranscript,
  readTranscriptByPath,
  formatTranscriptForDisplay,
  type LocalTranscript,
  type ParsedTranscript
} from "./local-logs";
import {
  correlateSessionsWithTranscripts,
  getCorrelationStats,
  attachProcessSnapshots,
  attachProjects,
  attachManagedSessions
} from "./correlation";
import {
  FORMAT_SCHEMAS,
  getFormatSchema,
  getSchemasByStatus,
  type FormatSchema
} from "./format-schemas";
import {
  loadContributorSettings,
  saveContributorSettings,
  loadContributionHistory,
  addContributionRecord,
  getContributionStats,
  getDestinationInfo,
  KNOWN_DESTINATIONS,
  getAvailableProfiles,
  getActiveProfile,
  isBuiltinProfile,
  saveRedactionProfile,
  deleteRedactionProfile,
  setActiveProfile,
  DEFAULT_PROFILE_ID,
  RESEARCH_PROFILES,
  getSessionArtifacts,
  addSessionArtifact,
  removeSessionArtifact,
  detectArtifactType,
  type RedactionConfig,
  type ArtifactType
} from "./contributor-settings";

// Hook enhancement services
import {
  registerEnhancementEndpoints,
  type EnhancementsState
} from "./api-enhancements";
import {
  registerEnrichmentEndpoints,
  type EnrichmentState
} from "./api-enrichments";
import { registerAuditEndpoints } from "./api-audit";
import * as privacyFlags from "./privacy-flags";
import type { RuleEngine } from "./rules";
import type { CostTracker, CostLimitsChecker } from "./cost";
import type { NotificationHub } from "./notifications/hub";
import type { NotificationPayload } from "./notifications/types";
import {
  getPrinciplesForProject,
  buildPrinciplesInjection
} from "./principles-parser";
import { buildEnhancedPrompt, type AgentType } from "./process-runner";

const { upgradeWebSocket, websocket } = createBunWebSocket();

export interface AppState {
  store: DataStore;
  hookStore: HookStore;
  sessionLogger: SessionLogger;
  sessionStore: SessionStore;
  connectionManager: ConnectionManager;
  config: Config;
  startedAt: number;
  shutdown?: () => void;
  // Hook enhancement services
  ruleEngine: RuleEngine;
  costTracker: CostTracker;
  costLimitsChecker: CostLimitsChecker;
  notificationHub: NotificationHub;
  // Process logger for snapshots
  processLogger?: ProcessLogger;
  // Transcript index for fast discovery
  transcriptIndex?: import("./transcript-index").TranscriptIndex;
  updateTranscriptIndex?: () => Promise<{
    index: import("./transcript-index").TranscriptIndex;
    added: number;
    updated: number;
    removed: number;
  }>;
  // Command Center (predictions, process runner)
  predictionStore?: import("@agentwatch/monitor").PredictionStore;
  processRunner?: import("./process-runner").ProcessRunner;
}

// Helper functions to convert types to API dicts
function repoToDict(repo: RepoStatus): Record<string, unknown> {
  return {
    repo_id: repo.repoId,
    path: repo.path,
    name: repo.name,
    branch: repo.branch,
    dirty:
      repo.stagedCount > 0 || repo.unstagedCount > 0 || repo.untrackedCount > 0,
    staged: repo.stagedCount,
    unstaged: repo.unstagedCount,
    untracked: repo.untrackedCount,
    conflict: repo.specialState.conflict,
    rebase: repo.specialState.rebase,
    merge: repo.specialState.merge,
    cherry_pick: repo.specialState.cherryPick,
    revert: repo.specialState.revert,
    ahead: repo.upstream?.ahead ?? 0,
    behind: repo.upstream?.behind ?? 0,
    upstream_name: repo.upstream?.upstreamName,
    last_error: repo.health.lastError,
    timed_out: repo.health.timedOut,
    last_scan_time: repo.lastScanTime,
    last_change_time: repo.lastChangeTime
  };
}

function agentToDict(agent: AgentProcess): Record<string, unknown> {
  const result: Record<string, unknown> = {
    pid: agent.pid,
    label: agent.label,
    cmdline: agent.cmdline,
    exe: agent.exe,
    cpu_pct: agent.cpuPct,
    rss_kb: agent.rssKb,
    threads: agent.threads,
    tty: agent.tty,
    cwd: agent.cwd,
    repo_path: agent.repoPath,
    start_time: agent.startTime,
    heuristic_state: null,
    wrapper_state: null
  };

  if (agent.heuristicState) {
    result.heuristic_state = {
      state: agent.heuristicState.state,
      cpu_pct_recent: agent.heuristicState.cpuPctRecent,
      quiet_seconds: agent.heuristicState.quietSeconds
    };
  }

  if (agent.wrapperState) {
    result.wrapper_state = {
      state: agent.wrapperState.state,
      last_output_time: agent.wrapperState.lastOutputTime,
      awaiting_user: agent.wrapperState.awaitingUser,
      cmdline: agent.wrapperState.cmdline,
      cwd: agent.wrapperState.cwd,
      label: agent.wrapperState.label,
      start_time: agent.wrapperState.startTime
    };
  }

  return result;
}

function hookSessionToDict(session: HookSession): Record<string, unknown> {
  return {
    session_id: session.sessionId,
    transcript_path: session.transcriptPath,
    cwd: session.cwd,
    start_time: session.startTime,
    end_time: session.endTime,
    permission_mode: session.permissionMode,
    source: session.source,
    tool_count: session.toolCount,
    last_activity: session.lastActivity,
    awaiting_user: session.awaitingUser,
    tools_used: session.toolsUsed,
    active: session.endTime === undefined,
    commits: session.commits,
    commit_count: session.commits.length,
    // Token/cost tracking
    total_input_tokens: session.totalInputTokens,
    total_output_tokens: session.totalOutputTokens,
    estimated_cost_usd: session.estimatedCostUsd,
    auto_continue_attempts: session.autoContinueAttempts,
    pid: session.pid
  };
}

function toolUsageToDict(usage: ToolUsage): Record<string, unknown> {
  return {
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
  };
}

function toolStatsToDict(stats: ToolStats): Record<string, unknown> {
  return {
    tool_name: stats.toolName,
    total_calls: stats.totalCalls,
    success_count: stats.successCount,
    failure_count: stats.failureCount,
    avg_duration_ms: stats.avgDurationMs,
    last_used: stats.lastUsed,
    success_rate:
      stats.totalCalls > 0 ? (stats.successCount / stats.totalCalls) * 100 : 0
  };
}

function dailyStatsToDict(stats: DailyStats): Record<string, unknown> {
  return {
    date: stats.date,
    session_count: stats.sessionCount,
    tool_calls: stats.toolCalls,
    tools_breakdown: stats.toolsBreakdown,
    active_minutes: stats.activeMinutes
  };
}

function gitCommitToDict(commit: GitCommit): Record<string, unknown> {
  return {
    commit_hash: commit.commitHash,
    session_id: commit.sessionId,
    timestamp: commit.timestamp,
    message: commit.message,
    repo_path: commit.repoPath
  };
}

function processSnapshotToDict(
  snapshot: ProcessSnapshot
): Record<string, unknown> {
  return {
    timestamp: snapshot.timestamp,
    pid: snapshot.pid,
    label: snapshot.label,
    cmdline: snapshot.cmdline,
    exe: snapshot.exe,
    cpu_pct: snapshot.cpuPct,
    rss_kb: snapshot.rssKb,
    threads: snapshot.threads,
    cwd: snapshot.cwd,
    repo_path: snapshot.repoPath,
    state: snapshot.state,
    sandboxed: snapshot.sandboxed,
    sandbox_type: snapshot.sandboxType,
    start_time: snapshot.startTime
  };
}

function processEventToDict(
  event: ProcessLifecycleEvent
): Record<string, unknown> {
  return {
    type: event.type,
    timestamp: event.timestamp,
    pid: event.pid,
    label: event.label,
    cmdline: event.cmdline,
    cwd: event.cwd,
    repo_path: event.repoPath,
    duration_ms: event.durationMs
  };
}

/**
 * Sanitize a process snapshot by redacting sensitive paths and cmdlines.
 */
function sanitizeProcessSnapshot(
  snapshot: ProcessSnapshot,
  redactPaths = true,
  redactCmdline = true
): Record<string, unknown> {
  const result = processSnapshotToDict(snapshot);

  if (redactPaths) {
    // Redact username from paths
    if (result.cwd && typeof result.cwd === "string") {
      result.cwd = redactUserFromPath(result.cwd);
    }
    if (result.repo_path && typeof result.repo_path === "string") {
      result.repo_path = redactUserFromPath(result.repo_path);
    }
    if (result.exe && typeof result.exe === "string") {
      result.exe = redactUserFromPath(result.exe);
    }
  }

  if (redactCmdline && result.cmdline && typeof result.cmdline === "string") {
    // Redact full paths and potential secrets from command line
    result.cmdline = redactCmdline
      ? sanitizeCmdline(result.cmdline)
      : result.cmdline;
  }

  return result;
}

/**
 * Sanitize a process lifecycle event.
 */
function sanitizeProcessEvent(
  event: ProcessLifecycleEvent,
  redactPaths = true,
  redactCmdlineArg = true
): Record<string, unknown> {
  const result = processEventToDict(event);

  if (redactPaths) {
    if (result.cwd && typeof result.cwd === "string") {
      result.cwd = redactUserFromPath(result.cwd);
    }
    if (result.repo_path && typeof result.repo_path === "string") {
      result.repo_path = redactUserFromPath(result.repo_path);
    }
  }

  if (
    redactCmdlineArg &&
    result.cmdline &&
    typeof result.cmdline === "string"
  ) {
    result.cmdline = sanitizeCmdline(result.cmdline);
  }

  return result;
}

/**
 * Redact username from a path by replacing /Users/xxx or /home/xxx with ~
 */
function redactUserFromPath(path: string): string {
  return path
    .replace(/^\/Users\/[^/]+/, "~")
    .replace(/^\/home\/[^/]+/, "~")
    .replace(/^C:\\Users\\[^\\]+/i, "~");
}

/**
 * Sanitize a command line by removing sensitive information.
 */
function sanitizeCmdline(cmdline: string): string {
  let result = cmdline;

  // Redact paths containing usernames
  result = result
    .replace(/\/Users\/[^/\s]+/g, "/Users/[REDACTED]")
    .replace(/\/home\/[^/\s]+/g, "/home/[REDACTED]")
    .replace(/C:\\Users\\[^\\\s]+/gi, "C:\\Users\\[REDACTED]");

  // Redact common secret patterns
  result = result
    .replace(/--token[=\s]+\S+/gi, "--token=[REDACTED]")
    .replace(/--api[-_]?key[=\s]+\S+/gi, "--api-key=[REDACTED]")
    .replace(/--password[=\s]+\S+/gi, "--password=[REDACTED]")
    .replace(/--secret[=\s]+\S+/gi, "--secret=[REDACTED]");

  return result;
}

function portToDict(port: ListeningPort): Record<string, unknown> {
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

function extractCommitHash(toolResponse: unknown): string | null {
  let output = "";

  if (typeof toolResponse === "object" && toolResponse !== null) {
    const resp = toolResponse as Record<string, unknown>;
    output = String(
      resp.stdout ?? resp.content ?? JSON.stringify(toolResponse)
    );
  } else if (typeof toolResponse === "string") {
    output = toolResponse;
  }

  // Look for commit hash patterns
  const patterns = [
    /\[[\w/-]+\s+([a-f0-9]{7,40})\]/, // [branch hash] format
    /^([a-f0-9]{7,40})\s/m, // hash at start of line
    /commit\s+([a-f0-9]{40})/ // full commit hash
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(output);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

function extractCommitMessage(toolResponse: unknown): string {
  let output = "";

  if (typeof toolResponse === "object" && toolResponse !== null) {
    const resp = toolResponse as Record<string, unknown>;
    output = String(
      resp.stdout ?? resp.content ?? JSON.stringify(toolResponse)
    );
  } else if (typeof toolResponse === "string") {
    output = toolResponse;
  }

  const match = /\[[^\]]+\]\s+(.+?)(?:\n|$)/.exec(output);
  if (match && match[1]) {
    return match[1].trim().slice(0, 200);
  }

  return "";
}

export function createApp(state: AppState): Hono {
  const app = new Hono();

  // Request logging (enable with DEBUG=1)
  if (process.env.DEBUG) {
    app.use("*", logger());
  }

  // CORS for browser access
  app.use(
    "/api/*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
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
      agent_count: state.store.snapshotAgents().length,
      repo_count: state.store.snapshotRepos().length,
      uptime_seconds: uptimeSeconds
    });
  });

  app.post("/api/shutdown", (c) => {
    setTimeout(() => state.shutdown?.(), 10);
    return c.json({ status: "ok" });
  });

  // Configuration endpoints
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
      daemon: {
        host: cfg.daemon.host,
        port: cfg.daemon.port
      },
      test_gate: {
        enabled: cfg.testGate.enabled,
        test_command: cfg.testGate.testCommand,
        pass_file: cfg.testGate.passFile,
        pass_file_max_age_seconds: cfg.testGate.passFileMaxAgeSeconds
      },
      notifications: {
        enable: cfg.notifications.enable,
        hook_awaiting_input: cfg.notifications.hookAwaitingInput,
        hook_session_end: cfg.notifications.hookSessionEnd,
        hook_tool_failure: cfg.notifications.hookToolFailure,
        hook_long_running: cfg.notifications.hookLongRunning,
        long_running_threshold_seconds:
          cfg.notifications.longRunningThresholdSeconds,
        // Educational hook notifications
        hook_session_start: cfg.notifications.hookSessionStart,
        hook_pre_tool_use: cfg.notifications.hookPreToolUse,
        hook_post_tool_use: cfg.notifications.hookPostToolUse,
        hook_notification: cfg.notifications.hookNotification,
        hook_permission_request: cfg.notifications.hookPermissionRequest,
        hook_user_prompt_submit: cfg.notifications.hookUserPromptSubmit,
        hook_stop: cfg.notifications.hookStop,
        hook_subagent_stop: cfg.notifications.hookSubagentStop,
        hook_pre_compact: cfg.notifications.hookPreCompact
      },
      agents: {
        refresh_seconds: cfg.agents.refreshSeconds,
        matchers: cfg.agents.matchers.map((m) => ({
          label: m.label,
          type: m.type,
          pattern: m.pattern
        }))
      },
      conversations: {
        transcript_days: cfg.conversations.transcriptDays,
        include_process_snapshots: cfg.conversations.includeProcessSnapshots
      },
      projects: {
        projects: cfg.projects.projects.map((p) => ({
          id: p.id,
          name: p.name,
          paths: p.paths,
          description: p.description
        }))
      }
    });
  });

  app.patch("/api/config", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const updates: string[] = [];

    // Update test gate
    if (typeof body.test_gate === "object" && body.test_gate) {
      const tg = body.test_gate as Record<string, unknown>;
      if (typeof tg.enabled === "boolean") {
        state.config.testGate.enabled = tg.enabled;
        updates.push(`test_gate.enabled = ${tg.enabled}`);
      }
      if (typeof tg.test_command === "string") {
        state.config.testGate.testCommand = tg.test_command;
        updates.push(`test_gate.test_command = ${tg.test_command}`);
      }
      if (typeof tg.pass_file === "string") {
        state.config.testGate.passFile = tg.pass_file;
        updates.push(`test_gate.pass_file = ${tg.pass_file}`);
      }
      if (typeof tg.pass_file_max_age_seconds === "number") {
        state.config.testGate.passFileMaxAgeSeconds =
          tg.pass_file_max_age_seconds;
        updates.push(
          `test_gate.pass_file_max_age_seconds = ${tg.pass_file_max_age_seconds}`
        );
      }
    }

    // Update notifications
    if (typeof body.notifications === "object" && body.notifications) {
      const n = body.notifications as Record<string, unknown>;
      if (typeof n.enable === "boolean") {
        state.config.notifications.enable = n.enable;
        updates.push(`notifications.enable = ${n.enable}`);
      }
      if (typeof n.hook_awaiting_input === "boolean") {
        state.config.notifications.hookAwaitingInput = n.hook_awaiting_input;
        updates.push(
          `notifications.hook_awaiting_input = ${n.hook_awaiting_input}`
        );
      }
      if (typeof n.hook_session_end === "boolean") {
        state.config.notifications.hookSessionEnd = n.hook_session_end;
        updates.push(`notifications.hook_session_end = ${n.hook_session_end}`);
      }
      if (typeof n.hook_tool_failure === "boolean") {
        state.config.notifications.hookToolFailure = n.hook_tool_failure;
        updates.push(
          `notifications.hook_tool_failure = ${n.hook_tool_failure}`
        );
      }
      // Educational hook notifications
      if (typeof n.hook_session_start === "boolean") {
        state.config.notifications.hookSessionStart = n.hook_session_start;
        updates.push(
          `notifications.hook_session_start = ${n.hook_session_start}`
        );
      }
      if (typeof n.hook_pre_tool_use === "boolean") {
        state.config.notifications.hookPreToolUse = n.hook_pre_tool_use;
        updates.push(
          `notifications.hook_pre_tool_use = ${n.hook_pre_tool_use}`
        );
      }
      if (typeof n.hook_post_tool_use === "boolean") {
        state.config.notifications.hookPostToolUse = n.hook_post_tool_use;
        updates.push(
          `notifications.hook_post_tool_use = ${n.hook_post_tool_use}`
        );
      }
      if (typeof n.hook_notification === "boolean") {
        state.config.notifications.hookNotification = n.hook_notification;
        updates.push(
          `notifications.hook_notification = ${n.hook_notification}`
        );
      }
      if (typeof n.hook_permission_request === "boolean") {
        state.config.notifications.hookPermissionRequest =
          n.hook_permission_request;
        updates.push(
          `notifications.hook_permission_request = ${n.hook_permission_request}`
        );
      }
      if (typeof n.hook_user_prompt_submit === "boolean") {
        state.config.notifications.hookUserPromptSubmit =
          n.hook_user_prompt_submit;
        updates.push(
          `notifications.hook_user_prompt_submit = ${n.hook_user_prompt_submit}`
        );
      }
      if (typeof n.hook_stop === "boolean") {
        state.config.notifications.hookStop = n.hook_stop;
        updates.push(`notifications.hook_stop = ${n.hook_stop}`);
      }
      if (typeof n.hook_subagent_stop === "boolean") {
        state.config.notifications.hookSubagentStop = n.hook_subagent_stop;
        updates.push(
          `notifications.hook_subagent_stop = ${n.hook_subagent_stop}`
        );
      }
      if (typeof n.hook_pre_compact === "boolean") {
        state.config.notifications.hookPreCompact = n.hook_pre_compact;
        updates.push(`notifications.hook_pre_compact = ${n.hook_pre_compact}`);
      }
    }

    // Update hook_enhancements.notification_hub
    if (typeof body.hook_enhancements === "object" && body.hook_enhancements) {
      const he = body.hook_enhancements as Record<string, unknown>;
      if (typeof he.notification_hub === "object" && he.notification_hub) {
        const nh = he.notification_hub as Record<string, unknown>;
        if (typeof nh.desktop === "object" && nh.desktop) {
          const d = nh.desktop as Record<string, unknown>;
          if (typeof d.format === "object" && d.format) {
            const f = d.format as Record<string, unknown>;
            if (typeof f.show_project_name === "boolean") {
              state.config.hookEnhancements.notificationHub.desktop.format.showProjectName =
                f.show_project_name;
              updates.push(
                `hook_enhancements.notification_hub.desktop.format.show_project_name = ${f.show_project_name}`
              );
            }
            if (typeof f.show_session_id === "boolean") {
              state.config.hookEnhancements.notificationHub.desktop.format.showSessionId =
                f.show_session_id;
              updates.push(
                `hook_enhancements.notification_hub.desktop.format.show_session_id = ${f.show_session_id}`
              );
            }
            if (typeof f.show_cwd === "boolean") {
              state.config.hookEnhancements.notificationHub.desktop.format.showCwd =
                f.show_cwd;
              updates.push(
                `hook_enhancements.notification_hub.desktop.format.show_cwd = ${f.show_cwd}`
              );
            }
            if (typeof f.show_tool_details === "boolean") {
              state.config.hookEnhancements.notificationHub.desktop.format.showToolDetails =
                f.show_tool_details;
              updates.push(
                `hook_enhancements.notification_hub.desktop.format.show_tool_details = ${f.show_tool_details}`
              );
            }
            if (typeof f.show_stats === "boolean") {
              state.config.hookEnhancements.notificationHub.desktop.format.showStats =
                f.show_stats;
              updates.push(
                `hook_enhancements.notification_hub.desktop.format.show_stats = ${f.show_stats}`
              );
            }
          }
        }
      }
    }

    // Update conversations
    if (typeof body.conversations === "object" && body.conversations) {
      const conv = body.conversations as Record<string, unknown>;
      if (typeof conv.transcript_days === "number") {
        state.config.conversations.transcriptDays = conv.transcript_days;
        updates.push(`conversations.transcript_days = ${conv.transcript_days}`);
      }
      if (typeof conv.include_process_snapshots === "boolean") {
        state.config.conversations.includeProcessSnapshots =
          conv.include_process_snapshots;
        updates.push(
          `conversations.include_process_snapshots = ${conv.include_process_snapshots}`
        );
      }
    }

    // Update projects
    if (typeof body.projects === "object" && body.projects) {
      const proj = body.projects as Record<string, unknown>;
      if (Array.isArray(proj.projects)) {
        state.config.projects.projects = proj.projects
          .filter(
            (p): p is Record<string, unknown> =>
              typeof p === "object" && p !== null
          )
          .map((p) => ({
            id: String(p.id ?? ""),
            name: String(p.name ?? ""),
            paths: Array.isArray(p.paths) ? p.paths.map(String) : [],
            description:
              typeof p.description === "string" ? p.description : undefined
          }));
        updates.push(
          `projects.projects (${state.config.projects.projects.length} projects)`
        );
      }
    }

    // Persist changes to TOML file
    if (updates.length > 0) {
      try {
        saveConfig(state.config);
      } catch (err) {
        // Log but don't fail the request - in-memory update still worked
        console.error("Failed to persist config to TOML:", err);
      }
    }

    return c.json({ success: true, updates });
  });

  // GET /api/config/raw - Get raw TOML config file content
  const CONFIG_PATH = join(homedir(), ".config", "agentwatch", "config.toml");

  app.get("/api/config/raw", (c) => {
    try {
      if (!existsSync(CONFIG_PATH)) {
        // Return empty content if file doesn't exist
        return c.json({
          exists: false,
          path: CONFIG_PATH,
          content: ""
        });
      }
      const content = readFileSync(CONFIG_PATH, "utf-8");
      return c.json({
        exists: true,
        path: CONFIG_PATH,
        content
      });
    } catch (error) {
      return c.json(
        { error: "Failed to read config file", details: String(error) },
        500
      );
    }
  });

  // PUT /api/config/raw - Update raw TOML config file content
  app.put("/api/config/raw", async (c) => {
    try {
      const body = await c.req.json();
      const content = body.content;

      if (typeof content !== "string") {
        return c.json({ error: "Content must be a string" }, 400);
      }

      // Ensure directory exists
      const configDir = join(homedir(), ".config", "agentwatch");
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(CONFIG_PATH, content, "utf-8");

      return c.json({
        success: true,
        path: CONFIG_PATH,
        message: "Config saved. Restart daemon to apply changes."
      });
    } catch (error) {
      return c.json(
        { error: "Failed to write config file", details: String(error) },
        500
      );
    }
  });

  // ==========================================================================
  // Claude Code Settings Endpoints (~/.claude/settings.json)
  // ==========================================================================

  const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

  // GET - Read Claude settings
  app.get("/api/claude/settings", (c) => {
    if (!existsSync(CLAUDE_SETTINGS_PATH)) {
      return c.json({
        exists: false,
        path: CLAUDE_SETTINGS_PATH,
        settings: null,
        raw: null,
        error: null
      });
    }

    try {
      const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
      const settings = JSON.parse(content) as Record<string, unknown>;
      return c.json({
        exists: true,
        path: CLAUDE_SETTINGS_PATH,
        settings,
        raw: content,
        error: null
      });
    } catch (e) {
      // File exists but is invalid JSON
      try {
        const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
        return c.json({
          exists: true,
          path: CLAUDE_SETTINGS_PATH,
          settings: null,
          raw: content,
          error:
            e instanceof Error ? e.message : "Failed to parse settings.json"
        });
      } catch {
        return c.json(
          {
            exists: true,
            path: CLAUDE_SETTINGS_PATH,
            settings: null,
            raw: null,
            error: "Failed to read settings.json"
          },
          400
        );
      }
    }
  });

  // PUT - Replace entire settings (for raw JSON editor)
  app.put("/api/claude/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      raw?: string;
      settings?: Record<string, unknown>;
    };

    try {
      let settingsToWrite: Record<string, unknown>;

      // If raw JSON string provided, validate and use it
      if (body.raw !== undefined) {
        try {
          settingsToWrite = JSON.parse(body.raw);
        } catch (e) {
          return c.json(
            {
              success: false,
              error:
                "Invalid JSON: " +
                (e instanceof Error ? e.message : "Parse error")
            },
            400
          );
        }
      } else if (body.settings !== undefined) {
        settingsToWrite = body.settings;
      } else {
        return c.json(
          {
            success: false,
            error: "Either 'raw' or 'settings' must be provided"
          },
          400
        );
      }

      // Ensure .claude directory exists
      const claudeDir = dirname(CLAUDE_SETTINGS_PATH);
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      // Write with pretty formatting
      writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(settingsToWrite, null, 2) + "\n"
      );

      return c.json({
        success: true,
        path: CLAUDE_SETTINGS_PATH,
        settings: settingsToWrite
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Failed to write settings"
        },
        500
      );
    }
  });

  // PATCH - Merge updates (for structured form)
  app.patch("/api/claude/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    try {
      // Read existing settings (or start with empty object)
      let settings: Record<string, unknown> = {};
      if (existsSync(CLAUDE_SETTINGS_PATH)) {
        try {
          settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
        } catch {
          return c.json(
            {
              success: false,
              error:
                "Existing settings.json is invalid JSON. Use PUT to replace entirely."
            },
            400
          );
        }
      }

      // Deep merge for specific known keys
      if (body.hooks !== undefined) {
        const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
        const newHooks = body.hooks as Record<string, unknown>;
        settings.hooks = { ...existingHooks, ...newHooks };
      }

      if (body.permissions !== undefined) {
        const existingPerms = (settings.permissions ?? {}) as Record<
          string,
          unknown
        >;
        const newPerms = body.permissions as Record<string, unknown>;
        settings.permissions = { ...existingPerms, ...newPerms };
      }

      if (body.env !== undefined) {
        const existingEnv = (settings.env ?? {}) as Record<string, unknown>;
        const newEnv = body.env as Record<string, unknown>;
        settings.env = { ...existingEnv, ...newEnv };
      }

      // Handle any other top-level keys (pass through)
      for (const key of Object.keys(body)) {
        if (!["hooks", "permissions", "env"].includes(key)) {
          settings[key] = body[key];
        }
      }

      // Ensure .claude directory exists
      const claudeDir = dirname(CLAUDE_SETTINGS_PATH);
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      // Write with pretty formatting
      writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(settings, null, 2) + "\n"
      );

      return c.json({
        success: true,
        path: CLAUDE_SETTINGS_PATH,
        settings
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Failed to update settings"
        },
        500
      );
    }
  });

  // GET - Read scoped Claude settings (user, project, or local)
  app.get("/api/claude/settings/:scope", (c) => {
    const scope = c.req.param("scope");
    const projectPath = c.req.query("project_path");

    let settingsPath: string;
    if (scope === "user") {
      settingsPath = CLAUDE_SETTINGS_PATH;
    } else if (scope === "project") {
      if (!projectPath) {
        return c.json(
          { error: "project_path query parameter required for project scope" },
          400
        );
      }
      settingsPath = join(projectPath, ".claude", "settings.json");
    } else if (scope === "local") {
      if (!projectPath) {
        return c.json(
          { error: "project_path query parameter required for local scope" },
          400
        );
      }
      settingsPath = join(projectPath, ".claude", "settings.local.json");
    } else {
      return c.json(
        { error: "Invalid scope. Use: user, project, or local" },
        400
      );
    }

    if (!existsSync(settingsPath)) {
      return c.json({
        exists: false,
        path: settingsPath,
        scope,
        settings: null,
        raw: null,
        error: null
      });
    }

    try {
      const content = readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(content) as Record<string, unknown>;
      return c.json({
        exists: true,
        path: settingsPath,
        scope,
        settings,
        raw: content,
        error: null
      });
    } catch (e) {
      try {
        const content = readFileSync(settingsPath, "utf-8");
        return c.json({
          exists: true,
          path: settingsPath,
          scope,
          settings: null,
          raw: content,
          error:
            e instanceof Error ? e.message : "Failed to parse settings.json"
        });
      } catch {
        return c.json(
          {
            exists: true,
            path: settingsPath,
            scope,
            settings: null,
            raw: null,
            error: "Failed to read settings file"
          },
          400
        );
      }
    }
  });

  // ==========================================================================
  // MCP Server Configuration Endpoints
  // ==========================================================================

  const CLAUDE_MCP_USER_PATH = join(homedir(), ".claude.json");

  // GET - Read MCP servers configuration
  app.get("/api/claude/mcp", (c) => {
    const projectPath = c.req.query("project_path");

    const result: {
      user: {
        exists: boolean;
        path: string;
        servers: Record<string, unknown> | null;
        error: string | null;
      };
      project: {
        exists: boolean;
        path: string | null;
        servers: Record<string, unknown> | null;
        error: string | null;
      } | null;
    } = {
      user: {
        exists: false,
        path: CLAUDE_MCP_USER_PATH,
        servers: null,
        error: null
      },
      project: null
    };

    // Read user MCP config (~/.claude.json)
    if (existsSync(CLAUDE_MCP_USER_PATH)) {
      try {
        const content = readFileSync(CLAUDE_MCP_USER_PATH, "utf-8");
        const config = JSON.parse(content) as Record<string, unknown>;
        result.user = {
          exists: true,
          path: CLAUDE_MCP_USER_PATH,
          servers: (config.mcpServers ?? {}) as Record<string, unknown>,
          error: null
        };
      } catch (e) {
        result.user = {
          exists: true,
          path: CLAUDE_MCP_USER_PATH,
          servers: null,
          error: e instanceof Error ? e.message : "Failed to parse"
        };
      }
    }

    // Read project MCP config (.mcp.json) if project path provided
    if (projectPath) {
      const projectMcpPath = join(projectPath, ".mcp.json");
      result.project = {
        exists: false,
        path: projectMcpPath,
        servers: null,
        error: null
      };

      if (existsSync(projectMcpPath)) {
        try {
          const content = readFileSync(projectMcpPath, "utf-8");
          const config = JSON.parse(content) as Record<string, unknown>;
          result.project = {
            exists: true,
            path: projectMcpPath,
            servers: (config.mcpServers ?? config) as Record<string, unknown>,
            error: null
          };
        } catch (e) {
          result.project = {
            exists: true,
            path: projectMcpPath,
            servers: null,
            error: e instanceof Error ? e.message : "Failed to parse"
          };
        }
      }
    }

    return c.json(result);
  });

  // ==========================================================================
  // Claude Code Reference Data (env vars, patterns, etc.)
  // ==========================================================================

  // GET - Environment variables reference
  app.get("/api/claude/reference/env-vars", (c) => {
    // Reference data based on Claude Code docs
    // Source: https://code.claude.com/docs/en/settings.md
    const envVars = [
      // Telemetry
      {
        name: "CLAUDE_CODE_ENABLE_TELEMETRY",
        category: "telemetry",
        description: "Enable OpenTelemetry metrics/events",
        example: "1"
      },
      {
        name: "OTEL_METRICS_EXPORTER",
        category: "telemetry",
        description: "Metrics exporter type",
        example: "otlp"
      },
      {
        name: "OTEL_LOGS_EXPORTER",
        category: "telemetry",
        description: "Logs exporter type",
        example: "otlp"
      },
      {
        name: "OTEL_EXPORTER_OTLP_PROTOCOL",
        category: "telemetry",
        description: "OTLP protocol",
        example: "grpc"
      },
      {
        name: "OTEL_EXPORTER_OTLP_ENDPOINT",
        category: "telemetry",
        description: "OTLP collector endpoint",
        example: "http://localhost:4317"
      },
      {
        name: "OTEL_EXPORTER_OTLP_HEADERS",
        category: "telemetry",
        description: "OTLP auth headers",
        example: "Authorization=Bearer token"
      },
      {
        name: "OTEL_RESOURCE_ATTRIBUTES",
        category: "telemetry",
        description: "Custom resource attributes",
        example: "team=platform,dept=eng"
      },
      {
        name: "OTEL_METRICS_INCLUDE_SESSION_ID",
        category: "telemetry",
        description: "Include session ID in metrics",
        example: "true"
      },
      // Bash/Shell
      {
        name: "BASH_DEFAULT_TIMEOUT_MS",
        category: "bash",
        description: "Default bash command timeout",
        example: "60000"
      },
      {
        name: "BASH_MAX_TIMEOUT_MS",
        category: "bash",
        description: "Maximum bash command timeout",
        example: "600000"
      },
      {
        name: "BASH_MAX_OUTPUT_LENGTH",
        category: "bash",
        description: "Max output chars from bash",
        example: "100000"
      },
      {
        name: "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR",
        category: "bash",
        description: "Reset cwd after each command",
        example: "1"
      },
      {
        name: "CLAUDE_CODE_SHELL_PREFIX",
        category: "bash",
        description: "Prefix script for all bash commands",
        example: "/path/to/logger.sh"
      },
      // MCP
      {
        name: "MCP_TIMEOUT",
        category: "mcp",
        description: "MCP server startup timeout",
        example: "10000"
      },
      {
        name: "MAX_MCP_OUTPUT_TOKENS",
        category: "mcp",
        description: "Max tokens from MCP tools",
        example: "25000"
      },
      {
        name: "MCP_TOOL_TIMEOUT",
        category: "mcp",
        description: "MCP tool execution timeout",
        example: "30000"
      },
      // Tokens/Limits
      {
        name: "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
        category: "limits",
        description: "Max output tokens per response",
        example: "10000"
      },
      {
        name: "MAX_THINKING_TOKENS",
        category: "limits",
        description: "Extended thinking token budget",
        example: "8000"
      },
      // Configuration
      {
        name: "CLAUDE_CONFIG_DIR",
        category: "config",
        description: "Custom config directory",
        example: "/custom/config"
      },
      {
        name: "CLAUDE_ENV_FILE",
        category: "config",
        description: "Env file for SessionStart hooks",
        example: "/path/to/env"
      },
      // Features
      {
        name: "DISABLE_AUTOUPDATER",
        category: "features",
        description: "Disable auto-updates",
        example: "1"
      },
      {
        name: "DISABLE_TELEMETRY",
        category: "features",
        description: "Disable all telemetry",
        example: "1"
      },
      {
        name: "DISABLE_ERROR_REPORTING",
        category: "features",
        description: "Disable error reporting",
        example: "1"
      },
      {
        name: "DISABLE_COST_WARNINGS",
        category: "features",
        description: "Disable cost warnings",
        example: "1"
      },
      {
        name: "CLAUDE_CODE_DISABLE_TERMINAL_TITLE",
        category: "features",
        description: "Disable terminal title updates",
        example: "1"
      }
    ];

    return c.json({
      env_vars: envVars,
      categories: ["telemetry", "bash", "mcp", "limits", "config", "features"],
      source: "https://code.claude.com/docs/en/settings.md"
    });
  });

  // GET - Permission pattern syntax reference
  app.get("/api/claude/reference/permissions", (c) => {
    const patterns = [
      {
        pattern: "Bash",
        description: "Any bash command",
        example: '{"allow": ["Bash"]}'
      },
      {
        pattern: "Bash(command)",
        description: "Exact command match",
        example: '{"allow": ["Bash(npm run test)"]}'
      },
      {
        pattern: "Bash(prefix:*)",
        description: "Prefix match with wildcard",
        example: '{"allow": ["Bash(npm run test:*)"]}'
      },
      {
        pattern: "Read(path)",
        description: "Read file at path",
        example: '{"allow": ["Read(src/**)"]}'
      },
      {
        pattern: "Edit(path)",
        description: "Edit file at path",
        example: '{"allow": ["Edit(src/**/*.ts)"]}'
      },
      {
        pattern: "Write(path)",
        description: "Write file at path",
        example: '{"deny": ["Write(.env)"]}'
      },
      {
        pattern: "WebFetch",
        description: "Any web fetch",
        example: '{"ask": ["WebFetch"]}'
      },
      {
        pattern: "WebFetch(domain:host)",
        description: "Fetch from specific domain",
        example: '{"allow": ["WebFetch(domain:github.com)"]}'
      },
      {
        pattern: "mcp__server__*",
        description: "All tools from MCP server",
        example: '{"allow": ["mcp__github__*"]}'
      },
      {
        pattern: "mcp__server__tool",
        description: "Specific MCP tool",
        example: '{"allow": ["mcp__memory__store"]}'
      }
    ];

    const pathTypes = [
      {
        prefix: "//",
        description: "Absolute from filesystem root",
        example: "Read(//Users/alice/secrets/**)"
      },
      {
        prefix: "~/",
        description: "Relative to home directory",
        example: "Read(~/Documents/*.pdf)"
      },
      {
        prefix: "/",
        description: "Relative to settings file location",
        example: "Edit(/src/**/*.ts)"
      },
      {
        prefix: "./",
        description: "Relative to current working directory",
        example: "Read(./*.env)"
      },
      {
        prefix: "(none)",
        description: "Also relative to cwd",
        example: "Read(src/**)"
      }
    ];

    return c.json({
      patterns,
      path_types: pathTypes,
      notes: [
        "Deny rules have highest priority, then Ask, then Allow",
        "Bash prefix matching only works at end with :*",
        "Glob patterns ** match any depth, * matches single segment"
      ],
      source: "https://code.claude.com/docs/en/iam.md"
    });
  });

  // GET - Log format schemas (data dictionaries for all supported agents)
  app.get("/api/reference/format-schemas", (c) => {
    const { supported, planned } = getSchemasByStatus();
    return c.json({
      supported,
      planned,
      all: FORMAT_SCHEMAS
    });
  });

  // GET - Format schema for specific agent
  app.get("/api/reference/format-schemas/:agent", (c) => {
    const agent = c.req.param("agent");
    const schema = getFormatSchema(agent);
    if (!schema) {
      return c.json({ error: `Unknown agent: ${agent}` }, 404);
    }
    return c.json(schema);
  });

  // ==========================================================================
  // Sandbox Management Endpoints
  // ==========================================================================

  // GET - Sandbox status (Docker, image, script)
  app.get("/api/sandbox/status", async (c) => {
    const { getSandboxStatus } = await import("./sandbox/docker.js");
    const status = getSandboxStatus();
    return c.json(status);
  });

  // GET - List available permission presets
  app.get("/api/sandbox/presets", async (c) => {
    const { getAllPresets } = await import("./sandbox/presets.js");
    return c.json({ presets: getAllPresets() });
  });

  // GET - Get a specific preset by ID
  app.get("/api/sandbox/presets/:id", async (c) => {
    const { getPreset } = await import("./sandbox/presets.js");
    const id = c.req.param("id");
    const preset = getPreset(id);
    if (!preset) {
      return c.json({ error: "Preset not found" }, 404);
    }
    return c.json(preset);
  });

  // POST - Apply a preset to Claude settings
  app.post("/api/sandbox/preset/:id/apply", async (c) => {
    const { getPreset, presetToSettings } = await import(
      "./sandbox/presets.js"
    );
    const id = c.req.param("id");
    const preset = getPreset(id);

    if (!preset) {
      return c.json({ success: false, error: "Preset not found" }, 404);
    }

    try {
      // Read existing settings
      let settings: Record<string, unknown> = {};
      if (existsSync(CLAUDE_SETTINGS_PATH)) {
        try {
          settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
        } catch {
          // Start fresh if invalid
        }
      }

      // Merge preset settings
      const presetSettings = presetToSettings(preset);
      const merged = { ...settings, ...presetSettings };

      // Ensure directory exists
      const dir = dirname(CLAUDE_SETTINGS_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Write settings
      writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(merged, null, 2));

      return c.json({
        success: true,
        preset: preset.name,
        path: CLAUDE_SETTINGS_PATH,
        applied: presetSettings
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Unknown error"
        },
        500
      );
    }
  });

  // GET - Security level documentation
  app.get("/api/sandbox/levels", async (c) => {
    const { SECURITY_LEVELS } = await import("./sandbox/documentation.js");
    return c.json({ levels: SECURITY_LEVELS });
  });

  // GET - Command category documentation
  app.get("/api/sandbox/commands", async (c) => {
    const { COMMAND_CATEGORIES } = await import("./sandbox/documentation.js");
    return c.json({ categories: COMMAND_CATEGORIES });
  });

  // GET - Full security documentation
  app.get("/api/sandbox/documentation", async (c) => {
    const { getDocumentation } = await import("./sandbox/documentation.js");
    return c.json(getDocumentation());
  });

  // GET - Combined security overview (gates + permissions + sandbox)
  app.get("/api/security/overview", async (c) => {
    const { getSandboxStatus } = await import("./sandbox/docker.js");
    const sandboxStatus = getSandboxStatus();

    // Get Claude settings
    let claudeSettings: Record<string, unknown> | null = null;
    if (existsSync(CLAUDE_SETTINGS_PATH)) {
      try {
        claudeSettings = JSON.parse(
          readFileSync(CLAUDE_SETTINGS_PATH, "utf-8")
        );
      } catch {
        claudeSettings = null;
      }
    }

    // Determine active security level
    let activeLevel = "permissions";
    if (sandboxStatus.ready) {
      activeLevel = "docker";
    } else if (
      claudeSettings &&
      (claudeSettings as { sandbox?: { enabled?: boolean } }).sandbox?.enabled
    ) {
      activeLevel = "macos-sandbox";
    }

    return c.json({
      activeLevel,
      sandbox: sandboxStatus,
      claudeSettings: {
        exists: claudeSettings !== null,
        sandboxEnabled:
          (claudeSettings as { sandbox?: { enabled?: boolean } } | null)
            ?.sandbox?.enabled ?? false,
        permissionsConfigured: !!(
          claudeSettings as { permissions?: unknown } | null
        )?.permissions,
        hooksConfigured: !!(claudeSettings as { hooks?: unknown } | null)?.hooks
      },
      testGate: {
        enabled: state.config.testGate.enabled,
        testCommand: state.config.testGate.testCommand,
        passFileMaxAgeSeconds: state.config.testGate.passFileMaxAgeSeconds
      }
    });
  });

  // Documentation endpoints - serve markdown docs from the docs/ directory
  app.get("/api/docs", (c) => {
    // List available docs
    const docsDir = join(__dirname, "..", "..", "..", "docs");
    try {
      if (!existsSync(docsDir)) {
        return c.json({ docs: [], error: "Docs directory not found" });
      }
      const files = readdirSync(docsDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
          id: f.replace(".md", ""),
          filename: f,
          title: f
            .replace(".md", "")
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
        }));
      return c.json({ docs: files });
    } catch (e) {
      return c.json({
        docs: [],
        error: e instanceof Error ? e.message : "Unknown error"
      });
    }
  });

  app.get("/api/docs/:id", (c) => {
    const id = c.req.param("id");
    const docsDir = join(__dirname, "..", "..", "..", "docs");
    const filePath = join(docsDir, `${id}.md`);

    try {
      if (!existsSync(filePath)) {
        return c.json({ error: "Document not found" }, 404);
      }
      const content = readFileSync(filePath, "utf-8");

      // Extract title from first heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : id.replace(/-/g, " ");

      return c.json({
        id,
        title,
        content
      });
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : "Unknown error" },
        500
      );
    }
  });

  // Repository endpoints
  app.get("/api/repos", (c) => {
    const repos = state.store.snapshotRepos();
    return c.json(repos.map(repoToDict));
  });

  // Agent endpoints
  app.get("/api/agents", (c) => {
    const agents = state.store.snapshotAgents();
    return c.json(agents.map(agentToDict));
  });

  app.get("/api/agents/:pid", (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agent = state.store.getAgent(pid);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }
    return c.json(agentToDict(agent));
  });

  app.get("/api/agents/:pid/output", (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const limit = Number.parseInt(c.req.query("limit") ?? "200", 10);
    const wrapperStates = state.store.snapshotWrapperStates();
    const wrapperState = wrapperStates.get(pid);
    if (!wrapperState) {
      return c.json({ error: "Agent not found or no wrapper state" }, 404);
    }
    const lines =
      limit > 0 ? wrapperState.lastLines.slice(-limit) : wrapperState.lastLines;
    return c.json({ pid, lines });
  });

  // Agent control endpoints
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

  app.post("/api/agents/:pid/signal", async (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const body = (await c.req.json().catch(() => ({}))) as { signal?: string };
    const signal = body.signal;

    // Map signal names to Unix signals
    const signalMap: Record<string, NodeJS.Signals> = {
      interrupt: "SIGINT",
      suspend: "SIGTSTP",
      continue: "SIGCONT",
      terminate: "SIGTERM",
      kill: "SIGKILL"
      // eof doesn't have a direct signal equivalent - it's an input, not a signal
    };

    if (!signal || !(signal in signalMap)) {
      if (signal === "eof") {
        // EOF is not a signal - it requires stdin access which we don't have
        return c.json(
          { error: "EOF requires stdin access (use wrapped mode)" },
          400
        );
      }
      return c.json(
        {
          error: `Invalid signal: ${signal}. Valid: interrupt, suspend, continue, terminate, kill`
        },
        400
      );
    }

    try {
      process.kill(pid, signalMap[signal]);
      return c.json({ success: true });
    } catch {
      return c.json({ error: "Process not found" }, 404);
    }
  });

  app.post("/api/agents/:pid/input", async (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    // Input requires access to process stdin, which we don't have for scanned processes
    // This would only work for wrapped processes where we have a pty
    const agent = state.store.getAgent(pid);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    // For now, return an error explaining the limitation
    return c.json(
      {
        success: false,
        error:
          "Input not supported for scanned processes. Use wrapped mode (agentwatch run) for stdin access."
      },
      501
    );
  });

  // Port endpoints
  app.get("/api/ports", (c) => {
    const ports = state.store.snapshotPorts();
    return c.json(ports.map(portToDict));
  });

  app.get("/api/ports/:port", (c) => {
    const portNum = Number.parseInt(c.req.param("port"), 10);
    const port = state.store.getPort(portNum);
    if (!port) {
      return c.json({ error: "Port not found" }, 404);
    }
    return c.json(portToDict(port));
  });

  // Rescan trigger
  app.post("/api/repos/rescan", (c) => {
    return c.json({ queued: true });
  });

  // Session log endpoints
  app.get("/api/sessions", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const sessions = state.sessionLogger.listSessions(limit);
    return c.json(
      sessions.map((s) => ({
        session_id: s.sessionId,
        pid: s.pid,
        label: s.label,
        start_time: s.startTime,
        end_time: s.endTime
      }))
    );
  });

  app.get("/api/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const events = state.sessionLogger.readSession(sessionId);
    if (events.length === 0) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json({ session_id: sessionId, events });
  });

  // ==========================================================================
  // Managed Sessions (aw run) Endpoints
  // ==========================================================================

  // Helper to convert ManagedSession to API dict
  function managedSessionToDict(
    session: ManagedSession
  ): Record<string, unknown> {
    return {
      id: session.id,
      prompt: session.prompt,
      agent: session.agent,
      pid: session.pid ?? null,
      cwd: session.cwd,
      started_at: session.startedAt,
      ended_at: session.endedAt ?? null,
      exit_code: session.exitCode ?? null,
      status: session.status,
      duration_ms: session.endedAt
        ? session.endedAt - session.startedAt
        : Date.now() - session.startedAt
    };
  }

  // List managed sessions
  app.get("/api/managed-sessions", (c) => {
    const active = c.req.query("active") === "true";
    const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const agent = c.req.query("agent");

    const sessions = state.sessionStore.listSessions({
      active,
      limit,
      agent: agent || undefined
    });
    return c.json(sessions.map(managedSessionToDict));
  });

  // Get a specific managed session
  app.get("/api/managed-sessions/:id", (c) => {
    const id = c.req.param("id");
    const session = state.sessionStore.getSession(id);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json(managedSessionToDict(session));
  });

  // Create a new managed session
  app.post("/api/managed-sessions", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;

    const prompt = String(body.prompt ?? "");
    const agent = String(body.agent ?? "claude");
    const cwd = String(body.cwd ?? process.cwd());

    if (!prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }

    const session = state.sessionStore.createSession(prompt, agent, cwd);
    return c.json(managedSessionToDict(session), 201);
  });

  // Update a managed session (e.g., set PID after spawn)
  app.patch("/api/managed-sessions/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as Record<string, unknown>;

    const updates: Partial<ManagedSession> = {};
    if (body.pid !== undefined) updates.pid = Number(body.pid);
    if (body.status !== undefined)
      updates.status = String(body.status) as ManagedSession["status"];

    const session = state.sessionStore.updateSession(id, updates);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json(managedSessionToDict(session));
  });

  // End a managed session
  app.post("/api/managed-sessions/:id/end", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as Record<string, unknown>;

    const exitCode = Number(body.exit_code ?? 0);
    const session = state.sessionStore.endSession(id, exitCode);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json(managedSessionToDict(session));
  });

  // ==========================================================================
  // Command Center: Run, Predictions, Calibration, Principles
  // ==========================================================================

  // Helper to convert RunPrediction to API dict
  function predictionToDict(
    prediction: RunPrediction,
    outcome?: RunOutcome
  ): Record<string, unknown> {
    return {
      id: prediction.id,
      managed_session_id: prediction.managedSessionId,
      created_at: prediction.createdAt,
      predicted_duration_minutes: prediction.predictedDurationMinutes,
      duration_confidence: prediction.durationConfidence,
      predicted_tokens: prediction.predictedTokens,
      token_confidence: prediction.tokenConfidence,
      success_conditions: prediction.successConditions,
      intentions: prediction.intentions,
      selected_principles: prediction.selectedPrinciples ?? [],
      principles_path: prediction.principlesPath ?? null,
      outcome: outcome
        ? {
            prediction_id: outcome.predictionId,
            managed_session_id: outcome.managedSessionId,
            recorded_at: outcome.recordedAt,
            actual_duration_minutes: outcome.actualDurationMinutes,
            actual_tokens: outcome.actualTokens,
            exit_code: outcome.exitCode,
            user_marked_success: outcome.userMarkedSuccess,
            outcome_notes: outcome.outcomeNotes ?? null
          }
        : null
    };
  }

  // Launch a run with optional prediction (daemon-side process spawning)
  app.post("/api/managed-sessions/run", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;

    const prompt = String(body.prompt ?? "");
    const agent = String(body.agent ?? "claude") as AgentType;
    const cwd = String(body.cwd ?? process.cwd());

    if (!prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }

    // Check if process runner is available
    if (!state.processRunner) {
      return c.json({ error: "Process runner not available" }, 503);
    }

    // Validate agent
    if (!state.processRunner.isValidAgent(agent)) {
      return c.json(
        {
          error: `Unknown agent: ${agent}`,
          supported: state.processRunner.getSupportedAgents()
        },
        400
      );
    }

    // Build principles injection if provided
    let principlesInjection: string | undefined;
    let principlesPath: string | undefined;
    const selectedPrinciples = body.selected_principles as string[] | undefined;

    if (selectedPrinciples && selectedPrinciples.length > 0) {
      const principlesFile = getPrinciplesForProject(cwd);
      if (principlesFile) {
        principlesInjection = buildPrinciplesInjection(
          selectedPrinciples,
          principlesFile.principles
        );
        principlesPath = principlesFile.path;
      }
    }

    const intentions = body.intentions as string | undefined;

    // Create managed session
    const session = state.sessionStore.createSession(prompt, agent, cwd);

    // Create prediction if provided
    let prediction: RunPrediction | undefined;
    if (state.predictionStore && body.prediction) {
      const pred = body.prediction as Record<string, unknown>;
      prediction = state.predictionStore.createPrediction({
        managedSessionId: session.id,
        predictedDurationMinutes: Number(pred.duration_minutes ?? 15),
        durationConfidence: String(
          pred.duration_confidence ?? "medium"
        ) as RunPrediction["durationConfidence"],
        predictedTokens: Number(pred.tokens ?? 50000),
        tokenConfidence: String(
          pred.token_confidence ?? "medium"
        ) as RunPrediction["tokenConfidence"],
        successConditions: String(pred.success_conditions ?? ""),
        intentions: intentions ?? "",
        selectedPrinciples: selectedPrinciples,
        principlesPath
      });
    }

    // Spawn the process
    try {
      const { pid } = await state.processRunner.run({
        sessionId: session.id,
        prompt,
        agent,
        cwd,
        principlesInjection,
        intentions
      });

      return c.json(
        {
          session: managedSessionToDict(
            state.sessionStore.getSession(session.id) ?? session
          ),
          prediction: prediction ? predictionToDict(prediction) : null,
          pid
        },
        201
      );
    } catch (error) {
      // Mark session as failed if spawn fails
      state.sessionStore.endSession(session.id, -1);
      return c.json(
        {
          error: "Failed to spawn process",
          details: String(error)
        },
        500
      );
    }
  });

  // Get supported agents
  app.get("/api/command-center/agents", (c) => {
    const agents = state.processRunner?.getSupportedAgents() ?? [
      "claude",
      "codex",
      "gemini"
    ];
    return c.json({ agents });
  });

  // ==========================================================================
  // Predictions API
  // ==========================================================================

  // Create a prediction
  app.post("/api/predictions", async (c) => {
    if (!state.predictionStore) {
      return c.json({ error: "Prediction store not available" }, 503);
    }

    const body = (await c.req.json()) as Record<string, unknown>;

    const managedSessionId = String(body.managed_session_id ?? "");
    if (!managedSessionId) {
      return c.json({ error: "managed_session_id is required" }, 400);
    }

    const prediction = state.predictionStore.createPrediction({
      managedSessionId,
      predictedDurationMinutes: Number(body.predicted_duration_minutes ?? 15),
      durationConfidence: String(
        body.duration_confidence ?? "medium"
      ) as RunPrediction["durationConfidence"],
      predictedTokens: Number(body.predicted_tokens ?? 50000),
      tokenConfidence: String(
        body.token_confidence ?? "medium"
      ) as RunPrediction["tokenConfidence"],
      successConditions: String(body.success_conditions ?? ""),
      intentions: String(body.intentions ?? ""),
      selectedPrinciples: body.selected_principles as string[] | undefined,
      principlesPath: body.principles_path as string | undefined
    });

    return c.json(predictionToDict(prediction), 201);
  });

  // Get prediction for a session
  app.get("/api/predictions/session/:sessionId", (c) => {
    if (!state.predictionStore) {
      return c.json({ error: "Prediction store not available" }, 503);
    }

    const sessionId = c.req.param("sessionId");
    const prediction = state.predictionStore.getPredictionForSession(sessionId);

    if (!prediction) {
      return c.json({ error: "Prediction not found" }, 404);
    }

    const outcome = state.predictionStore.getOutcome(prediction.id);
    return c.json(predictionToDict(prediction, outcome ?? undefined));
  });

  // List predictions
  app.get("/api/predictions", (c) => {
    if (!state.predictionStore) {
      return c.json({ error: "Prediction store not available" }, 503);
    }

    const hasOutcome = c.req.query("has_outcome");
    const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);

    const results = state.predictionStore.listPredictions({
      hasOutcome: hasOutcome === undefined ? undefined : hasOutcome === "true",
      limit
    });

    return c.json(
      results.map(({ prediction, outcome }) =>
        predictionToDict(prediction, outcome)
      )
    );
  });

  // Record outcome for a prediction
  app.post("/api/predictions/:id/outcome", async (c) => {
    if (!state.predictionStore) {
      return c.json({ error: "Prediction store not available" }, 503);
    }

    const predictionId = c.req.param("id");
    const body = (await c.req.json()) as Record<string, unknown>;

    const prediction = state.predictionStore.getPrediction(predictionId);
    if (!prediction) {
      return c.json({ error: "Prediction not found" }, 404);
    }

    const result = state.predictionStore.recordOutcome({
      predictionId,
      managedSessionId: prediction.managedSessionId,
      actualDurationMinutes: Number(body.actual_duration_minutes ?? 0),
      actualTokens: Number(body.actual_tokens ?? 0),
      exitCode: Number(body.exit_code ?? 0),
      userMarkedSuccess: Boolean(body.user_marked_success),
      outcomeNotes: body.outcome_notes as string | undefined
    });

    if (!result) {
      return c.json({ error: "Failed to record outcome" }, 500);
    }

    return c.json({
      prediction: predictionToDict(prediction, result.outcome),
      calibration: {
        prediction_id: result.calibration.predictionId,
        duration_error: result.calibration.durationError,
        duration_within_confidence: result.calibration.durationWithinConfidence,
        duration_score: result.calibration.durationScore,
        token_error: result.calibration.tokenError,
        token_within_confidence: result.calibration.tokenWithinConfidence,
        token_score: result.calibration.tokenScore,
        success_prediction_correct: result.calibration.successPredictionCorrect,
        success_score: result.calibration.successScore,
        overall_score: result.calibration.overallScore
      }
    });
  });

  // ==========================================================================
  // Calibration API
  // ==========================================================================

  // Get calibration stats
  app.get("/api/calibration", (c) => {
    if (!state.predictionStore) {
      return c.json({ error: "Prediction store not available" }, 503);
    }

    const stats = state.predictionStore.getCalibrationStats();

    return c.json({
      total_predictions: stats.totalPredictions,
      completed_predictions: stats.completedPredictions,
      overall_calibration_score: stats.overallCalibrationScore,
      recent_trend: stats.recentTrend,
      history: stats.history
    });
  });

  // Get calibration history for charts
  app.get("/api/calibration/history", (c) => {
    if (!state.predictionStore) {
      return c.json({ error: "Prediction store not available" }, 503);
    }

    const days = Number.parseInt(c.req.query("days") ?? "30", 10);
    const history = state.predictionStore.getCalibrationHistory(days);

    return c.json({ history, days });
  });

  // ==========================================================================
  // Principles API
  // ==========================================================================

  // Get principles for a directory
  app.get("/api/principles", (c) => {
    const cwd = c.req.query("cwd") ?? process.cwd();
    const principlesFile = getPrinciplesForProject(cwd);

    if (!principlesFile) {
      return c.json({ found: false, path: null, principles: [] });
    }

    return c.json({
      found: true,
      path: principlesFile.path,
      last_modified: principlesFile.lastModified,
      principles: principlesFile.principles.map((p) => ({
        id: p.id,
        text: p.text,
        category: p.category ?? null
      }))
    });
  });

  // ==========================================================================
  // Claude Code Hook Integration Endpoints
  // ==========================================================================

  /**
   * Send a notification through the NotificationHub with rich context.
   * Falls back to direct osascript if hub is not available.
   */
  async function sendHookNotification(
    payload: NotificationPayload,
    broadcastType: string
  ): Promise<void> {
    // Try notification hub first
    if (state.notificationHub.isAvailable()) {
      await state.notificationHub.send(payload);
    } else {
      // Fall back to direct notification with rich formatting
      // Derive project name from cwd
      const projectName = payload.cwd
        ? payload.cwd.split("/").pop() || "Project"
        : "";
      const title = projectName || payload.title;

      // Build message with stats if available
      const message = payload.message;
      const parts: string[] = [];
      if (payload.toolCount && payload.toolCount > 0) {
        parts.push(`${payload.toolCount} tools`);
      }
      // Show tokens if available
      const inTok = payload.inputTokens ?? 0;
      const outTok = payload.outputTokens ?? 0;
      if (inTok > 0 || outTok > 0) {
        const formatTok = (n: number) =>
          n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
        parts.push(`${formatTok(inTok)}/${formatTok(outTok)} tok`);
      }
      const subtitle = parts.length > 0 ? parts.join(", ") : undefined;

      // Send via osascript directly
      if (process.platform === "darwin") {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);

        const escapeAS = (str: string) =>
          str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        let script = `display notification "${escapeAS(message)}" with title "${escapeAS(title)}"`;
        if (subtitle) {
          script += ` subtitle "${escapeAS(subtitle)}"`;
        }
        if (payload.sound !== false) {
          script += ` sound name "default"`;
        }

        try {
          await execAsync(`osascript -e '${script}'`);
        } catch {
          // Notification failed - log but don't throw
        }
      }
    }

    // Broadcast notification_sent event for UI
    state.connectionManager.broadcast({
      type: "notification_sent",
      notification_type: broadcastType,
      title: payload.title,
      message: payload.message,
      session_id: payload.sessionId,
      timestamp: Date.now()
    });
  }

  app.post("/api/hooks/session-start", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;

    // Validate session source
    const rawSource = String(body.source ?? "startup");
    const validSources: SessionSource[] = [
      "startup",
      "resume",
      "clear",
      "compact"
    ];
    const source: SessionSource = validSources.includes(
      rawSource as SessionSource
    )
      ? (rawSource as SessionSource)
      : "startup";

    const cwd = String(body.cwd ?? "");

    const session = state.hookStore.sessionStart(
      String(body.session_id ?? ""),
      String(body.transcript_path ?? ""),
      cwd,
      String(body.permission_mode ?? "default"),
      source
    );

    state.connectionManager.broadcast({
      type: "hook_session_start",
      session: hookSessionToDict(session)
    });

    // Notification via hub
    if (
      state.config.notifications.enable &&
      state.config.notifications.hookSessionStart
    ) {
      await sendHookNotification(
        {
          type: "info",
          title: "Session Started",
          message: source === "startup" ? "New session" : `Session ${source}`,
          hookType: "SessionStart",
          sessionId: session.sessionId,
          cwd,
          metadata: { source }
        },
        "hook_session_start"
      );
    }

    // Context injection for SessionStart
    const contextParts: string[] = [];
    const ci = state.config.hookEnhancements.contextInjection;

    if (ci.injectGitContext && cwd) {
      try {
        const { execSync } = await import("node:child_process");
        const gitStatus = execSync("git status --short 2>/dev/null || true", {
          cwd,
          encoding: "utf-8",
          timeout: 5000
        }).trim();
        if (gitStatus) {
          const lines = gitStatus.split("\n").slice(0, ci.maxContextLines);
          contextParts.push(
            `## Git Status\n\`\`\`\n${lines.join("\n")}\n\`\`\``
          );
        }
      } catch {
        // Git not available or error
      }
    }

    if (ci.injectProjectContext && cwd) {
      try {
        const { readFileSync, existsSync } = await import("node:fs");
        const { join } = await import("node:path");

        // Try CLAUDE.md first, then README.md
        const claudeMdPath = join(cwd, "CLAUDE.md");
        const readmePath = join(cwd, "README.md");

        let projectContext = "";
        if (existsSync(claudeMdPath)) {
          projectContext = readFileSync(claudeMdPath, "utf-8");
        } else if (existsSync(readmePath)) {
          projectContext = readFileSync(readmePath, "utf-8");
        }

        if (projectContext) {
          const lines = projectContext.split("\n").slice(0, ci.maxContextLines);
          contextParts.push(`## Project Context\n${lines.join("\n")}`);
        }
      } catch {
        // File read error
      }
    }

    // Capture git state at session start for diff snapshot
    if (cwd) {
      try {
        const { captureSessionStart } =
          require("./enrichments/git-snapshot") as typeof import(
            "./enrichments/git-snapshot"
          );
        captureSessionStart(session.sessionId, cwd);
      } catch {
        // Git capture failed, continue anyway
      }
    }

    // Return context injection if configured
    if (contextParts.length > 0) {
      return c.json({
        status: "ok",
        session_id: session.sessionId,
        additionalContext: contextParts.join("\n\n")
      });
    }

    return c.json({ status: "ok", session_id: session.sessionId });
  });

  app.post("/api/hooks/session-end", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const sessionId = String(body.session_id ?? "");
    const session = state.hookStore.sessionEnd(sessionId);

    if (session) {
      state.connectionManager.broadcast({
        type: "hook_session_end",
        session: hookSessionToDict(session)
      });

      // Notification via hub
      if (
        state.config.notifications.enable &&
        state.config.notifications.hookSessionEnd
      ) {
        await sendHookNotification(
          {
            type: "info",
            title: "Session Ended",
            message: "Session complete",
            hookType: "SessionEnd",
            sessionId,
            cwd: session.cwd,
            toolCount: session.toolCount,
            inputTokens: session.totalInputTokens,
            outputTokens: session.totalOutputTokens
          },
          "hook_session_end"
        );
      }

      // Auto-enrichment: compute and store enrichments for this session
      try {
        const { computeAllEnrichments, clearStartStateCache } =
          require("./enrichments") as typeof import("./enrichments");
        const { updateEnrichments } =
          require("./enrichment-store") as typeof import("./enrichment-store");
        const toolUsages = state.hookStore.getSessionToolUsages(sessionId);
        const cwd = session.cwd || process.cwd();

        const enrichments = computeAllEnrichments(
          sessionId,
          session,
          toolUsages,
          cwd
        );

        // Store enrichments with session reference
        const sessionRef = {
          hookSessionId: sessionId,
          correlationId: sessionId // Use session ID as correlation ID for now
        };

        updateEnrichments(sessionId, sessionRef, enrichments);

        // Clear the git start state cache for this session
        clearStartStateCache(sessionId);

        // Broadcast enrichment update
        state.connectionManager.broadcast({
          type: "enrichment_computed",
          session_id: sessionId,
          enrichments
        });
      } catch (err) {
        // Auto-enrichment failed, log but don't fail the hook
        console.error("Auto-enrichment failed for session", sessionId, err);
      }
    }

    return c.json({ status: "ok" });
  });

  app.post("/api/hooks/pre-tool-use", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const toolName = String(body.tool_name ?? "");
    const toolInput = (body.tool_input ?? {}) as Record<string, unknown>;
    const cwd = String(body.cwd ?? "");

    const usage = state.hookStore.recordPreToolUse(
      String(body.session_id ?? ""),
      String(body.tool_use_id ?? ""),
      toolName,
      toolInput,
      cwd
    );

    state.connectionManager.broadcast({
      type: "hook_pre_tool_use",
      usage: toolUsageToDict(usage)
    });

    // Notification via hub
    if (
      state.config.notifications.enable &&
      state.config.notifications.hookPreToolUse
    ) {
      await sendHookNotification(
        {
          type: "info",
          title: "Tool Starting",
          message: toolName,
          hookType: "PreToolUse",
          sessionId: usage.sessionId,
          cwd,
          toolName,
          toolInput
        },
        "hook_pre_tool_use"
      );
    }

    // Input modification logic
    const im = state.config.hookEnhancements.inputModification;
    let updatedInput: Record<string, unknown> | undefined;

    if (im.enabled) {
      // Auto-add dry-run flags to destructive bash commands
      if (im.addDryRunFlags && toolName.toLowerCase() === "bash") {
        const command = toolInput.command ? String(toolInput.command) : "";
        // Check for destructive commands that support --dry-run
        const dryRunCommands = [
          "rm",
          "mv",
          "cp",
          "rsync",
          "git clean",
          "npm prune"
        ];
        const needsDryRun = dryRunCommands.some(
          (cmd) =>
            command.includes(cmd) &&
            !command.includes("--dry-run") &&
            !command.includes("-n")
        );
        if (needsDryRun) {
          updatedInput = {
            ...toolInput,
            command: command + " --dry-run"
          };
        }
      }

      // Enforce commit message format
      if (im.enforceCommitFormat && toolName.toLowerCase() === "bash") {
        const command = toolInput.command ? String(toolInput.command) : "";
        if (command.includes("git commit") && im.commitMessagePrefix) {
          // Check if commit message already has the prefix
          const msgMatch = command.match(/-m\s+["']([^"']+)["']/);
          if (
            msgMatch?.[1] &&
            !msgMatch[1].startsWith(im.commitMessagePrefix)
          ) {
            const newCommand = command.replace(
              /-m\s+["']([^"']+)["']/,
              `-m "${im.commitMessagePrefix}$1"`
            );
            updatedInput = {
              ...toolInput,
              command: newCommand
            };
          }
        }
      }
    }

    // Return with updated input if modified
    if (updatedInput) {
      return c.json({
        decision: "approve",
        updatedInput
      });
    }

    return c.json({ decision: "approve" });
  });

  app.post("/api/hooks/post-tool-use", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;

    const usage = state.hookStore.recordPostToolUse(
      String(body.tool_use_id ?? ""),
      body.tool_response as Record<string, unknown> | undefined,
      body.error ? String(body.error) : undefined
    );

    if (usage) {
      state.connectionManager.broadcast({
        type: "hook_post_tool_use",
        usage: toolUsageToDict(usage)
      });

      // Notification via hub
      if (
        state.config.notifications.enable &&
        state.config.notifications.hookPostToolUse
      ) {
        const durationMs = usage.durationMs ?? 0;
        const durationStr =
          durationMs > 1000
            ? `${(durationMs / 1000).toFixed(1)}s`
            : `${durationMs}ms`;
        await sendHookNotification(
          {
            type: usage.success ? "success" : "error",
            title: usage.success ? "Tool Complete" : "Tool Failed",
            message: `${usage.toolName} (${durationStr})`,
            hookType: "PostToolUse",
            sessionId: usage.sessionId,
            cwd: usage.cwd,
            toolName: usage.toolName,
            toolInput: usage.toolInput,
            metadata: { success: usage.success, durationMs, error: usage.error }
          },
          "hook_post_tool_use"
        );
      }

      // Additional notification for tool failures (separate toggle)
      if (
        !usage.success &&
        state.config.notifications.enable &&
        state.config.notifications.hookToolFailure
      ) {
        await sendHookNotification(
          {
            type: "error",
            title: "Tool Failed",
            message: usage.error
              ? `${usage.toolName}: ${usage.error.slice(0, 80)}`
              : usage.toolName,
            hookType: "PostToolUse",
            sessionId: usage.sessionId,
            cwd: usage.cwd,
            toolName: usage.toolName,
            sound: true // Sound for failures to get attention
          },
          "hook_tool_failure"
        );
      }

      // Check for git commits and record them
      if (usage.toolName.toLowerCase() === "bash" && usage.success) {
        const command = usage.toolInput?.command
          ? String(usage.toolInput.command)
          : "";
        if (command.includes("git commit") && usage.toolResponse) {
          const commitHash = extractCommitHash(usage.toolResponse);
          if (commitHash) {
            const commitMsg = extractCommitMessage(usage.toolResponse);
            state.hookStore.recordCommit(
              usage.sessionId,
              commitHash,
              commitMsg,
              usage.cwd
            );
            state.connectionManager.broadcast({
              type: "git_commit",
              session_id: usage.sessionId,
              commit_hash: commitHash,
              message: commitMsg
            });
          }
        }
      }

      // Check if this was a test command (for Test Gate feature)
      const testGate = state.config.testGate;
      if (testGate.enabled && usage.toolName.toLowerCase() === "bash") {
        const command = usage.toolInput?.command
          ? String(usage.toolInput.command)
          : "";
        const testCmd = testGate.testCommand;

        if (testCmd && command.includes(testCmd)) {
          if (usage.success) {
            recordTestPass(testGate.passFile);
            state.connectionManager.broadcast({
              type: "test_gate_pass",
              command
            });
          } else {
            clearTestPass(testGate.passFile);
            state.connectionManager.broadcast({
              type: "test_gate_fail",
              command,
              error: usage.error
            });
          }
        }
      }
    }

    return c.json({ status: "ok" });
  });

  app.post("/api/hooks/notification", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const sessionId = String(body.session_id ?? "");
    const notificationType = String(body.notification_type ?? "");
    const session = state.hookStore.getSession(sessionId);

    if (notificationType === "permission_prompt") {
      state.hookStore.updateSessionAwaiting(sessionId, true);

      // Awaiting input notification via hub
      if (
        state.config.notifications.enable &&
        state.config.notifications.hookAwaitingInput
      ) {
        await sendHookNotification(
          {
            type: "warning",
            title: "Input Required",
            message: "Claude is waiting for permission",
            hookType: "Notification",
            sessionId,
            cwd: session?.cwd,
            toolCount: session?.toolCount,
            inputTokens: session?.totalInputTokens,
            outputTokens: session?.totalOutputTokens,
            sound: true // Sound for attention
          },
          "hook_awaiting_input"
        );
      }
    }

    // General notification hook via hub
    if (
      state.config.notifications.enable &&
      state.config.notifications.hookNotification
    ) {
      await sendHookNotification(
        {
          type: "info",
          title: "Notification",
          message: notificationType,
          hookType: "Notification",
          sessionId,
          cwd: session?.cwd,
          metadata: { notificationType }
        },
        "hook_notification"
      );
    }

    state.connectionManager.broadcast({
      type: "hook_notification",
      session_id: sessionId,
      notification_type: notificationType
    });

    return c.json({ status: "ok" });
  });

  // PermissionRequest hook - tracks permission grants/denials
  app.post("/api/hooks/permission-request", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const sessionId = String(body.session_id ?? "");
    const toolName = String(body.tool_name ?? "");
    const toolInput = (body.tool_input ?? {}) as Record<string, unknown>;
    const action = String(body.action ?? ""); // "allow", "deny", "allowForSession", etc.

    state.connectionManager.broadcast({
      type: "hook_permission_request",
      session_id: sessionId,
      tool_name: toolName,
      action,
      timestamp: Date.now()
    });

    // Notification via hub
    if (
      state.config.notifications.enable &&
      state.config.notifications.hookPermissionRequest
    ) {
      const session = state.hookStore.getSession(sessionId);
      const actionLabel = action.includes("allow")
        ? "allowed"
        : action.includes("deny")
          ? "denied"
          : action;
      await sendHookNotification(
        {
          type: action.includes("allow")
            ? "success"
            : action.includes("deny")
              ? "warning"
              : "info",
          title: "Permission",
          message: `${toolName} ${actionLabel}`,
          hookType: "PermissionRequest",
          sessionId,
          cwd: session?.cwd,
          toolName,
          toolInput,
          metadata: { action }
        },
        "hook_permission_request"
      );
    }

    // Auto-permission decisions
    const ap = state.config.hookEnhancements.autoPermissions;
    if (ap.enabled) {
      // Auto-approve read-only operations
      if (ap.autoApproveReadOnly) {
        const readOnlyTools = ["Read", "Glob", "Grep", "WebFetch", "WebSearch"];
        if (readOnlyTools.includes(toolName)) {
          return c.json({
            decision: "allow",
            reason: "Auto-approved: read-only operation"
          });
        }
      }

      // Note: Protected paths feature was removed - use Claude Code's native deny rules instead
    }

    return c.json({ status: "ok" });
  });

  // UserPromptSubmit hook - runs when user submits a prompt
  app.post("/api/hooks/user-prompt-submit", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const sessionId = String(body.session_id ?? "");
    const prompt = String(body.user_message ?? body.prompt ?? "");
    const promptLength = prompt.length;
    const cwd = String(body.cwd ?? "");

    // Update session activity
    if (sessionId) {
      state.hookStore.updateSessionAwaiting(sessionId, false);
    }

    state.connectionManager.broadcast({
      type: "hook_user_prompt_submit",
      session_id: sessionId,
      prompt_length: promptLength,
      timestamp: Date.now()
    });

    // Notification via hub
    if (
      state.config.notifications.enable &&
      state.config.notifications.hookUserPromptSubmit
    ) {
      const session = state.hookStore.getSession(sessionId);
      await sendHookNotification(
        {
          type: "info",
          title: "Prompt Submitted",
          message: `${promptLength} characters`,
          hookType: "UserPromptSubmit",
          sessionId,
          cwd,
          toolCount: session?.toolCount,
          inputTokens: session?.totalInputTokens,
          outputTokens: session?.totalOutputTokens,
          metadata: { promptLength }
        },
        "hook_user_prompt_submit"
      );
    }

    // Context injection for UserPromptSubmit
    const contextParts: string[] = [];
    const ci = state.config.hookEnhancements.contextInjection;

    // Inject recent errors if enabled
    if (ci.injectRecentErrors && cwd) {
      try {
        // Check for recent test failures or build errors
        const recentUsages = state.hookStore.getRecentToolUsages(20);
        const recentErrors = recentUsages
          .filter((u) => !u.success && u.error && u.cwd === cwd)
          .slice(0, 3);

        if (recentErrors.length > 0) {
          const errorLines = recentErrors.map(
            (e) => `- ${e.toolName}: ${e.error?.slice(0, 100)}`
          );
          contextParts.push(`## Recent Errors\n${errorLines.join("\n")}`);
        }
      } catch {
        // Error getting recent usages
      }
    }

    // Return context injection if configured
    if (contextParts.length > 0) {
      return c.json({
        status: "ok",
        additionalContext: contextParts.join("\n\n")
      });
    }

    return c.json({ status: "ok" });
  });

  // Stop hook - runs when Claude finishes responding
  app.post("/api/hooks/stop", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const sessionId = String(body.session_id ?? "");
    const stopReason = String(body.stop_reason ?? "end_turn");
    const inputTokens = Number(body.input_tokens ?? 0);
    const outputTokens = Number(body.output_tokens ?? 0);
    const cwd = String(body.cwd ?? "");

    // Token/cost tracking
    const tt = state.config.hookEnhancements.tokenTracking;
    if (tt.enabled && sessionId) {
      // CAVEAT: Cost is a rough ESTIMATE only, not actual Anthropic billing.
      // Uses hardcoded Sonnet 3.5 pricing which may be outdated.
      // Does not account for model differences, caching, or API discounts.
      const inputCost = (inputTokens / 1_000_000) * 3; // $3/M input (Sonnet estimate)
      const outputCost = (outputTokens / 1_000_000) * 15; // $15/M output (Sonnet estimate)
      const estimatedCost = inputCost + outputCost;

      const session = state.hookStore.updateSessionTokens(
        sessionId,
        inputTokens,
        outputTokens,
        estimatedCost
      );

      // Cost warning notification
      if (session && session.estimatedCostUsd >= tt.costWarningThresholdUsd) {
        state.connectionManager.broadcast({
          type: "cost_warning",
          session_id: sessionId,
          total_cost_usd: session.estimatedCostUsd,
          threshold_usd: tt.costWarningThresholdUsd
        });
      }
    }

    state.connectionManager.broadcast({
      type: "hook_stop",
      session_id: sessionId,
      stop_reason: stopReason,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      timestamp: Date.now()
    });

    // Notification via hub - get session for rich context
    if (
      state.config.notifications.enable &&
      state.config.notifications.hookStop
    ) {
      const session = state.hookStore.getSession(sessionId);
      await sendHookNotification(
        {
          type: "info",
          title: "Turn Complete",
          message: stopReason === "end_turn" ? "Response complete" : stopReason,
          hookType: "Stop",
          sessionId,
          cwd,
          toolCount: session?.toolCount,
          inputTokens: session?.totalInputTokens,
          outputTokens: session?.totalOutputTokens,
          metadata: {
            stopReason,
            turnInputTokens: inputTokens,
            turnOutputTokens: outputTokens
          }
        },
        "hook_stop"
      );
    }

    // Auto-continue logic
    const ac = state.config.hookEnhancements.autoContinue;
    if (ac.enabled && sessionId && cwd) {
      const attempts = state.hookStore.incrementAutoContinueAttempts(sessionId);

      if (attempts <= ac.maxAttempts) {
        let shouldContinue = false;
        let continueReason = "";

        // Check for failing tests
        if (ac.onFailingTests) {
          const testGate = state.config.testGate;
          if (testGate.enabled && testGate.passFile) {
            try {
              const { existsSync, statSync } = await import("node:fs");
              const passFilePath = testGate.passFile.replace(
                "~",
                process.env.HOME || ""
              );
              if (!existsSync(passFilePath)) {
                shouldContinue = true;
                continueReason =
                  "Tests have not passed yet. Please run the tests and fix any failures.";
              } else {
                // Check if pass file is stale
                const stat = statSync(passFilePath);
                const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
                if (ageSeconds > testGate.passFileMaxAgeSeconds) {
                  shouldContinue = true;
                  continueReason =
                    "Test pass is stale. Please run tests again.";
                }
              }
            } catch {
              // Can't check test status
            }
          }
        }

        // Check for lint errors
        if (ac.onLintErrors && !shouldContinue && cwd) {
          try {
            const { execSync } = await import("node:child_process");
            // Try to run lint check (common patterns)
            const lintOutput = execSync(
              "npm run lint --silent 2>&1 || yarn lint --silent 2>&1 || true",
              { cwd, encoding: "utf-8", timeout: 30000 }
            ).trim();
            if (lintOutput.toLowerCase().includes("error")) {
              shouldContinue = true;
              continueReason =
                "Lint errors detected. Please fix them before continuing.";
            }
          } catch {
            // Lint check not available
          }
        }

        if (shouldContinue) {
          return c.json({
            continue: true,
            systemMessage: continueReason
          });
        } else {
          // Reset attempts if we didn't need to continue
          state.hookStore.resetAutoContinueAttempts(sessionId);
        }
      }
    }

    return c.json({ status: "ok" });
  });

  // SubagentStop hook - runs when a subagent (Task tool) finishes
  app.post("/api/hooks/subagent-stop", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const sessionId = String(body.session_id ?? "");
    const subagentId = String(body.subagent_id ?? body.tool_use_id ?? "");
    const stopReason = String(body.stop_reason ?? "end_turn");
    const inputTokens = Number(body.input_tokens ?? 0);
    const outputTokens = Number(body.output_tokens ?? 0);

    // Token tracking for subagents too
    const tt = state.config.hookEnhancements.tokenTracking;
    if (tt.enabled && sessionId) {
      // CAVEAT: Cost is a rough ESTIMATE only (see Stop hook for details)
      const inputCost = (inputTokens / 1_000_000) * 3;
      const outputCost = (outputTokens / 1_000_000) * 15;
      const estimatedCost = inputCost + outputCost;

      state.hookStore.updateSessionTokens(
        sessionId,
        inputTokens,
        outputTokens,
        estimatedCost
      );
    }

    state.connectionManager.broadcast({
      type: "hook_subagent_stop",
      session_id: sessionId,
      subagent_id: subagentId,
      stop_reason: stopReason,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      timestamp: Date.now()
    });

    // Notification via hub
    if (
      state.config.notifications.enable &&
      state.config.notifications.hookSubagentStop
    ) {
      const session = state.hookStore.getSession(sessionId);
      await sendHookNotification(
        {
          type: "info",
          title: "Subagent Complete",
          message: stopReason === "end_turn" ? "Task finished" : stopReason,
          hookType: "SubagentStop",
          sessionId,
          cwd: session?.cwd,
          inputTokens,
          outputTokens,
          metadata: { subagentId, stopReason }
        },
        "hook_subagent_stop"
      );
    }

    // Subagent quality gates
    const sq = state.config.hookEnhancements.subagentQuality;
    if (sq.enabled) {
      // Check if subagent completed successfully
      if (sq.requireSuccess && stopReason !== "end_turn") {
        return c.json({
          continue: false,
          stopReason: `Subagent did not complete successfully: ${stopReason}`
        });
      }
    }

    return c.json({ status: "ok" });
  });

  // PreCompact hook - runs before context compacting
  app.post("/api/hooks/pre-compact", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const sessionId = String(body.session_id ?? "");
    const compactType = String(body.compact_type ?? "auto"); // "manual" or "auto"

    state.connectionManager.broadcast({
      type: "hook_pre_compact",
      session_id: sessionId,
      compact_type: compactType,
      timestamp: Date.now()
    });

    // Notification via hub
    if (
      state.config.notifications.enable &&
      state.config.notifications.hookPreCompact
    ) {
      const session = state.hookStore.getSession(sessionId);
      await sendHookNotification(
        {
          type: "warning",
          title: "Context Compacting",
          message:
            compactType === "auto"
              ? "Auto-compacting context"
              : "Manual compact",
          hookType: "PreCompact",
          sessionId,
          cwd: session?.cwd,
          toolCount: session?.toolCount,
          inputTokens: session?.totalInputTokens,
          outputTokens: session?.totalOutputTokens,
          metadata: { compactType }
        },
        "hook_pre_compact"
      );
    }

    return c.json({ status: "ok" });
  });

  // Test notification endpoint
  app.post("/api/notifications/test", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const type = String(body.type ?? "awaiting_input");

    // Direct test with error capture
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    const script = `display notification "Test from agentwatch daemon" with title "Agentwatch" subtitle "Notification Test" sound name "default"`;

    let directResult: {
      success: boolean;
      stdout?: string;
      stderr?: string;
      error?: string;
    } = { success: false };
    try {
      const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
      directResult = { success: true, stdout, stderr };
    } catch (error: unknown) {
      const e = error as { message?: string; stdout?: string; stderr?: string };
      directResult = {
        success: false,
        error: e.message,
        stdout: e.stdout,
        stderr: e.stderr
      };
    }

    let result: boolean;
    switch (type) {
      case "awaiting_input":
        result = await notifications.awaitingInput(
          "test-session",
          "/test/path"
        );
        break;
      case "session_end":
        result = await notifications.sessionEnd("test-session", "/test/path");
        break;
      case "tool_failure":
        result = await notifications.toolFailure(
          "TestTool",
          "Test error message"
        );
        break;
      case "long_running":
        result = await notifications.longRunning("TestTool", 120);
        break;
      case "security_blocked":
        result = await notifications.securityBlocked(
          "TestTool",
          "Test security block"
        );
        break;
      default:
        result = await notifications.awaitingInput(
          "test-session",
          "/test/path"
        );
    }

    return c.json({
      success: result,
      type,
      enabled: state.config.notifications.enable,
      platform: process.platform,
      directTest: directResult
    });
  });

  // ==========================================================================
  // Test Gate Endpoint
  // ==========================================================================
  // Note: Pattern-based security gates were removed. Use Claude Code's native
  // deny rules in ~/.claude/settings.json for blocking dangerous commands.
  // Only Test Gate remains as it provides unique workflow functionality.

  app.get("/api/test-gate", (c) => {
    const testGate = state.config.testGate;
    if (!testGate.enabled) {
      return c.json({ enabled: false });
    }

    const decision = checkTestGate(testGate);
    return c.json({
      enabled: true,
      test_command: testGate.testCommand,
      pass_file: testGate.passFile,
      pass_file_max_age_seconds: testGate.passFileMaxAgeSeconds,
      tests_passed: decision.allowed,
      reason: decision.reason
    });
  });

  app.post("/api/test-gate/toggle", async (c) => {
    const body = (await c.req.json()) as { enabled?: boolean };
    if (typeof body.enabled === "boolean") {
      state.config.testGate.enabled = body.enabled;
    }
    return c.json({ enabled: state.config.testGate.enabled });
  });

  // PreToolUse hook for Test Gate - blocks git commit if tests haven't passed
  app.post("/api/hooks/test-gate", async (c) => {
    const testGate = state.config.testGate;
    if (!testGate.enabled) {
      return c.json({ decision: "allow" });
    }

    const body = (await c.req.json()) as Record<string, unknown>;
    const toolName = String(body.tool_name ?? "");
    const toolInput = (body.tool_input ?? {}) as Record<string, unknown>;

    // Only check git commits
    if (toolName.toLowerCase() !== "bash") {
      return c.json({ decision: "allow" });
    }

    const command = String(toolInput.command ?? "");
    if (!isGitCommit(command)) {
      return c.json({ decision: "allow" });
    }

    const decision = checkTestGate(testGate);
    if (!decision.allowed) {
      state.connectionManager.broadcast({
        type: "test_gate_block",
        reason: decision.reason
      });

      return c.json({
        decision: "block",
        reason: decision.reason
      });
    }

    return c.json({ decision: "allow" });
  });

  // Hook data query endpoints
  app.get("/api/hooks/sessions", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const activeOnly = c.req.query("active_only") === "true";

    const sessions = activeOnly
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
    return c.json(hookSessionToDict(session));
  });

  app.get("/api/hooks/sessions/:id/timeline", (c) => {
    const sessionId = c.req.param("id");
    const usages = state.hookStore.getSessionToolUsages(sessionId);
    return c.json(usages.map(toolUsageToDict));
  });

  app.get("/api/hooks/tools/stats", (c) => {
    const stats = state.hookStore.getToolStats();
    return c.json({ stats: stats.map(toolStatsToDict) });
  });

  app.get("/api/hooks/tools/recent", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "500", 10);
    const tool = c.req.query("tool");
    const usages = state.hookStore.getRecentToolUsages(
      limit,
      tool ?? undefined
    );
    return c.json(usages.map(toolUsageToDict));
  });

  app.get("/api/hooks/stats/daily", (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);
    const stats = state.hookStore.getDailyStats(days);
    return c.json({ days, stats: stats.map(dailyStatsToDict) });
  });

  // Git Session Attribution Endpoints
  app.get("/api/hooks/commits", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const commits = state.hookStore.getAllCommits(limit);
    return c.json(commits.map(gitCommitToDict));
  });

  app.get("/api/hooks/sessions/:id/commits", (c) => {
    const sessionId = c.req.param("id");
    const commits = state.hookStore.getSessionCommits(sessionId);
    return c.json(commits.map(gitCommitToDict));
  });

  // Smart Suggestions Endpoints
  app.get("/api/hooks/suggestions", (c) => {
    const suggestions: Suggestion[] = [];

    // Analyze tool stats
    const toolStats = state.hookStore.getToolStats();
    suggestions.push(...analyzeToolStats(toolStats));

    // Analyze recent sessions
    const sessions = state.hookStore.getAllSessions(20);
    const toolUsagesBySession = new Map<string, ToolUsage[]>();
    for (const session of sessions) {
      toolUsagesBySession.set(
        session.sessionId,
        state.hookStore.getSessionToolUsages(session.sessionId)
      );
    }
    suggestions.push(...analyzeRecentSessions(sessions, toolUsagesBySession));

    return c.json({
      suggestions: suggestions.map(suggestionToDict),
      session_count: sessions.length
    });
  });

  app.get("/api/hooks/sessions/:id/suggestions", (c) => {
    const sessionId = c.req.param("id");
    const session = state.hookStore.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const toolUsages = state.hookStore.getSessionToolUsages(sessionId);
    const suggestions = analyzeSession(session, toolUsages);

    return c.json({
      session_id: sessionId,
      suggestions: suggestions.map(suggestionToDict)
    });
  });

  // Session Annotations & Heuristic Scoring
  app.get("/api/annotations", (c) => {
    const { getAllAnnotations } = require("./annotations") as typeof import(
      "./annotations"
    );
    return c.json(getAllAnnotations());
  });

  app.get("/api/annotations/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    const { getAnnotation, computeHeuristicScore } =
      require("./annotations") as typeof import("./annotations");

    const annotation = getAnnotation(sessionId);

    // Try to compute heuristic if we have hook session data
    let heuristic = null;
    const session = state.hookStore.getSession(sessionId);
    if (session) {
      const toolUsages = state.hookStore.getSessionToolUsages(sessionId);
      heuristic = computeHeuristicScore(session, toolUsages);
    }

    return c.json({ annotation, heuristic });
  });

  app.post("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as {
      feedback?: "positive" | "negative" | null;
      notes?: string;
    };
    const { setAnnotation } = require("./annotations") as typeof import(
      "./annotations"
    );

    const annotation = setAnnotation(
      sessionId,
      body.feedback ?? null,
      body.notes
    );
    return c.json(annotation);
  });

  app.delete("/api/annotations/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    const { deleteAnnotation } = require("./annotations") as typeof import(
      "./annotations"
    );

    const deleted = deleteAnnotation(sessionId);
    if (!deleted) {
      return c.json({ error: "Annotation not found" }, 404);
    }
    return c.json({ success: true });
  });

  app.get("/api/annotations/stats", (c) => {
    const { getAnnotationStats, computeHeuristicScore, getAllAnnotations } =
      require("./annotations") as typeof import("./annotations");

    // Get all hook sessions
    const sessions = state.hookStore.getAllSessions(1000);
    const sessionIds = sessions.map((s) => s.sessionId);

    // Compute heuristic scores for all sessions
    const heuristicScores = new Map<
      string,
      ReturnType<typeof computeHeuristicScore>
    >();
    for (const session of sessions) {
      const toolUsages = state.hookStore.getSessionToolUsages(
        session.sessionId
      );
      const score = computeHeuristicScore(session, toolUsages);
      heuristicScores.set(session.sessionId, score);
    }

    const stats = getAnnotationStats(sessionIds, heuristicScores);
    return c.json(stats);
  });

  // Bulk heuristic scoring for sessions
  app.post("/api/annotations/heuristics", async (c) => {
    let body: { session_ids?: string[] } = {};
    try {
      body = (await c.req.json()) as { session_ids?: string[] };
    } catch {
      body = {};
    }
    const { computeHeuristicScore } = require("./annotations") as typeof import(
      "./annotations"
    );

    const sessionIds =
      (Array.isArray(body.session_ids) ? body.session_ids : undefined) ||
      state.hookStore.getAllSessions(100).map((s) => s.sessionId);
    const results: Record<
      string,
      ReturnType<typeof computeHeuristicScore>
    > = {};

    for (const sessionId of sessionIds) {
      const session = state.hookStore.getSession(sessionId);
      if (session) {
        const toolUsages = state.hookStore.getSessionToolUsages(sessionId);
        results[sessionId] = computeHeuristicScore(session, toolUsages);
      }
    }

    return c.json(results);
  });

  // ==========================================================================
  // Projects Endpoints
  // ==========================================================================

  app.get("/api/projects", (c) => {
    return c.json({
      projects: state.config.projects.projects.map((p) => ({
        id: p.id,
        name: p.name,
        paths: p.paths,
        description: p.description
      }))
    });
  });

  app.get("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const project = state.config.projects.projects.find((p) => p.id === id);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }
    return c.json({
      id: project.id,
      name: project.name,
      paths: project.paths,
      description: project.description
    });
  });

  app.post("/api/projects", async (c) => {
    const body = (await c.req.json()) as {
      id: string;
      name: string;
      paths: string[];
      description?: string;
    };

    // Validate required fields
    if (
      !body.id ||
      !body.name ||
      !Array.isArray(body.paths) ||
      body.paths.length === 0
    ) {
      return c.json(
        { error: "Missing required fields: id, name, paths (non-empty array)" },
        400
      );
    }

    // Check for duplicate ID
    if (state.config.projects.projects.some((p) => p.id === body.id)) {
      return c.json({ error: "Project with this ID already exists" }, 409);
    }

    const project = {
      id: body.id,
      name: body.name,
      paths: body.paths,
      description: body.description
    };

    state.config.projects.projects.push(project);

    try {
      saveConfig(state.config);
    } catch (err) {
      console.error("Failed to persist project:", err);
    }

    return c.json({ success: true, project }, 201);
  });

  app.patch("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as Partial<{
      name: string;
      paths: string[];
      description: string;
    }>;

    const project = state.config.projects.projects.find((p) => p.id === id);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    if (body.name !== undefined) project.name = body.name;
    if (body.paths !== undefined) project.paths = body.paths;
    if (body.description !== undefined) project.description = body.description;

    try {
      saveConfig(state.config);
    } catch (err) {
      console.error("Failed to persist project update:", err);
    }

    return c.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        paths: project.paths,
        description: project.description
      }
    });
  });

  app.delete("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const idx = state.config.projects.projects.findIndex((p) => p.id === id);

    if (idx === -1) {
      return c.json({ error: "Project not found" }, 404);
    }

    state.config.projects.projects.splice(idx, 1);

    try {
      saveConfig(state.config);
    } catch (err) {
      console.error("Failed to persist project deletion:", err);
    }

    return c.json({ success: true });
  });

  // Infer projects from git repositories in session cwds
  app.post("/api/projects/infer", async (c) => {
    const fs = await import("fs");
    const path = await import("path");

    // Collect all unique cwds from hook sessions and transcripts
    const cwds = new Set<string>();

    // From hook sessions
    const sessions = state.hookStore.getAllSessions(1000);
    for (const session of sessions) {
      if (session.cwd) cwds.add(session.cwd);
    }

    // From transcripts
    if (state.transcriptIndex) {
      for (const entry of Object.values(state.transcriptIndex.entries)) {
        if (entry.projectDir) cwds.add(entry.projectDir);
      }
    }

    // Find git roots and extract project info
    const gitProjects = new Map<
      string,
      { name: string; path: string; remoteUrl?: string }
    >();

    for (const cwd of cwds) {
      // Walk up to find .git directory
      let dir = cwd;
      let gitRoot: string | null = null;

      for (let i = 0; i < 10; i++) {
        const gitPath = path.join(dir, ".git");
        try {
          const stat = fs.statSync(gitPath);
          if (stat.isDirectory() || stat.isFile()) {
            gitRoot = dir;
            break;
          }
        } catch {
          // Not found, continue up
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }

      if (gitRoot && !gitProjects.has(gitRoot)) {
        // Extract repo name from directory
        const repoName = path.basename(gitRoot);

        // Try to get remote URL
        let remoteUrl: string | undefined;
        try {
          const configPath = path.join(gitRoot, ".git", "config");
          const configContent = fs.readFileSync(configPath, "utf8");
          const urlMatch = configContent.match(
            /\[remote "origin"\][^\[]*url\s*=\s*(.+)/
          );
          if (urlMatch?.[1]) {
            remoteUrl = urlMatch[1].trim();
          }
        } catch {
          // Ignore
        }

        gitProjects.set(gitRoot, {
          name: repoName,
          path: gitRoot,
          remoteUrl
        });
      }
    }

    // Create projects for repos not already tracked
    const existingPaths = new Set<string>();
    for (const project of state.config.projects.projects) {
      for (const p of project.paths) {
        existingPaths.add(p.replace(/\/$/, ""));
      }
    }

    const newProjects: Array<{
      id: string;
      name: string;
      paths: string[];
      description?: string;
    }> = [];

    for (const [gitPath, info] of gitProjects) {
      if (existingPaths.has(gitPath)) continue;

      // Generate unique ID
      const baseId = info.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      let id = baseId;
      let counter = 1;
      while (state.config.projects.projects.some((p) => p.id === id)) {
        id = `${baseId}-${counter++}`;
      }

      const project = {
        id,
        name: info.name,
        paths: [gitPath],
        description: info.remoteUrl ? `Git: ${info.remoteUrl}` : undefined
      };

      state.config.projects.projects.push(project);
      newProjects.push(project);
    }

    // Persist if we added any
    if (newProjects.length > 0) {
      try {
        saveConfig(state.config);
      } catch (err) {
        console.error("Failed to persist inferred projects:", err);
      }
    }

    return c.json({
      success: true,
      scanned_cwds: cwds.size,
      git_repos_found: gitProjects.size,
      new_projects: newProjects.length,
      projects: newProjects
    });
  });

  // ==========================================================================
  // Agent Metadata (Naming/Annotations) Endpoints
  // ==========================================================================

  app.get("/api/agent-metadata", (c) => {
    const { getAllAgentMetadata } =
      require("./agent-metadata") as typeof import("./agent-metadata");
    return c.json(getAllAgentMetadata());
  });

  app.get("/api/agent-metadata/:agentId", (c) => {
    const agentId = c.req.param("agentId");
    const { getAgentMetadataById } =
      require("./agent-metadata") as typeof import("./agent-metadata");

    const metadata = getAgentMetadataById(agentId);
    if (!metadata) {
      return c.json({ error: "Agent metadata not found" }, 404);
    }
    return c.json(metadata);
  });

  app.post("/api/agent-metadata", async (c) => {
    const body = (await c.req.json()) as {
      label: string;
      exe: string;
      customName?: string | null;
      aliases?: string[] | null;
      notes?: string | null;
      tags?: string[] | null;
      color?: string | null;
    };

    if (!body.label || !body.exe) {
      return c.json({ error: "label and exe are required" }, 400);
    }

    const { setAgentMetadata } = require("./agent-metadata") as typeof import(
      "./agent-metadata"
    );

    const metadata = setAgentMetadata(body.label, body.exe, {
      customName: body.customName,
      aliases: body.aliases,
      notes: body.notes,
      tags: body.tags,
      color: body.color
    });
    return c.json(metadata);
  });

  app.patch("/api/agent-metadata/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    const body = (await c.req.json()) as {
      customName?: string | null;
      aliases?: string[] | null;
      notes?: string | null;
      tags?: string[] | null;
      color?: string | null;
    };

    const { setAgentMetadataById } =
      require("./agent-metadata") as typeof import("./agent-metadata");

    const metadata = setAgentMetadataById(agentId, {
      customName: body.customName,
      aliases: body.aliases,
      notes: body.notes,
      tags: body.tags,
      color: body.color
    });
    return c.json(metadata);
  });

  app.delete("/api/agent-metadata/:agentId", (c) => {
    const agentId = c.req.param("agentId");
    const { deleteAgentMetadata } =
      require("./agent-metadata") as typeof import("./agent-metadata");

    const deleted = deleteAgentMetadata(agentId);
    if (!deleted) {
      return c.json({ error: "Agent metadata not found" }, 404);
    }
    return c.json({ success: true });
  });

  app.get("/api/agent-metadata/search", (c) => {
    const query = c.req.query("q") ?? "";
    const { searchAgentMetadata } =
      require("./agent-metadata") as typeof import("./agent-metadata");

    const results = searchAgentMetadata(query);
    return c.json(results);
  });

  app.get("/api/agent-metadata/:agentId/history", (c) => {
    const agentId = c.req.param("agentId");
    const { getAgentRenameHistory } =
      require("./agent-metadata") as typeof import("./agent-metadata");

    const history = getAgentRenameHistory(agentId);
    return c.json(history);
  });

  // Convenience endpoint to set metadata for an agent by PID
  app.post("/api/agents/:pid/metadata", async (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agent = state.store.getAgent(pid);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const body = (await c.req.json()) as {
      customName?: string | null;
      aliases?: string[] | null;
      notes?: string | null;
      tags?: string[] | null;
      color?: string | null;
    };

    const { setAgentMetadata } = require("./agent-metadata") as typeof import(
      "./agent-metadata"
    );

    const metadata = setAgentMetadata(agent.label, agent.exe, {
      customName: body.customName,
      aliases: body.aliases,
      notes: body.notes,
      tags: body.tags,
      color: body.color
    });
    return c.json(metadata);
  });

  app.get("/api/agents/:pid/metadata", (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agent = state.store.getAgent(pid);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const { getAgentMetadata } = require("./agent-metadata") as typeof import(
      "./agent-metadata"
    );

    const metadata = getAgentMetadata(agent.label, agent.exe);
    return c.json(metadata || { agentId: null });
  });

  // ==========================================================================
  // Conversation Metadata (Naming) Endpoints
  // ==========================================================================

  app.get("/api/conversation-metadata", (c) => {
    const { getAllConversationMetadata } =
      require("./conversation-metadata") as typeof import(
        "./conversation-metadata"
      );
    return c.json(getAllConversationMetadata());
  });

  app.get("/api/conversation-metadata/:conversationId", (c) => {
    const conversationId = c.req.param("conversationId");
    const { getConversationMetadata } =
      require("./conversation-metadata") as typeof import(
        "./conversation-metadata"
      );

    const metadata = getConversationMetadata(conversationId);
    if (!metadata) {
      return c.json({ error: "Metadata not found" }, 404);
    }
    return c.json(metadata);
  });

  app.patch("/api/conversation-metadata/:conversationId", async (c) => {
    const conversationId = c.req.param("conversationId");
    const body = (await c.req.json()) as {
      customName?: string | null;
    };

    const { setConversationMetadata } =
      require("./conversation-metadata") as typeof import(
        "./conversation-metadata"
      );

    const metadata = setConversationMetadata(conversationId, {
      customName: body.customName
    });
    return c.json(metadata);
  });

  app.delete("/api/conversation-metadata/:conversationId", (c) => {
    const conversationId = c.req.param("conversationId");
    const { deleteConversationMetadata } =
      require("./conversation-metadata") as typeof import(
        "./conversation-metadata"
      );

    const deleted = deleteConversationMetadata(conversationId);
    if (!deleted) {
      return c.json({ error: "Metadata not found" }, 404);
    }
    return c.json({ success: true });
  });

  // Export Reports Endpoints
  app.get("/api/export/sessions", (c) => {
    const format = c.req.query("format") ?? "json";
    const days = Number.parseInt(c.req.query("days") ?? "7", 10);

    const sessions = state.hookStore.getAllSessions(1000);
    const cutoff = Date.now() - days * 86400 * 1000;
    const filtered = sessions.filter((s) => s.startTime > cutoff);

    if (format === "csv") {
      const lines = [
        "session_id,cwd,start_time,end_time,tool_count,commit_count,duration_minutes"
      ];
      for (const s of filtered) {
        const duration = ((s.endTime ?? Date.now()) - s.startTime) / 60000;
        lines.push(
          `${s.sessionId},${s.cwd},${s.startTime},${s.endTime ?? ""},${s.toolCount},${s.commits.length},${duration.toFixed(1)}`
        );
      }
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=sessions_${days}d.csv`
        }
      });
    }

    return c.json({
      exported_at: Date.now() / 1000,
      days,
      count: filtered.length,
      sessions: filtered.map(hookSessionToDict)
    });
  });

  app.get("/api/export/activity", (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "7", 10);

    const sessions = state.hookStore.getAllSessions(1000);
    const cutoff = Date.now() - days * 86400 * 1000;
    const filtered = sessions.filter((s) => s.startTime > cutoff);

    const toolStats = state.hookStore.getToolStats();
    const dailyStats = state.hookStore.getDailyStats(days);
    const commits = state.hookStore.getAllCommits(1000);
    const filteredCommits = commits.filter((c) => c.timestamp > cutoff);

    const totalToolCalls = filtered.reduce((sum, s) => sum + s.toolCount, 0);
    const totalDurationHours =
      filtered.reduce(
        (sum, s) => sum + ((s.endTime ?? Date.now()) - s.startTime),
        0
      ) / 3600000;

    return c.json({
      report_generated_at: Date.now() / 1000,
      period_days: days,
      summary: {
        total_sessions: filtered.length,
        total_tool_calls: totalToolCalls,
        total_commits: filteredCommits.length,
        total_duration_hours: Math.round(totalDurationHours * 10) / 10,
        avg_tools_per_session:
          filtered.length > 0
            ? Math.round((totalToolCalls / filtered.length) * 10) / 10
            : 0
      },
      tool_breakdown: Object.fromEntries(
        toolStats.map((s) => [
          s.toolName,
          {
            calls: s.totalCalls,
            success_rate:
              s.totalCalls > 0
                ? Math.round((s.successCount / s.totalCalls) * 1000) / 10
                : 0,
            avg_duration_ms: Math.round(s.avgDurationMs * 10) / 10
          }
        ])
      ),
      daily_activity: dailyStats.map(dailyStatsToDict)
    });
  });

  // ==========================================================================
  // Transcript Sanitization Endpoints
  // ==========================================================================

  app.get("/api/contrib/patterns", (c) => {
    // Return available sanitization patterns
    return c.json({
      patterns: Object.entries(DEFAULT_PATTERNS).map(([key, pattern]) => ({
        name: key,
        category: pattern.category,
        placeholder: pattern.placeholder,
        patternCount: pattern.regex.length
      }))
    });
  });

  // ==========================================================================
  // Pattern Management Endpoints
  // ==========================================================================

  // Get all patterns with full details
  app.get("/api/contrib/patterns/all", (c) => {
    const patterns = getPatternDefinitions();
    return c.json({
      version: "1.0.0",
      patterns,
      count: patterns.length
    });
  });

  // Get sample text for pattern testing
  app.get("/api/contrib/patterns/sample", (c) => {
    return c.json({
      sample_text: generateSampleText()
    });
  });

  // Test patterns against sample text
  app.post("/api/contrib/patterns/test", async (c) => {
    const body = (await c.req.json()) as {
      sample_text: string;
      pattern_names?: string[];
    };

    const allPatterns = getPatternDefinitions();
    const patternsToTest = body.pattern_names
      ? allPatterns.filter((p) => body.pattern_names!.includes(p.name))
      : allPatterns;

    const results = testAllPatterns(patternsToTest, body.sample_text);

    return c.json({
      results: results.map((r) => ({
        pattern_name: r.patternName,
        match_count: r.matchCount,
        matches: r.matches
      })),
      total_matches: results.reduce((sum, r) => sum + r.matchCount, 0),
      patterns_with_matches: results.filter((r) => r.matchCount > 0).length
    });
  });

  // Validate a pattern definition
  app.post("/api/contrib/patterns/validate", async (c) => {
    const body = (await c.req.json()) as PatternDefinition;

    const result = validatePattern(body);

    return c.json({
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings
    });
  });

  app.post("/api/contrib/sanitize", async (c) => {
    const body = (await c.req.json()) as {
      content: string | Record<string, unknown>;
      options?: {
        redactSecrets?: boolean;
        redactPii?: boolean;
        redactPaths?: boolean;
        maskCodeBlocks?: boolean;
        customRegex?: string[];
      };
    };

    const sanitizer = createSanitizer({
      redactSecrets: body.options?.redactSecrets ?? true,
      redactPii: body.options?.redactPii ?? true,
      redactPaths: body.options?.redactPaths ?? true,
      maskCodeBlocks: body.options?.maskCodeBlocks ?? false,
      customRegex: body.options?.customRegex
    });

    const contentStr =
      typeof body.content === "string"
        ? body.content
        : JSON.stringify(body.content);
    const originalLength = contentStr.length;

    let result: unknown;
    if (typeof body.content === "string") {
      result = sanitizer.redactText(body.content);
    } else {
      result = sanitizer.redactObject(body.content);
    }

    const report = sanitizer.getReport();
    const sanitizedStr =
      typeof result === "string" ? result : JSON.stringify(result);

    return c.json({
      sanitized: result,
      original_length: originalLength,
      sanitized_length: sanitizedStr.length,
      redaction_count: report.totalRedactions,
      categories: report.countsByCategory
    });
  });

  app.post("/api/contrib/check", async (c) => {
    // Residue check - verify sanitization completeness
    const body = (await c.req.json()) as { content: string | string[] };

    const strings = Array.isArray(body.content) ? body.content : [body.content];
    const result = residueCheck(strings);

    // Convert warnings to issues format expected by frontend
    const issues = result.warnings.map((warning) => {
      // Determine type from warning message
      let type = "unknown";
      if (warning.toLowerCase().includes("private key")) {
        type = "private_key";
      } else if (warning.toLowerCase().includes("token")) {
        type = "token";
      } else if (warning.toLowerCase().includes("email")) {
        type = "email";
      }
      return {
        type,
        description: warning,
        locations: [] // Location tracking not implemented in residueCheck
      };
    });

    return c.json({
      clean: !result.blocked && result.warnings.length === 0,
      issues
    });
  });

  // ==========================================================================
  // Unified Preparation Pipeline
  // ==========================================================================

  app.get("/api/contrib/fields", (c) => {
    // Return field schemas for field selection UI
    const source = c.req.query("source") || "all";
    const schemas = getFieldSchemasByCategory(source);
    const defaultSelected = getDefaultFieldSelection(source);

    return c.json({
      schemas: {
        essential: schemas.essential.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        })),
        recommended: schemas.recommended.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        })),
        optional: schemas.optional.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        })),
        strip: schemas.strip.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        })),
        always_strip: schemas.always_strip.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        }))
      },
      default_selected: defaultSelected
    });
  });

  app.post("/api/contrib/prepare", async (c) => {
    // Unified preparation pipeline using core processing
    const body = (await c.req.json()) as {
      correlation_ids?: string[]; // Preferred: correlation IDs (merged hook+transcript)
      session_ids?: string[]; // Legacy: Hook session IDs
      local_ids?: string[]; // Legacy: Local transcript IDs
      redaction: {
        redactSecrets?: boolean;
        redactPii?: boolean;
        redactPaths?: boolean;
        maskCodeBlocks?: boolean;
        customRegex?: string[];
        enableHighEntropy?: boolean;
      };
      selected_fields?: string[];
      contributor: {
        contributor_id?: string;
        license?: string;
        ai_preference?: string;
        rights_statement?: string;
        rights_confirmed?: boolean;
        reviewed_confirmed?: boolean;
      };
    };

    const rawSessions: RawSession[] = [];

    // If correlation_ids provided, use correlation-based processing
    // This properly merges matched hook+transcript into single sessions
    if (body.correlation_ids?.length) {
      // Get all data needed for correlation
      const hookSessions = state.hookStore.getAllSessions();
      const transcripts = await discoverLocalTranscripts();
      const toolUsagesMap = new Map<string, ToolUsage[]>();
      for (const session of hookSessions) {
        const usages = state.hookStore.getSessionToolUsages(session.sessionId);
        toolUsagesMap.set(session.sessionId, usages);
      }

      // Correlate to get merged conversations
      const correlated = correlateSessionsWithTranscripts(
        hookSessions,
        transcripts,
        toolUsagesMap
      );

      // Build lookup map by correlation ID
      const correlationMap = new Map(
        correlated.map((c) => [c.correlationId, c])
      );

      // Process each requested correlation
      for (const correlationId of body.correlation_ids) {
        const conv = correlationMap.get(correlationId);
        if (!conv) continue;

        // Build merged data object
        const data: Record<string, unknown> = {};
        let source = "unknown";
        let sessionId = correlationId;
        let mtimeUtc = new Date().toISOString();
        let sourcePathHint: string | undefined;

        // Add hook data if present
        if (conv.hookSession) {
          data.session = hookSessionToDict(conv.hookSession);
          data.tool_usages = (conv.toolUsages ?? []).map((u) =>
            toolUsageToDict(u)
          );
          source = "claude";
          sessionId = conv.hookSession.sessionId;
          mtimeUtc = new Date(conv.hookSession.startTime).toISOString();
          sourcePathHint = conv.hookSession.transcriptPath;
        }

        // Add transcript data if present
        if (conv.transcript) {
          const parsed = await readTranscript(conv.transcript.id);
          if (parsed) {
            data.messages = parsed.messages;
            data.total_input_tokens = parsed.totalInputTokens;
            data.total_output_tokens = parsed.totalOutputTokens;
            data.estimated_cost_usd = parsed.estimatedCostUsd;
            // Only override source if no hook session
            if (!conv.hookSession) {
              source = parsed.agent;
              sessionId = conv.transcript.id;
              mtimeUtc = new Date(
                conv.transcript.modifiedAt ?? Date.now()
              ).toISOString();
              sourcePathHint = parsed.path;
            }
          }
        }

        rawSessions.push({
          sessionId,
          source,
          data,
          mtimeUtc,
          sourcePathHint
        });
      }
    } else {
      // Legacy path: separate hook and transcript processing
      // Build raw sessions from hook store
      for (const sessionId of body.session_ids ?? []) {
        const session = state.hookStore.getSession(sessionId);
        if (!session) continue;

        const toolUsages = state.hookStore.getSessionToolUsages(sessionId);

        // Combine session and tool usages into data
        const data = {
          session: hookSessionToDict(session),
          tool_usages: toolUsages.map((u) => toolUsageToDict(u))
        };

        rawSessions.push({
          sessionId,
          source: "claude", // Hook sessions are from Claude Code
          data,
          mtimeUtc: new Date(session.startTime).toISOString(),
          sourcePathHint: session.transcriptPath
        });
      }

      // Build raw sessions from local transcripts
      // First get metadata for all local transcripts to access modifiedAt
      const localMeta = body.local_ids?.length
        ? await discoverLocalTranscripts()
        : [];

      for (const localId of body.local_ids ?? []) {
        const transcript = await readTranscript(localId);
        if (!transcript) continue;

        // Find metadata to get modifiedAt
        const meta = localMeta.find((m) => m.id === localId);

        // Convert parsed transcript to RawSession format
        const data = {
          messages: transcript.messages,
          total_input_tokens: transcript.totalInputTokens,
          total_output_tokens: transcript.totalOutputTokens,
          estimated_cost_usd: transcript.estimatedCostUsd
        };

        rawSessions.push({
          sessionId: localId,
          source: transcript.agent,
          data,
          mtimeUtc: meta?.modifiedAt
            ? new Date(meta.modifiedAt).toISOString()
            : new Date().toISOString(),
          sourcePathHint: transcript.path
        });
      }
    }

    if (rawSessions.length === 0) {
      return c.json({ error: "No valid sessions found" }, 400);
    }

    // Prepare using unified pipeline
    const config: PreparationConfig = {
      redaction: {
        redactSecrets: body.redaction.redactSecrets ?? true,
        redactPii: body.redaction.redactPii ?? true,
        redactPaths: body.redaction.redactPaths ?? true,
        maskCodeBlocks: body.redaction.maskCodeBlocks ?? false,
        customRegex: body.redaction.customRegex ?? [],
        enableHighEntropy: body.redaction.enableHighEntropy ?? true
      },
      selectedFields: body.selected_fields,
      contributor: {
        contributorId: body.contributor.contributor_id ?? "anonymous",
        license: body.contributor.license ?? "CC-BY-4.0",
        aiPreference: body.contributor.ai_preference ?? "train-genai=deny",
        rightsStatement:
          body.contributor.rights_statement ??
          "I have the right to share this data.",
        rightsConfirmed: body.contributor.rights_confirmed ?? false,
        reviewedConfirmed: body.contributor.reviewed_confirmed ?? false
      },
      appVersion: "0.1.0"
    };

    const result = await prepareSessions(rawSessions, config);

    return c.json({
      sessions: result.sessions.map((s) => ({
        session_id: s.sessionId,
        source: s.source,
        preview_original: s.previewOriginal,
        preview_redacted: s.previewRedacted,
        score: s.score,
        approx_chars: s.approxChars,
        raw_sha256: s.rawSha256,
        raw_json_original: JSON.stringify(s.rawData, null, 2),
        raw_json: JSON.stringify(s.sanitizedData, null, 2)
      })),
      redaction_report: {
        total_redactions: result.redactionReport.totalRedactions,
        counts_by_category: result.redactionReport.countsByCategory,
        enabled_categories: result.redactionReport.enabledCategories,
        residue_warnings: result.residueWarnings,
        blocked: result.blocked
      },
      stripped_fields: result.strippedFields,
      fields_present: result.fieldsPresent,
      fields_by_source: result.fieldsBySource,
      redaction_info_map: result.redactionInfoMap,
      stats: result.stats
    });
  });

  app.get("/api/contrib/transcripts", (c) => {
    // List available hook sessions for export
    const sessions = state.hookStore.getAllSessions(100);

    return c.json({
      transcripts: sessions.map((s) => {
        // Compute estimated size from tool usages
        const usages = state.hookStore.getSessionToolUsages(s.sessionId);
        const estimatedSizeBytes = usages.reduce((sum, u) => {
          // Estimate size from tool input and response
          const inputSize = JSON.stringify(u.toolInput || {}).length;
          const responseSize = JSON.stringify(u.toolResponse || {}).length;
          return sum + inputSize + responseSize + 200; // Base overhead per tool
        }, 0);

        return {
          session_id: s.sessionId,
          transcript_path: s.transcriptPath,
          cwd: s.cwd,
          start_time: s.startTime,
          end_time: s.endTime,
          tool_count: s.toolCount,
          active: s.endTime === undefined,
          duration_minutes: s.endTime
            ? Math.round((s.endTime - s.startTime) / 60)
            : null,
          estimated_size_bytes: estimatedSizeBytes
        };
      })
    });
  });

  // ==========================================================================
  // Local Log Discovery Endpoints
  // ==========================================================================

  app.get("/api/contrib/local-logs", async (c) => {
    // Discover local transcripts from all supported agents
    const agents = c.req.query("agents")?.split(",");
    const transcripts = await discoverLocalTranscripts(agents);

    return c.json({
      transcripts: transcripts.map((t) => ({
        id: t.id,
        agent: t.agent,
        path: t.path,
        name: t.name,
        project_dir: t.projectDir,
        modified_at: t.modifiedAt,
        size_bytes: t.sizeBytes,
        message_count: t.messageCount,
        start_time: t.startTime,
        end_time: t.endTime
      })),
      agents_scanned: agents || ["claude", "codex", "opencode", "gemini"]
    });
  });

  app.get("/api/contrib/local-logs/:transcriptId", async (c) => {
    // Read a specific local transcript
    const transcriptId = decodeURIComponent(c.req.param("transcriptId"));
    const format = c.req.query("format") || "full";

    const transcript = await readTranscript(transcriptId);
    if (!transcript) {
      return c.json({ error: "Transcript not found" }, 404);
    }

    if (format === "chat") {
      // Return formatted chat messages for display
      const messages = formatTranscriptForDisplay(transcript);
      return c.json({
        id: transcript.id,
        agent: transcript.agent,
        name: transcript.name,
        path: transcript.path,
        project_dir: transcript.projectDir,
        messages,
        total_input_tokens: transcript.totalInputTokens,
        total_output_tokens: transcript.totalOutputTokens,
        estimated_cost_usd: transcript.estimatedCostUsd
      });
    }

    // Return full transcript data
    return c.json({
      id: transcript.id,
      agent: transcript.agent,
      name: transcript.name,
      path: transcript.path,
      project_dir: transcript.projectDir,
      messages: transcript.messages,
      total_input_tokens: transcript.totalInputTokens,
      total_output_tokens: transcript.totalOutputTokens,
      estimated_cost_usd: transcript.estimatedCostUsd
    });
  });

  app.post("/api/contrib/local-logs/read", async (c) => {
    // Read a transcript by file path (for direct file access)
    const body = (await c.req.json()) as { path: string; agent?: string };
    const agent = body.agent || "claude";

    const transcript = await readTranscriptByPath(agent, body.path);
    if (!transcript) {
      return c.json({ error: "Failed to read transcript" }, 400);
    }

    const messages = formatTranscriptForDisplay(transcript);
    return c.json({
      id: transcript.id,
      agent: transcript.agent,
      name: transcript.name,
      project_dir: transcript.projectDir,
      messages,
      total_input_tokens: transcript.totalInputTokens,
      total_output_tokens: transcript.totalOutputTokens,
      estimated_cost_usd: transcript.estimatedCostUsd
    });
  });

  // ==========================================================================
  // Correlation Endpoints
  // ==========================================================================

  app.get("/api/contrib/correlated", async (c) => {
    // Get correlated view of hook sessions + local transcripts + optional process snapshots
    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const agents = c.req.query("agents")?.split(",");
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);

    // Calculate time cutoff
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get hook sessions and filter by time
    const allHookSessions = state.hookStore.getAllSessions(limit * 2); // Get more to account for filtering
    const hookSessions = allHookSessions.filter((s) => s.startTime >= cutoffMs);

    // Get local transcripts and filter by time
    const allTranscripts = await discoverLocalTranscripts(agents);
    const transcripts = allTranscripts.filter((t) => t.modifiedAt >= cutoffMs);

    // Build tool usages map
    const toolUsagesMap = new Map<string, ToolUsage[]>();
    for (const session of hookSessions) {
      const usages = state.hookStore.getSessionToolUsages(session.sessionId);
      toolUsagesMap.set(session.sessionId, usages);
    }

    // Correlate
    let correlated = correlateSessionsWithTranscripts(
      hookSessions,
      transcripts,
      toolUsagesMap
    );

    // Optionally attach process snapshots if enabled in config
    if (
      state.config.conversations?.includeProcessSnapshots &&
      state.processLogger
    ) {
      // Get date range for process snapshots
      const startDate = new Date(cutoffMs).toISOString().slice(0, 10);
      const endDate = new Date().toISOString().slice(0, 10);
      const processSnapshots = state.processLogger.readSnapshotsInRange(
        startDate,
        endDate
      );
      correlated = attachProcessSnapshots(correlated, processSnapshots);
    }

    // Attach managed sessions (from `aw run`)
    const allManagedSessions = state.sessionStore.listSessions({ limit: 500 });
    const managedSessions = allManagedSessions.filter(
      (ms) => ms.startedAt >= cutoffMs
    );
    if (managedSessions.length > 0) {
      correlated = attachManagedSessions(correlated, managedSessions);
    }

    // Attach projects based on cwd matching
    const projects = state.config.projects?.projects ?? [];
    if (projects.length > 0) {
      correlated = attachProjects(correlated, projects);
    }

    // Get stats
    const stats = getCorrelationStats(correlated);

    return c.json({
      sessions: correlated.map((s) => ({
        correlation_id: s.correlationId,
        match_type: s.matchType,
        match_details: {
          path_match: s.matchDetails.pathMatch,
          time_match: s.matchDetails.timeMatch,
          cwd_match: s.matchDetails.cwdMatch,
          tool_count_match: s.matchDetails.toolCountMatch,
          score: s.matchDetails.score
        },
        start_time: s.startTime,
        cwd: s.cwd,
        agent: s.agent,
        hook_session: s.hookSession ? hookSessionToDict(s.hookSession) : null,
        transcript: s.transcript
          ? {
              id: s.transcript.id,
              agent: s.transcript.agent,
              path: s.transcript.path,
              name: s.transcript.name,
              project_dir: s.transcript.projectDir,
              modified_at: s.transcript.modifiedAt,
              size_bytes: s.transcript.sizeBytes,
              message_count: s.transcript.messageCount,
              start_time: s.transcript.startTime,
              end_time: s.transcript.endTime
            }
          : null,
        process_snapshots:
          s.processSnapshots?.map((ps) => ({
            timestamp: ps.timestamp,
            pid: ps.pid,
            label: ps.label,
            cpu_pct: ps.cpuPct,
            rss_kb: ps.rssKb,
            threads: ps.threads,
            state: ps.state
          })) ?? null,
        managed_session: s.managedSession
          ? {
              id: s.managedSession.id,
              prompt: s.managedSession.prompt,
              agent: s.managedSession.agent,
              pid: s.managedSession.pid ?? null,
              cwd: s.managedSession.cwd,
              started_at: s.managedSession.startedAt,
              ended_at: s.managedSession.endedAt ?? null,
              exit_code: s.managedSession.exitCode ?? null,
              status: s.managedSession.status,
              duration_ms: s.managedSession.endedAt
                ? s.managedSession.endedAt - s.managedSession.startedAt
                : Date.now() - s.managedSession.startedAt
            }
          : null,
        project: s.project ?? null,
        tool_count: s.toolUsages?.length ?? 0,
        snapshot_count: s.processSnapshots?.length ?? 0
      })),
      stats: {
        total: stats.total,
        exact: stats.exact,
        confident: stats.confident,
        uncertain: stats.uncertain,
        unmatched: stats.unmatched,
        hook_only: stats.hookOnly,
        transcript_only: stats.transcriptOnly,
        managed_only: stats.managedOnly,
        with_managed_session: stats.withManagedSession
      }
    });
  });

  /**
   * GET /api/analytics/by-project - Analytics breakdown by project
   *
   * Returns session count, cost, and success metrics grouped by configured project.
   */
  app.get("/api/analytics/by-project", async (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);
    const projects = state.config.projects?.projects ?? [];

    if (projects.length === 0) {
      return c.json({
        days,
        breakdown: [],
        unassigned: {
          session_count: 0,
          total_cost_usd: 0,
          success_count: 0,
          failure_count: 0
        }
      });
    }

    // Calculate time cutoff
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get hook sessions and filter by time
    const allHookSessions = state.hookStore.getAllSessions(1000);
    const hookSessions = allHookSessions.filter((s) => s.startTime >= cutoffMs);

    // Get local transcripts and filter by time
    const allTranscripts = await discoverLocalTranscripts();
    const transcripts = allTranscripts.filter((t) => t.modifiedAt >= cutoffMs);

    // Build tool usages map
    const toolUsagesMap = new Map<string, ToolUsage[]>();
    for (const session of hookSessions) {
      const usages = state.hookStore.getSessionToolUsages(session.sessionId);
      toolUsagesMap.set(session.sessionId, usages);
    }

    // Correlate and attach projects
    let correlated = correlateSessionsWithTranscripts(
      hookSessions,
      transcripts,
      toolUsagesMap
    );
    correlated = attachProjects(correlated, projects);

    // Get enrichments for quality scores
    const { getAllEnrichments } = await import("./enrichment-store");
    const allEnrichments = getAllEnrichments();

    // Aggregate by project
    const projectStats = new Map<
      string,
      {
        project_id: string;
        project_name: string;
        session_count: number;
        total_cost_usd: number;
        total_input_tokens: number;
        total_output_tokens: number;
        success_count: number;
        failure_count: number;
      }
    >();

    // Initialize stats for all projects
    for (const project of projects) {
      projectStats.set(project.id, {
        project_id: project.id,
        project_name: project.name,
        session_count: 0,
        total_cost_usd: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        success_count: 0,
        failure_count: 0
      });
    }

    // Track unassigned
    const unassigned = {
      session_count: 0,
      total_cost_usd: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      success_count: 0,
      failure_count: 0
    };

    for (const conv of correlated) {
      let cost = conv.hookSession?.estimatedCostUsd ?? 0;
      let inputTokens = conv.hookSession?.totalInputTokens ?? 0;
      let outputTokens = conv.hookSession?.totalOutputTokens ?? 0;

      if (!conv.hookSession && conv.transcript) {
        const parsed = await readTranscriptByPath(
          conv.transcript.agent,
          conv.transcript.path
        );
        if (parsed) {
          cost = parsed.estimatedCostUsd ?? 0;
          inputTokens = parsed.totalInputTokens ?? 0;
          outputTokens = parsed.totalOutputTokens ?? 0;
        }
      }

      // Check enrichment for quality
      let isSuccess = false;
      let isFailure = false;
      if (conv.hookSession) {
        const enrichment = allEnrichments[`hook:${conv.hookSession.sessionId}`];
        if (enrichment?.qualityScore) {
          if (enrichment.qualityScore.overall >= 60) isSuccess = true;
          else if (enrichment.qualityScore.overall < 40) isFailure = true;
        }
      } else if (conv.transcript) {
        const enrichment = allEnrichments[`transcript:${conv.transcript.id}`];
        if (enrichment?.qualityScore) {
          if (enrichment.qualityScore.overall >= 60) isSuccess = true;
          else if (enrichment.qualityScore.overall < 40) isFailure = true;
        }
      }

      if (conv.project) {
        const stats = projectStats.get(conv.project.id);
        if (stats) {
          stats.session_count++;
          stats.total_cost_usd += cost;
          stats.total_input_tokens += inputTokens;
          stats.total_output_tokens += outputTokens;
          if (isSuccess) stats.success_count++;
          if (isFailure) stats.failure_count++;
        }
      } else {
        unassigned.session_count++;
        unassigned.total_cost_usd += cost;
        unassigned.total_input_tokens += inputTokens;
        unassigned.total_output_tokens += outputTokens;
        if (isSuccess) unassigned.success_count++;
        if (isFailure) unassigned.failure_count++;
      }
    }

    // Convert to array and round costs
    const breakdown = Array.from(projectStats.values())
      .map((s) => ({
        ...s,
        total_cost_usd: Math.round(s.total_cost_usd * 100) / 100
      }))
      .sort((a, b) => b.session_count - a.session_count);

    return c.json({
      days,
      breakdown,
      unassigned: {
        ...unassigned,
        total_cost_usd: Math.round(unassigned.total_cost_usd * 100) / 100
      }
    });
  });

  /**
   * GET /api/quality-config - Get quality scoring configuration
   *
   * Returns the current quality scoring weights for transparency.
   * This helps users understand how quality scores are calculated.
   */
  app.get("/api/quality-config", async (c) => {
    const { DIMENSION_WEIGHTS, SIGNAL_WEIGHTS } = await import(
      "./enrichments/quality-score"
    );

    return c.json({
      dimension_weights: {
        completion: DIMENSION_WEIGHTS.completion,
        code_quality: DIMENSION_WEIGHTS.codeQuality,
        efficiency: DIMENSION_WEIGHTS.efficiency,
        safety: DIMENSION_WEIGHTS.safety
      },
      signal_weights: {
        no_failures: SIGNAL_WEIGHTS.noFailures,
        has_commits: SIGNAL_WEIGHTS.hasCommits,
        normal_end: SIGNAL_WEIGHTS.normalEnd,
        reasonable_tool_count: SIGNAL_WEIGHTS.reasonableToolCount,
        healthy_pacing: SIGNAL_WEIGHTS.healthyPacing
      },
      dimension_descriptions: {
        completion:
          "Task completion based on commits, test results, and build status",
        code_quality: "Code quality based on lint results and test coverage",
        efficiency:
          "Session efficiency based on tool usage patterns and pacing",
        safety: "Safety based on absence of dangerous operations"
      },
      signal_descriptions: {
        no_failures: "Tool failure rate below 20%",
        has_commits: "At least one commit was made",
        normal_end: "Session ended within 1 minute of last activity",
        reasonable_tool_count: "Between 3 and 500 tool calls",
        healthy_pacing: "Tool usage rate between 0.5 and 20 per minute"
      }
    });
  });

  // ==========================================================================
  // Process Snapshots Endpoints (lightweight sessions data)
  // ==========================================================================

  app.get("/api/contrib/process-logs/summary", (c) => {
    // Get summary stats about available process logs
    if (!state.processLogger) {
      return c.json({ error: "Process logger not available" }, 500);
    }

    const summary = state.processLogger.getSummaryStats();

    return c.json({
      snapshot_file_count: summary.snapshotFileCount,
      event_file_count: summary.eventFileCount,
      total_snapshots: summary.totalSnapshots,
      total_events: summary.totalEvents,
      total_size_bytes: summary.totalSizeBytes,
      earliest_date: summary.earliestDate,
      latest_date: summary.latestDate,
      log_dir: summary.logDir
    });
  });

  app.get("/api/contrib/process-logs/files", (c) => {
    // List available process log files
    if (!state.processLogger) {
      return c.json({ error: "Process logger not available" }, 500);
    }

    const snapshotFiles = state.processLogger.listSnapshotFiles();
    const eventFiles = state.processLogger.listEventFiles();

    return c.json({
      snapshot_files: snapshotFiles.map((f) => ({
        filename: f.filename,
        date: f.date,
        size_bytes: f.sizeBytes,
        modified_at: f.modifiedAt
      })),
      event_files: eventFiles.map((f) => ({
        filename: f.filename,
        date: f.date,
        size_bytes: f.sizeBytes,
        modified_at: f.modifiedAt
      }))
    });
  });

  app.get("/api/contrib/process-logs/snapshots/:date", (c) => {
    // Read snapshots for a specific date
    if (!state.processLogger) {
      return c.json({ error: "Process logger not available" }, 500);
    }

    const date = c.req.param("date");
    const snapshots = state.processLogger.readSnapshots(date);

    // Sanitize cmdline and paths if redaction is requested
    const redact = c.req.query("redact") === "true";

    const sanitizedSnapshots = redact
      ? snapshots.map((s) => sanitizeProcessSnapshot(s))
      : snapshots.map((s) => processSnapshotToDict(s));

    return c.json({
      date,
      count: sanitizedSnapshots.length,
      snapshots: sanitizedSnapshots
    });
  });

  app.get("/api/contrib/process-logs/events/:date", (c) => {
    // Read lifecycle events for a specific date
    if (!state.processLogger) {
      return c.json({ error: "Process logger not available" }, 500);
    }

    const date = c.req.param("date");
    const events = state.processLogger.readEvents(date);

    // Sanitize if requested
    const redact = c.req.query("redact") === "true";

    const sanitizedEvents = redact
      ? events.map((e) => sanitizeProcessEvent(e))
      : events.map((e) => processEventToDict(e));

    return c.json({
      date,
      count: sanitizedEvents.length,
      events: sanitizedEvents
    });
  });

  app.post("/api/contrib/process-logs/prepare", async (c) => {
    // Prepare process logs for contribution with redaction
    if (!state.processLogger) {
      return c.json({ error: "Process logger not available" }, 500);
    }

    const body = (await c.req.json()) as {
      start_date?: string;
      end_date?: string;
      include_snapshots?: boolean;
      include_events?: boolean;
      redact_paths?: boolean;
      redact_cmdline?: boolean;
    };

    // Default to last 7 days if no range specified
    const endDate = body.end_date ?? new Date().toISOString().slice(0, 10);
    const startDate =
      body.start_date ??
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().slice(0, 10);
      })();

    const includeSnapshots = body.include_snapshots !== false;
    const includeEvents = body.include_events !== false;
    const redactPaths = body.redact_paths !== false;
    const redactCmdline = body.redact_cmdline !== false;

    let snapshots: Record<string, unknown>[] = [];
    let events: Record<string, unknown>[] = [];

    if (includeSnapshots) {
      const rawSnapshots = state.processLogger.readSnapshotsInRange(
        startDate,
        endDate
      );
      snapshots = rawSnapshots.map((s) =>
        redactPaths || redactCmdline
          ? sanitizeProcessSnapshot(s, redactPaths, redactCmdline)
          : processSnapshotToDict(s)
      );
    }

    if (includeEvents) {
      const rawEvents = state.processLogger.readEventsInRange(
        startDate,
        endDate
      );
      events = rawEvents.map((e) =>
        redactPaths || redactCmdline
          ? sanitizeProcessEvent(e, redactPaths, redactCmdline)
          : processEventToDict(e)
      );
    }

    // Generate preview content
    const previewLines: string[] = [];
    if (snapshots.length > 0) {
      previewLines.push(
        `// ${snapshots.length} process snapshots from ${startDate} to ${endDate}`
      );
      previewLines.push(JSON.stringify(snapshots[0], null, 2));
      if (snapshots.length > 1) {
        previewLines.push(`// ... and ${snapshots.length - 1} more snapshots`);
      }
    }
    if (events.length > 0) {
      previewLines.push(
        `// ${events.length} lifecycle events from ${startDate} to ${endDate}`
      );
      previewLines.push(JSON.stringify(events[0], null, 2));
      if (events.length > 1) {
        previewLines.push(`// ... and ${events.length - 1} more events`);
      }
    }

    return c.json({
      start_date: startDate,
      end_date: endDate,
      snapshot_count: snapshots.length,
      event_count: events.length,
      preview: previewLines.join("\n"),
      snapshots,
      events
    });
  });

  app.post("/api/contrib/export", async (c) => {
    // Export sanitized transcript as JSONL
    const body = (await c.req.json()) as {
      session_id: string;
      options?: {
        redactSecrets?: boolean;
        redactPii?: boolean;
        redactPaths?: boolean;
        maskCodeBlocks?: boolean;
      };
    };

    const session = state.hookStore.getSession(body.session_id);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const toolUsages = state.hookStore.getSessionToolUsages(body.session_id);

    // Build original content for line counting
    const originalSession = hookSessionToDict(session);
    const originalUsages = toolUsages.map((u) => toolUsageToDict(u));
    const originalLines: string[] = [
      JSON.stringify({ type: "session", data: originalSession }),
      ...originalUsages.map((u) =>
        JSON.stringify({ type: "tool_usage", data: u })
      )
    ];

    // Create sanitizer with options
    const sanitizer = createSanitizer({
      redactSecrets: body.options?.redactSecrets ?? true,
      redactPii: body.options?.redactPii ?? true,
      redactPaths: body.options?.redactPaths ?? true,
      maskCodeBlocks: body.options?.maskCodeBlocks ?? false
    });

    // Sanitize session data
    const sanitizedSession = sanitizer.redactObject(originalSession);
    const sanitizedUsages = originalUsages.map((u) =>
      sanitizer.redactObject(u)
    );

    const report = sanitizer.getReport();

    // Build JSONL content
    const jsonlLines: string[] = [
      JSON.stringify({
        type: "session",
        session_id: body.session_id,
        data: sanitizedSession,
        exported_at: new Date().toISOString()
      }),
      ...sanitizedUsages.map((u, i) =>
        JSON.stringify({
          type: "tool_usage",
          session_id: body.session_id,
          sequence: i + 1,
          data: u
        })
      )
    ];

    const content = jsonlLines.join("\n");

    return c.json({
      session_id: body.session_id,
      original_lines: originalLines.length,
      sanitized_lines: jsonlLines.length,
      redaction_count: report.totalRedactions,
      categories: report.countsByCategory,
      content
    });
  });

  // ==========================================================================
  // Cost Estimation Endpoints
  // ==========================================================================

  // NOTE: aggregate must come before :sessionId to prevent "aggregate" matching as a session ID
  app.get("/api/contrib/cost/aggregate", (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "7", 10);
    const sessions = state.hookStore.getAllSessions(1000);
    const cutoff = Date.now() - days * 86400 * 1000;

    const filtered = sessions.filter((s) => {
      const ts = s.startTime > 1e12 ? s.startTime : s.startTime * 1000;
      return ts > cutoff;
    });

    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;
    const modelTotals: Record<
      string,
      { cost: number; input: number; output: number }
    > = {};
    const dailyCosts: Record<string, number> = {};

    for (const session of filtered) {
      if (!session.transcriptPath || !existsSync(session.transcriptPath))
        continue;

      const cost = parseTranscriptFile(session.transcriptPath);
      if (!cost) continue;

      totalCost += cost.estimatedCostUsd;
      totalInput += cost.totalInputTokens;
      totalOutput += cost.totalOutputTokens;

      // Track by model
      for (const [model, data] of Object.entries(cost.modelBreakdown)) {
        if (!modelTotals[model]) {
          modelTotals[model] = { cost: 0, input: 0, output: 0 };
        }
        modelTotals[model].cost += data.estimatedCostUsd;
        modelTotals[model].input += data.tokens.inputTokens;
        modelTotals[model].output += data.tokens.outputTokens;
      }

      // Track by day
      const date = new Date(
        session.startTime > 1e12 ? session.startTime : session.startTime * 1000
      )
        .toISOString()
        .slice(0, 10);
      dailyCosts[date] = (dailyCosts[date] || 0) + cost.estimatedCostUsd;
    }

    return c.json({
      period_days: days,
      total_cost_usd: Math.round(totalCost * 100) / 100,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      session_count: filtered.length,
      model_breakdown: modelTotals,
      daily_costs: dailyCosts
    });
  });

  app.get("/api/contrib/cost/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    const session = state.hookStore.getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (!session.transcriptPath || !existsSync(session.transcriptPath)) {
      return c.json({ error: "Transcript file not found" }, 404);
    }

    const cost = parseTranscriptFile(session.transcriptPath);
    if (!cost) {
      return c.json({ error: "Failed to parse transcript" }, 500);
    }

    return c.json({
      session_id: sessionId,
      total_input_tokens: cost.totalInputTokens,
      total_output_tokens: cost.totalOutputTokens,
      total_cache_creation_tokens: cost.totalCacheCreationTokens,
      total_cache_read_tokens: cost.totalCacheReadTokens,
      estimated_cost_usd: cost.estimatedCostUsd,
      message_count: cost.messageCount,
      model_breakdown: Object.fromEntries(
        Object.entries(cost.modelBreakdown).map(([model, data]) => [
          model,
          {
            input_tokens: data.tokens.inputTokens,
            output_tokens: data.tokens.outputTokens,
            estimated_cost_usd: data.estimatedCostUsd,
            message_count: data.messageCount
          }
        ])
      )
    });
  });

  // ==========================================================================
  // Sharing Endpoints
  // ==========================================================================

  app.post("/api/share/gist", async (c) => {
    const body = (await c.req.json()) as {
      session_id: string;
      token: string;
      description?: string;
      public?: boolean;
    };

    const session = state.hookStore.getSession(body.session_id);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Get and sanitize export
    const toolUsages = state.hookStore.getSessionToolUsages(body.session_id);
    const sanitizer = createSanitizer({
      redactSecrets: true,
      redactPii: true,
      redactPaths: true
    });

    const sanitizedSession = sanitizer.redactObject(hookSessionToDict(session));
    const sanitizedUsages = toolUsages.map((u) =>
      sanitizer.redactObject(toolUsageToDict(u))
    );

    const content = JSON.stringify(
      {
        session: sanitizedSession,
        tool_usages: sanitizedUsages,
        exported_at: new Date().toISOString()
      },
      null,
      2
    );

    // Create gist via GitHub API
    try {
      const response = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${body.token}`,
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          description:
            body.description ||
            `Agentwatch session ${body.session_id.slice(0, 8)}`,
          public: body.public ?? false,
          files: {
            [`session-${body.session_id.slice(0, 8)}.json`]: {
              content
            }
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        return c.json(
          { error: `GitHub API error: ${error}` },
          response.status as 400
        );
      }

      const gist = (await response.json()) as { html_url: string; id: string };
      return c.json({
        success: true,
        url: gist.html_url,
        gist_id: gist.id
      });
    } catch (e) {
      return c.json({ error: `Failed to create gist: ${e}` }, 500);
    }
  });

  app.post("/api/contrib/export/bundle", async (c) => {
    const body = (await c.req.json()) as {
      correlation_ids?: string[]; // Preferred: correlation IDs (merged hook+transcript)
      session_ids?: string[]; // Legacy: Hook session IDs
      local_ids?: string[]; // Legacy: Local transcript IDs
      include_cost?: boolean;
      options?: {
        redactSecrets?: boolean;
        redactPii?: boolean;
        redactPaths?: boolean;
      };
    };

    const bundleId = crypto.randomUUID();
    const sessions: Array<Record<string, unknown>> = [];
    const allToolUsages: Array<Record<string, unknown>> = [];

    const sanitizer = createSanitizer({
      redactSecrets: body.options?.redactSecrets ?? true,
      redactPii: body.options?.redactPii ?? true,
      redactPaths: body.options?.redactPaths ?? true
    });

    // If correlation_ids provided, use correlation-based processing
    if (body.correlation_ids?.length) {
      // Get all data needed for correlation
      const hookSessions = state.hookStore.getAllSessions();
      const transcripts = await discoverLocalTranscripts();
      const toolUsagesMap = new Map<string, ToolUsage[]>();
      for (const session of hookSessions) {
        const usages = state.hookStore.getSessionToolUsages(session.sessionId);
        toolUsagesMap.set(session.sessionId, usages);
      }

      // Correlate to get merged conversations
      const correlated = correlateSessionsWithTranscripts(
        hookSessions,
        transcripts,
        toolUsagesMap
      );

      // Build lookup map by correlation ID
      const correlationMap = new Map(
        correlated.map((c) => [c.correlationId, c])
      );

      // Process each requested correlation
      for (const correlationId of body.correlation_ids) {
        const conv = correlationMap.get(correlationId);
        if (!conv) continue;

        // Build merged session data
        const sessionData: Record<string, unknown> = {
          correlation_id: correlationId
        };

        // Add hook data if present
        if (conv.hookSession) {
          Object.assign(sessionData, hookSessionToDict(conv.hookSession));

          // Add tool usages
          const toolUsages = conv.toolUsages ?? [];
          for (const usage of toolUsages) {
            allToolUsages.push(
              sanitizer.redactObject(toolUsageToDict(usage)) as Record<
                string,
                unknown
              >
            );
          }

          // Add cost estimate from transcript if available
          if (
            body.include_cost &&
            conv.hookSession.transcriptPath &&
            existsSync(conv.hookSession.transcriptPath)
          ) {
            const cost = parseTranscriptFile(conv.hookSession.transcriptPath);
            if (cost) {
              sessionData.cost_estimate = {
                total_input_tokens: cost.totalInputTokens,
                total_output_tokens: cost.totalOutputTokens,
                estimated_cost_usd: cost.estimatedCostUsd
              };
            }
          }
        }

        // Add transcript data if present
        if (conv.transcript) {
          const parsed = await readTranscript(conv.transcript.id);
          if (parsed) {
            sessionData.messages = parsed.messages;
            sessionData.agent = parsed.agent;
            sessionData.path = parsed.path;

            // Add cost if available and not already set
            if (body.include_cost && !sessionData.cost_estimate) {
              sessionData.cost_estimate = {
                total_input_tokens: parsed.totalInputTokens,
                total_output_tokens: parsed.totalOutputTokens,
                estimated_cost_usd: parsed.estimatedCostUsd
              };
            }
          }
        }

        sessions.push(
          sanitizer.redactObject(sessionData) as Record<string, unknown>
        );
      }
    } else {
      // Legacy path: separate hook and transcript processing
      // Process hook sessions
      for (const sessionId of body.session_ids ?? []) {
        const session = state.hookStore.getSession(sessionId);
        if (!session) continue;

        const sessionData = hookSessionToDict(session) as Record<
          string,
          unknown
        >;
        const toolUsages = state.hookStore.getSessionToolUsages(sessionId);

        // Add cost estimate if requested
        if (
          body.include_cost &&
          session.transcriptPath &&
          existsSync(session.transcriptPath)
        ) {
          const cost = parseTranscriptFile(session.transcriptPath);
          if (cost) {
            sessionData.cost_estimate = {
              total_input_tokens: cost.totalInputTokens,
              total_output_tokens: cost.totalOutputTokens,
              estimated_cost_usd: cost.estimatedCostUsd
            };
          }
        }

        sessions.push(
          sanitizer.redactObject(sessionData) as Record<string, unknown>
        );

        for (const usage of toolUsages) {
          allToolUsages.push(
            sanitizer.redactObject(toolUsageToDict(usage)) as Record<
              string,
              unknown
            >
          );
        }
      }

      // Process local transcripts
      for (const localId of body.local_ids ?? []) {
        const transcript = await readTranscript(localId);
        if (!transcript) continue;

        const sessionData: Record<string, unknown> = {
          source: "local",
          agent: transcript.agent,
          session_id: localId,
          path: transcript.path,
          messages: transcript.messages
        };

        // Add cost estimate if available
        if (body.include_cost) {
          sessionData.cost_estimate = {
            total_input_tokens: transcript.totalInputTokens,
            total_output_tokens: transcript.totalOutputTokens,
            estimated_cost_usd: transcript.estimatedCostUsd
          };
        }

        sessions.push(
          sanitizer.redactObject(sessionData) as Record<string, unknown>
        );
      }
    }

    const report = sanitizer.getReport();

    // Build JSONL content
    const lines: string[] = [];

    // Manifest line
    lines.push(
      JSON.stringify({
        type: "manifest",
        bundle_id: bundleId,
        version: "1.0.0",
        exported_at: new Date().toISOString(),
        session_count: sessions.length,
        tool_usage_count: allToolUsages.length,
        sanitization: {
          total_redactions: report.totalRedactions,
          categories: report.countsByCategory
        }
      })
    );

    // Session lines
    for (const session of sessions) {
      lines.push(JSON.stringify({ type: "session", data: session }));
    }

    // Tool usage lines
    for (const usage of allToolUsages) {
      lines.push(JSON.stringify({ type: "tool_usage", data: usage }));
    }

    return c.json({
      bundle_id: bundleId,
      session_count: sessions.length,
      tool_usage_count: allToolUsages.length,
      redaction_count: report.totalRedactions,
      categories: report.countsByCategory,
      content: lines.join("\n")
    });
  });

  // ==========================================================================
  // HuggingFace Integration Endpoints
  // ==========================================================================

  /**
   * GET /api/share/huggingface/cli-auth - Check HuggingFace CLI auth status
   *
   * Reads from ~/.cache/huggingface/token or HF_TOKEN env var.
   * This allows users to authenticate once with `huggingface-cli login`
   * and use across all HF tools.
   */
  app.get("/api/share/huggingface/cli-auth", async (c) => {
    const status = await checkHFCLIAuth();
    return c.json(status);
  });

  /**
   * POST /api/share/huggingface/use-cli-token - Use CLI token for upload
   *
   * Returns the cached token for use in upload operations.
   * Only returns token if user explicitly requests it.
   */
  app.post("/api/share/huggingface/use-cli-token", async (c) => {
    const token = await getHFCachedToken();
    if (token) {
      return c.json({ success: true, token });
    }
    return c.json({
      success: false,
      error:
        "No cached token found. Run 'huggingface-cli login' to authenticate."
    });
  });

  /**
   * GET /api/share/huggingface/oauth/config - Get OAuth configuration status
   */
  app.get("/api/share/huggingface/oauth/config", (c) => {
    const clientId = process.env.HF_OAUTH_CLIENT_ID;
    const port = state.config.daemon.port || 8021;

    return c.json({
      configured: !!clientId,
      clientId: clientId || null,
      redirectUri: `http://localhost:${port}/api/share/huggingface/oauth/callback`,
      scopes: ["read-repos", "write-repos"],
      setupUrl: "https://huggingface.co/settings/applications"
    });
  });

  /**
   * POST /api/share/huggingface/oauth/start - Start OAuth flow
   *
   * Returns the authorization URL to redirect the user to.
   */
  app.post("/api/share/huggingface/oauth/start", async (c) => {
    const clientId = process.env.HF_OAUTH_CLIENT_ID;
    if (!clientId) {
      return c.json(
        {
          success: false,
          error:
            "OAuth not configured. Set HF_OAUTH_CLIENT_ID environment variable."
        },
        400
      );
    }

    const port = state.config.daemon.port || 8021;
    const oauthConfig: HFOAuthConfig = {
      clientId,
      clientSecret: process.env.HF_OAUTH_CLIENT_SECRET,
      redirectUri: `http://localhost:${port}/api/share/huggingface/oauth/callback`,
      scopes: ["read-repos", "write-repos"]
    };

    const result = await getHFOAuthURL(oauthConfig);
    return c.json({
      success: true,
      url: result.url,
      state: result.state
    });
  });

  /**
   * GET /api/share/huggingface/oauth/callback - OAuth callback handler
   *
   * HuggingFace redirects here after user authorizes.
   * Exchanges code for token and shows success page.
   */
  app.get("/api/share/huggingface/oauth/callback", async (c) => {
    const code = c.req.query("code");
    const oauthState = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");

    if (error) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>HuggingFace Login Failed</title></head>
          <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1 style="color: #dc2626;">Login Failed</h1>
            <p>${errorDescription || error}</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body>
        </html>
      `);
    }

    if (!code || !oauthState) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>HuggingFace Login Failed</title></head>
          <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1 style="color: #dc2626;">Login Failed</h1>
            <p>Missing authorization code or state</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body>
        </html>
      `);
    }

    const clientId = process.env.HF_OAUTH_CLIENT_ID;
    if (!clientId) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>HuggingFace Login Failed</title></head>
          <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1 style="color: #dc2626;">Login Failed</h1>
            <p>OAuth not configured</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body>
        </html>
      `);
    }

    const port = state.config.daemon.port || 8021;
    const oauthConfig: HFOAuthConfig = {
      clientId,
      clientSecret: process.env.HF_OAUTH_CLIENT_SECRET,
      redirectUri: `http://localhost:${port}/api/share/huggingface/oauth/callback`
    };

    const result = await exchangeHFOAuthCode(code, oauthState, oauthConfig);

    if (!result.success) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>HuggingFace Login Failed</title></head>
          <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1 style="color: #dc2626;">Login Failed</h1>
            <p>${result.error}</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body>
        </html>
      `);
    }

    // Store the token in contributor settings
    saveContributorSettings({ hfToken: result.accessToken });

    // Return success page that posts message to opener and closes
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>HuggingFace Login Successful</title></head>
        <body style="font-family: system-ui; padding: 2rem; text-align: center;">
          <h1 style="color: #16a34a;">Login Successful!</h1>
          <p>Logged in as <strong>${result.username || "unknown"}</strong></p>
          <p>You can close this window.</p>
          <script>
            // Notify opener window
            if (window.opener) {
              window.opener.postMessage({
                type: 'hf-oauth-success',
                username: ${JSON.stringify(result.username)},
              }, '*');
            }
            // Auto-close after short delay
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  });

  app.post("/api/share/huggingface/validate", async (c) => {
    const body = (await c.req.json()) as { token: string };
    const result = await validateHuggingFaceToken(body.token);
    return c.json(result);
  });

  app.post("/api/share/huggingface/check-repo", async (c) => {
    const body = (await c.req.json()) as { token: string; repo_id: string };
    const result = await checkDatasetAccess(body.token, body.repo_id);
    return c.json(result);
  });

  app.post("/api/share/huggingface", async (c) => {
    const body = (await c.req.json()) as {
      correlation_ids?: string[]; // Preferred: correlation IDs (merged hook+transcript)
      session_ids?: string[]; // Legacy: Hook session IDs
      local_ids?: string[]; // Legacy: Local transcript IDs
      token?: string;
      repo_id: string;
      create_pr?: boolean;
      contributor_id?: string;
      license?: string;
      ai_preference?: string;
      format?: "zip" | "jsonl" | "auto";
    };

    // Use provided token, or fall back to saved token from OAuth/settings
    let token = body.token;
    if (!token) {
      const settings = loadContributorSettings();
      token = settings.hfToken;
    }

    // Validate required fields
    const hasCorrelations =
      body.correlation_ids && body.correlation_ids.length > 0;
    const hasHookSessions = body.session_ids && body.session_ids.length > 0;
    const hasLocalSessions = body.local_ids && body.local_ids.length > 0;
    if (
      !token ||
      !body.repo_id ||
      (!hasCorrelations && !hasHookSessions && !hasLocalSessions)
    ) {
      return c.json(
        {
          error:
            "Missing required fields: token, repo_id, and at least one session"
        },
        400
      );
    }

    const bundleId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Build sessions and sanitize
    const sanitizer = createSanitizer({
      redactSecrets: true,
      redactPii: true,
      redactPaths: true
    });

    const contribSessions: Array<
      ContribSession & { sanitized: unknown; previewRedacted?: string }
    > = [];

    // Helper to add a session to contribSessions
    const addContribSession = async (
      sessionId: string,
      sessionContent: Record<string, unknown>,
      source: string,
      mtimeUtc: string,
      sourcePathHint: string | undefined,
      entryTypes: Record<string, number>
    ) => {
      const contentStr = JSON.stringify(sessionContent);
      const sanitized = sanitizer.redactObject(sessionContent);
      const previewText = contentStr.slice(0, 500);
      const quality = scoreText(previewText);

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(contentStr)
      );
      const rawSha256 = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      contribSessions.push({
        sessionId,
        source,
        rawSha256,
        mtimeUtc,
        data: sessionContent,
        preview: previewText,
        score: quality,
        approxChars: contentStr.length,
        sourcePathHint: sourcePathHint ?? "unknown",
        filePath: `sessions/${sessionId}.json`,
        entryTypes,
        primaryType: "session",
        sanitized,
        previewRedacted: String(sanitizer.redactText(previewText))
      });
    };

    // If correlation_ids provided, use correlation-based processing
    if (body.correlation_ids?.length) {
      // Get all data needed for correlation
      const hookSessions = state.hookStore.getAllSessions();
      const transcripts = await discoverLocalTranscripts();
      const toolUsagesMap = new Map<string, ToolUsage[]>();
      for (const session of hookSessions) {
        const usages = state.hookStore.getSessionToolUsages(session.sessionId);
        toolUsagesMap.set(session.sessionId, usages);
      }

      // Correlate to get merged conversations
      const correlated = correlateSessionsWithTranscripts(
        hookSessions,
        transcripts,
        toolUsagesMap
      );

      // Build lookup map by correlation ID
      const correlationMap = new Map(
        correlated.map((c) => [c.correlationId, c])
      );

      // Process each requested correlation
      for (const correlationId of body.correlation_ids) {
        const conv = correlationMap.get(correlationId);
        if (!conv) continue;

        // Build merged session data
        const sessionContent: Record<string, unknown> = {
          correlation_id: correlationId
        };
        let source = "unknown";
        let sessionId = correlationId;
        let mtimeUtc = new Date().toISOString();
        let sourcePathHint: string | undefined;
        const entryTypes: Record<string, number> = { session: 1 };

        // Add hook data if present
        if (conv.hookSession) {
          Object.assign(sessionContent, hookSessionToDict(conv.hookSession));
          sessionContent.tool_usages = (conv.toolUsages ?? []).map((u) =>
            toolUsageToDict(u)
          );
          source = conv.hookSession.source || "claude";
          sessionId = conv.hookSession.sessionId;
          mtimeUtc = new Date(conv.hookSession.startTime).toISOString();
          sourcePathHint =
            conv.hookSession.transcriptPath || conv.hookSession.cwd;
          entryTypes.tool_usage = conv.toolUsages?.length ?? 0;
        }

        // Add transcript data if present
        if (conv.transcript) {
          const parsed = await readTranscript(conv.transcript.id);
          if (parsed) {
            sessionContent.messages = parsed.messages;
            sessionContent.agent = parsed.agent;
            sessionContent.path = parsed.path;
            sessionContent.cost_estimate = {
              total_input_tokens: parsed.totalInputTokens,
              total_output_tokens: parsed.totalOutputTokens,
              estimated_cost_usd: parsed.estimatedCostUsd
            };
            entryTypes.message = parsed.messages?.length ?? 0;

            // Only override source if no hook session
            if (!conv.hookSession) {
              source = parsed.agent;
              sessionId = conv.transcript.id;
              mtimeUtc = new Date(
                conv.transcript.modifiedAt ?? Date.now()
              ).toISOString();
              sourcePathHint = parsed.path;
            }
          }
        }

        await addContribSession(
          sessionId,
          sessionContent,
          source,
          mtimeUtc,
          sourcePathHint,
          entryTypes
        );
      }
    } else {
      // Legacy path: separate hook and transcript processing
      // Process hook sessions
      for (const sessionId of body.session_ids ?? []) {
        const session = state.hookStore.getSession(sessionId);
        if (!session) continue;

        const toolUsages = state.hookStore.getSessionToolUsages(sessionId);

        // Build session content for sanitization
        const sessionContent = {
          ...hookSessionToDict(session),
          tool_usages: toolUsages.map((u) => toolUsageToDict(u))
        };

        await addContribSession(
          sessionId,
          sessionContent,
          session.source || "claude",
          new Date(session.startTime).toISOString(),
          session.transcriptPath || session.cwd,
          { session: 1, tool_usage: toolUsages.length }
        );
      }

      // Process local transcripts
      // First get metadata for all local transcripts to access modifiedAt
      const localMetaHf = body.local_ids?.length
        ? await discoverLocalTranscripts()
        : [];

      for (const localId of body.local_ids ?? []) {
        const transcript = await readTranscript(localId);
        if (!transcript) continue;

        // Find metadata to get modifiedAt
        const meta = localMetaHf.find((m) => m.id === localId);

        const sessionContent = {
          source: "local",
          agent: transcript.agent,
          session_id: localId,
          path: transcript.path,
          messages: transcript.messages,
          cost_estimate: {
            total_input_tokens: transcript.totalInputTokens,
            total_output_tokens: transcript.totalOutputTokens,
            estimated_cost_usd: transcript.estimatedCostUsd
          }
        };

        await addContribSession(
          localId,
          sessionContent,
          transcript.agent,
          meta?.modifiedAt
            ? new Date(meta.modifiedAt).toISOString()
            : new Date().toISOString(),
          transcript.path,
          { session: 1, message: transcript.messages?.length ?? 0 }
        );
      }
    }

    if (contribSessions.length === 0) {
      return c.json({ error: "No valid sessions found" }, 400);
    }

    // Build contributor metadata
    const contributor: ContributorMeta = {
      contributorId: body.contributor_id || "anonymous",
      license: body.license || "CC-BY-4.0",
      aiPreference: body.ai_preference || "train-genai=deny",
      rightsStatement: "I have the right to share these transcripts",
      rightsConfirmed: true,
      reviewedConfirmed: true
    };

    // Get redaction report
    const report = sanitizer.getReport();
    const redactionReport: RedactionReport = {
      ...report,
      residueWarnings: [],
      blocked: false
    };

    try {
      // Determine bundle format: 'auto' uses JSONL for small contributions (<=3 sessions)
      let bundleFormat: "zip" | "jsonl" = "zip";
      if (body.format === "jsonl") {
        bundleFormat = "jsonl";
      } else if (body.format === "auto" || !body.format) {
        bundleFormat = contribSessions.length <= 3 ? "jsonl" : "zip";
      }

      // Get quality config for bundle transparency
      const { DIMENSION_WEIGHTS, SIGNAL_WEIGHTS } = await import(
        "./enrichments/quality-score"
      );

      // Create the full bundle
      const bundleResult = await createBundle({
        sessions: contribSessions,
        contributor,
        appVersion: "agentwatch-0.1.0",
        redaction: redactionReport,
        format: bundleFormat,
        qualityConfig: {
          dimensionWeights: DIMENSION_WEIGHTS,
          signalWeights: SIGNAL_WEIGHTS
        }
      });

      // Upload to HuggingFace (pass string for JSONL, bytes for ZIP)
      const uploadContent =
        bundleResult.bundleFormat === "jsonl"
          ? new TextDecoder().decode(bundleResult.bundleBytes)
          : bundleResult.bundleBytes;

      const uploadResult = await uploadToHuggingFace(
        uploadContent,
        bundleResult.bundleId,
        {
          token,
          repoId: body.repo_id,
          createPr: body.create_pr ?? true,
          commitMessage: `Add contribution bundle ${bundleResult.bundleId.slice(0, 16)}`,
          prTitle: `Contribution: ${contribSessions.length} session(s)`,
          prDescription: `Bundle ID: ${bundleResult.bundleId}\nSessions: ${contribSessions.length}\nRedactions: ${report.totalRedactions}`
        }
      );

      if (!uploadResult.success) {
        return c.json({ error: uploadResult.error }, 500);
      }

      return c.json({
        success: true,
        bundle_id: bundleResult.bundleId,
        session_count: contribSessions.length,
        redaction_count: report.totalRedactions,
        url: uploadResult.url,
        pr_number: uploadResult.prNumber,
        commit_sha: uploadResult.commitSha,
        is_pull_request: uploadResult.isPullRequest,
        was_fallback: uploadResult.wasFallback
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  });

  // ==========================================================================
  // Contributor Settings & History Endpoints
  // ==========================================================================

  /**
   * GET /api/contrib/settings - Load saved contributor preferences
   */
  app.get("/api/contrib/settings", (c) => {
    const settings = loadContributorSettings();
    return c.json({
      contributor_id: settings.contributorId,
      license: settings.license,
      ai_preference: settings.aiPreference,
      rights_statement: settings.rightsStatement,
      hf_token: settings.hfToken ? "***saved***" : null,
      hf_dataset: settings.hfDataset,
      updated_at: settings.updatedAt
    });
  });

  /**
   * POST /api/contrib/settings - Save contributor preferences
   */
  app.post("/api/contrib/settings", async (c) => {
    const body = (await c.req.json()) as {
      contributor_id?: string;
      license?: string;
      ai_preference?: string;
      rights_statement?: string;
      hf_token?: string;
      hf_dataset?: string;
    };

    const updated = saveContributorSettings({
      contributorId: body.contributor_id,
      license: body.license,
      aiPreference: body.ai_preference,
      rightsStatement: body.rights_statement,
      hfToken: body.hf_token,
      hfDataset: body.hf_dataset
    });

    return c.json({
      success: true,
      contributor_id: updated.contributorId,
      license: updated.license,
      ai_preference: updated.aiPreference,
      rights_statement: updated.rightsStatement,
      hf_token: updated.hfToken ? "***saved***" : null,
      hf_dataset: updated.hfDataset,
      updated_at: updated.updatedAt
    });
  });

  /**
   * GET /api/contrib/profiles - List all redaction profiles (built-in + user-defined)
   */
  app.get("/api/contrib/profiles", (c) => {
    const settings = loadContributorSettings();
    const allProfiles = getAvailableProfiles(settings);

    return c.json({
      profiles: allProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        kept_fields: p.keptFields,
        redaction_config: {
          redact_secrets: p.redactionConfig.redactSecrets,
          redact_pii: p.redactionConfig.redactPii,
          redact_paths: p.redactionConfig.redactPaths,
          enable_high_entropy: p.redactionConfig.enableHighEntropy,
          custom_patterns: p.redactionConfig.customPatterns
        },
        is_default: p.isDefault,
        is_builtin: isBuiltinProfile(p.id),
        created_at: p.createdAt,
        updated_at: p.updatedAt
      })),
      active_profile_id: settings.activeProfileId || DEFAULT_PROFILE_ID
    });
  });

  /**
   * GET /api/contrib/research-profiles - Get research-oriented profiles with full metadata
   *
   * Returns profiles with research questions, shared/stripped summaries, and UI hints.
   * This is the preferred endpoint for the new research-oriented UI.
   */
  app.get("/api/contrib/research-profiles", (c) => {
    return c.json({
      profiles: RESEARCH_PROFILES.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        enables_research: p.enablesResearch.map((q) => ({
          question: q.question,
          context: q.context
        })),
        shared_summary: p.sharedSummary,
        stripped_summary: p.strippedSummary,
        kept_fields: p.keptFields,
        redaction_config: {
          redact_secrets: p.redactionConfig.redactSecrets,
          redact_pii: p.redactionConfig.redactPii,
          redact_paths: p.redactionConfig.redactPaths,
          enable_high_entropy: p.redactionConfig.enableHighEntropy
        },
        requires_review: p.requiresReview ?? false,
        ui: p.ui ?? {}
      })),
      default_profile_id: DEFAULT_PROFILE_ID
    });
  });

  /**
   * POST /api/contrib/profiles - Save a new redaction profile
   */
  app.post("/api/contrib/profiles", async (c) => {
    const body = (await c.req.json()) as {
      name: string;
      description?: string;
      kept_fields: string[];
      redaction_config?: {
        redact_secrets?: boolean;
        redact_pii?: boolean;
        redact_paths?: boolean;
        enable_high_entropy?: boolean;
        custom_patterns?: string[];
      };
    };

    if (!body.name || !body.kept_fields) {
      return c.json({ error: "name and kept_fields are required" }, 400);
    }

    const redactionConfig: RedactionConfig = {
      redactSecrets: body.redaction_config?.redact_secrets ?? true,
      redactPii: body.redaction_config?.redact_pii ?? true,
      redactPaths: body.redaction_config?.redact_paths ?? true,
      enableHighEntropy: body.redaction_config?.enable_high_entropy ?? true,
      customPatterns: body.redaction_config?.custom_patterns
    };

    const profile = saveRedactionProfile(
      body.name,
      body.kept_fields,
      redactionConfig,
      body.description
    );

    return c.json({
      success: true,
      profile: {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        kept_fields: profile.keptFields,
        redaction_config: {
          redact_secrets: profile.redactionConfig.redactSecrets,
          redact_pii: profile.redactionConfig.redactPii,
          redact_paths: profile.redactionConfig.redactPaths,
          enable_high_entropy: profile.redactionConfig.enableHighEntropy,
          custom_patterns: profile.redactionConfig.customPatterns
        },
        created_at: profile.createdAt,
        updated_at: profile.updatedAt
      }
    });
  });

  /**
   * DELETE /api/contrib/profiles/:id - Delete a user-defined profile
   */
  app.delete("/api/contrib/profiles/:id", (c) => {
    const profileId = c.req.param("id");

    if (isBuiltinProfile(profileId)) {
      return c.json({ error: "Cannot delete built-in profiles" }, 400);
    }

    const deleted = deleteRedactionProfile(profileId);
    if (!deleted) {
      return c.json({ error: "Profile not found" }, 404);
    }

    return c.json({ success: true });
  });

  /**
   * PUT /api/contrib/profiles/active - Set the active redaction profile
   */
  app.put("/api/contrib/profiles/active", async (c) => {
    const body = (await c.req.json()) as { profile_id: string };

    if (!body.profile_id) {
      return c.json({ error: "profile_id is required" }, 400);
    }

    const success = setActiveProfile(body.profile_id);
    if (!success) {
      return c.json({ error: "Profile not found" }, 404);
    }

    const settings = loadContributorSettings();
    const activeProfile = getActiveProfile(settings);

    return c.json({
      success: true,
      active_profile_id: activeProfile.id,
      profile: {
        id: activeProfile.id,
        name: activeProfile.name,
        kept_fields: activeProfile.keptFields,
        redaction_config: {
          redact_secrets: activeProfile.redactionConfig.redactSecrets,
          redact_pii: activeProfile.redactionConfig.redactPii,
          redact_paths: activeProfile.redactionConfig.redactPaths,
          enable_high_entropy: activeProfile.redactionConfig.enableHighEntropy,
          custom_patterns: activeProfile.redactionConfig.customPatterns
        }
      }
    });
  });

  /**
   * GET /api/contrib/history - Get contribution history and stats
   */
  app.get("/api/contrib/history", (c) => {
    const stats = getContributionStats();
    return c.json({
      total_contributions: stats.totalContributions,
      successful_contributions: stats.successfulContributions,
      total_sessions: stats.totalSessions,
      total_chars: stats.totalChars,
      first_contribution: stats.firstContribution,
      last_contribution: stats.lastContribution,
      recent: stats.recentContributions.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        session_count: r.sessionCount,
        total_chars: r.totalChars,
        destination: r.destination,
        bundle_id: r.bundleId,
        status: r.status,
        error: r.error,
        session_ids: r.sessionIds
      }))
    });
  });

  /**
   * POST /api/contrib/history - Record a new contribution
   */
  app.post("/api/contrib/history", async (c) => {
    const body = (await c.req.json()) as {
      session_count: number;
      total_chars: number;
      destination: string;
      bundle_id: string;
      status: "success" | "failed" | "pending";
      error?: string;
      session_ids?: string[];
    };

    const record = addContributionRecord({
      timestamp: new Date().toISOString(),
      sessionCount: body.session_count,
      totalChars: body.total_chars,
      destination: body.destination,
      bundleId: body.bundle_id,
      status: body.status,
      error: body.error,
      sessionIds: body.session_ids
    });

    return c.json({
      success: true,
      id: record.id
    });
  });

  /**
   * GET /api/contrib/destinations - Get known upload destinations
   */
  app.get("/api/contrib/destinations", (c) => {
    const settings = loadContributorSettings();
    const defaultDataset =
      settings.hfDataset || KNOWN_DESTINATIONS.huggingface.defaultDataset;

    return c.json({
      default: `huggingface:${defaultDataset}`,
      destinations: [
        {
          id: "huggingface",
          name: KNOWN_DESTINATIONS.huggingface.name,
          dataset: defaultDataset,
          url: KNOWN_DESTINATIONS.huggingface.url(defaultDataset),
          description: KNOWN_DESTINATIONS.huggingface.description,
          is_public: true,
          requires_token: true,
          has_token: !!settings.hfToken
        },
        {
          id: "local",
          name: KNOWN_DESTINATIONS.local.name,
          description: KNOWN_DESTINATIONS.local.description,
          is_public: false,
          requires_token: false
        }
      ]
    });
  });

  // ==========================================================================
  // ARTIFACT LINKING
  // ==========================================================================

  /**
   * GET /api/contrib/artifacts/:sessionId - Get artifacts linked to a session
   */
  app.get("/api/contrib/artifacts/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    const artifacts = getSessionArtifacts(sessionId);

    return c.json({
      session_id: sessionId,
      artifacts: artifacts.map((a) => ({
        type: a.type,
        url: a.url,
        label: a.label,
        metadata: a.metadata,
        added_at: a.addedAt
      }))
    });
  });

  /**
   * POST /api/contrib/artifacts/:sessionId - Add an artifact link to a session
   */
  app.post("/api/contrib/artifacts/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as {
      url: string;
      type?: ArtifactType;
      label?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.url) {
      return c.json({ error: "url is required" }, 400);
    }

    // Auto-detect type if not provided
    const type = body.type || detectArtifactType(body.url);

    const artifact = addSessionArtifact(sessionId, {
      type,
      url: body.url,
      label: body.label,
      metadata: body.metadata
    });

    return c.json({
      success: true,
      artifact: {
        type: artifact.type,
        url: artifact.url,
        label: artifact.label,
        metadata: artifact.metadata,
        added_at: artifact.addedAt
      }
    });
  });

  /**
   * DELETE /api/contrib/artifacts/:sessionId - Remove an artifact link
   */
  app.delete("/api/contrib/artifacts/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as { url: string };

    if (!body.url) {
      return c.json({ error: "url is required" }, 400);
    }

    const removed = removeSessionArtifact(sessionId, body.url);
    if (!removed) {
      return c.json({ error: "Artifact not found" }, 404);
    }

    return c.json({ success: true });
  });

  // WebSocket for real-time updates
  app.get(
    "/ws",
    upgradeWebSocket(() => ({
      onOpen: (_event, ws) => {
        state.connectionManager.connect(ws);

        // Send initial state
        const repos = state.store.snapshotRepos();
        const agents = state.store.snapshotAgents();
        const ports = state.store.snapshotPorts();

        ws.send(
          JSON.stringify({
            type: "repos_update",
            repos: repos.map(repoToDict)
          })
        );
        ws.send(
          JSON.stringify({
            type: "agents_update",
            agents: agents.map(agentToDict)
          })
        );
        ws.send(
          JSON.stringify({
            type: "ports_update",
            ports: ports.map(portToDict)
          })
        );
      },
      onMessage: (event, ws) => {
        try {
          const data = JSON.parse(String(event.data)) as { type?: string };
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          // Ignore parse errors
        }
      },
      onClose: (_event, ws) => {
        state.connectionManager.disconnect(ws);
      }
    }))
  );

  // Register hook enhancement endpoints (before static file serving)
  registerEnhancementEndpoints(app, () => ({
    config: state.config,
    hookStore: state.hookStore,
    ruleEngine: state.ruleEngine,
    costTracker: state.costTracker,
    costLimitsChecker: state.costLimitsChecker,
    notificationHub: state.notificationHub
  }));

  // Register enrichment & analytics endpoints
  registerEnrichmentEndpoints(app, () => ({
    hookStore: state.hookStore
  }));

  // Register audit log endpoints
  registerAuditEndpoints(app);

  // ==========================================================================
  // Privacy Flags API
  // ==========================================================================

  app.get("/api/privacy-flags", (c) => {
    // Get all flags, optionally filtered by session
    const sessionId = c.req.query("session_id");
    const flags = sessionId
      ? privacyFlags.getFlagsForSession(sessionId)
      : privacyFlags.getAllFlags();

    return c.json({
      flags,
      stats: privacyFlags.getFlagStats()
    });
  });

  app.get("/api/privacy-flags/:flagId", (c) => {
    const flagId = c.req.param("flagId");
    const flag = privacyFlags.getFlag(flagId);

    if (!flag) {
      return c.json({ error: "Flag not found" }, 404);
    }

    return c.json(flag);
  });

  app.post("/api/privacy-flags", async (c) => {
    // Create a new flag
    const body = (await c.req.json()) as {
      session_id: string;
      message_id: string;
      concern_type: "pii" | "secrets" | "proprietary" | "sensitive" | "other";
      notes: string;
      exclude_from_export?: boolean;
      redact_fields?: string[];
    };

    if (!body.session_id || !body.message_id) {
      return c.json({ error: "session_id and message_id are required" }, 400);
    }

    const flag = privacyFlags.createFlag(
      body.session_id,
      body.message_id,
      body.concern_type || "other",
      body.notes || "",
      body.exclude_from_export ?? false,
      body.redact_fields
    );

    return c.json(flag, 201);
  });

  app.patch("/api/privacy-flags/:flagId", async (c) => {
    // Update a flag
    const flagId = c.req.param("flagId");
    const body = (await c.req.json()) as {
      concern_type?: "pii" | "secrets" | "proprietary" | "sensitive" | "other";
      notes?: string;
      exclude_from_export?: boolean;
      redact_fields?: string[];
    };

    const updates: Parameters<typeof privacyFlags.updateFlag>[1] = {};
    if (body.concern_type !== undefined)
      updates.concernType = body.concern_type;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.exclude_from_export !== undefined)
      updates.excludeFromExport = body.exclude_from_export;
    if (body.redact_fields !== undefined)
      updates.redactFields = body.redact_fields;

    const flag = privacyFlags.updateFlag(flagId, updates);

    if (!flag) {
      return c.json({ error: "Flag not found" }, 404);
    }

    return c.json(flag);
  });

  app.post("/api/privacy-flags/:flagId/resolve", async (c) => {
    // Mark a flag as resolved
    const flagId = c.req.param("flagId");
    const body = (await c.req.json()) as { notes?: string };

    const flag = privacyFlags.resolveFlag(flagId, body.notes);

    if (!flag) {
      return c.json({ error: "Flag not found" }, 404);
    }

    return c.json(flag);
  });

  app.delete("/api/privacy-flags/:flagId", (c) => {
    const flagId = c.req.param("flagId");
    const success = privacyFlags.deleteFlag(flagId);

    if (!success) {
      return c.json({ error: "Flag not found" }, 404);
    }

    return c.json({ success: true });
  });

  // Serve static files for web UI
  const staticDirs = [
    join(process.cwd(), "web", "dist"),
    "/usr/share/agentwatch/web",
    join(homedir(), ".agentwatch", "web")
  ];

  for (const staticDir of staticDirs) {
    const indexPath = join(staticDir, "index.html");
    if (existsSync(indexPath)) {
      // Serve static files
      app.use("/assets/*", serveStatic({ root: staticDir }));

      // Serve index.html for root
      app.get("/", serveStatic({ path: indexPath }));

      // SPA fallback - serve index.html for all non-API routes
      app.get("*", async (c) => {
        const path = c.req.path;
        if (path.startsWith("/api/") || path === "/ws") {
          return c.notFound();
        }
        // Read and return index.html
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

export { websocket };
