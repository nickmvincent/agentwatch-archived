/**
 * @agentwatch/analyzer
 *
 * On-demand analysis tool for AI coding agent sessions.
 *
 * Features:
 * - Transcript browsing and search
 * - Quality scoring and auto-tagging
 * - Manual annotation workflow
 * - Analytics and statistics
 * - Export to HuggingFace datasets
 *
 * Usage:
 * ```
 * import { AnalyzerServer } from "@agentwatch/analyzer";
 *
 * const server = new AnalyzerServer();
 * await server.start();  // Opens browser automatically
 * ```
 */

export { AnalyzerServer, type AnalyzerServerOptions } from "./server";
export { createAnalyzerApp, type AnalyzerAppState } from "./api";
export {
  BrowserLifecycle,
  type BrowserLifecycleOptions
} from "./browser-lifecycle";

// Re-export enrichment utilities
export * from "./enrichments";
