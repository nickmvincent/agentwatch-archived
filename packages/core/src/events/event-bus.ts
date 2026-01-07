/**
 * EventBus - Unified event stream for AgentWatch.
 *
 * Single write path that fans out to:
 * 1. Audit log (persistent, ~/.agentwatch/events.jsonl)
 * 2. Subscribers (realtime, for WebSocket broadcast)
 * 3. Memory buffer (Activity Feed)
 *
 * Design: All significant operations emit events through EventBus.
 * This replaces scattered WebSocket broadcasts and partial audit logging.
 */

import { EventEmitter } from "events";
import { logAuditEvent } from "../audit/audit-log";
import type {
  AgentWatchEvent,
  EmitEventOptions,
  EventSubscriber,
  GetRecentOptions
} from "./types";

/** Default in-memory buffer size */
const DEFAULT_BUFFER_SIZE = 500;

/** Event name for internal EventEmitter */
const EVENT_NAME = "agentwatch:event";

/**
 * Generate a unique event ID.
 */
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * EventBus provides a unified event stream for all AgentWatch events.
 *
 * Usage:
 * ```typescript
 * const bus = new EventBus();
 *
 * // Subscribe to events (for WebSocket broadcast)
 * const unsubscribe = bus.subscribe((event) => {
 *   ws.broadcast({ type: "agentwatch_event", event });
 * });
 *
 * // Emit events (from scanners, hooks, metadata changes)
 * bus.emit({
 *   category: "process",
 *   action: "discover",
 *   entityId: "12345",
 *   description: "Claude Code process detected",
 *   source: "scanner"
 * });
 *
 * // Get recent events (for Activity Feed)
 * const recent = bus.getRecent({ limit: 50 });
 * ```
 */
export class EventBus {
  private emitter: EventEmitter;
  private buffer: AgentWatchEvent[];
  private bufferSize: number;
  private started: boolean = false;

  constructor(options: { bufferSize?: number } = {}) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50); // Allow many subscribers
    this.buffer = [];
    this.bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
  }

  /**
   * Emit an event.
   * Writes to audit log, notifies subscribers, and adds to memory buffer.
   */
  emit(options: EmitEventOptions): AgentWatchEvent {
    const {
      category,
      action,
      entityId,
      description,
      details,
      source = "api"
    } = options;

    // Write to persistent audit log
    const auditEntry = logAuditEvent(
      category,
      action,
      entityId,
      description,
      details,
      source
    );

    // Create full event with ID
    const event: AgentWatchEvent = {
      ...auditEntry,
      id: generateEventId()
    };

    // Add to memory buffer (ring buffer behavior)
    this.buffer.push(event);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    // Notify subscribers
    this.emitter.emit(EVENT_NAME, event);

    return event;
  }

  /**
   * Subscribe to events.
   * Returns an unsubscribe function.
   */
  subscribe(callback: EventSubscriber): () => void {
    this.emitter.on(EVENT_NAME, callback);
    return () => {
      this.emitter.off(EVENT_NAME, callback);
    };
  }

  /**
   * Get recent events from the in-memory buffer.
   * For historical events beyond the buffer, use readAuditLog().
   */
  getRecent(options: GetRecentOptions = {}): AgentWatchEvent[] {
    const { limit = 50, category, action, since } = options;

    let events = [...this.buffer];

    // Apply filters
    if (category) {
      events = events.filter((e) => e.category === category);
    }
    if (action) {
      events = events.filter((e) => e.action === action);
    }
    if (since) {
      events = events.filter((e) => e.timestamp >= since);
    }

    // Sort by timestamp descending (newest first)
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply limit
    return events.slice(0, limit);
  }

  /**
   * Get buffer statistics.
   */
  getStats(): { bufferSize: number; eventCount: number; oldestEvent?: string; newestEvent?: string } {
    const stats = {
      bufferSize: this.bufferSize,
      eventCount: this.buffer.length,
      oldestEvent: undefined as string | undefined,
      newestEvent: undefined as string | undefined
    };

    if (this.buffer.length > 0) {
      stats.oldestEvent = this.buffer[0]!.timestamp;
      stats.newestEvent = this.buffer[this.buffer.length - 1]!.timestamp;
    }

    return stats;
  }

  /**
   * Clear the in-memory buffer.
   * Does not affect the persistent audit log.
   */
  clearBuffer(): void {
    this.buffer = [];
  }

  /**
   * Mark the EventBus as started.
   * Used for lifecycle tracking.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.emit({
      category: "system",
      action: "start",
      entityId: "event-bus",
      description: "EventBus started",
      source: "watcher"
    });
  }

  /**
   * Mark the EventBus as stopped.
   */
  stop(): void {
    if (!this.started) return;
    this.emit({
      category: "system",
      action: "end",
      entityId: "event-bus",
      description: "EventBus stopped",
      source: "watcher"
    });
    this.started = false;
    this.emitter.removeAllListeners();
  }

  /**
   * Check if EventBus is running.
   */
  isRunning(): boolean {
    return this.started;
  }
}

/**
 * Singleton EventBus instance.
 * Use this for the main application event bus.
 */
let globalEventBus: EventBus | null = null;

/**
 * Get or create the global EventBus instance.
 */
export function getEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/**
 * Reset the global EventBus (for testing).
 */
export function resetEventBus(): void {
  if (globalEventBus) {
    globalEventBus.stop();
    globalEventBus = null;
  }
}
