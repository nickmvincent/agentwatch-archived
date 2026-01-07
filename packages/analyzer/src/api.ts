/**
 * Analyzer API - On-demand analysis server for AI coding sessions.
 *
 * This is the main entry point for the Analyzer HTTP server.
 * Routes are organized into modular files under `routes/`:
 *
 * - `routes/monitoring.ts` - Health, status, heartbeat, shutdown
 * - `routes/transcripts.ts` - Transcript discovery and stats
 * - `routes/enrichments.ts` - Enrichments, annotations, privacy-risk
 * - `routes/analytics.ts` - Overview, daily, quality, per-project
 * - `routes/projects.ts` - Project CRUD operations
 * - `routes/share.ts` - Export and contribution
 *
 * ## Endpoints Overview
 *
 * ### Health & Lifecycle
 * - `GET /api/health` - Simple health check
 * - `GET /api/status` - Server status with uptime
 * - `GET /api/config` - Proxy config from watcher
 * - `POST /api/heartbeat` - Browser lifecycle heartbeat
 * - `POST /api/shutdown` - Trigger graceful shutdown
 *
 * ### Transcripts
 * - `GET /api/transcripts` - List local transcripts
 * - `GET /api/transcripts/stats` - Aggregate transcript statistics
 * - `GET /api/transcripts/:id` - Get transcript content
 * - `POST /api/transcripts/rescan` - Trigger index rescan
 *
 * ### Enrichments
 * - `GET /api/enrichments` - List all enrichments
 * - `GET /api/enrichments/workflow-stats` - Review workflow stats
 * - `GET /api/enrichments/:id` - Get session enrichment
 * - `POST /api/enrichments/:id/annotation` - Set annotation
 * - `POST /api/enrichments/:id/tags` - Update user tags
 * - `POST /api/enrichments/bulk` - Bulk get enrichments
 * - `DELETE /api/enrichments/:id` - Delete enrichment
 * - `GET /api/enrichments/privacy-risk/:id` - Privacy risk analysis
 *
 * ### Annotations
 * - `GET /api/annotations` - List all annotations
 * - `GET /api/annotations/:id` - Get annotation
 * - `POST /api/annotations/:id` - Create/update annotation
 * - `DELETE /api/annotations/:id` - Delete annotation
 *
 * ### Analytics
 * - `GET /api/analytics/overview` - Overview statistics
 * - `GET /api/analytics/daily` - Daily breakdown
 * - `GET /api/analytics/quality-distribution` - Quality score distribution
 * - `GET /api/analytics/by-project` - Per-project analytics
 * - `GET /api/analytics/combined` - Combined analytics payload
 * - `GET /api/analytics/export/sqlite` - SQLite export for notebooks
 *
 * ### Projects
 * - `GET /api/projects` - List projects
 * - `GET /api/projects/:id` - Get project
 * - `POST /api/projects` - Create project
 * - `PATCH /api/projects/:id` - Update project
 * - `DELETE /api/projects/:id` - Delete project
 *
 * ### Share
 * - `GET /api/share/status` - Share configuration status
 * - `POST /api/share/export` - Export data
 * - `POST /api/share/huggingface` - Upload bundle to HuggingFace
 * - `GET /api/share/huggingface/cli-auth` - HF CLI auth status
 * - `POST /api/share/huggingface/use-cli-token` - Use CLI token
 * - `GET /api/share/huggingface/oauth/config` - OAuth config
 * - `POST /api/share/huggingface/oauth/start` - Start OAuth flow
 * - `GET /api/share/huggingface/oauth/callback` - OAuth callback
 * - `POST /api/share/huggingface/validate` - Validate HF token
 * - `POST /api/share/huggingface/check-repo` - Check dataset access
 *
 * ### Conversations
 * - `GET /api/contrib/correlated` - Correlated sessions + transcripts
 * - `GET /api/conversation-metadata` - All conversation metadata
 * - `GET /api/conversation-metadata/:id` - Get conversation metadata
 * - `PATCH /api/conversation-metadata/:id` - Update conversation metadata
 * - `DELETE /api/conversation-metadata/:id` - Delete conversation metadata
 *
 * ### Contribution Prep (legacy daemon compatibility)
 * - `GET /api/contrib/fields` - Field schema list
 * - `POST /api/contrib/prepare` - Redaction preview pipeline
 * - `GET /api/contrib/transcripts` - Hook sessions list
 * - `GET /api/contrib/local-logs` - Local transcript list
 * - `GET /api/contrib/local-logs/:id` - Local transcript detail
 * - `GET /api/contrib/local-logs/:id/raw` - Raw transcript file
 * - `POST /api/contrib/export/bundle` - JSONL export bundle
 * - `GET /api/contrib/settings` - Contributor settings
 * - `POST /api/contrib/settings` - Update contributor settings
 * - `GET /api/contrib/profiles` - Redaction profiles
 * - `POST /api/contrib/profiles` - Create redaction profile
 * - `DELETE /api/contrib/profiles/:id` - Delete redaction profile
 * - `PUT /api/contrib/profiles/active` - Set active profile
 * - `GET /api/contrib/history` - Contribution history
 * - `POST /api/contrib/history` - Record contribution
 * - `GET /api/contrib/destinations` - Share destinations
 *
 * @module api
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";

// Import modular routes
import {
  registerMonitoringRoutes,
  registerTranscriptRoutes,
  registerEnrichmentRoutes,
  registerAnnotationRoutes,
  registerAnalyticsRoutes,
  registerProjectRoutes,
  registerShareRoutes,
  registerContribRoutes,
  registerConversationRoutes,
  registerDocsRoutes
} from "./routes";

/**
 * State required by the Analyzer API.
 *
 * This is passed to createAnalyzerApp and provides access to:
 * - Server start timestamp for uptime calculation
 * - Watcher URL for proxying requests
 * - Shutdown callback for graceful termination
 * - Heartbeat callback for browser lifecycle
 */
export interface AnalyzerAppState {
  /** Server start timestamp (milliseconds) */
  startedAt: number;
  /** Watcher server URL for proxying */
  watcherUrl: string;
  /** Callback to trigger graceful shutdown */
  shutdown?: () => void;
  /** Callback to record browser heartbeat */
  recordHeartbeat?: () => void;
}

/**
 * Create the Analyzer Hono application.
 *
 * @param state - Application state and dependencies
 * @returns Configured Hono app instance
 *
 * @example
 * ```typescript
 * const app = createAnalyzerApp({
 *   startedAt: Date.now(),
 *   watcherUrl: "http://localhost:8420",
 *   shutdown: () => process.exit(0)
 * });
 *
 * Bun.serve({
 *   port: 8421,
 *   fetch: app.fetch
 * });
 * ```
 */
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

  // =========== Register Modular Routes ===========

  // Health, status, heartbeat, shutdown
  registerMonitoringRoutes(app, state);

  // Transcript discovery and stats
  registerTranscriptRoutes(app);

  // Enrichments, annotations, privacy-risk
  registerEnrichmentRoutes(app);

  // Standalone annotations
  registerAnnotationRoutes(app);

  // Analytics and statistics
  registerAnalyticsRoutes(app);

  // Project management
  registerProjectRoutes(app);

  // Share and export
  registerShareRoutes(app);

  // Conversations (correlated sessions + transcripts)
  registerConversationRoutes(app);

  // Contribution prep + local logs (legacy daemon API)
  registerContribRoutes(app);

  // Documentation
  registerDocsRoutes(app);

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
