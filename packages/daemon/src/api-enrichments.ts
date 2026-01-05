/**
 * Enrichment & Analytics API Endpoints
 *
 * Endpoints for session enrichments (auto-tags, quality scores, annotations)
 * and analytics aggregation (success rates, cost trends, quality distribution).
 */

import type { Hono } from "hono";
import type { HookStore } from "@agentwatch/monitor";
import type {
  HookSession,
  ToolUsage,
  SessionRef,
  FeedbackType,
  WorkflowStatus
} from "@agentwatch/core";
import type { ParsedTranscript } from "./local-logs";

export interface EnrichmentState {
  hookStore: HookStore;
}

// Helper to convert session ref
function parseSessionRef(idOrRef: string): SessionRef {
  if (idOrRef.startsWith("corr:")) {
    return { correlationId: idOrRef.slice(5) };
  }
  if (idOrRef.startsWith("hook:")) {
    return { hookSessionId: idOrRef.slice(5) };
  }
  if (idOrRef.startsWith("transcript:")) {
    return { transcriptId: idOrRef.slice(11) };
  }
  // Default to hook session ID
  return { hookSessionId: idOrRef };
}

/**
 * Register enrichment and analytics endpoints on the app.
 */
export function registerEnrichmentEndpoints(
  app: Hono,
  getState: () => EnrichmentState
): void {
  // ==========================================================================
  // Session Enrichment Endpoints
  // ==========================================================================

  /**
   * GET /api/enrichments - List all sessions with enrichments
   */
  app.get("/api/enrichments", (c) => {
    const { getAllEnrichments, getEnrichmentStats } =
      require("./enrichment-store") as typeof import("./enrichment-store");

    const enrichments = getAllEnrichments();
    const stats = getEnrichmentStats();

    return c.json({
      sessions: Object.entries(enrichments).map(([id, e]) => ({
        id,
        session_ref: e.sessionRef,
        has_auto_tags: !!e.autoTags,
        has_outcome_signals: !!e.outcomeSignals,
        has_quality_score: !!e.qualityScore,
        has_manual_annotation: !!e.manualAnnotation,
        has_loop_detection: !!e.loopDetection,
        has_diff_snapshot: !!e.diffSnapshot,
        quality_score: e.qualityScore?.overall,
        feedback: e.manualAnnotation?.feedback,
        workflow_status: e.manualAnnotation?.workflowStatus,
        task_type: e.autoTags?.taskType,
        updated_at: e.updatedAt
      })),
      stats
    });
  });

  /**
   * GET /api/enrichments/workflow-stats - Get workflow status statistics
   * NOTE: Must be defined before :sessionId route to avoid wildcard matching
   */
  app.get("/api/enrichments/workflow-stats", (c) => {
    const { getAllEnrichments } =
      require("./enrichment-store") as typeof import("./enrichment-store");

    const enrichments = getAllEnrichments();

    const stats = {
      total: 0,
      reviewed: 0,
      ready_to_contribute: 0,
      skipped: 0,
      pending: 0
    };

    for (const e of Object.values(enrichments)) {
      stats.total++;
      const status = e.manualAnnotation?.workflowStatus || "pending";
      if (status === "reviewed") stats.reviewed++;
      else if (status === "ready_to_contribute") stats.ready_to_contribute++;
      else if (status === "skipped") stats.skipped++;
      else stats.pending++;
    }

    return c.json(stats);
  });

  /**
   * GET /api/enrichments/:sessionId - Get enrichments for a session
   */
  app.get("/api/enrichments/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    const { getEnrichments } = require("./enrichment-store") as typeof import(
      "./enrichment-store"
    );

    const ref = parseSessionRef(sessionId);
    const enrichments = getEnrichments(ref);

    if (!enrichments) {
      return c.json({ error: "Enrichments not found", session_ref: ref }, 404);
    }

    return c.json({
      session_ref: enrichments.sessionRef,
      auto_tags: enrichments.autoTags,
      outcome_signals: enrichments.outcomeSignals,
      quality_score: enrichments.qualityScore,
      manual_annotation: enrichments.manualAnnotation,
      loop_detection: enrichments.loopDetection,
      diff_snapshot: enrichments.diffSnapshot,
      updated_at: enrichments.updatedAt
    });
  });

  /**
   * POST /api/enrichments/:sessionId/annotation - Set manual annotation
   */
  app.post("/api/enrichments/:sessionId/annotation", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as {
      feedback?: FeedbackType;
      notes?: string;
      user_tags?: string[];
      rating?: number;
      task_description?: string;
      goal_achieved?: boolean;
      workflow_status?: WorkflowStatus;
    };

    const { setManualAnnotation } =
      require("./enrichment-store") as typeof import("./enrichment-store");

    const ref = parseSessionRef(sessionId);
    const enrichments = setManualAnnotation(ref, body.feedback ?? null, {
      notes: body.notes,
      userTags: body.user_tags,
      rating: body.rating,
      taskDescription: body.task_description,
      goalAchieved: body.goal_achieved,
      workflowStatus: body.workflow_status
    });

    return c.json({
      success: true,
      session_ref: enrichments.sessionRef,
      manual_annotation: enrichments.manualAnnotation
    });
  });

  /**
   * POST /api/enrichments/:sessionId/tags - Update user tags
   */
  app.post("/api/enrichments/:sessionId/tags", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await c.req.json()) as { tags: string[] };

    const { updateUserTags } = require("./enrichment-store") as typeof import(
      "./enrichment-store"
    );

    const ref = parseSessionRef(sessionId);
    const enrichments = updateUserTags(ref, body.tags || []);

    return c.json({
      success: true,
      session_ref: enrichments.sessionRef,
      user_tags:
        enrichments.autoTags?.userTags || enrichments.manualAnnotation?.userTags
    });
  });

  /**
   * POST /api/enrichments/analyze-transcript - Analyze a transcript without hooks
   *
   * This endpoint runs the enrichment pipeline directly on a transcript file,
   * allowing quality scores and tags to be computed for sessions that didn't
   * have Claude Code hooks enabled.
   */
  app.post("/api/enrichments/analyze-transcript", async (c) => {
    const body = (await c.req.json()) as {
      /** Transcript ID from local-logs discovery */
      transcript_id?: string;
      /** Or direct path to a transcript file */
      transcript_path?: string;
      /** Agent type (claude, codex, gemini) - required if using path */
      agent?: string;
      /** Override cwd for git operations */
      cwd?: string;
      /** Skip git diff computation */
      skip_git_diff?: boolean;
    };

    const { readTranscript, readTranscriptByPath } =
      require("./local-logs") as typeof import("./local-logs");
    const { computeEnrichmentsFromTranscript } =
      require("./enrichments") as typeof import("./enrichments");
    const {
      setAutoTags,
      setOutcomeSignals,
      setLoopDetection,
      setQualityScore,
      setDiffSnapshot,
      getEnrichments
    } = require("./enrichment-store") as typeof import("./enrichment-store");

    try {
      // Get the transcript
      let transcript;
      try {
        if (body.transcript_id) {
          transcript = await readTranscript(body.transcript_id);
        } else if (body.transcript_path && body.agent) {
          transcript = await readTranscriptByPath(
            body.agent,
            body.transcript_path
          );
        } else {
          return c.json(
            {
              error:
                "Must provide either transcript_id or (transcript_path + agent)"
            },
            400
          );
        }
      } catch (readErr) {
        return c.json(
          {
            error: "Failed to read transcript",
            details: String(readErr),
            stage: "read"
          },
          500
        );
      }

      if (!transcript) {
        return c.json({ error: "Transcript not found" }, 404);
      }

      // Compute enrichments from transcript
      // Default to skipping git diff since it often fails due to permission issues
      let enrichments;
      try {
        enrichments = computeEnrichmentsFromTranscript(transcript, {
          cwd: body.cwd,
          skipGitDiff: body.skip_git_diff ?? true
        });
      } catch (computeErr) {
        return c.json(
          {
            error: "Failed to compute enrichments",
            details: String(computeErr),
            stage: "compute"
          },
          500
        );
      }

      // Store enrichments with transcript reference
      const ref = { transcriptId: transcript.id };

      if (enrichments.autoTags) {
        setAutoTags(ref, enrichments.autoTags, "auto");
      }
      if (enrichments.outcomeSignals) {
        setOutcomeSignals(ref, enrichments.outcomeSignals, "auto");
      }
      if (enrichments.loopDetection) {
        setLoopDetection(ref, enrichments.loopDetection, "auto");
      }
      if (enrichments.qualityScore) {
        setQualityScore(ref, enrichments.qualityScore, "auto");
      }
      if (enrichments.diffSnapshot) {
        setDiffSnapshot(ref, enrichments.diffSnapshot, "auto");
      }

      // Get the full stored enrichments
      const stored = getEnrichments(ref);

      return c.json({
        success: true,
        transcript_id: transcript.id,
        transcript_name: transcript.name,
        source: "transcript",
        enrichments: {
          auto_tags: enrichments.autoTags,
          outcome_signals: enrichments.outcomeSignals,
          quality_score: enrichments.qualityScore,
          loop_detection: enrichments.loopDetection,
          diff_snapshot: enrichments.diffSnapshot
        },
        // Summary for quick access
        summary: {
          task_type: enrichments.autoTags?.taskType,
          quality_score: enrichments.qualityScore?.overall,
          quality_classification: enrichments.qualityScore?.classification,
          loops_detected: enrichments.loopDetection?.loopsDetected,
          tests_passed: enrichments.outcomeSignals?.testResults?.passed,
          tests_failed: enrichments.outcomeSignals?.testResults?.failed
        }
      });
    } catch (err) {
      const errObj = err as Error;
      return c.json(
        {
          error: "Failed to analyze transcript",
          details: String(err),
          message: errObj.message,
          stack: errObj.stack?.split("\n").slice(0, 5)
        },
        500
      );
    }
  });

  /**
   * POST /api/enrichments/analyze-transcripts-bulk - Bulk analyze transcripts
   *
   * Analyzes multiple transcripts in a single request.
   */
  app.post("/api/enrichments/analyze-transcripts-bulk", async (c) => {
    const body = (await c.req.json()) as {
      /** List of transcript IDs to analyze */
      transcript_ids: string[];
      /** Skip git diff computation */
      skip_git_diff?: boolean;
    };

    if (!body.transcript_ids || !Array.isArray(body.transcript_ids)) {
      return c.json({ error: "transcript_ids array required" }, 400);
    }

    const { readTranscript } = require("./local-logs") as typeof import(
      "./local-logs"
    );
    const { computeEnrichmentsFromTranscript } =
      require("./enrichments") as typeof import("./enrichments");
    const {
      setAutoTags,
      setOutcomeSignals,
      setLoopDetection,
      setQualityScore,
      setDiffSnapshot
    } = require("./enrichment-store") as typeof import("./enrichment-store");

    const results: Array<{
      transcript_id: string;
      success: boolean;
      quality_score?: number;
      task_type?: string;
      error?: string;
    }> = [];

    for (const transcriptId of body.transcript_ids) {
      try {
        const transcript = await readTranscript(transcriptId);
        if (!transcript) {
          results.push({
            transcript_id: transcriptId,
            success: false,
            error: "Not found"
          });
          continue;
        }

        const enrichments = computeEnrichmentsFromTranscript(transcript, {
          skipGitDiff: body.skip_git_diff ?? true // Default to skipping for bulk
        });

        const ref = { transcriptId: transcript.id };

        if (enrichments.autoTags)
          setAutoTags(ref, enrichments.autoTags, "auto");
        if (enrichments.outcomeSignals)
          setOutcomeSignals(ref, enrichments.outcomeSignals, "auto");
        if (enrichments.loopDetection)
          setLoopDetection(ref, enrichments.loopDetection, "auto");
        if (enrichments.qualityScore)
          setQualityScore(ref, enrichments.qualityScore, "auto");
        if (enrichments.diffSnapshot)
          setDiffSnapshot(ref, enrichments.diffSnapshot, "auto");

        results.push({
          transcript_id: transcriptId,
          success: true,
          quality_score: enrichments.qualityScore?.overall,
          task_type: enrichments.autoTags?.taskType
        });
      } catch (err) {
        results.push({
          transcript_id: transcriptId,
          success: false,
          error: String(err)
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return c.json({
      total: body.transcript_ids.length,
      succeeded,
      failed,
      results
    });
  });

  /**
   * POST /api/enrichments/compute - Trigger enrichment computation
   */
  app.post("/api/enrichments/compute", async (c) => {
    const state = getState();
    const body = (await c.req.json()) as {
      session_ids?: string[];
      force?: boolean;
    };

    const {
      setAutoTags,
      setOutcomeSignals,
      setLoopDetection,
      setQualityScore,
      getEnrichments
    } = require("./enrichment-store") as typeof import("./enrichment-store");

    const {
      inferAutoTags,
      extractOutcomeSignals,
      detectLoops,
      computeQualityScore
    } = require("./enrichments") as typeof import("./enrichments");

    // Get sessions to enrich
    const sessionIds =
      body.session_ids ||
      state.hookStore.getAllSessions(100).map((s) => s.sessionId);

    let computed = 0;
    let skipped = 0;
    const errors: Array<{ session_id: string; error: string }> = [];

    for (const sessionId of sessionIds) {
      try {
        const session = state.hookStore.getSession(sessionId);
        if (!session) {
          skipped++;
          continue;
        }

        const ref: SessionRef = { hookSessionId: sessionId };

        // Check if already enriched (skip unless force)
        if (!body.force) {
          const existing = getEnrichments(ref);
          if (existing?.qualityScore) {
            skipped++;
            continue;
          }
        }

        const toolUsages = state.hookStore.getSessionToolUsages(sessionId);

        // Compute enrichments
        const autoTags = inferAutoTags(session, toolUsages);
        const outcomeSignals = extractOutcomeSignals(
          toolUsages,
          session.startTime
        );
        const loopDetection = detectLoops(toolUsages);
        const qualityScore = computeQualityScore(
          session,
          toolUsages,
          outcomeSignals,
          loopDetection
        );

        // Store enrichments
        setAutoTags(ref, autoTags);
        setOutcomeSignals(ref, outcomeSignals);
        setLoopDetection(ref, loopDetection);
        setQualityScore(ref, qualityScore);

        computed++;
      } catch (err) {
        errors.push({
          session_id: sessionId,
          error: String(err)
        });
      }
    }

    return c.json({ computed, skipped, errors });
  });

  /**
   * POST /api/enrichments/bulk - Bulk get enrichments
   */
  app.post("/api/enrichments/bulk", async (c) => {
    const body = (await c.req.json()) as { session_ids: string[] };
    const { bulkGetEnrichments } =
      require("./enrichment-store") as typeof import("./enrichment-store");

    const refs = body.session_ids.map(parseSessionRef);
    const enrichments = bulkGetEnrichments(refs);

    const result: Record<string, unknown> = {};
    for (const [id, e] of Object.entries(enrichments)) {
      if (e) {
        result[id] = {
          session_ref: e.sessionRef,
          auto_tags: e.autoTags,
          outcome_signals: e.outcomeSignals,
          quality_score: e.qualityScore,
          manual_annotation: e.manualAnnotation,
          loop_detection: e.loopDetection,
          diff_snapshot: e.diffSnapshot,
          updated_at: e.updatedAt
        };
      } else {
        result[id] = null;
      }
    }

    return c.json({
      enrichments: result,
      found: Object.values(enrichments).filter(Boolean).length,
      missing: Object.values(enrichments).filter((e) => !e).length
    });
  });

  /**
   * DELETE /api/enrichments/:sessionId - Delete enrichments
   */
  app.delete("/api/enrichments/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    const { deleteEnrichments } =
      require("./enrichment-store") as typeof import("./enrichment-store");

    const ref = parseSessionRef(sessionId);
    const deleted = deleteEnrichments(ref);

    if (!deleted) {
      return c.json({ error: "Enrichments not found" }, 404);
    }

    return c.json({ success: true });
  });

  /**
   * POST /api/enrichments/privacy-risk - Analyze transcript for privacy risks
   *
   * Scans a transcript for potentially sensitive content:
   * - Files read (especially sensitive patterns like .env, .ssh, credentials)
   * - Total file paths mentioned
   * - Web domains accessed
   * - Command outputs that might contain secrets
   */
  app.post("/api/enrichments/privacy-risk", async (c) => {
    const body = (await c.req.json()) as {
      transcript_id?: string;
      transcript_path?: string;
      agent?: string;
    };

    const { readTranscript, readTranscriptByPath } =
      require("./local-logs") as typeof import("./local-logs");

    let transcript: ParsedTranscript | null = null;

    // Resolve transcript
    if (body.transcript_id) {
      transcript = await readTranscript(body.transcript_id);
    } else if (body.transcript_path && body.agent) {
      transcript = await readTranscriptByPath(body.transcript_path, body.agent);
    }

    if (!transcript) {
      return c.json({ error: "Transcript not found" }, 404);
    }

    // Analyze privacy risks
    const filesRead: string[] = [];
    const filesWritten: string[] = [];
    const filesEdited: string[] = [];
    const domains: string[] = [];
    const sensitivePatterns: Array<{ path: string; reason: string }> = [];

    // Sensitive file patterns
    const SENSITIVE_PATTERNS = [
      {
        pattern: /\.env($|\.)/,
        reason: "Environment file (may contain secrets)"
      },
      { pattern: /\.pem$/, reason: "PEM certificate/key file" },
      { pattern: /\.key$/, reason: "Key file" },
      { pattern: /id_rsa|id_ed25519|id_ecdsa/, reason: "SSH private key" },
      { pattern: /\.ssh\//, reason: "SSH directory" },
      { pattern: /credentials/, reason: "Credentials file" },
      { pattern: /secrets?[/.]/, reason: "Secrets file/directory" },
      { pattern: /password/, reason: "Password file" },
      { pattern: /\.aws\//, reason: "AWS configuration" },
      { pattern: /\.docker\/config\.json/, reason: "Docker credentials" },
      { pattern: /\.npmrc/, reason: "NPM config (may contain tokens)" },
      { pattern: /\.pypirc/, reason: "PyPI config (may contain tokens)" },
      { pattern: /\.netrc/, reason: "Netrc file (may contain passwords)" },
      { pattern: /config\.json$/, reason: "Config file (review for secrets)" }
    ];

    for (const msg of transcript.messages) {
      // Check tool uses
      if (msg.toolName === "Read" && msg.toolInput?.file_path) {
        const path = String(msg.toolInput.file_path);
        filesRead.push(path);

        // Check for sensitive patterns
        for (const { pattern, reason } of SENSITIVE_PATTERNS) {
          if (pattern.test(path)) {
            sensitivePatterns.push({ path, reason });
            break;
          }
        }
      }

      if (msg.toolName === "Write" && msg.toolInput?.file_path) {
        filesWritten.push(String(msg.toolInput.file_path));
      }

      if (msg.toolName === "Edit" && msg.toolInput?.file_path) {
        filesEdited.push(String(msg.toolInput.file_path));
      }

      if (msg.toolName === "WebFetch" && msg.toolInput?.url) {
        try {
          const url = new URL(String(msg.toolInput.url));
          if (!domains.includes(url.hostname)) {
            domains.push(url.hostname);
          }
        } catch {
          /* invalid URL */
        }
      }
    }

    // Deduplicate
    const uniqueFilesRead = [...new Set(filesRead)];
    const uniqueFilesWritten = [...new Set(filesWritten)];
    const uniqueFilesEdited = [...new Set(filesEdited)];

    // Risk level assessment
    let riskLevel: "low" | "medium" | "high" = "low";
    if (sensitivePatterns.length > 0) {
      riskLevel = "high";
    } else if (uniqueFilesRead.length > 20 || domains.length > 5) {
      riskLevel = "medium";
    }

    return c.json({
      transcript_id: transcript.id,
      risk_level: riskLevel,
      summary: {
        files_read: uniqueFilesRead.length,
        files_written: uniqueFilesWritten.length,
        files_edited: uniqueFilesEdited.length,
        domains_accessed: domains.length,
        sensitive_files: sensitivePatterns.length,
        total_messages: transcript.messages.length
      },
      files_read: uniqueFilesRead,
      files_written: uniqueFilesWritten,
      files_edited: uniqueFilesEdited,
      domains_accessed: domains,
      sensitive_files: sensitivePatterns,
      recommendations:
        sensitivePatterns.length > 0
          ? [
              "Use 'Tool Usage Patterns' profile (shares no file contents)",
              "Manually review files listed above before sharing 'Full Transcript'"
            ]
          : []
    });
  });

  /**
   * GET /api/transcripts/stats - Aggregate statistics across all local transcripts
   *
   * Provides an overview of what data exists in the user's transcripts:
   * - Total count and size
   * - File operations summary
   * - Sensitive file detection
   * - Per-project breakdown
   *
   * NOTE: This is a work-in-progress. A comprehensive "contribution flow"
   * document is needed to fully specify the data review/audit experience.
   */
  app.get("/api/transcripts/stats", async (c) => {
    const { discoverLocalTranscripts, readTranscript } =
      require("./local-logs") as typeof import("./local-logs");

    // Scan all transcripts
    const transcripts = await discoverLocalTranscripts();

    // Aggregate stats
    let totalSizeBytes = 0;
    let totalFileReads = 0;
    let totalFileWrites = 0;
    let totalFileEdits = 0;
    const sensitiveFiles: Map<
      string,
      { count: number; sessions: string[]; reason: string }
    > = new Map();
    const projectStats: Map<
      string,
      { transcripts: number; sizeBytes: number; fileReads: number }
    > = new Map();
    const fileReadCounts: Map<string, number> = new Map();

    // Sensitive patterns (same as privacy-risk endpoint)
    const SENSITIVE_PATTERNS = [
      { pattern: /\.env($|\.)/, reason: "Environment file" },
      { pattern: /\.pem$/, reason: "PEM key file" },
      { pattern: /\.key$/, reason: "Key file" },
      { pattern: /id_rsa|id_ed25519|id_ecdsa/, reason: "SSH private key" },
      { pattern: /\.ssh\//, reason: "SSH directory" },
      { pattern: /credentials/i, reason: "Credentials file" },
      { pattern: /secrets?[/.]/, reason: "Secrets file" },
      { pattern: /password/i, reason: "Password file" },
      { pattern: /\.aws\//, reason: "AWS config" },
      { pattern: /\.npmrc$/, reason: "NPM config" },
      { pattern: /\.netrc$/, reason: "Netrc file" }
    ];

    // Process each transcript (limit to avoid timeout)
    const maxToProcess = 500;
    const toProcess = transcripts.slice(0, maxToProcess);

    for (const t of toProcess) {
      totalSizeBytes += t.sizeBytes;

      // Extract project name from path
      const projectMatch = t.projectDir?.match(/([^/]+)$/);
      const projectName = projectMatch?.[1] || "unknown";

      // Update project stats
      const ps = projectStats.get(projectName) || {
        transcripts: 0,
        sizeBytes: 0,
        fileReads: 0
      };
      ps.transcripts++;
      ps.sizeBytes += t.sizeBytes;
      projectStats.set(projectName, ps);

      // Read and analyze transcript
      try {
        const parsed = await readTranscript(t.id);
        if (!parsed) continue;

        for (const msg of parsed.messages) {
          if (msg.toolName === "Read" && msg.toolInput?.file_path) {
            const path = String(msg.toolInput.file_path);
            totalFileReads++;
            ps.fileReads++;
            fileReadCounts.set(path, (fileReadCounts.get(path) || 0) + 1);

            // Check for sensitive patterns
            for (const { pattern, reason } of SENSITIVE_PATTERNS) {
              if (pattern.test(path)) {
                const existing = sensitiveFiles.get(path) || {
                  count: 0,
                  sessions: [],
                  reason
                };
                existing.count++;
                if (!existing.sessions.includes(t.id)) {
                  existing.sessions.push(t.id);
                }
                sensitiveFiles.set(path, existing);
                break;
              }
            }
          }

          if (msg.toolName === "Write") totalFileWrites++;
          if (msg.toolName === "Edit") totalFileEdits++;
        }
      } catch {
        // Skip unparseable transcripts
      }
    }

    // Sort and limit results
    const topFiles = [...fileReadCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([path, count]) => ({ path, count }));

    const sensitiveFilesList = [...sensitiveFiles.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([path, data]) => ({
        path,
        count: data.count,
        sessions: data.sessions.slice(0, 5), // Limit session list
        session_count: data.sessions.length,
        reason: data.reason
      }));

    const byProject = [...projectStats.entries()]
      .sort((a, b) => b[1].sizeBytes - a[1].sizeBytes)
      .slice(0, 20)
      .map(([name, stats]) => ({ name, ...stats }));

    return c.json({
      _note:
        "Work in progress - comprehensive contribution flow documentation needed",
      total_transcripts: transcripts.length,
      processed_transcripts: toProcess.length,
      total_size_bytes: totalSizeBytes,
      total_size_mb: Math.round(totalSizeBytes / 1024 / 1024),
      summary: {
        file_reads: totalFileReads,
        file_writes: totalFileWrites,
        file_edits: totalFileEdits
      },
      sensitive_files: sensitiveFilesList,
      sensitive_file_count: sensitiveFilesList.length,
      top_files_read: topFiles,
      by_project: byProject
    });
  });

  // ==========================================================================
  // Analytics Endpoints
  // ==========================================================================

  /**
   * GET /api/analytics/dashboard - Dashboard summary stats
   *
   * Includes both hook sessions AND local transcripts.
   */
  app.get("/api/analytics/dashboard", async (c) => {
    const state = getState();
    const days = Number.parseInt(c.req.query("days") || "7", 10);

    const { getAllEnrichments, getEnrichmentStats } =
      require("./enrichment-store") as typeof import("./enrichment-store");
    const { discoverLocalTranscripts, readTranscriptByPath } =
      require("./local-logs") as typeof import("./local-logs");

    const cutoff = Date.now() - days * 86400 * 1000;
    const allEnrichments = getAllEnrichments();
    const enrichmentStats = getEnrichmentStats();

    // Compute summary from BOTH hook sessions and local transcripts
    let totalSessions = 0;
    let totalCostUsd = 0;
    let totalDurationMs = 0;
    let sessionsWithDuration = 0;
    let successCount = 0;
    let failureCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // 1. Process hook sessions
    const hookSessions = state.hookStore.getAllSessions(1000);
    const recentHookSessions = hookSessions.filter((s) => s.startTime > cutoff);

    for (const session of recentHookSessions) {
      totalSessions++;
      totalCostUsd += session.estimatedCostUsd || 0;
      totalInputTokens += session.totalInputTokens ?? 0;
      totalOutputTokens += session.totalOutputTokens ?? 0;
      if (session.endTime) {
        totalDurationMs += session.endTime - session.startTime;
        sessionsWithDuration++;
      }

      const enrichment = allEnrichments[`hook:${session.sessionId}`];
      if (enrichment?.qualityScore) {
        if (enrichment.qualityScore.overall >= 60) {
          successCount++;
        } else if (enrichment.qualityScore.overall < 40) {
          failureCount++;
        }
      }
    }

    // 2. Process local transcripts (that aren't already counted as hook sessions)
    const hookSessionPaths = new Set(
      recentHookSessions.map((s) => s.transcriptPath).filter(Boolean)
    );
    const localTranscripts = await discoverLocalTranscripts();
    const recentTranscripts = localTranscripts.filter(
      (t) => t.modifiedAt >= cutoff
    );
    const transcriptOnly = recentTranscripts.filter(
      (t) => !hookSessionPaths.has(t.path)
    );

    for (const transcript of transcriptOnly) {
      totalSessions++;

      const parsed = await readTranscriptByPath(
        transcript.agent,
        transcript.path
      );
      if (parsed) {
        totalCostUsd += parsed.estimatedCostUsd || 0;
        totalInputTokens += parsed.totalInputTokens || 0;
        totalOutputTokens += parsed.totalOutputTokens || 0;
      }

      // Check for enrichments
      const enrichment = allEnrichments[`transcript:${transcript.id}`];
      if (enrichment?.qualityScore) {
        if (enrichment.qualityScore.overall >= 60) {
          successCount++;
        } else if (enrichment.qualityScore.overall < 40) {
          failureCount++;
        }
      }
    }

    const avgDurationMs =
      sessionsWithDuration > 0 ? totalDurationMs / sessionsWithDuration : 0;
    const successRate =
      totalSessions > 0 ? (successCount / totalSessions) * 100 : 0;

    return c.json({
      time_range: {
        start: new Date(cutoff).toISOString(),
        end: new Date().toISOString(),
        days
      },
      summary: {
        total_sessions: totalSessions,
        success_rate: Math.round(successRate * 10) / 10,
        total_cost_usd: Math.round(totalCostUsd * 100) / 100,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        avg_duration_ms: Math.round(avgDurationMs)
      },
      enrichment_stats: enrichmentStats,
      sources: {
        hook_sessions: recentHookSessions.length,
        local_transcripts: transcriptOnly.length
      }
    });
  });

  /**
   * GET /api/analytics/success-trend - Success rate over time
   *
   * Includes both hook sessions AND local transcripts.
   */
  app.get("/api/analytics/success-trend", async (c) => {
    const state = getState();
    const days = Number.parseInt(c.req.query("days") || "30", 10);

    const { getAllEnrichments } =
      require("./enrichment-store") as typeof import("./enrichment-store");
    const { discoverLocalTranscripts, readTranscriptByPath } =
      require("./local-logs") as typeof import("./local-logs");

    const cutoff = Date.now() - days * 86400 * 1000;
    const allEnrichments = getAllEnrichments();

    // Group by date
    const byDate = new Map<
      string,
      { success: number; failure: number; total: number }
    >();

    // 1. Process hook sessions
    const hookSessions = state.hookStore.getAllSessions(1000);
    const recentHookSessions = hookSessions.filter((s) => s.startTime > cutoff);
    const hookSessionPaths = new Set(
      recentHookSessions.map((s) => s.transcriptPath).filter(Boolean)
    );

    for (const session of recentHookSessions) {
      const date = new Date(session.startTime).toISOString().slice(0, 10);
      const stats = byDate.get(date) || { success: 0, failure: 0, total: 0 };

      stats.total++;

      const enrichment = allEnrichments[`hook:${session.sessionId}`];
      if (enrichment?.qualityScore) {
        if (enrichment.qualityScore.overall >= 60) {
          stats.success++;
        } else if (enrichment.qualityScore.overall < 40) {
          stats.failure++;
        }
      }

      byDate.set(date, stats);
    }

    // 2. Process local transcripts
    const localTranscripts = await discoverLocalTranscripts();
    const recentTranscripts = localTranscripts.filter(
      (t) => t.modifiedAt >= cutoff
    );

    for (const transcript of recentTranscripts) {
      if (hookSessionPaths.has(transcript.path)) continue;

      const date = new Date(transcript.modifiedAt).toISOString().slice(0, 10);
      const stats = byDate.get(date) || { success: 0, failure: 0, total: 0 };

      stats.total++;

      const enrichment = allEnrichments[`transcript:${transcript.id}`];
      if (enrichment?.qualityScore) {
        if (enrichment.qualityScore.overall >= 60) {
          stats.success++;
        } else if (enrichment.qualityScore.overall < 40) {
          stats.failure++;
        }
      }

      byDate.set(date, stats);
    }

    // Convert to array sorted by date
    const trend = Array.from(byDate.entries())
      .map(([date, stats]) => ({
        date,
        success_count: stats.success,
        failure_count: stats.failure,
        total: stats.total,
        rate:
          stats.total > 0
            ? Math.round((stats.success / stats.total) * 1000) / 10
            : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return c.json({ days, trend });
  });

  /**
   * GET /api/analytics/cost-by-type - Cost breakdown by task type
   *
   * Includes both hook sessions AND local transcripts.
   * Note: Cost data is estimated from token usage; transcripts only contribute when usage is available.
   */
  app.get("/api/analytics/cost-by-type", async (c) => {
    const state = getState();
    const days = Number.parseInt(c.req.query("days") || "30", 10);

    const { getAllEnrichments } =
      require("./enrichment-store") as typeof import("./enrichment-store");
    const { discoverLocalTranscripts, readTranscriptByPath } =
      require("./local-logs") as typeof import("./local-logs");

    const cutoff = Date.now() - days * 86400 * 1000;
    const allEnrichments = getAllEnrichments();

    // Group by task type
    const byType = new Map<
      string,
      { cost: number; count: number; inputTokens: number; outputTokens: number }
    >();

    // 1. Process hook sessions
    const hookSessions = state.hookStore.getAllSessions(1000);
    const recentHookSessions = hookSessions.filter((s) => s.startTime > cutoff);
    const hookSessionPaths = new Set(
      recentHookSessions.map((s) => s.transcriptPath).filter(Boolean)
    );

    for (const session of recentHookSessions) {
      const enrichment = allEnrichments[`hook:${session.sessionId}`];
      const taskType = enrichment?.autoTags?.taskType || "unknown";

      const stats = byType.get(taskType) || {
        cost: 0,
        count: 0,
        inputTokens: 0,
        outputTokens: 0
      };
      stats.cost += session.estimatedCostUsd || 0;
      stats.count++;
      stats.inputTokens += session.totalInputTokens ?? 0;
      stats.outputTokens += session.totalOutputTokens ?? 0;
      byType.set(taskType, stats);
    }

    // 2. Process local transcripts
    const localTranscripts = await discoverLocalTranscripts();
    const recentTranscripts = localTranscripts.filter(
      (t) => t.modifiedAt >= cutoff
    );

    for (const transcript of recentTranscripts) {
      if (hookSessionPaths.has(transcript.path)) continue;

      const enrichment = allEnrichments[`transcript:${transcript.id}`];
      const taskType = enrichment?.autoTags?.taskType || "unknown";

      const stats = byType.get(taskType) || {
        cost: 0,
        count: 0,
        inputTokens: 0,
        outputTokens: 0
      };
      const parsed = await readTranscriptByPath(
        transcript.agent,
        transcript.path
      );
      if (parsed) {
        stats.cost += parsed.estimatedCostUsd || 0;
        stats.inputTokens += parsed.totalInputTokens || 0;
        stats.outputTokens += parsed.totalOutputTokens || 0;
      }
      stats.count++;
      byType.set(taskType, stats);
    }

    const breakdown = Array.from(byType.entries())
      .map(([taskType, stats]) => ({
        task_type: taskType,
        total_cost_usd: Math.round(stats.cost * 100) / 100,
        total_input_tokens: stats.inputTokens,
        total_output_tokens: stats.outputTokens,
        session_count: stats.count,
        avg_cost_usd:
          stats.count > 0
            ? Math.round((stats.cost / stats.count) * 100) / 100
            : 0
      }))
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

    return c.json({ days, breakdown });
  });

  /**
   * GET /api/analytics/tool-retries - Tool retry patterns
   */
  app.get("/api/analytics/tool-retries", (c) => {
    const state = getState();
    const days = Number.parseInt(c.req.query("days") || "30", 10);

    const sessions = state.hookStore.getAllSessions(500);
    const cutoff = Date.now() - days * 86400 * 1000;
    const recentSessions = sessions.filter((s) => s.startTime > cutoff);

    // Analyze tool failures
    const byTool = new Map<
      string,
      { total: number; failures: number; errors: string[] }
    >();

    for (const session of recentSessions) {
      const toolUsages = state.hookStore.getSessionToolUsages(
        session.sessionId
      );

      for (const usage of toolUsages) {
        const stats = byTool.get(usage.toolName) || {
          total: 0,
          failures: 0,
          errors: []
        };
        stats.total++;

        if (usage.success === false) {
          stats.failures++;
          if (usage.error && stats.errors.length < 5) {
            const shortError = usage.error.slice(0, 50);
            if (!stats.errors.includes(shortError)) {
              stats.errors.push(shortError);
            }
          }
        }

        byTool.set(usage.toolName, stats);
      }
    }

    const patterns = Array.from(byTool.entries())
      .map(([toolName, stats]) => ({
        tool_name: toolName,
        total_calls: stats.total,
        failures: stats.failures,
        failure_rate:
          stats.total > 0
            ? Math.round((stats.failures / stats.total) * 1000) / 10
            : 0,
        common_errors: stats.errors
      }))
      .filter((p) => p.failures > 0)
      .sort((a, b) => b.failure_rate - a.failure_rate);

    return c.json({ days, patterns });
  });

  /**
   * GET /api/analytics/quality-distribution - Quality score distribution
   */
  app.get("/api/analytics/quality-distribution", (c) => {
    const days = Number.parseInt(c.req.query("days") || "30", 10);

    const { getAllEnrichments } =
      require("./enrichment-store") as typeof import("./enrichment-store");
    const allEnrichments = getAllEnrichments();

    const cutoff = Date.now() - days * 86400 * 1000;

    // Define buckets
    const buckets = [
      { range: "0-25", min: 0, max: 25, count: 0 },
      { range: "25-50", min: 25, max: 50, count: 0 },
      { range: "50-75", min: 50, max: 75, count: 0 },
      { range: "75-100", min: 75, max: 100, count: 0 }
    ];

    let total = 0;
    const scores: number[] = [];

    for (const enrichment of Object.values(allEnrichments)) {
      if (!enrichment.qualityScore) continue;

      // Note: We don't have timestamp on enrichment, so include all for now
      const score = enrichment.qualityScore.overall;
      scores.push(score);
      total++;

      for (const bucket of buckets) {
        if (score >= bucket.min && score < bucket.max) {
          bucket.count++;
          break;
        }
        if (score >= 100 && bucket.max === 100) {
          bucket.count++;
          break;
        }
      }
    }

    // Calculate percentages
    const distribution = buckets.map((b) => ({
      range: b.range,
      min: b.min,
      max: b.max,
      count: b.count,
      percentage: total > 0 ? Math.round((b.count / total) * 1000) / 10 : 0
    }));

    // Calculate percentiles
    scores.sort((a, b) => a - b);
    const percentiles = {
      p25: scores[Math.floor(scores.length * 0.25)] || 0,
      p50: scores[Math.floor(scores.length * 0.5)] || 0,
      p75: scores[Math.floor(scores.length * 0.75)] || 0,
      p90: scores[Math.floor(scores.length * 0.9)] || 0
    };

    return c.json({
      days,
      total_scored: total,
      distribution,
      percentiles
    });
  });

  /**
   * GET /api/analytics/loops - Loop detection summary
   */
  app.get("/api/analytics/loops", (c) => {
    const days = Number.parseInt(c.req.query("days") || "30", 10);

    const { getAllEnrichments } =
      require("./enrichment-store") as typeof import("./enrichment-store");
    const allEnrichments = getAllEnrichments();

    let sessionsWithLoops = 0;
    let totalLoops = 0;
    let totalRetries = 0;
    const patternTypes = new Map<string, number>();

    for (const enrichment of Object.values(allEnrichments)) {
      if (!enrichment.loopDetection?.loopsDetected) continue;

      sessionsWithLoops++;
      totalLoops += enrichment.loopDetection.patterns.length;
      totalRetries += enrichment.loopDetection.totalRetries;

      for (const pattern of enrichment.loopDetection.patterns) {
        const count = patternTypes.get(pattern.patternType) || 0;
        patternTypes.set(pattern.patternType, count + 1);
      }
    }

    return c.json({
      days,
      sessions_with_loops: sessionsWithLoops,
      total_loops: totalLoops,
      total_retries: totalRetries,
      by_pattern_type: Object.fromEntries(patternTypes)
    });
  });

  /**
   * GET /api/analytics/combined - All analytics in one request
   *
   * Reduces 9 separate API calls to 1, fetching shared data once.
   * Returns dashboard, success_trend, cost_by_type, tool_retries,
   * quality_distribution, and loops in a single response.
   */
  app.get("/api/analytics/combined", async (c) => {
    const state = getState();
    const days = Number.parseInt(c.req.query("days") || "30", 10);

    const { getAllEnrichments, getEnrichmentStats } =
      require("./enrichment-store") as typeof import("./enrichment-store");
    const { discoverLocalTranscripts, readTranscriptByPath } =
      require("./local-logs") as typeof import("./local-logs");

    const cutoff = Date.now() - days * 86400 * 1000;

    // Fetch all shared data once
    const allEnrichments = getAllEnrichments();
    const enrichmentStats = getEnrichmentStats();
    const hookSessions = state.hookStore.getAllSessions(1000);
    const recentHookSessions = hookSessions.filter((s) => s.startTime > cutoff);
    const hookSessionPaths = new Set(
      recentHookSessions.map((s) => s.transcriptPath).filter(Boolean)
    );

    const localTranscripts = await discoverLocalTranscripts();
    const recentTranscripts = localTranscripts.filter(
      (t) => t.modifiedAt >= cutoff
    );
    const transcriptOnly = recentTranscripts.filter(
      (t) => !hookSessionPaths.has(t.path)
    );

    // Parse transcripts once (needed for cost calculations)
    const parsedTranscripts = new Map<
      string,
      { cost: number; input: number; output: number }
    >();
    for (const transcript of transcriptOnly) {
      const parsed = await readTranscriptByPath(
        transcript.agent,
        transcript.path
      );
      if (parsed) {
        parsedTranscripts.set(transcript.id, {
          cost: parsed.estimatedCostUsd || 0,
          input: parsed.totalInputTokens || 0,
          output: parsed.totalOutputTokens || 0
        });
      }
    }

    // ========== Dashboard ==========
    let totalSessions = 0;
    let totalCostUsd = 0;
    let totalDurationMs = 0;
    let sessionsWithDuration = 0;
    let successCount = 0;
    let failureCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const session of recentHookSessions) {
      totalSessions++;
      totalCostUsd += session.estimatedCostUsd || 0;
      totalInputTokens += session.totalInputTokens ?? 0;
      totalOutputTokens += session.totalOutputTokens ?? 0;
      if (session.endTime) {
        totalDurationMs += session.endTime - session.startTime;
        sessionsWithDuration++;
      }
      const enrichment = allEnrichments[`hook:${session.sessionId}`];
      if (enrichment?.qualityScore) {
        if (enrichment.qualityScore.overall >= 60) successCount++;
        else if (enrichment.qualityScore.overall < 40) failureCount++;
      }
    }

    for (const transcript of transcriptOnly) {
      totalSessions++;
      const parsed = parsedTranscripts.get(transcript.id);
      if (parsed) {
        totalCostUsd += parsed.cost;
        totalInputTokens += parsed.input;
        totalOutputTokens += parsed.output;
      }
      const enrichment = allEnrichments[`transcript:${transcript.id}`];
      if (enrichment?.qualityScore) {
        if (enrichment.qualityScore.overall >= 60) successCount++;
        else if (enrichment.qualityScore.overall < 40) failureCount++;
      }
    }

    const avgDurationMs =
      sessionsWithDuration > 0 ? totalDurationMs / sessionsWithDuration : 0;
    const successRate =
      totalSessions > 0 ? (successCount / totalSessions) * 100 : 0;

    const dashboard = {
      time_range: {
        start: new Date(cutoff).toISOString(),
        end: new Date().toISOString(),
        days
      },
      summary: {
        total_sessions: totalSessions,
        success_rate: Math.round(successRate * 10) / 10,
        total_cost_usd: Math.round(totalCostUsd * 100) / 100,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        avg_duration_ms: Math.round(avgDurationMs)
      },
      enrichment_stats: enrichmentStats,
      sources: {
        hook_sessions: recentHookSessions.length,
        local_transcripts: transcriptOnly.length
      }
    };

    // ========== Success Trend ==========
    const trendByDate = new Map<
      string,
      { success: number; failure: number; total: number }
    >();

    for (const session of recentHookSessions) {
      const date = new Date(session.startTime).toISOString().slice(0, 10);
      const stats = trendByDate.get(date) || {
        success: 0,
        failure: 0,
        total: 0
      };
      stats.total++;
      const enrichment = allEnrichments[`hook:${session.sessionId}`];
      if (enrichment?.qualityScore) {
        if (enrichment.qualityScore.overall >= 60) stats.success++;
        else if (enrichment.qualityScore.overall < 40) stats.failure++;
      }
      trendByDate.set(date, stats);
    }

    for (const transcript of transcriptOnly) {
      const date = new Date(transcript.modifiedAt).toISOString().slice(0, 10);
      const stats = trendByDate.get(date) || {
        success: 0,
        failure: 0,
        total: 0
      };
      stats.total++;
      const enrichment = allEnrichments[`transcript:${transcript.id}`];
      if (enrichment?.qualityScore) {
        if (enrichment.qualityScore.overall >= 60) stats.success++;
        else if (enrichment.qualityScore.overall < 40) stats.failure++;
      }
      trendByDate.set(date, stats);
    }

    const success_trend = Array.from(trendByDate.entries())
      .map(([date, stats]) => ({
        date,
        success_count: stats.success,
        failure_count: stats.failure,
        total: stats.total,
        rate:
          stats.total > 0
            ? Math.round((stats.success / stats.total) * 1000) / 10
            : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ========== Cost By Type ==========
    const costByType = new Map<
      string,
      { cost: number; count: number; inputTokens: number; outputTokens: number }
    >();

    for (const session of recentHookSessions) {
      const enrichment = allEnrichments[`hook:${session.sessionId}`];
      const taskType = enrichment?.autoTags?.taskType || "unknown";
      const stats = costByType.get(taskType) || {
        cost: 0,
        count: 0,
        inputTokens: 0,
        outputTokens: 0
      };
      stats.cost += session.estimatedCostUsd || 0;
      stats.count++;
      stats.inputTokens += session.totalInputTokens ?? 0;
      stats.outputTokens += session.totalOutputTokens ?? 0;
      costByType.set(taskType, stats);
    }

    for (const transcript of transcriptOnly) {
      const enrichment = allEnrichments[`transcript:${transcript.id}`];
      const taskType = enrichment?.autoTags?.taskType || "unknown";
      const stats = costByType.get(taskType) || {
        cost: 0,
        count: 0,
        inputTokens: 0,
        outputTokens: 0
      };
      const parsed = parsedTranscripts.get(transcript.id);
      if (parsed) {
        stats.cost += parsed.cost;
        stats.inputTokens += parsed.input;
        stats.outputTokens += parsed.output;
      }
      stats.count++;
      costByType.set(taskType, stats);
    }

    const cost_by_type = Array.from(costByType.entries())
      .map(([taskType, stats]) => ({
        task_type: taskType,
        total_cost_usd: Math.round(stats.cost * 100) / 100,
        total_input_tokens: stats.inputTokens,
        total_output_tokens: stats.outputTokens,
        session_count: stats.count,
        avg_cost_usd:
          stats.count > 0
            ? Math.round((stats.cost / stats.count) * 100) / 100
            : 0
      }))
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

    // ========== Tool Retries ==========
    const toolByName = new Map<
      string,
      { total: number; failures: number; errors: string[] }
    >();

    for (const session of recentHookSessions) {
      const toolUsages = state.hookStore.getSessionToolUsages(
        session.sessionId
      );
      for (const usage of toolUsages) {
        const stats = toolByName.get(usage.toolName) || {
          total: 0,
          failures: 0,
          errors: []
        };
        stats.total++;
        if (usage.success === false) {
          stats.failures++;
          if (usage.error && stats.errors.length < 5) {
            const shortError = usage.error.slice(0, 50);
            if (!stats.errors.includes(shortError)) {
              stats.errors.push(shortError);
            }
          }
        }
        toolByName.set(usage.toolName, stats);
      }
    }

    const tool_retries = Array.from(toolByName.entries())
      .map(([toolName, stats]) => ({
        tool_name: toolName,
        total_calls: stats.total,
        failures: stats.failures,
        failure_rate:
          stats.total > 0
            ? Math.round((stats.failures / stats.total) * 1000) / 10
            : 0,
        common_errors: stats.errors
      }))
      .filter((p) => p.failures > 0)
      .sort((a, b) => b.failure_rate - a.failure_rate);

    // ========== Quality Distribution ==========
    const buckets = [
      { range: "0-25", min: 0, max: 25, count: 0 },
      { range: "25-50", min: 25, max: 50, count: 0 },
      { range: "50-75", min: 50, max: 75, count: 0 },
      { range: "75-100", min: 75, max: 100, count: 0 }
    ];
    let qualityTotal = 0;
    const scores: number[] = [];

    for (const enrichment of Object.values(allEnrichments)) {
      if (!enrichment.qualityScore) continue;
      const score = enrichment.qualityScore.overall;
      scores.push(score);
      qualityTotal++;
      for (const bucket of buckets) {
        if (score >= bucket.min && score < bucket.max) {
          bucket.count++;
          break;
        }
        if (score >= 100 && bucket.max === 100) {
          bucket.count++;
          break;
        }
      }
    }

    scores.sort((a, b) => a - b);
    const quality_distribution = {
      total_scored: qualityTotal,
      distribution: buckets.map((b) => ({
        range: b.range,
        min: b.min,
        max: b.max,
        count: b.count,
        percentage:
          qualityTotal > 0 ? Math.round((b.count / qualityTotal) * 1000) / 10 : 0
      })),
      percentiles: {
        p25: scores[Math.floor(scores.length * 0.25)] || 0,
        p50: scores[Math.floor(scores.length * 0.5)] || 0,
        p75: scores[Math.floor(scores.length * 0.75)] || 0,
        p90: scores[Math.floor(scores.length * 0.9)] || 0
      }
    };

    // ========== Loops ==========
    let sessionsWithLoops = 0;
    let totalLoops = 0;
    let totalRetries = 0;
    const patternTypes = new Map<string, number>();

    for (const enrichment of Object.values(allEnrichments)) {
      if (!enrichment.loopDetection?.loopsDetected) continue;
      sessionsWithLoops++;
      totalLoops += enrichment.loopDetection.patterns.length;
      totalRetries += enrichment.loopDetection.totalRetries;
      for (const pattern of enrichment.loopDetection.patterns) {
        const count = patternTypes.get(pattern.patternType) || 0;
        patternTypes.set(pattern.patternType, count + 1);
      }
    }

    const loops = {
      sessions_with_loops: sessionsWithLoops,
      total_loops: totalLoops,
      total_retries: totalRetries,
      by_pattern_type: Object.fromEntries(patternTypes)
    };

    // Return combined response
    return c.json({
      days,
      dashboard,
      success_trend,
      cost_by_type,
      tool_retries,
      quality_distribution,
      loops
    });
  });
}
