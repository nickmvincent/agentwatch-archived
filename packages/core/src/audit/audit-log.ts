/**
 * Centralized Audit Log for AgentWatch.
 *
 * Provides a complete timeline of all CRUD operations on AgentWatch data.
 * Uses append-only JSONL format for durability and easy parsing.
 *
 * Storage: ~/.agentwatch/events.jsonl
 */

import { existsSync, renameSync } from "fs";
import { join, dirname } from "path";
import type {
  AuditCategory,
  AuditAction,
  AuditEntry,
  AuditStats,
  AuditSource,
  ReadAuditLogOptions
} from "./types";
import { AUDIT_LOG_FILE, DATA_DIR } from "../storage/paths";
import { expandPath, ensureDir, appendJsonl, readJsonl } from "../storage";

const LEGACY_AUDIT_LOG_PATH = `${DATA_DIR}/audit.jsonl`;

/**
 * Migrate legacy audit.jsonl to events.jsonl if needed.
 */
function migrateEventsLog(): void {
  const legacyPath = expandPath(LEGACY_AUDIT_LOG_PATH);
  const newPath = expandPath(AUDIT_LOG_FILE);

  if (existsSync(legacyPath) && !existsSync(newPath)) {
    try {
      ensureDir(newPath);
      renameSync(legacyPath, newPath);
      console.log("[audit-log] Migrated audit.jsonl to events.jsonl");
    } catch (err) {
      console.error("[audit-log] Failed to migrate audit.jsonl:", err);
    }
  }
}

/**
 * Append an audit entry to the log.
 */
export function logAuditEvent(
  category: AuditCategory,
  action: AuditAction,
  entityId: string,
  description: string,
  details?: Record<string, unknown>,
  source: AuditSource = "api"
): AuditEntry {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    category,
    action,
    entityId,
    description,
    details,
    source
  };

  try {
    migrateEventsLog();
    appendJsonl(AUDIT_LOG_FILE, entry);
  } catch (err) {
    console.error("[audit-log] Failed to write audit entry:", err);
  }

  return entry;
}

/**
 * Read audit entries from the log file.
 */
export function readAuditLog(options: ReadAuditLogOptions = {}): AuditEntry[] {
  migrateEventsLog();

  let entries = readJsonl<AuditEntry>(AUDIT_LOG_FILE);

  // Apply filters
  if (options.category) {
    entries = entries.filter((e) => e.category === options.category);
  }
  if (options.action) {
    entries = entries.filter((e) => e.action === options.action);
  }
  if (options.since) {
    const since = options.since;
    entries = entries.filter((e) => e.timestamp >= since);
  }
  if (options.until) {
    const until = options.until;
    entries = entries.filter((e) => e.timestamp <= until);
  }

  // Sort by timestamp descending (newest first)
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply pagination
  if (options.offset) {
    entries = entries.slice(options.offset);
  }
  if (options.limit) {
    entries = entries.slice(0, options.limit);
  }

  return entries;
}

/**
 * Get audit log statistics.
 */
export function getAuditStats(): AuditStats {
  const entries = readAuditLog();

  const stats: AuditStats = {
    totalEvents: entries.length,
    byCategory: {},
    byAction: {}
  };

  for (const entry of entries) {
    stats.byCategory[entry.category] =
      (stats.byCategory[entry.category] || 0) + 1;
    stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
  }

  if (entries.length > 0) {
    // Entries are sorted newest first
    stats.newestEvent = entries[0]!.timestamp;
    stats.oldestEvent = entries[entries.length - 1]!.timestamp;
  }

  return stats;
}

/**
 * Get the path to the audit log file.
 */
export function getAuditLogPath(): string {
  return expandPath(AUDIT_LOG_FILE);
}
