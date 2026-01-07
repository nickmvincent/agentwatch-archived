/**
 * Tests for core audit module.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import type {
  AuditCategory,
  AuditAction,
  AuditEntry
} from "../src/audit";

import { logAuditEventStub } from "../src/audit";

describe("audit/types", () => {
  test("AuditCategory values", () => {
    const categories: AuditCategory[] = [
      "session",
      "sharing",
      "configuration",
      "analysis",
      "annotation"
    ];

    // Just verify the types compile
    expect(categories.length).toBe(5);
  });

  test("AuditAction values", () => {
    const actions: AuditAction[] = [
      "created",
      "updated",
      "deleted",
      "exported",
      "imported",
      "started",
      "stopped",
      "completed"
    ];

    // Just verify the types compile
    expect(actions.length).toBe(8);
  });

  test("AuditEntry structure", () => {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      category: "session",
      action: "started",
      entityId: "session-123",
      description: "Session started",
      source: "watcher"
    };

    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.category).toBe("session");
    expect(entry.action).toBe("started");
    expect(entry.entityId).toBe("session-123");
  });

  test("AuditEntry with optional details", () => {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      category: "sharing",
      action: "exported",
      entityId: "export-456",
      description: "Data exported to HuggingFace",
      source: "analyzer",
      details: {
        format: "jsonl",
        recordCount: 100,
        destination: "huggingface"
      }
    };

    expect(entry.details).toBeDefined();
    expect(entry.details?.format).toBe("jsonl");
  });
});

describe("audit/audit-stub", () => {
  test("stub function does nothing and returns void", () => {
    // Should not throw
    expect(() => {
      logAuditEventStub("session", "started", "test-123", "Test event");
    }).not.toThrow();
  });

  test("stub function accepts all parameters", () => {
    expect(() => {
      logAuditEventStub(
        "configuration",
        "updated",
        "config-1",
        "Config updated",
        { setting: "value" }
      );
    }).not.toThrow();
  });
});

describe("audit/audit-log (integration)", () => {
  // Note: The actual audit log writes to ~/.agentwatch/events.jsonl
  // These tests verify the structure, not the actual file writing

  test("audit entry can be serialized to JSON", () => {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      category: "annotation",
      action: "created",
      entityId: "annotation-789",
      description: "Annotation added",
      source: "web"
    };

    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as AuditEntry;

    expect(parsed.category).toBe("annotation");
    expect(parsed.action).toBe("created");
    expect(parsed.entityId).toBe("annotation-789");
  });

  test("audit entries can be appended as JSONL", () => {
    const entries: AuditEntry[] = [
      {
        timestamp: Date.now(),
        category: "session",
        action: "started",
        entityId: "session-1",
        description: "Session 1 started",
        source: "watcher"
      },
      {
        timestamp: Date.now() + 1000,
        category: "session",
        action: "completed",
        entityId: "session-1",
        description: "Session 1 completed",
        source: "watcher"
      }
    ];

    const jsonl = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    const lines = jsonl.trim().split("\n");

    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).action).toBe("started");
    expect(JSON.parse(lines[1]).action).toBe("completed");
  });
});
