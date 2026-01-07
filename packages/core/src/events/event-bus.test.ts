/**
 * Tests for EventBus - unified event stream.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { EventBus, resetEventBus, getEventBus } from "./event-bus";
import type { AgentWatchEvent, EmitEventOptions } from "./types";

// Mock the audit log to avoid file system writes
mock.module("../audit/audit-log", () => ({
  logAuditEvent: (
    category: string,
    action: string,
    entityId: string,
    description: string,
    details?: Record<string, unknown>,
    source = "api"
  ) => ({
    timestamp: new Date().toISOString(),
    category,
    action,
    entityId,
    description,
    details,
    source
  })
}));

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe("emit", () => {
    it("should emit events with all required fields", () => {
      const event = bus.emit({
        category: "process",
        action: "discover",
        entityId: "12345",
        description: "Test process detected",
        source: "scanner"
      });

      expect(event.category).toBe("process");
      expect(event.action).toBe("discover");
      expect(event.entityId).toBe("12345");
      expect(event.description).toBe("Test process detected");
      expect(event.source).toBe("scanner");
      expect(event.timestamp).toBeDefined();
      expect(event.id).toBeDefined();
    });

    it("should include optional details", () => {
      const event = bus.emit({
        category: "hook_session",
        action: "start",
        entityId: "session-1",
        description: "Hook session started",
        details: { cwd: "/test", toolName: "bash" },
        source: "hook"
      });

      expect(event.details).toEqual({ cwd: "/test", toolName: "bash" });
    });

    it("should default source to 'api'", () => {
      const event = bus.emit({
        category: "annotation",
        action: "create",
        entityId: "conv-1",
        description: "Annotation created"
      });

      expect(event.source).toBe("api");
    });
  });

  describe("subscribe", () => {
    it("should notify subscribers of new events", () => {
      const received: AgentWatchEvent[] = [];
      bus.subscribe((event) => received.push(event));

      bus.emit({
        category: "repo",
        action: "update",
        entityId: "/test/repo",
        description: "Repo status changed"
      });

      expect(received).toHaveLength(1);
      expect(received[0]!.category).toBe("repo");
    });

    it("should support multiple subscribers", () => {
      let count1 = 0;
      let count2 = 0;

      bus.subscribe(() => count1++);
      bus.subscribe(() => count2++);

      bus.emit({
        category: "port",
        action: "start",
        entityId: "8080",
        description: "Port opened"
      });

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it("should return unsubscribe function", () => {
      const received: AgentWatchEvent[] = [];
      const unsubscribe = bus.subscribe((event) => received.push(event));

      bus.emit({
        category: "process",
        action: "start",
        entityId: "1",
        description: "First"
      });

      unsubscribe();

      bus.emit({
        category: "process",
        action: "end",
        entityId: "1",
        description: "Second"
      });

      expect(received).toHaveLength(1);
    });
  });

  describe("getRecent", () => {
    it("should return recent events from buffer", () => {
      bus.emit({
        category: "process",
        action: "start",
        entityId: "1",
        description: "Process 1"
      });
      bus.emit({
        category: "repo",
        action: "update",
        entityId: "/repo",
        description: "Repo updated"
      });

      const recent = bus.getRecent();
      expect(recent).toHaveLength(2);
    });

    it("should filter by category", () => {
      bus.emit({
        category: "process",
        action: "start",
        entityId: "1",
        description: "Process"
      });
      bus.emit({
        category: "repo",
        action: "update",
        entityId: "/repo",
        description: "Repo"
      });

      const recent = bus.getRecent({ category: "process" });
      expect(recent).toHaveLength(1);
      expect(recent[0]!.category).toBe("process");
    });

    it("should filter by action", () => {
      bus.emit({
        category: "process",
        action: "start",
        entityId: "1",
        description: "Start"
      });
      bus.emit({
        category: "process",
        action: "end",
        entityId: "1",
        description: "End"
      });

      const recent = bus.getRecent({ action: "start" });
      expect(recent).toHaveLength(1);
      expect(recent[0]!.action).toBe("start");
    });

    it("should respect limit", () => {
      for (let i = 0; i < 10; i++) {
        bus.emit({
          category: "process",
          action: "start",
          entityId: String(i),
          description: `Process ${i}`
        });
      }

      const recent = bus.getRecent({ limit: 5 });
      expect(recent).toHaveLength(5);
    });

    it("should return newest first", () => {
      bus.emit({
        category: "process",
        action: "start",
        entityId: "first",
        description: "First"
      });

      // Small delay to ensure different timestamps
      const now = Date.now();
      while (Date.now() === now) {
        // Wait for timestamp to change
      }

      bus.emit({
        category: "process",
        action: "end",
        entityId: "second",
        description: "Second"
      });

      const recent = bus.getRecent();
      expect(recent[0]!.entityId).toBe("second");
      expect(recent[1]!.entityId).toBe("first");
    });
  });

  describe("buffer management", () => {
    it("should respect buffer size limit", () => {
      const smallBus = new EventBus({ bufferSize: 3 });

      for (let i = 0; i < 5; i++) {
        smallBus.emit({
          category: "process",
          action: "start",
          entityId: String(i),
          description: `Event ${i}`
        });
      }

      const recent = smallBus.getRecent({ limit: 10 });
      expect(recent).toHaveLength(3);
    });

    it("should clear buffer", () => {
      bus.emit({
        category: "process",
        action: "start",
        entityId: "1",
        description: "Test"
      });

      expect(bus.getRecent()).toHaveLength(1);
      bus.clearBuffer();
      expect(bus.getRecent()).toHaveLength(0);
    });
  });

  describe("lifecycle", () => {
    it("should track running state", () => {
      expect(bus.isRunning()).toBe(false);
      bus.start();
      expect(bus.isRunning()).toBe(true);
      bus.stop();
      expect(bus.isRunning()).toBe(false);
    });

    it("should emit lifecycle events", () => {
      const received: AgentWatchEvent[] = [];
      bus.subscribe((event) => received.push(event));

      bus.start();
      bus.stop();

      const systemEvents = received.filter((e) => e.category === "system");
      expect(systemEvents).toHaveLength(2);
      expect(systemEvents[0]!.action).toBe("start");
      expect(systemEvents[1]!.action).toBe("end");
    });
  });

  describe("getStats", () => {
    it("should return buffer statistics", () => {
      bus.emit({
        category: "process",
        action: "start",
        entityId: "1",
        description: "Test"
      });

      const stats = bus.getStats();
      expect(stats.bufferSize).toBe(500);
      expect(stats.eventCount).toBe(1);
      expect(stats.oldestEvent).toBeDefined();
      expect(stats.newestEvent).toBeDefined();
    });
  });

  describe("getEventBus singleton", () => {
    it("should return same instance", () => {
      const bus1 = getEventBus();
      const bus2 = getEventBus();
      expect(bus1).toBe(bus2);
    });

    it("should reset singleton", () => {
      const bus1 = getEventBus();
      resetEventBus();
      const bus2 = getEventBus();
      expect(bus1).not.toBe(bus2);
    });
  });
});
