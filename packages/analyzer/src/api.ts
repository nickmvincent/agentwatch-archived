/**
 * Analyzer API routes.
 *
 * Handles:
 * - /api/health, /api/status
 * - /api/heartbeat - Browser lifecycle heartbeat
 * - /api/enrichments/* - Session enrichments
 * - /api/transcripts/* - Transcript browsing
 * - /api/annotations/* - Manual annotations
 * - /api/analytics/* - Aggregated statistics
 * - /api/share/* - Export and contribution
 * - Static files for web UI
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";

// Import data stores
import {
  loadTranscriptIndex,
  getIndexedTranscripts,
  getIndexStats,
  updateTranscriptIndex
} from "./transcript-index";
import {
  getAllEnrichments,
  getEnrichments,
  getEnrichmentStats,
  setManualAnnotation as setEnrichmentAnnotation
} from "./enrichment-store";
import {
  getAllAnnotations,
  getAnnotation,
  setAnnotation,
  deleteAnnotation,
  getAnnotationStats
} from "./annotations";

export interface AnalyzerAppState {
  startedAt: number;
  watcherUrl: string;
  shutdown?: () => void;
}

export function createAnalyzerApp(state: AnalyzerAppState): Hono {
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

  // =========== Health & Status ===========
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  // Proxy config from watcher
  app.get("/api/config", async (c) => {
    try {
      const res = await fetch(`${state.watcherUrl}/api/config`);
      if (res.ok) {
        const config = await res.json();
        return c.json(config);
      }
      return c.json({ error: "Watcher not available" }, 503);
    } catch {
      return c.json({ error: "Watcher not available" }, 503);
    }
  });

  app.get("/api/status", (c) => {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - state.startedAt) / 1000)
    );
    return c.json({
      status: "ok",
      component: "analyzer",
      uptime_seconds: uptimeSeconds,
      watcher_url: state.watcherUrl
    });
  });

  // =========== Browser Lifecycle ===========
  app.post("/api/heartbeat", (c) => {
    // Heartbeat is handled by the server, this just acknowledges
    return c.json({ status: "ok", timestamp: Date.now() });
  });

  app.post("/api/shutdown", (c) => {
    setTimeout(() => state.shutdown?.(), 10);
    return c.json({ status: "ok" });
  });

  // =========== Enrichments ===========
  app.get("/api/enrichments", async (c) => {
    try {
      const enrichments = getAllEnrichments();
      const stats = getEnrichmentStats();

      // Convert to array format for API
      const sessions = Object.entries(enrichments).map(([id, e]) => ({
        session_id: id,
        ...e
      }));

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
          // Include annotated breakdown for UI compatibility
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

  app.get("/api/enrichments/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      // Try with transcriptId first
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

  app.post("/api/enrichments/:sessionId/annotation", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const body = await c.req.json();

      // Map rating to feedback type
      const feedback =
        body.thumbs ||
        (body.rating >= 4 ? "positive" : body.rating <= 2 ? "negative" : null);

      setEnrichmentAnnotation({ transcriptId: sessionId }, feedback, {
        notes: body.notes
      });

      return c.json({ status: "ok", session_id: sessionId });
    } catch (err) {
      return c.json({ error: "Failed to save annotation" }, 500);
    }
  });

  // =========== Transcripts ===========
  app.get("/api/transcripts", async (c) => {
    try {
      const index = loadTranscriptIndex();
      const agent = c.req.query("agent");
      const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
      const offset = Number.parseInt(c.req.query("offset") ?? "0", 10);

      const transcripts = getIndexedTranscripts(index, {
        agents: agent ? [agent] : undefined,
        limit
      });

      const stats = getIndexStats(index);

      // Apply offset manually (getIndexedTranscripts doesn't support it)
      const paged = transcripts.slice(offset, offset + limit);

      return c.json({
        transcripts: paged.map((t) => ({
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
        total: stats.total,
        offset,
        limit
      });
    } catch {
      return c.json({
        transcripts: [],
        total: 0,
        offset: 0,
        limit: 100
      });
    }
  });

  app.get("/api/transcripts/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const index = loadTranscriptIndex();
      const entry = index.entries[id];

      if (!entry) {
        return c.json({ error: "Transcript not found" }, 404);
      }

      // Read the actual transcript file
      const content = await Bun.file(entry.path).text();
      return c.json({
        id: entry.id,
        agent: entry.agent,
        path: entry.path,
        name: entry.name,
        content,
        modified_at: entry.modifiedAt,
        size_bytes: entry.sizeBytes
      });
    } catch {
      return c.json({ error: "Transcript not found" }, 404);
    }
  });

  app.post("/api/transcripts/rescan", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const forceFullScan = body.force === true;

      const index = loadTranscriptIndex();
      await updateTranscriptIndex(index, { forceFullScan });

      const updatedIndex = loadTranscriptIndex();
      const stats = getIndexStats(updatedIndex);

      return c.json({
        status: "ok",
        total: stats.total,
        last_scan: updatedIndex.lastFullScan
      });
    } catch {
      return c.json({
        status: "ok",
        total: 0,
        last_scan: null
      });
    }
  });

  // =========== Analytics ===========
  app.get("/api/analytics/overview", async (c) => {
    try {
      const index = loadTranscriptIndex();
      const indexStats = getIndexStats(index);
      const enrichStats = getEnrichmentStats();
      const withFeedback =
        enrichStats.annotated.positive + enrichStats.annotated.negative;

      return c.json({
        sessions: {
          total: indexStats.total,
          with_enrichments: enrichStats.totalSessions,
          with_feedback: withFeedback
        },
        quality: {
          average_score: null,
          distribution: enrichStats.qualityDistribution
        },
        costs: {
          total_usd: 0,
          average_per_session: 0
        }
      });
    } catch {
      return c.json({
        sessions: { total: 0, with_enrichments: 0, with_feedback: 0 },
        quality: { average_score: null, distribution: {} },
        costs: { total_usd: 0, average_per_session: 0 }
      });
    }
  });

  app.get("/api/analytics/daily", async (c) => {
    // Daily analytics requires aggregating by date
    // For now return empty - will implement when needed
    return c.json({
      days: [],
      summary: {}
    });
  });

  // =========== Annotations ===========
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

  app.post("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const body = await c.req.json();

      // setAnnotation(sessionId, feedback, notes) - feedback is "positive" | "negative" | null
      const feedback =
        body.feedback ||
        (body.rating >= 4 ? "positive" : body.rating <= 2 ? "negative" : null);
      setAnnotation(sessionId, feedback, body.notes);

      return c.json({ status: "ok", session_id: sessionId });
    } catch {
      return c.json({ error: "Failed to save annotation" }, 500);
    }
  });

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

  // =========== Share/Export ===========
  app.get("/api/share/status", async (c) => {
    return c.json({
      configured: false,
      authenticated: false,
      dataset_url: null
    });
  });

  app.post("/api/share/export", async (c) => {
    return c.json(
      {
        error: "Not implemented"
      },
      501
    );
  });

  // =========== Static File Serving ===========
  // Look for built web UI in multiple locations
  const staticDirs = [
    join(process.cwd(), "web", "dist", "analyzer"),
    join(process.cwd(), "web", "dist"),
    "/usr/share/agentwatch/web/analyzer",
    join(homedir(), ".agentwatch", "web", "analyzer")
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
        if (path.startsWith("/api/")) {
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
