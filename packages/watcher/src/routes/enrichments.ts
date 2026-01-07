/**
 * Enrichment and annotation routes for watcher.
 */

import type { Hono } from "hono";
import type {
  WorkflowStatus,
  SessionEnrichments,
  SessionRef
} from "@agentwatch/core";
import {
  getAllEnrichments,
  getEnrichmentStats,
  getEnrichments,
  setManualAnnotation
} from "../enrichment-store";

function findEnrichmentsBySessionId(sessionId: string) {
  return (
    getEnrichments({ hookSessionId: sessionId }) ||
    getEnrichments({ correlationId: sessionId }) ||
    getEnrichments({ transcriptId: sessionId })
  );
}

function resolveSessionRef(
  sessionId: string,
  existing?: { sessionRef: SessionRef }
): SessionRef {
  if (existing?.sessionRef) {
    return existing.sessionRef;
  }
  return { hookSessionId: sessionId };
}

function toApiEnrichments(enrichment: SessionEnrichments) {
  return {
    session_ref: enrichment.sessionRef,
    auto_tags: enrichment.autoTags,
    outcome_signals: enrichment.outcomeSignals,
    quality_score: enrichment.qualityScore,
    manual_annotation: enrichment.manualAnnotation,
    loop_detection: enrichment.loopDetection,
    diff_snapshot: enrichment.diffSnapshot,
    updated_at: enrichment.updatedAt
  };
}

export function registerEnrichmentRoutes(app: Hono): void {
  app.get("/api/enrichments", (c) => {
    const enrichments = getAllEnrichments();
    const stats = getEnrichmentStats();

    const sessions = Object.entries(enrichments).map(([id, e]) => ({
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
    }));

    return c.json({
      sessions,
      stats
    });
  });

  app.get("/api/enrichments/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    const enrichment = findEnrichmentsBySessionId(sessionId);
    if (!enrichment) {
      return c.json({ error: "Enrichment not found" }, 404);
    }

    return c.json({
      session_id: sessionId,
      ...toApiEnrichments(enrichment)
    });
  });

  app.post("/api/enrichments/:sessionId/annotation", async (c) => {
    const sessionId = c.req.param("sessionId");
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

    const existing = findEnrichmentsBySessionId(sessionId);
    const ref = resolveSessionRef(sessionId, existing ?? undefined);

    const enrichment = setManualAnnotation(ref, feedback, {
      notes: body.notes,
      userTags: body.user_tags ?? body.userTags,
      rating: body.rating,
      taskDescription: body.task_description ?? body.taskDescription,
      goalAchieved: body.goal_achieved ?? body.goalAchieved,
      workflowStatus: (body.workflow_status ??
        body.workflowStatus) as WorkflowStatus,
      extraData: body.extra_data ?? body.extraData
    });

    return c.json({
      success: true,
      session_ref: enrichment.sessionRef,
      manual_annotation: enrichment.manualAnnotation ?? null
    });
  });
}
