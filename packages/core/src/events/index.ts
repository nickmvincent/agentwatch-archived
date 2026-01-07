/**
 * Events module - Unified event stream for AgentWatch.
 *
 * Provides a single EventBus that fans out to:
 * - Audit log (persistent)
 * - WebSocket subscribers (realtime)
 * - In-memory buffer (Activity Feed)
 *
 * Usage:
 * ```typescript
 * import { getEventBus } from "@agentwatch/core";
 *
 * const bus = getEventBus();
 * bus.emit({
 *   category: "process",
 *   action: "discover",
 *   entityId: "12345",
 *   description: "Claude Code process detected",
 *   source: "scanner"
 * });
 * ```
 */

export * from "./types";
export { EventBus, getEventBus, resetEventBus } from "./event-bus";
