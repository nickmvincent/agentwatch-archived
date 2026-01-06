/**
 * Watcher Integration Tests
 *
 * Tests real user flows for the watcher server - hook lifecycle,
 * data persistence, and event broadcasting.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createWatcherApp, type WatcherAppState } from "../src/api";
import { HookStore } from "@agentwatch/monitor";
import { DataStore } from "@agentwatch/monitor";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Test data directory
const TEST_DATA_DIR = "/tmp/claude/agentwatch-watcher-integration-test";
const mockSessionStore = {
  createSession: () => ({
    id: "test",
    prompt: "",
    agent: "",
    cwd: "",
    startedAt: Date.now(),
    status: "running"
  }),
  updateSession: () => null,
  endSession: () => null,
  getSession: () => null,
  getSessionByPid: () => null,
  listSessions: () => [],
  markStaleSessions: () => [],
  cleanup: () => {}
};

describe("Watcher Integration: Hook Lifecycle", () => {
  let app: ReturnType<typeof createWatcherApp>;
  let hookStore: HookStore;
  let dataStore: DataStore;

  beforeEach(async () => {
    // Create fresh test directory
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
    await mkdir(TEST_DATA_DIR, { recursive: true });
    await mkdir(join(TEST_DATA_DIR, "hooks"), { recursive: true });

    // Create real stores
    hookStore = new HookStore(TEST_DATA_DIR);
    dataStore = new DataStore();

    const state: WatcherAppState = {
      store: dataStore,
      hookStore: hookStore,
      sessionStore: mockSessionStore as any,
      sessionLogger: {
        rotateLogs: () => {},
        closeAll: () => {}
      } as any,
      connectionManager: {
        connect: () => {},
        disconnect: () => {},
        broadcast: () => {}
      } as any,
      config: {
        roots: ["/tmp"],
        repo: {
          refreshFastSeconds: 2,
          refreshSlowSeconds: 30,
          includeUntracked: true,
          showClean: false
        },
        agents: {
          refreshSeconds: 2,
          activeCpuThreshold: 1.0,
          stalledSeconds: 300,
          matchers: []
        },
        watcher: {
          host: "localhost",
          port: 8420,
          logDir: join(TEST_DATA_DIR, "logs")
        },
        testGate: {
          enabled: false,
          testCommand: "",
          passFile: "~/.agentwatch/test-pass",
          passFileMaxAgeSeconds: 3600
        },
        notifications: {
          enable: false,
          hookAwaitingInput: true,
          hookSessionEnd: true,
          hookToolFailure: true,
          hookLongRunning: true,
          hookStop: true,
          longRunningThresholdSeconds: 300,
          hookSessionStart: false,
          hookPreToolUse: false,
          hookPostToolUse: false,
          hookNotification: false,
          hookPermissionRequest: false,
          hookUserPromptSubmit: false,
          hookSubagentStop: false,
          hookPreCompact: false
        },
        hookEnhancements: {
          costControls: {
            enabled: false,
            sessionLimitUsd: 5,
            dailyLimitUsd: 50,
            warningThreshold: 0.8
          },
          notificationHub: { enabled: false, desktop: false },
          rules: {
            enabled: false,
            rulesFile: "~/.agentwatch/rules.jsonl",
            enabledRuleSets: []
          },
          tokenTracking: {
            enabled: true,
            costWarningThresholdUsd: 5.0
          },
          autoContinue: {
            enabled: false,
            onFailingTests: false,
            onLintErrors: false,
            maxAttempts: 3
          },
          stopBlocking: {
            enabled: false,
            requireTestsPass: false,
            requireNoLintErrors: false,
            maxBlockAttempts: 2
          }
        }
      },
      startedAt: Date.now()
    };

    app = createWatcherApp(state);
  });

  afterEach(async () => {
    // Cleanup
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("completes full session lifecycle: start → tool → end", async () => {
    const sessionId = `integration-test-${Date.now()}`;

    // 1. Start session
    const startRes = await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        cwd: "/tmp/test-project",
        permission_mode: "default"
      })
    });
    expect(startRes.status).toBe(200);
    const startData = await startRes.json();
    expect(startData.result).toBe("continue");

    // Verify session exists
    const session = hookStore.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.cwd).toBe("/tmp/test-project");

    // 2. Use a tool (pre)
    const preToolRes = await app.request("/api/hooks/pre-tool-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: "Read",
        tool_input: { file_path: "/tmp/test.txt" },
        tool_use_id: "tool-123"
      })
    });
    expect(preToolRes.status).toBe(200);

    // 3. Complete tool use (post)
    const postToolRes = await app.request("/api/hooks/post-tool-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: "Read",
        tool_use_id: "tool-123",
        tool_response: { content: "file contents here" }
      })
    });
    expect(postToolRes.status).toBe(200);

    // Verify tool usage recorded
    const usages = hookStore.getSessionToolUsages(sessionId);
    expect(usages.length).toBe(1);
    expect(usages[0].toolName).toBe("Read");
    expect(usages[0].success).toBe(true);

    // 4. End session
    const endRes = await app.request("/api/hooks/session-end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId })
    });
    expect(endRes.status).toBe(200);

    // Verify session ended
    const endedSession = hookStore.getSession(sessionId);
    expect(endedSession?.endTime).toBeDefined();
  });

  it("tracks multiple tool usages in a session", async () => {
    const sessionId = `multi-tool-${Date.now()}`;

    // Start session
    await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        cwd: "/tmp/project"
      })
    });

    // Use multiple tools
    const tools = [
      { name: "Read", id: "tool-1", input: { file_path: "/a.txt" } },
      {
        name: "Write",
        id: "tool-2",
        input: { file_path: "/b.txt", content: "x" }
      },
      { name: "Bash", id: "tool-3", input: { command: "ls" } },
      { name: "Read", id: "tool-4", input: { file_path: "/c.txt" } }
    ];

    for (const tool of tools) {
      await app.request("/api/hooks/pre-tool-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          tool_name: tool.name,
          tool_input: tool.input,
          tool_use_id: tool.id
        })
      });

      await app.request("/api/hooks/post-tool-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          tool_name: tool.name,
          tool_use_id: tool.id,
          tool_response: { success: true }
        })
      });
    }

    // Verify all tools recorded
    const usages = hookStore.getSessionToolUsages(sessionId);
    expect(usages.length).toBe(4);

    // Verify session tool counts
    const session = hookStore.getSession(sessionId);
    expect(session?.toolCount).toBe(4);
    expect(session?.toolsUsed?.Read).toBe(2);
    expect(session?.toolsUsed?.Write).toBe(1);
    expect(session?.toolsUsed?.Bash).toBe(1);
  });

  it("handles tool failures gracefully", async () => {
    const sessionId = `failed-tool-${Date.now()}`;

    await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        cwd: "/tmp/project"
      })
    });

    // Pre tool use
    await app.request("/api/hooks/pre-tool-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "invalid-command" },
        tool_use_id: "failed-tool-1"
      })
    });

    // Post tool use with error
    const postRes = await app.request("/api/hooks/post-tool-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_use_id: "failed-tool-1",
        error: "Command not found: invalid-command"
      })
    });
    expect(postRes.status).toBe(200);

    // Verify failure recorded
    const usages = hookStore.getSessionToolUsages(sessionId);
    expect(usages[0].success).toBe(false);
    expect(usages[0].error).toContain("Command not found");
  });

  it("tracks user prompts and awaiting state", async () => {
    const sessionId = `prompt-test-${Date.now()}`;

    await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        cwd: "/tmp/project"
      })
    });

    // Simulate user prompt submit
    const promptRes = await app.request("/api/hooks/user-prompt-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        prompt: "Please fix the bug in main.ts"
      })
    });
    expect(promptRes.status).toBe(200);

    // Session should no longer be awaiting user
    const session = hookStore.getSession(sessionId);
    expect(session?.awaitingUser).toBe(false);
  });

  it("records token usage and cost estimates", async () => {
    const sessionId = `token-test-${Date.now()}`;

    await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        cwd: "/tmp/project"
      })
    });

    // Record tool usage that includes token counts
    await app.request("/api/hooks/pre-tool-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: "Read",
        tool_input: { file_path: "/test.txt" },
        tool_use_id: "tool-with-tokens"
      })
    });

    // Post-tool-use with token counts
    await app.request("/api/hooks/post-tool-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: "Read",
        tool_use_id: "tool-with-tokens",
        tool_response: { content: "file contents" },
        input_tokens: 5000,
        output_tokens: 1500
      })
    });

    // Verify token tracking
    const session = hookStore.getSession(sessionId);
    expect(session?.totalInputTokens).toBe(5000);
    expect(session?.totalOutputTokens).toBe(1500);
  });
});

describe("Watcher Integration: Session Queries", () => {
  let app: ReturnType<typeof createWatcherApp>;
  let hookStore: HookStore;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
    await mkdir(TEST_DATA_DIR, { recursive: true });
    await mkdir(join(TEST_DATA_DIR, "hooks"), { recursive: true });

    hookStore = new HookStore(TEST_DATA_DIR);

    const state: WatcherAppState = {
      store: new DataStore(),
      hookStore: hookStore,
      sessionLogger: { rotateLogs: () => {}, closeAll: () => {} } as any,
      connectionManager: {
        connect: () => {},
        disconnect: () => {},
        broadcast: () => {}
      } as any,
      config: {
        roots: [],
        repo: {
          refreshFastSeconds: 2,
          refreshSlowSeconds: 30,
          includeUntracked: true,
          showClean: false
        },
        agents: {
          refreshSeconds: 2,
          activeCpuThreshold: 1.0,
          stalledSeconds: 300,
          matchers: []
        },
        watcher: {
          host: "localhost",
          port: 8420,
          logDir: join(TEST_DATA_DIR, "logs")
        },
        testGate: {
          enabled: false,
          testCommand: "",
          passFile: "~/.agentwatch/test-pass",
          passFileMaxAgeSeconds: 3600
        },
        notifications: {
          enable: false,
          hookAwaitingInput: true,
          hookSessionEnd: true,
          hookToolFailure: true,
          hookLongRunning: true,
          hookStop: true,
          longRunningThresholdSeconds: 300,
          hookSessionStart: false,
          hookPreToolUse: false,
          hookPostToolUse: false,
          hookNotification: false,
          hookPermissionRequest: false,
          hookUserPromptSubmit: false,
          hookSubagentStop: false,
          hookPreCompact: false
        },
        hookEnhancements: {
          costControls: {
            enabled: false,
            sessionLimitUsd: 5,
            dailyLimitUsd: 50,
            warningThreshold: 0.8
          },
          notificationHub: { enabled: false, desktop: false },
          rules: {
            enabled: false,
            rulesFile: "~/.agentwatch/rules.jsonl",
            enabledRuleSets: []
          },
          tokenTracking: {
            enabled: true,
            costWarningThresholdUsd: 5.0
          },
          autoContinue: {
            enabled: false,
            onFailingTests: false,
            onLintErrors: false,
            maxAttempts: 3
          },
          stopBlocking: {
            enabled: false,
            requireTestsPass: false,
            requireNoLintErrors: false,
            maxBlockAttempts: 2
          }
        }
      },
      startedAt: Date.now()
    };

    app = createWatcherApp(state);
  });

  afterEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("GET /api/hooks/sessions returns all sessions", async () => {
    // Create multiple sessions
    for (let i = 0; i < 3; i++) {
      await app.request("/api/hooks/session-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: `session-${i}`,
          cwd: `/tmp/project-${i}`
        })
      });
    }

    const res = await app.request("/api/hooks/sessions");
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions.length).toBe(3);
  });

  it("GET /api/hooks/sessions/:id returns session with tools", async () => {
    const sessionId = "detailed-session";

    // Create session with tools
    await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        cwd: "/tmp/project"
      })
    });

    await app.request("/api/hooks/pre-tool-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: "Read",
        tool_input: { file_path: "/test.txt" },
        tool_use_id: "tool-1"
      })
    });

    await app.request("/api/hooks/post-tool-use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: "Read",
        tool_use_id: "tool-1",
        tool_response: { content: "test" }
      })
    });

    const res = await app.request(`/api/hooks/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.session_id).toBe(sessionId);
    expect(data.tool_count).toBe(1);
    expect(Array.isArray(data.tool_usages)).toBe(true);
    expect(data.tool_usages.length).toBe(1);
    expect(data.tool_usages[0].tool_name).toBe("Read");
  });

  it("GET /api/hooks/sessions?active=true returns only active sessions", async () => {
    // Create and end one session
    await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "ended-session", cwd: "/tmp" })
    });
    await app.request("/api/hooks/session-end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "ended-session" })
    });

    // Create active session
    await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "active-session", cwd: "/tmp" })
    });

    const res = await app.request("/api/hooks/sessions?active=true");
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions.length).toBe(1);
    expect(sessions[0].session_id).toBe("active-session");
  });
});

describe("Watcher Integration: Statistics", () => {
  let app: ReturnType<typeof createWatcherApp>;
  let hookStore: HookStore;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
    await mkdir(TEST_DATA_DIR, { recursive: true });
    await mkdir(join(TEST_DATA_DIR, "hooks"), { recursive: true });

    hookStore = new HookStore(TEST_DATA_DIR);

    const state: WatcherAppState = {
      store: new DataStore(),
      hookStore: hookStore,
      sessionLogger: { rotateLogs: () => {}, closeAll: () => {} } as any,
      connectionManager: {
        connect: () => {},
        disconnect: () => {},
        broadcast: () => {}
      } as any,
      config: {
        roots: [],
        repo: {
          refreshFastSeconds: 2,
          refreshSlowSeconds: 30,
          includeUntracked: true,
          showClean: false
        },
        agents: {
          refreshSeconds: 2,
          activeCpuThreshold: 1.0,
          stalledSeconds: 300,
          matchers: []
        },
        watcher: {
          host: "localhost",
          port: 8420,
          logDir: join(TEST_DATA_DIR, "logs")
        },
        testGate: {
          enabled: false,
          testCommand: "",
          passFile: "~/.agentwatch/test-pass",
          passFileMaxAgeSeconds: 3600
        },
        notifications: {
          enable: false,
          hookAwaitingInput: true,
          hookSessionEnd: true,
          hookToolFailure: true,
          hookLongRunning: true,
          hookStop: true,
          longRunningThresholdSeconds: 300,
          hookSessionStart: false,
          hookPreToolUse: false,
          hookPostToolUse: false,
          hookNotification: false,
          hookPermissionRequest: false,
          hookUserPromptSubmit: false,
          hookSubagentStop: false,
          hookPreCompact: false
        },
        hookEnhancements: {
          costControls: {
            enabled: false,
            sessionLimitUsd: 5,
            dailyLimitUsd: 50,
            warningThreshold: 0.8
          },
          notificationHub: { enabled: false, desktop: false },
          rules: {
            enabled: false,
            rulesFile: "~/.agentwatch/rules.jsonl",
            enabledRuleSets: []
          },
          tokenTracking: {
            enabled: true,
            costWarningThresholdUsd: 5.0
          },
          autoContinue: {
            enabled: false,
            onFailingTests: false,
            onLintErrors: false,
            maxAttempts: 3
          },
          stopBlocking: {
            enabled: false,
            requireTestsPass: false,
            requireNoLintErrors: false,
            maxBlockAttempts: 2
          }
        }
      },
      startedAt: Date.now()
    };

    app = createWatcherApp(state);
  });

  afterEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("GET /api/hooks/tools/stats returns tool statistics", async () => {
    const sessionId = "stats-session";

    await app.request("/api/hooks/session-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, cwd: "/tmp" })
    });

    // Multiple tool uses
    for (let i = 0; i < 5; i++) {
      await app.request("/api/hooks/pre-tool-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          tool_name: "Read",
          tool_input: {},
          tool_use_id: `tool-${i}`
        })
      });
      await app.request("/api/hooks/post-tool-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          tool_name: "Read",
          tool_use_id: `tool-${i}`,
          tool_response: {}
        })
      });
    }

    const res = await app.request("/api/hooks/tools/stats");
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(Array.isArray(stats)).toBe(true);

    const readStats = stats.find((s: any) => s.tool_name === "Read");
    expect(readStats).toBeDefined();
    expect(readStats.total_calls).toBe(5);
  });
});
