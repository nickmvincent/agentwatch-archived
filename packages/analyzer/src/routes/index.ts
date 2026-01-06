/**
 * Route module exports.
 *
 * This package provides modular route registration for the Analyzer API.
 * Each route module handles a specific domain:
 *
 * - `monitoring` - Health, status, heartbeat, shutdown
 * - `transcripts` - Transcript discovery and stats
 * - `enrichments` - Enrichments, annotations, privacy-risk
 * - `analytics` - Overview, daily, quality, per-project
 * - `projects` - Project CRUD operations
 * - `share` - Export and contribution
 *
 * @example
 * ```typescript
 * import {
 *   registerMonitoringRoutes,
 *   registerTranscriptRoutes,
 *   registerEnrichmentRoutes,
 *   registerAnnotationRoutes,
 *   registerAnalyticsRoutes,
 *   registerProjectRoutes,
 *   registerShareRoutes
 * } from "./routes";
 *
 * const app = new Hono();
 * registerMonitoringRoutes(app, state);
 * registerTranscriptRoutes(app);
 * // ...
 * ```
 *
 * @module routes
 */

export { registerMonitoringRoutes } from "./monitoring";
export { registerTranscriptRoutes } from "./transcripts";
export {
  registerEnrichmentRoutes,
  registerAnnotationRoutes
} from "./enrichments";
export { registerAnalyticsRoutes } from "./analytics";
export { registerProjectRoutes } from "./projects";
export { registerShareRoutes } from "./share";
export { registerConversationRoutes } from "./conversations";
export { registerDocsRoutes } from "./docs";
