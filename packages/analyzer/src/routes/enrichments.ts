/**
 * Enrichment and annotation routes.
 *
 * Provides endpoints for:
 * - Session enrichments (quality scores, auto-tags)
 * - Manual annotations (thumbs up/down, notes)
 * - Privacy risk analysis
 * - User tags
 *
 * @module routes/enrichments
 */

import type { Hono } from "hono";
import type { WorkflowStatus } from "@agentwatch/core";
import {
  getAllEnrichments,
  getEnrichments,
  getEnrichmentStats,
  setManualAnnotation as setEnrichmentAnnotation,
  updateUserTags,
  bulkGetEnrichments,
  deleteEnrichments
} from "../enrichment-store";
import {
  getAllAnnotations,
  getAnnotation,
  setAnnotation,
  deleteAnnotation
} from "../annotations";
import { readTranscript } from "../local-logs";

/**
 * Register enrichment routes.
 *
 * @param app - The Hono app instance
 */
export function registerEnrichmentRoutes(app: Hono): void {
  /**
   * GET /api/enrichments
   *
   * List all enrichments with stats.
   *
   * @returns { sessions: Array, stats: object }
   */
  app.get("/api/enrichments", async (c) => {
    try {
      const enrichments = getAllEnrichments();
      const stats = getEnrichmentStats();

      // Convert to EnrichmentListItem format for API
      const sessions = Object.entries(enrichments).map(([id, e]) => {
        // Parse the ID to extract session_ref components
        const sessionRef = e.sessionRef || {};
        return {
          id,
          session_ref: {
            correlationId: sessionRef.correlationId,
            hookSessionId: sessionRef.hookSessionId,
            transcriptId: sessionRef.transcriptId
          },
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
        };
      });

      return c.json({
        sessions,
        stats: {
          total: stats.totalSessions,
          with_quality_score:
            stats.qualityDistribution.excellent +
            stats.qualityDistribution.good +
            stats.qualityDistribution.fair +
            stats.qualityDistribution.poor,
          with_annotations: stats.annotated.positive + stats.annotated.negative,
          with_auto_tags: stats.byType.autoTags,
          annotated: {
            positive: stats.annotated.positive,
            negative: stats.annotated.negative
          }
        }
      });
    } catch {
      return c.json({
        sessions: [],
        stats: {
          total: 0,
          with_quality_score: 0,
          with_annotations: 0,
          with_auto_tags: 0,
          annotated: { positive: 0, negative: 0 }
        }
      });
    }
  });

  /**
   * GET /api/enrichments/workflow-stats
   *
   * Get workflow statistics for review status.
   *
   * @returns Workflow stats (total, reviewed, pending, etc.)
   */
  app.get("/api/enrichments/workflow-stats", async (c) => {
    try {
      const stats = getEnrichmentStats();
      const withAnnotations =
        stats.annotated.positive + stats.annotated.negative;
      return c.json({
        total: stats.totalSessions,
        reviewed: withAnnotations,
        ready_to_contribute: stats.annotated.positive,
        skipped: 0,
        pending: stats.totalSessions - withAnnotations
      });
    } catch {
      return c.json({
        total: 0,
        reviewed: 0,
        ready_to_contribute: 0,
        skipped: 0,
        pending: 0
      });
    }
  });

  /**
   * GET /api/enrichments/:sessionId
   *
   * Get enrichment for a specific session.
   *
   * @param sessionId - Session/transcript ID
   * @returns Enrichment data or 404
   */
  app.get("/api/enrichments/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const enrichment = getEnrichments({ transcriptId: sessionId });

      if (!enrichment) {
        return c.json({ error: "Enrichment not found" }, 404);
      }

      return c.json({
        session_id: sessionId,
        ...enrichment
      });
    } catch {
      return c.json({ error: "Enrichment not found" }, 404);
    }
  });

  /**
   * POST /api/enrichments/:sessionId/annotation
   *
   * Set manual annotation (thumbs up/down) for a session.
   *
   * @param sessionId - Session ID
   * @body thumbs - "positive" or "negative"
   * @body rating - Number 1-5 (converted to positive/negative)
   * @body notes - Optional notes
   * @returns { status: "ok" }
   */
  app.post("/api/enrichments/:sessionId/annotation", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        feedback?: "positive" | "negative" | null;
        thumbs?: "positive" | "negative" | null;
        rating?: number;
        notes?: string;
        user_tags?: string[];
        userTags?: string[];
        task_description?: string;
        taskDescription?: string;
        goal_achieved?: boolean;
        goalAchieved?: boolean;
        workflow_status?: string;
        workflowStatus?: string;
        extra_data?: Record<string, unknown>;
        extraData?: Record<string, unknown>;
      };

      const feedback =
        body.feedback ??
        body.thumbs ??
        (typeof body.rating === "number"
          ? body.rating >= 4
            ? "positive"
            : body.rating <= 2
              ? "negative"
              : null
          : null);

      const enrichment = setEnrichmentAnnotation(
        { transcriptId: sessionId },
        feedback,
        {
          notes: body.notes,
          userTags: body.user_tags ?? body.userTags,
          rating: body.rating,
          taskDescription: body.task_description ?? body.taskDescription,
          goalAchieved: body.goal_achieved ?? body.goalAchieved,
          workflowStatus: (body.workflow_status ??
            body.workflowStatus) as WorkflowStatus,
          extraData: body.extra_data ?? body.extraData
        }
      );

      return c.json({
        success: true,
        session_ref: enrichment.sessionRef,
        manual_annotation: enrichment.manualAnnotation ?? null
      });
    } catch {
      return c.json({ error: "Failed to save annotation" }, 500);
    }
  });

  /**
   * POST /api/enrichments/:sessionId/tags
   *
   * Update user-defined tags for a session.
   *
   * @param sessionId - Session ID
   * @body tags - Array of tag strings
   * @returns { success: boolean, tags: string[] }
   */
  app.post("/api/enrichments/:sessionId/tags", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        tags?: string[];
      };
      const tags = body.tags || [];

      const enrichment = updateUserTags({ transcriptId: sessionId }, tags);

      return c.json({
        success: true,
        session_ref: enrichment.sessionRef,
        user_tags: enrichment.manualAnnotation?.userTags || []
      });
    } catch {
      return c.json({ error: "Failed to update tags" }, 500);
    }
  });

  /**
   * POST /api/enrichments/bulk
   *
   * Get enrichments for multiple sessions.
   *
   * @body session_ids - Array of session IDs
   * @returns { enrichments: Record<id, data>, found: number, missing: number }
   */
  app.post("/api/enrichments/bulk", async (c) => {
    try {
      const body = await c.req.json();
      const sessionIds = body.session_ids || [];

      const refs = sessionIds.map((id: string) => ({ transcriptId: id }));
      const enrichments = bulkGetEnrichments(refs);

      const result: Record<string, unknown> = {};
      for (const [id, e] of Object.entries(enrichments)) {
        if (e) {
          result[id] = {
            session_id: id,
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
    } catch {
      return c.json({ enrichments: {}, found: 0, missing: 0 });
    }
  });

  /**
   * DELETE /api/enrichments/:sessionId
   *
   * Delete enrichment data for a session.
   *
   * @param sessionId - Session ID
   * @returns { success: boolean } or 404
   */
  app.delete("/api/enrichments/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");

    const deleted = deleteEnrichments({ transcriptId: sessionId });

    if (!deleted) {
      return c.json({ error: "Enrichment not found" }, 404);
    }

    return c.json({ success: true });
  });

  /**
   * GET /api/enrichments/privacy-risk/:transcriptId
   *
   * Analyze a transcript for privacy-sensitive content before sharing.
   * Returns a risk assessment with detailed breakdown of:
   * - Files read, written, and edited
   * - Domains accessed via WebFetch
   * - Sensitive files detected (env files, keys, credentials)
   * - Risk level (low, medium, high)
   *
   * @param transcriptId - The transcript ID to analyze
   * @returns Privacy risk assessment object
   */
  app.get("/api/enrichments/privacy-risk/:transcriptId", async (c) => {
    const transcriptId = c.req.param("transcriptId");

    try {
      const parsed = await readTranscript(transcriptId);
      if (!parsed) {
        return c.json({ error: "Transcript not found" }, 404);
      }

      const filesRead: string[] = [];
      const filesWritten: string[] = [];
      const filesEdited: string[] = [];
      const domains: string[] = [];
      const sensitivePatterns: { path: string; reason: string }[] = [];

      // Patterns that indicate potentially sensitive file access
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

      for (const msg of parsed.messages) {
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
        transcript_id: transcriptId,
        risk_level: riskLevel,
        summary: {
          files_read: uniqueFilesRead.length,
          files_written: uniqueFilesWritten.length,
          files_edited: uniqueFilesEdited.length,
          domains_accessed: domains.length,
          sensitive_files: sensitivePatterns.length,
          total_messages: parsed.messages.length
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
    } catch {
      return c.json({ error: "Failed to analyze transcript" }, 500);
    }
  });
}

/**
 * Register annotation routes (separate from enrichments).
 *
 * @param app - The Hono app instance
 */
export function registerAnnotationRoutes(app: Hono): void {
  /**
   * GET /api/annotations
   *
   * List all annotations.
   *
   * @returns { annotations: Array }
   */
  app.get("/api/annotations", async (c) => {
    try {
      const annotations = getAllAnnotations();
      const list = Object.entries(annotations).map(([id, a]) => ({
        session_id: id,
        ...a
      }));
      return c.json({ annotations: list });
    } catch {
      return c.json({ annotations: [] });
    }
  });

  /**
   * GET /api/annotations/:sessionId
   *
   * Get annotation for a specific session.
   *
   * @param sessionId - Session ID
   * @returns Annotation or 404
   */
  app.get("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const annotation = getAnnotation(sessionId);

      if (!annotation) {
        return c.json({ error: "Annotation not found" }, 404);
      }

      return c.json({ session_id: sessionId, ...annotation });
    } catch {
      return c.json({ error: "Annotation not found" }, 404);
    }
  });

  /**
   * POST /api/annotations/:sessionId
   *
   * Create or update annotation for a session.
   *
   * @param sessionId - Session ID
   * @body feedback - "positive" or "negative"
   * @body rating - Number 1-5 (converted to feedback)
   * @body notes - Optional notes
   * @returns { status: "ok" }
   */
  app.post("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const body = await c.req.json();

      const feedback =
        body.feedback ||
        (body.rating >= 4 ? "positive" : body.rating <= 2 ? "negative" : null);
      setAnnotation(sessionId, feedback, body.notes);

      return c.json({ status: "ok", session_id: sessionId });
    } catch {
      return c.json({ error: "Failed to save annotation" }, 500);
    }
  });

  /**
   * DELETE /api/annotations/:sessionId
   *
   * Delete annotation for a session.
   *
   * @param sessionId - Session ID
   * @returns { status: "ok" } or 404
   */
  app.delete("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const deleted = deleteAnnotation(sessionId);

      if (!deleted) {
        return c.json({ error: "Annotation not found" }, 404);
      }

      return c.json({ status: "ok", session_id: sessionId });
    } catch {
      return c.json({ error: "Annotation not found" }, 404);
    }
  });
}
