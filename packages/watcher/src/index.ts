/**
 * @agentwatch/watcher
 *
 * Lightweight daemon for real-time monitoring of AI coding agents.
 *
 * Responsibilities:
 * - Process scanning (detect running Claude/Codex/Gemini sessions)
 * - Repository status monitoring
 * - Port scanning
 * - Hook capture (session lifecycle, tool usage)
 * - Real-time WebSocket broadcasts
 * - Data persistence to ~/.agentwatch/
 *
 * Usage:
 * ```
 * import { WatcherServer } from "@agentwatch/watcher";
 *
 * const server = new WatcherServer();
 * await server.run("localhost", 8420);
 * ```
 */

export { WatcherServer, type WatcherServerOptions } from "./server";
export { type WatcherConfig, loadConfig } from "./config";
export { ConnectionManager, type BroadcastMessage } from "./connection-manager";
export { SessionLogger, type SessionInfo } from "./session-logger";
export { PidFile } from "./pid-file";
