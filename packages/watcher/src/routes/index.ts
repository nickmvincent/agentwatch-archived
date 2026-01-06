/**
 * Route module exports.
 *
 * This package provides modular route registration for the Watcher API.
 * Each route module handles a specific domain:
 *
 * - `agents` - Agent process monitoring and control
 * - `hooks` - Hook session capture and statistics
 * - `monitoring` - Health, repos, and ports
 * - `config` - Watcher and Claude settings
 * - `sandbox` - Docker sandbox status and permission presets
 * - `projects` - Shared project configuration
 *
 * @example
 * ```typescript
 * import {
 *   registerAgentRoutes,
 *   registerHookSessionRoutes,
 *   registerHookStatsRoutes,
 *   registerHookEventRoutes,
 *   registerMonitoringRoutes,
 *   registerConfigRoutes,
 *   registerClaudeSettingsRoutes,
 *   registerSandboxRoutes
 * } from "./routes";
 *
 * const app = new Hono();
 * registerAgentRoutes(app, store);
 * registerMonitoringRoutes(app, { store, startedAt, shutdown });
 * registerSandboxRoutes(app);
 * // ...
 * ```
 *
 * @module routes
 */

export { registerAgentRoutes } from "./agents";
export {
  registerHookSessionRoutes,
  registerHookStatsRoutes,
  registerHookEventRoutes
} from "./hooks";
export {
  registerMonitoringRoutes,
  type MonitoringRouteOptions
} from "./monitoring";
export { registerConfigRoutes, registerClaudeSettingsRoutes } from "./config";
export { registerSandboxRoutes } from "./sandbox";
export { registerProjectRoutes } from "./projects";
