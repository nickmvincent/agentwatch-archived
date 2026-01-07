/**
 * Tests for core annotator module.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock the storage paths before importing annotator functions
const testDir = join(tmpdir(), "agentwatch-test-annotator-" + Date.now());

// We test the store logic directly since the actual functions use hardcoded paths
import { loadJson, saveJson } from "../src/storage";

describe("annotator/agent-metadata", () => {
  const metadataFile = join(testDir, "agent-metadata.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test("loads empty store when file missing", () => {
    const store = loadJson(metadataFile, { metadata: {}, updatedAt: "", version: 1 });
    expect(store.metadata).toEqual({});
  });

  test("preserves metadata structure", () => {
    const data = {
      metadata: {
        "claude-code": {
          customName: "My Claude",
          description: "Main coding assistant",
          tags: ["primary"],
          lastSeen: Date.now(),
          notes: "Test notes"
        }
      },
      updatedAt: new Date().toISOString(),
      version: 1
    };

    saveJson(metadataFile, data);
    const loaded = loadJson(metadataFile, { metadata: {}, updatedAt: "", version: 1 });

    expect(loaded.metadata["claude-code"].customName).toBe("My Claude");
    expect(loaded.metadata["claude-code"].tags).toContain("primary");
  });
});

describe("annotator/conversation-metadata", () => {
  const metadataFile = join(testDir, "conversation-metadata.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test("stores conversation custom names", () => {
    const store: Record<string, { customName: string | null; updatedAt: string }> = {};

    store["conv-123"] = {
      customName: "Bug Fix Session",
      updatedAt: new Date().toISOString()
    };

    saveJson(metadataFile, store);
    const loaded = loadJson<typeof store>(metadataFile, {});

    expect(loaded["conv-123"].customName).toBe("Bug Fix Session");
  });

  test("handles null custom names", () => {
    const store: Record<string, { customName: string | null; updatedAt: string }> = {};

    store["conv-456"] = {
      customName: null,
      updatedAt: new Date().toISOString()
    };

    saveJson(metadataFile, store);
    const loaded = loadJson<typeof store>(metadataFile, {});

    expect(loaded["conv-456"].customName).toBeNull();
  });
});

describe("annotator/annotations", () => {
  const annotationsFile = join(testDir, "annotations.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  interface SessionAnnotation {
    feedback?: "positive" | "negative" | null;
    rating?: number;
    notes?: string;
    userTags?: string[];
    taskDescription?: string;
    goalAchieved?: boolean;
    updatedAt: string;
  }

  test("stores session feedback", () => {
    const annotations: Record<string, SessionAnnotation> = {};

    annotations["session-abc"] = {
      feedback: "positive",
      rating: 5,
      notes: "Great work!",
      updatedAt: new Date().toISOString()
    };

    saveJson(annotationsFile, annotations);
    const loaded = loadJson<typeof annotations>(annotationsFile, {});

    expect(loaded["session-abc"].feedback).toBe("positive");
    expect(loaded["session-abc"].rating).toBe(5);
  });

  test("supports user tags", () => {
    const annotations: Record<string, SessionAnnotation> = {};

    annotations["session-xyz"] = {
      userTags: ["refactor", "tested", "production"],
      updatedAt: new Date().toISOString()
    };

    saveJson(annotationsFile, annotations);
    const loaded = loadJson<typeof annotations>(annotationsFile, {});

    expect(loaded["session-xyz"].userTags).toContain("refactor");
    expect(loaded["session-xyz"].userTags?.length).toBe(3);
  });

  test("tracks goal achievement", () => {
    const annotations: Record<string, SessionAnnotation> = {};

    annotations["session-goal"] = {
      taskDescription: "Fix login bug",
      goalAchieved: true,
      updatedAt: new Date().toISOString()
    };

    saveJson(annotationsFile, annotations);
    const loaded = loadJson<typeof annotations>(annotationsFile, {});

    expect(loaded["session-goal"].goalAchieved).toBe(true);
    expect(loaded["session-goal"].taskDescription).toBe("Fix login bug");
  });
});
