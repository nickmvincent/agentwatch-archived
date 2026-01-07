/**
 * Tests for core storage module.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  expandPath,
  ensureDir,
  writeFileAtomic,
  loadJson,
  saveJson,
  createJsonStore,
  appendJsonl,
  readJsonl,
  createPartitionedJsonlStore
} from "../src/storage";

describe("storage/file-utils", () => {
  describe("expandPath", () => {
    test("expands ~ to home directory", () => {
      const expanded = expandPath("~/.agentwatch");
      expect(expanded).not.toContain("~");
      expect(expanded).toContain(".agentwatch");
    });

    test("returns non-tilde paths unchanged", () => {
      const path = "/absolute/path";
      expect(expandPath(path)).toBe(path);
    });

    test("handles paths starting with ~/", () => {
      const expanded = expandPath("~/projects/test");
      expect(expanded).not.toContain("~");
      expect(expanded).toContain("projects/test");
    });
  });

  describe("ensureDir", () => {
    const testDir = join(tmpdir(), "agentwatch-test-" + Date.now());

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    test("creates parent directories for file path", () => {
      const filePath = join(testDir, "subdir", "file.txt");
      ensureDir(filePath);
      expect(existsSync(join(testDir, "subdir"))).toBe(true);
    });

    test("handles existing directories", () => {
      mkdirSync(testDir, { recursive: true });
      const filePath = join(testDir, "file.txt");
      expect(() => ensureDir(filePath)).not.toThrow();
    });
  });

  describe("writeFileAtomic", () => {
    const testDir = join(tmpdir(), "agentwatch-test-atomic-" + Date.now());
    const testFile = join(testDir, "test.txt");

    beforeEach(() => {
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    test("writes content to file", () => {
      writeFileAtomic(testFile, "hello world");
      expect(readFileSync(testFile, "utf-8")).toBe("hello world");
    });

    test("overwrites existing file", () => {
      writeFileSync(testFile, "old content");
      writeFileAtomic(testFile, "new content");
      expect(readFileSync(testFile, "utf-8")).toBe("new content");
    });
  });
});

describe("storage/json-store", () => {
  const testDir = join(tmpdir(), "agentwatch-test-json-" + Date.now());
  const testFile = join(testDir, "store.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe("loadJson", () => {
    test("returns default for missing file", () => {
      const result = loadJson(testFile, { count: 0 });
      expect(result).toEqual({ count: 0 });
    });

    test("loads existing JSON file", () => {
      writeFileSync(testFile, JSON.stringify({ count: 42 }));
      const result = loadJson(testFile, { count: 0 });
      expect(result.count).toBe(42);
    });

    test("returns default for invalid JSON", () => {
      writeFileSync(testFile, "not valid json");
      const result = loadJson(testFile, { count: 0 });
      expect(result).toEqual({ count: 0 });
    });
  });

  describe("saveJson", () => {
    test("saves object as JSON", () => {
      saveJson(testFile, { name: "test", value: 123 });
      const content = JSON.parse(readFileSync(testFile, "utf-8"));
      expect(content.name).toBe("test");
      expect(content.value).toBe(123);
    });

    test("creates parent directories", () => {
      const nestedFile = join(testDir, "nested", "deep", "store.json");
      saveJson(nestedFile, { nested: true });
      expect(existsSync(nestedFile)).toBe(true);
    });
  });

  describe("createJsonStore", () => {
    test("provides load/save/update methods", () => {
      const store = createJsonStore<{ count: number }>(testFile, { count: 0 });

      expect(store.load().count).toBe(0);

      store.save({ count: 10 });
      expect(store.load().count).toBe(10);

      store.update((data) => ({ count: data.count + 5 }));
      expect(store.load().count).toBe(15);
    });
  });
});

describe("storage/jsonl-store", () => {
  const testDir = join(tmpdir(), "agentwatch-test-jsonl-" + Date.now());
  const testFile = join(testDir, "records.jsonl");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe("appendJsonl", () => {
    test("appends record as JSON line", () => {
      appendJsonl(testFile, { id: 1, name: "first" });
      appendJsonl(testFile, { id: 2, name: "second" });

      const content = readFileSync(testFile, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).id).toBe(1);
      expect(JSON.parse(lines[1]).id).toBe(2);
    });

    test("creates parent directories", () => {
      const nestedFile = join(testDir, "nested", "records.jsonl");
      appendJsonl(nestedFile, { nested: true });
      expect(existsSync(nestedFile)).toBe(true);
    });
  });

  describe("readJsonl", () => {
    test("reads all records from file", () => {
      writeFileSync(testFile, '{"id":1}\n{"id":2}\n{"id":3}\n');

      const records = readJsonl<{ id: number }>(testFile);
      expect(records.length).toBe(3);
      expect(records[0].id).toBe(1);
      expect(records[2].id).toBe(3);
    });

    test("returns empty array for missing file", () => {
      const records = readJsonl(join(testDir, "missing.jsonl"));
      expect(records).toEqual([]);
    });

    test("skips invalid JSON lines", () => {
      writeFileSync(testFile, '{"id":1}\ninvalid\n{"id":3}\n');

      const records = readJsonl<{ id: number }>(testFile);
      expect(records.length).toBe(2);
    });

    test("handles empty lines gracefully", () => {
      writeFileSync(testFile, '{"id":1}\n\n{"id":2}\n\n');

      const records = readJsonl<{ id: number }>(testFile);
      expect(records.length).toBe(2);
    });
  });

  describe("createPartitionedJsonlStore", () => {
    test("provides append and todayPath methods", () => {
      const pattern = join(testDir, "events_*.jsonl");
      const store = createPartitionedJsonlStore<{ event: string }>(pattern);

      // Verify todayPath contains expected format
      const todayPath = store.todayPath();
      expect(todayPath).toContain("events_");
      expect(todayPath).toContain(".jsonl");

      // Append creates the file
      store.append({ event: "test" });
      expect(existsSync(todayPath)).toBe(true);

      // Verify content was written
      const content = readFileSync(todayPath, "utf-8");
      expect(content).toContain('"event":"test"');
    });

    test("has cleanup method", () => {
      const pattern = join(testDir, "logs_*.jsonl");
      const store = createPartitionedJsonlStore<{ msg: string }>(pattern);

      // Cleanup returns expected structure
      const result = store.cleanup({ maxAgeDays: 30 });
      expect(result).toHaveProperty("deleted");
      expect(result).toHaveProperty("kept");
      expect(Array.isArray(result.deleted)).toBe(true);
      expect(Array.isArray(result.kept)).toBe(true);
    });
  });
});
