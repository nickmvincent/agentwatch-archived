/**
 * Hook session and event handler routes.
 *
 * Provides endpoints for:
 * - Querying hook sessions and their tool usage timelines
 * - Receiving hook events from Claude Code (session lifecycle, tool usage)
 * - Aggregated statistics (tool stats, daily stats, commits)
 *
 * Hooks are configured in Claude Code's settings.json and call these endpoints
 * at various lifecycle points (session start, tool use, etc.).
 *
 * @see https://docs.anthropic.com/claude-code/hooks
 * @module routes/hooks
 */

import type { Hono } from "hono";
import type { HookStore } from "@agentwatch/monitor";
import type { EventBus } from "@agentwatch/core";
import type { ConnectionManager } from "../connection-manager";
import type { HookNotifier } from "../notifications";
import type { NotificationsConfig } from "../config";
import {
  hookSessionToDict,
  toolUsageToDict,
  toolStatsToDict,
  dailyStatsToDict,
  gitCommitToDict,
  extractCommitHash,
  extractCommitMessage
} from "@agentwatch/shared-api";

/**
 * Register hook session query routes.
 *
 * @param app - The Hono app instance
 * @param hookStore - HookStore containing session and tool usage data
 */
export function registerHookSessionRoutes(
  app: Hono,
  hookStore: HookStore
): void {
  /**
   * GET /api/hooks/sessions
   *
   * List hook sessions.
   *
   * @query active - If "true", only return active (non-ended) sessions
   * @query limit - Max sessions to return (default: 100)
   * @returns Array of session objects
   */
  app.get("/api/hooks/sessions", (c) => {
    const active = c.req.query("active") === "true";
    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);

    const sessions = active
      ? hookStore.getActiveSessions()
      : hookStore.getAllSessions(limit);

    return c.json(sessions.map(hookSessionToDict));
  });

  /**
   * GET /api/hooks/sessions/:id
   *
   * Get a specific session with its tool usage timeline.
   *
   * @param id - Session ID (from Claude Code)
   * @returns Session object with tool_usages array, or 404
   */
  app.get("/api/hooks/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const session = hookStore.getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const toolUsages = hookStore.getSessionToolUsages(sessionId);

    return c.json({
      ...hookSessionToDict(session),
      tool_usages: toolUsages.map(toolUsageToDict)
    });
  });

  /**
   * GET /api/hooks/sessions/:id/timeline
   *
   * Get just the tool usage timeline for a session.
   *
   * @param id - Session ID
   * @returns Array of tool usage objects
   */
  app.get("/api/hooks/sessions/:id/timeline", (c) => {
    const sessionId = c.req.param("id");
    const toolUsages = hookStore.getSessionToolUsages(sessionId);
    return c.json(toolUsages.map(toolUsageToDict));
  });

  /**
   * GET /api/hooks/sessions/:id/commits
   *
   * Get git commits made during a session.
   *
   * @param id - Session ID
   * @returns Array of commit objects
   */
  app.get("/api/hooks/sessions/:id/commits", (c) => {
    const sessionId = c.req.param("id");
    const commits = hookStore.getAllCommits(100);
    const sessionCommits = commits.filter(
      (commit) => commit.sessionId === sessionId
    );
    return c.json(sessionCommits.map(gitCommitToDict));
  });
}

/**
 * Register hook statistics routes.
 *
 * @param app - The Hono app instance
 * @param hookStore - HookStore for aggregated statistics
 */
export function registerHookStatsRoutes(app: Hono, hookStore: HookStore): void {
  /**
   * GET /api/hooks/tools/stats
   *
   * Get aggregated tool usage statistics.
   *
   * @returns Array of { tool_name, call_count, success_count, failure_count, avg_duration_ms }
   */
  app.get("/api/hooks/tools/stats", (c) => {
    const stats = hookStore.getToolStats();
    return c.json(stats.map(toolStatsToDict));
  });

  /**
   * GET /api/hooks/tools/recent
   *
   * Get recent tool usages across all sessions.
   *
   * @query limit - Max usages to return (default: 50)
   * @returns Array of tool usage objects, sorted by timestamp descending
   */
  app.get("/api/hooks/tools/recent", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const allSessions = hookStore.getAllSessions(100);
    const recentUsages: ReturnType<typeof hookStore.getSessionToolUsages> = [];

    for (const session of allSessions) {
      const usages = hookStore.getSessionToolUsages(session.sessionId);
      recentUsages.push(...usages);
    }

    recentUsages.sort((a, b) => b.timestamp - a.timestamp);
    return c.json(recentUsages.slice(0, limit).map(toolUsageToDict));
  });

  /**
   * GET /api/hooks/stats/daily
   *
   * Get daily aggregated statistics.
   *
   * @query limit - Number of days to return (default: 30)
   * @returns Array of { date, session_count, tool_count, total_input_tokens, total_output_tokens }
   */
  app.get("/api/hooks/stats/daily", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "30", 10);
    const stats = hookStore.getDailyStats(limit);
    return c.json(stats.map(dailyStatsToDict));
  });

  /**
   * GET /api/hooks/commits
   *
   * Get recent git commits made during hook sessions.
   *
   * @query limit - Max commits to return (default: 50)
   * @returns Array of commit objects
   */
  app.get("/api/hooks/commits", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const commits = hookStore.getAllCommits(limit);
    return c.json(commits.map(gitCommitToDict));
  });
}

/**
 * Register hook event handler routes.
 *
 * These endpoints are called by Claude Code hooks at various lifecycle points.
 * They should return quickly as Claude Code waits for the response.
 *
 * @param app - The Hono app instance
 * @param hookStore - HookStore to record events
 * @param connectionManager - For broadcasting notifications
 * @param notifier - Optional HookNotifier for desktop notifications
 * @param notifyConfig - Notification configuration
 */
export function registerHookEventRoutes(
  app: Hono,
  hookStore: HookStore,
  connectionManager: ConnectionManager,
  notifier?: HookNotifier,
  notifyConfig?: NotificationsConfig,
  eventBus?: EventBus
): void {
  /**
   * POST /api/hooks/session-start
   *
   * Called when a Claude Code session starts.
   *
   * @body session_id - Unique session identifier
   * @body transcript_path - Path to transcript file
   * @body cwd - Current working directory
   * @body permission_mode - Permission mode (default, plan, etc.)
   * @body source - How session started (startup, resume, etc.)
   * @returns { result: "continue" }
   */
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

    hookStore.sessionStart(
      sessionId,
      transcriptPath ?? "",
      cwd,
      permissionMode,
      source
    );

    // Emit to EventBus
    eventBus?.emit({
      category: "hook_session",
      action: "start",
      entityId: sessionId,
      description: `Hook session started in ${cwd}`,
      details: { cwd, permissionMode, source, transcriptPath },
      source: "hook"
    });

    // Desktop notification for session start (if enabled)
    if (notifier && notifyConfig?.hookSessionStart) {
      notifier.notifySessionStart(sessionId, cwd);
    }

    return c.json({ result: "continue" });
  });

  /**
   * POST /api/hooks/session-end
   *
   * Called when a Claude Code session ends.
   *
   * @body session_id - Session identifier
   * @returns { result: "continue" }
   */
  app.post("/api/hooks/session-end", async (c) => {
    const body = await c.req.json();
    const { session_id: sessionId, cwd = "" } = body;

    if (!sessionId) {
      return c.json({ error: "Missing session_id" }, 400);
    }

    hookStore.sessionEnd(sessionId);

    // Emit to EventBus
    eventBus?.emit({
      category: "hook_session",
      action: "end",
      entityId: sessionId,
      description: `Hook session ended`,
      details: { cwd },
      source: "hook"
    });

    // Desktop notification for session end
    if (notifier && notifyConfig?.hookSessionEnd) {
      notifier.notifySessionEnd(sessionId, cwd);
    }

    return c.json({ result: "continue" });
  });

  /**
   * POST /api/hooks/pre-tool-use
   *
   * Called before a tool is executed.
   *
   * @body session_id - Session identifier
   * @body tool_name - Name of tool being called
   * @body tool_input - Tool input parameters
   * @body tool_use_id - Unique identifier for this tool usage
   * @returns { result: "continue" }
   */
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

    hookStore.recordPreToolUse(
      sessionId,
      toolUseId ?? `${sessionId}-${Date.now()}`,
      toolName,
      toolInput,
      body.cwd ?? ""
    );

    hookStore.updateSessionAwaiting(sessionId, false);

    // Start long-running timer for Bash commands
    if (notifier && notifyConfig?.hookLongRunning && toolName === "Bash") {
      notifier.startLongRunningTimer(sessionId, toolName, body.cwd ?? "");
    }

    return c.json({ result: "continue" });
  });

  /**
   * POST /api/hooks/post-tool-use
   *
   * Called after a tool completes.
   *
   * @body session_id - Session identifier
   * @body tool_name - Name of tool that was called
   * @body tool_use_id - Identifier matching pre-tool-use
   * @body tool_response - Tool output/result
   * @body error - Error message if tool failed
   * @body input_tokens - Tokens used in this turn
   * @body output_tokens - Tokens generated in this turn
   * @returns { result: "continue" }
   */
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

    hookStore.recordPostToolUse(
      toolUseId ?? `${sessionId}-recent`,
      toolResponse,
      error
    );

    if (inputTokens || outputTokens) {
      hookStore.updateSessionTokens(
        sessionId,
        inputTokens ?? 0,
        outputTokens ?? 0,
        0
      );
    }

    // Check for git commit in Bash tool output
    if (toolName === "Bash" && toolResponse) {
      const commitHash = extractCommitHash(toolResponse);
      if (commitHash) {
        const message = extractCommitMessage(toolResponse);
        hookStore.recordCommit(sessionId, commitHash, message, body.cwd ?? "");
      }
    }

    // Clear long-running timer
    if (notifier) {
      notifier.clearLongRunningTimer(sessionId);
    }

    // Emit to EventBus
    eventBus?.emit({
      category: "tool_usage",
      action: error ? "end" : "end",
      entityId: toolUseId ?? `${sessionId}-recent`,
      description: error
        ? `Tool ${toolName} failed: ${error.slice(0, 100)}`
        : `Tool ${toolName} completed`,
      details: {
        sessionId,
        toolName,
        success: !error,
        inputTokens,
        outputTokens
      },
      source: "hook"
    });

    // Notify on tool failure
    if (notifier && notifyConfig?.hookToolFailure && error) {
      notifier.notifyToolFailure(sessionId, toolName, error, body.cwd ?? "");
    }

    return c.json({ result: "continue" });
  });

  /**
   * POST /api/hooks/stop
   *
   * Called when agent stops (auto-continue limit, user stop, etc.)
   *
   * @returns { result: "continue" }
   */
  app.post("/api/hooks/stop", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { session_id: sessionId, cwd = "" } = body as {
      session_id?: string;
      cwd?: string;
    };

    // Notify that agent stopped (awaiting input)
    if (notifier && notifyConfig?.hookAwaitingInput && sessionId) {
      notifier.notifyAwaitingInput(sessionId, cwd);
    }

    return c.json({ result: "continue" });
  });

  /**
   * POST /api/hooks/subagent-stop
   *
   * Called when a subagent (Task tool) stops.
   *
   * @returns { result: "continue" }
   */
  app.post("/api/hooks/subagent-stop", async (_c) => {
    return _c.json({ result: "continue" });
  });

  /**
   * POST /api/hooks/notification
   *
   * Called when Claude Code has a notification to display.
   * Broadcasts to connected WebSocket clients.
   *
   * @body message - Notification message
   * @body level - Notification level (info, warning, error)
   * @returns { result: "continue" }
   */
  app.post("/api/hooks/notification", async (c) => {
    const body = await c.req.json();
    connectionManager.broadcast({
      type: "notification",
      ...body
    });
    return c.json({ result: "continue" });
  });

  /**
   * POST /api/hooks/permission-request
   *
   * Called when Claude Code requests permission for an action.
   *
   * @returns { result: "allow" } - Currently auto-allows all
   */
  app.post("/api/hooks/permission-request", async (_c) => {
    return _c.json({ result: "allow" });
  });

  /**
   * POST /api/hooks/user-prompt-submit
   *
   * Called when user submits a prompt.
   *
   * @body session_id - Session identifier
   * @returns { result: "continue" }
   */
  app.post("/api/hooks/user-prompt-submit", async (c) => {
    const body = await c.req.json();
    const { session_id: sessionId } = body;

    if (sessionId) {
      hookStore.updateSessionAwaiting(sessionId, false);
    }

    return c.json({ result: "continue" });
  });

  /**
   * POST /api/hooks/pre-compact
   *
   * Called before conversation is compacted.
   *
   * @returns { result: "continue" }
   */
  app.post("/api/hooks/pre-compact", async (_c) => {
    return _c.json({ result: "continue" });
  });
}
