/**
 * Event types for the unified event stream.
 *
 * All significant agentwatch events flow through EventBus,
 * which fans out to: audit log (persistent) + WebSocket (realtime) + memory (Activity Feed).
 */

import type { AuditCategory, AuditAction, AuditSource, AuditEntry } from "../audit/types";

/**
 * A unified agentwatch event.
 * Extends AuditEntry with an optional unique ID for tracking.
 */
export interface AgentWatchEvent extends AuditEntry {
  /** Unique event ID (auto-generated if not provided) */
  id?: string;
}

/**
 * Options for creating an event.
 */
export interface EmitEventOptions {
  /** Event category */
  category: AuditCategory;
  /** CRUD action */
  action: AuditAction;
  /** Entity ID (session ID, process PID, repo path, etc.) */
  entityId: string;
  /** Human-readable description */
  description: string;
  /** Additional context/metadata */
  details?: Record<string, unknown>;
  /** Source of the event */
  source?: AuditSource;
}

/**
 * Callback for event subscribers.
 */
export type EventSubscriber = (event: AgentWatchEvent) => void;

/**
 * Options for querying recent events.
 */
export interface GetRecentOptions {
  /** Maximum events to return */
  limit?: number;
  /** Filter by category */
  category?: AuditCategory;
  /** Filter by action */
  action?: AuditAction;
  /** Filter events after this timestamp */
  since?: string;
}
