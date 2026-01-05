/**
 * @agentwatch/monitor
 *
 * Monitoring module for agentwatch - detects agents and tracks repositories.
 *
 * This package provides:
 * - Process scanner for detecting AI coding agents
 * - Repository scanner for git status monitoring
 * - Hook store for Claude Code integration
 * - In-memory data store with callbacks
 */

// Data store
export { DataStore } from "./store";
export type {
  ReposChangeCallback,
  AgentsChangeCallback,
  PortsChangeCallback,
  WrapperOutputCallback
} from "./store";

// Process scanner
export {
  ProcessScanner,
  DEFAULT_PROCESS_SCANNER_CONFIG
} from "./process-scanner";

// Repository scanner
export { RepoScanner, DEFAULT_REPO_SCANNER_CONFIG } from "./repo-scanner";

// Port scanner
export { PortScanner, DEFAULT_PORT_SCANNER_CONFIG } from "./port-scanner";

// Hook store
export { HookStore } from "./hook-store";
export type { SessionChangeCallback, ToolUsageCallback } from "./hook-store";

// Process logger
export { ProcessLogger } from "./process-logger";
export type {
  ProcessSnapshot,
  ProcessLifecycleEvent,
  ProcessLoggerConfig,
  ProcessSnapshotFileInfo,
  ProcessEventFileInfo,
  ProcessLogSummary
} from "./process-logger";

// Git utilities
export {
  hashPath,
  resolveGitDir,
  discoverRepos,
  getRepoStatus,
  getBranchName,
  getUpstreamCounts,
  getLastChangeTime,
  initRepoStatus
} from "./git";

// Session store (user-managed agent sessions)
export { SessionStore } from "./session-store";
export type {
  ManagedSession,
  SessionStatus,
  SessionChangeCallback as ManagedSessionChangeCallback
} from "./session-store";

// Prediction store (run predictions and calibration)
export { PredictionStore } from "./prediction-store";
export type { PredictionChangeCallback } from "./prediction-store";
