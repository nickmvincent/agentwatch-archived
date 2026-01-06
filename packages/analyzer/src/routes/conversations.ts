/**
 * Conversations API routes.
 *
 * Provides the correlated view of hook sessions + transcripts + managed sessions.
 * This is the primary endpoint for the Sessions/Conversations pane.
 *
 * @module routes/conversations
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Hono } from "hono";
import type { HookSession, ToolUsage } from "@agentwatch/core";
import {
  correlateSessionsWithTranscripts,
  attachProjects,
  attachManagedSessions,
  getCorrelationStats
} from "../correlation";
import { loadTranscriptIndex, getIndexedTranscripts } from "../transcript-index";
import type { LocalTranscript } from "../local-logs";
import { loadAnalyzerConfig } from "../config";
import {
  deleteConversationMetadata,
  getAllConversationMetadata,
  getConversationMetadata,
  setConversationMetadata
} from "../conversation-metadata";

/**
 * Read hook sessions from disk JSONL files.
 * Reads both legacy single file and daily files.
 */
function readHookSessions(days: number): HookSession[] {
  const dataDir = join(homedir(), ".agentwatch", "hooks");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const sessions: Map<string, HookSession> = new Map();

  if (!existsSync(dataDir)) return [];

  try {
    // Load from legacy single file (backwards compat)
    const legacyFile = join(dataDir, "sessions.jsonl");
    if (existsSync(legacyFile)) {
      loadSessionsFromFile(legacyFile, cutoff, sessions);
    }

    // Load from daily files (sessions_YYYY-MM-DD.jsonl)
    for (const name of readdirSync(dataDir)) {
      if (name.startsWith("sessions_") && name.endsWith(".jsonl")) {
        const filepath = join(dataDir, name);
        loadSessionsFromFile(filepath, cutoff, sessions);
      }
    }
  } catch {
    // Ignore load errors
  }

  return [...sessions.values()];
}

function loadSessionsFromFile(
  filepath: string,
  cutoff: number,
  sessions: Map<string, HookSession>
): void {
  try {
    const content = readFileSync(filepath, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const session = JSON.parse(line) as HookSession;
        if (session.startTime >= cutoff) {
          sessions.set(session.sessionId, session);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore file errors
  }
}

/**
 * Read tool usages from disk JSONL files.
 */
function readToolUsages(days: number): Map<string, ToolUsage[]> {
  const dataDir = join(homedir(), ".agentwatch", "hooks");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const usagesBySession: Map<string, ToolUsage[]> = new Map();

  if (!existsSync(dataDir)) return usagesBySession;

  try {
    // Load from legacy single file
    const legacyFile = join(dataDir, "tool_usages.jsonl");
    if (existsSync(legacyFile)) {
      loadToolUsagesFromFile(legacyFile, cutoff, usagesBySession);
    }

    // Load from daily files
    for (const name of readdirSync(dataDir)) {
      if (name.startsWith("tool_usages_") && name.endsWith(".jsonl")) {
        const filepath = join(dataDir, name);
        loadToolUsagesFromFile(filepath, cutoff, usagesBySession);
      }
    }
  } catch {
    // Ignore load errors
  }

  return usagesBySession;
}

function loadToolUsagesFromFile(
  filepath: string,
  cutoff: number,
  usagesBySession: Map<string, ToolUsage[]>
): void {
  try {
    const content = readFileSync(filepath, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const usage = JSON.parse(line) as ToolUsage;
        if (usage.timestamp >= cutoff) {
          const existing = usagesBySession.get(usage.sessionId) || [];
          existing.push(usage);
          usagesBySession.set(usage.sessionId, existing);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore file errors
  }
}

/**
 * Read managed sessions from disk.
 */
function readManagedSessions(days: number): any[] {
  const sessionsDir = join(homedir(), ".agentwatch", "sessions");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const sessions: any[] = [];

  if (!existsSync(sessionsDir)) return sessions;

  try {
    for (const name of readdirSync(sessionsDir)) {
      if (!name.endsWith(".json")) continue;
      const filepath = join(sessionsDir, name);
      try {
        const content = readFileSync(filepath, "utf-8");
        const session = JSON.parse(content);
        if (session.startedAt >= cutoff) {
          sessions.push(session);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore errors
  }

  return sessions;
}

/**
 * Convert HookSession to API response format (snake_case).
 */
function hookSessionToDict(session: HookSession) {
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
    active: !session.endTime,
    total_input_tokens: session.totalInputTokens,
    total_output_tokens: session.totalOutputTokens,
    estimated_cost_usd: session.estimatedCostUsd
  };
}

/**
 * Register conversation routes.
 */
export function registerConversationRoutes(app: Hono): void {
  /**
   * GET /api/contrib/correlated
   *
   * Get correlated view of hook sessions + transcripts + managed sessions.
   * This is the primary endpoint for the Conversations/Sessions pane.
   */
  app.get("/api/contrib/correlated", async (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);

    // Read hook sessions from disk
    const hookSessions = readHookSessions(days);

    // Read tool usages
    const toolUsagesMap = readToolUsages(days);

    // Get local transcripts from index
    const index = loadTranscriptIndex();
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
    const allTranscripts = getIndexedTranscripts(index, {});
    const transcripts = allTranscripts.filter((t) => t.modifiedAt >= cutoffMs);

    // Convert to LocalTranscript format expected by correlation
    const localTranscripts: LocalTranscript[] = transcripts.map((t) => ({
      id: t.id,
      agent: t.agent,
      path: t.path,
      name: t.name,
      projectDir: t.projectDir,
      modifiedAt: t.modifiedAt,
      sizeBytes: t.sizeBytes,
      messageCount: t.messageCount,
      startTime: t.startTime,
      endTime: t.endTime
    }));

    // Correlate
    let correlated = correlateSessionsWithTranscripts(
      hookSessions,
      localTranscripts,
      toolUsagesMap
    );

    // Attach managed sessions
    const managedSessions = readManagedSessions(days);
    if (managedSessions.length > 0) {
      correlated = attachManagedSessions(correlated, managedSessions);
    }

    // Attach projects from config
    const config = loadAnalyzerConfig();
    const projects = config.projects ?? [];
    if (projects.length > 0) {
      correlated = attachProjects(correlated, projects);
    }

    // Get stats
    const stats = getCorrelationStats(correlated);

    // Apply limit
    const limited = correlated.slice(0, limit);

    return c.json({
      sessions: limited.map((s) => ({
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
              path: s.transcript.path,
              name: s.transcript.name,
              agent: s.transcript.agent,
              project_dir: s.transcript.projectDir,
              modified_at: s.transcript.modifiedAt,
              size_bytes: s.transcript.sizeBytes,
              message_count: s.transcript.messageCount,
              start_time: s.transcript.startTime,
              end_time: s.transcript.endTime
            }
          : null,
        managed_session: s.managedSession
          ? {
              id: s.managedSession.id,
              agent: s.managedSession.agent,
              cwd: s.managedSession.cwd,
              started_at: s.managedSession.startedAt,
              ended_at: s.managedSession.endedAt,
              status: s.managedSession.status,
              pid: s.managedSession.pid
            }
          : null,
        project: s.project
          ? {
              id: s.project.id,
              name: s.project.name
            }
          : null
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
   * GET /api/conversation-metadata
   *
   * Get metadata for all conversations (for renaming, annotations).
   */
  app.get("/api/conversation-metadata", (c) => {
    return c.json(getAllConversationMetadata());
  });

  /**
   * GET /api/conversation-metadata/:conversationId
   *
   * Get metadata for a specific conversation.
   */
  app.get("/api/conversation-metadata/:conversationId", (c) => {
    const conversationId = c.req.param("conversationId");
    const metadata = getConversationMetadata(conversationId);
    if (!metadata) {
      return c.json({ error: "Conversation metadata not found" }, 404);
    }
    return c.json(metadata);
  });

  /**
   * PATCH /api/conversation-metadata/:conversationId
   *
   * Update metadata for a conversation.
   */
  app.patch("/api/conversation-metadata/:conversationId", async (c) => {
    const conversationId = c.req.param("conversationId");
    const body = (await c.req.json().catch(() => ({}))) as {
      customName?: string | null;
    };
    const updated = setConversationMetadata(conversationId, {
      customName: body.customName ?? null
    });
    return c.json(updated);
  });

  /**
   * DELETE /api/conversation-metadata/:conversationId
   *
   * Delete metadata for a conversation.
   */
  app.delete("/api/conversation-metadata/:conversationId", (c) => {
    const conversationId = c.req.param("conversationId");
    const success = deleteConversationMetadata(conversationId);
    return c.json({ success });
  });
}
