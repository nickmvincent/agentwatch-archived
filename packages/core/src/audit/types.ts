/**
 * Audit log types for agentwatch.
 *
 * Audit events track all significant operations on agentwatch data.
 */

/**
 * Categories of audit events.
 */
export type AuditCategory =
  | "transcript" // Local transcript files discovered
  | "hook_session" // Claude Code hook sessions
  | "tool_usage" // Individual tool invocations
  | "enrichment" // Auto-computed enrichments
  | "annotation" // User annotations/feedback
  | "conversation" // Conversation metadata (names)
  | "agent" // Agent metadata (names, notes)
  | "managed_session" // User-managed agent sessions
  | "process" // Agent process lifecycle
  | "repo" // Repository status changes
  | "port" // Port listening changes
  | "config" // Configuration/settings changes
  | "contributor" // Contributor settings/contributions
  | "daemon" // Daemon lifecycle events
  | "watcher" // Watcher lifecycle events
  | "analyzer" // Analyzer lifecycle events
  | "system"; // System-level events

/**
 * CRUD action types.
 */
export type AuditAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "start"
  | "end"
  | "discover"
  | "rename"
  | "annotate"
  | "compute"
  | "export"
  | "import";

/**
 * Source of the audit event.
 */
export type AuditSource =
  | "hook" // From Claude Code hooks
  | "api" // From REST API
  | "scanner" // From process/repo/port scanners
  | "inferred" // Reconstructed from file timestamps
  | "daemon" // From daemon lifecycle
  | "watcher" // From watcher lifecycle
  | "analyzer" // From analyzer lifecycle
  | "user"; // From direct user action

/**
 * A single audit log entry.
 */
export interface AuditEntry {
  /** ISO timestamp of the event */
  timestamp: string;
  /** Event category */
  category: AuditCategory;
  /** CRUD action */
  action: AuditAction;
  /** Entity ID (session ID, conversation ID, etc.) */
  entityId: string;
  /** Human-readable description */
  description: string;
  /** Additional context/metadata */
  details?: Record<string, unknown>;
  /** Source of the event */
  source: AuditSource;
}

/**
 * Summary statistics for the audit log.
 */
export interface AuditStats {
  totalEvents: number;
  byCategory: Record<string, number>;
  byAction: Record<string, number>;
  oldestEvent?: string;
  newestEvent?: string;
}

/**
 * Options for reading audit log entries.
 */
export interface ReadAuditLogOptions {
  /** Maximum entries to return */
  limit?: number;
  /** Number of entries to skip */
  offset?: number;
  /** Filter by category */
  category?: AuditCategory;
  /** Filter by action */
  action?: AuditAction;
  /** Filter events after this timestamp */
  since?: string;
  /** Filter events before this timestamp */
  until?: string;
}
