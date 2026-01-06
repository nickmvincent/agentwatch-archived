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
  // These will be expanded to import from enrichment-store.ts

  app.get("/api/enrichments", async (c) => {
    // Placeholder - will integrate with enrichment store
    return c.json({
      sessions: [],
      stats: {
        total: 0,
        with_quality_score: 0,
        with_annotations: 0,
        with_auto_tags: 0
      }
    });
  });

  app.get("/api/enrichments/workflow-stats", async (c) => {
    return c.json({
      total: 0,
      reviewed: 0,
      ready_to_contribute: 0,
      skipped: 0,
      pending: 0
    });
  });

  app.get("/api/enrichments/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    return c.json(
      {
        error: "Not implemented",
        session_id: sessionId
      },
      501
    );
  });

  // =========== Transcripts ===========
  app.get("/api/transcripts", async (c) => {
    // Will integrate with transcript-index.ts
    return c.json({
      transcripts: [],
      total: 0
    });
  });

  app.get("/api/transcripts/:id", async (c) => {
    const id = c.req.param("id");
    return c.json(
      {
        error: "Not implemented",
        transcript_id: id
      },
      501
    );
  });

  // =========== Analytics ===========
  app.get("/api/analytics/overview", async (c) => {
    return c.json({
      sessions: {
        total: 0,
        with_enrichments: 0,
        with_feedback: 0
      },
      quality: {
        average_score: null,
        distribution: {}
      },
      costs: {
        total_usd: 0,
        average_per_session: 0
      }
    });
  });

  app.get("/api/analytics/daily", async (c) => {
    return c.json({
      days: [],
      summary: {}
    });
  });

  // =========== Annotations ===========
  app.get("/api/annotations", async (c) => {
    return c.json({ annotations: [] });
  });

  app.post("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    return c.json(
      {
        error: "Not implemented",
        session_id: sessionId
      },
      501
    );
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
