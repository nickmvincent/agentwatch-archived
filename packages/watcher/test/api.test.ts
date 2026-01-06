/**
 * Watcher API Tests
 *
 * Tests for the watcher REST API endpoints.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { Hono } from "hono";
import { createWatcherApp, type WatcherAppState } from "../src/api";

// Mock DataStore
class MockDataStore {
  private repos: any[] = [];
  private agents: any[] = [];
  private ports: any[] = [];

  snapshotRepos() {
    return this.repos;
  }
  snapshotAgents() {
    return this.agents;
  }
  snapshotPorts() {
    return this.ports;
  }
  setCallbacks() {}

  // Test helpers
  _setRepos(repos: any[]) {
    this.repos = repos;
  }
  _setAgents(agents: any[]) {
    this.agents = agents;
  }
  _setPorts(ports: any[]) {
    this.ports = ports;
  }
}

// Mock HookStore
class MockHookStore {
  private sessions: Map<string, any> = new Map();
  private toolUsages: Map<string, any[]> = new Map();
  private commits: any[] = [];

  sessionStart(
    sessionId: string,
    transcriptPath: string,
    cwd: string,
    permissionMode = "default",
    source = "startup"
  ) {
    const session = {
      sessionId,
      transcriptPath,
      cwd,
      permissionMode,
      source,
      startTime: Date.now(),
      toolCount: 0,
      lastActivity: Date.now(),
      awaitingUser: false,
      toolsUsed: {},
      commits: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostUsd: 0,
      autoContinueAttempts: 0
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  sessionEnd(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = Date.now();
    }
    return session;
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId) || null;
  }

  getActiveSessions() {
    return [...this.sessions.values()].filter((s) => !s.endTime);
  }

  getAllSessions(limit = 100) {
    return [...this.sessions.values()].slice(0, limit);
  }

  getSessionToolUsages(sessionId: string) {
    return this.toolUsages.get(sessionId) || [];
  }

  recordPreToolUse(
    sessionId: string,
    toolUseId: string,
    toolName: string,
    toolInput: any,
    cwd: string
  ) {
    const usage = {
      toolUseId,
      toolName,
      toolInput,
      sessionId,
      cwd,
      timestamp: Date.now()
    };
    const usages = this.toolUsages.get(sessionId) || [];
    usages.push(usage);
    this.toolUsages.set(sessionId, usages);
    return usage;
  }

  recordPostToolUse(toolUseId: string, toolResponse?: any, error?: string) {
    // Find and update the usage
    for (const usages of this.toolUsages.values()) {
      const usage = usages.find((u: any) => u.toolUseId === toolUseId);
      if (usage) {
        usage.toolResponse = toolResponse;
        usage.error = error;
        usage.success = !error;
        return usage;
      }
    }
    return null;
  }

  updateSessionAwaiting(sessionId: string, awaiting: boolean) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.awaitingUser = awaiting;
      session.lastActivity = Date.now();
    }
  }

  updateSessionTokens(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    estimatedCostUsd: number
  ) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.totalInputTokens += inputTokens;
      session.totalOutputTokens += outputTokens;
      session.estimatedCostUsd += estimatedCostUsd;
    }
    return session;
  }

  recordCommit(
    sessionId: string,
    commitHash: string,
    message = "",
    repoPath = ""
  ) {
    const commit = {
      sessionId,
      commitHash,
      message,
      repoPath,
      timestamp: Date.now()
    };
    this.commits.push(commit);
    return commit;
  }

  getToolStats() {
    return [];
  }

  getDailyStats(days = 30) {
    return [];
  }

  getAllCommits(limit = 100) {
    return this.commits.slice(0, limit);
  }

  cleanupOldData() {}
  setCallbacks() {}
}

// Mock SessionLogger
class MockSessionLogger {
  rotateLogs() {}
  closeAll() {}
}

// Mock ConnectionManager
class MockConnectionManager {
  connect(ws: any) {}
  disconnect(ws: any) {}
  broadcast(msg: any) {}
}

describe("Watcher API", () => {
  let app: Hono;
  let store: MockDataStore;
  let hookStore: MockHookStore;

  beforeEach(() => {
    store = new MockDataStore();
    hookStore = new MockHookStore();

    const state: WatcherAppState = {
      store: store as any,
      hookStore: hookStore as any,
      sessionLogger: new MockSessionLogger() as any,
      connectionManager: new MockConnectionManager() as any,
      config: {
        roots: ["/home/user"],
        repo: {
          refreshFastSeconds: 2,
          refreshSlowSeconds: 30,
          includeUntracked: true,
          showClean: false
        },
        watcher: {
          host: "localhost",
          port: 8420,
          logDir: "~/.agentwatch/logs"
        },
        hookEnhancements: {
          costControls: {
            enabled: false,
            sessionLimitUsd: 5,
            dailyLimitUsd: 50,
            warningThreshold: 0.8
          },
          notificationHub: { enabled: false, desktop: true }
        }
      },
      startedAt: Date.now()
    };

    app = createWatcherApp(state);
  });

  describe("Health & Status", () => {
    it("GET /api/health returns ok", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
    });

    it("GET /api/status returns watcher status", async () => {
      const res = await app.request("/api/status");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.component).toBe("watcher");
      expect(typeof data.uptime_seconds).toBe("number");
    });
  });

  describe("Agents API", () => {
    it("GET /api/agents returns empty list", async () => {
      const res = await app.request("/api/agents");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });

    it("GET /api/agents returns agents", async () => {
      store._setAgents([
        {
          pid: 1234,
          name: "claude",
          cmdline: ["claude"],
          startTime: Date.now(),
          cpuPercent: 5,
          rssKb: 100000
        }
      ]);

      const res = await app.request("/api/agents");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBe(1);
      expect(data[0].pid).toBe(1234);
    });

    it("GET /api/agents/:pid returns 404 for unknown", async () => {
      const res = await app.request("/api/agents/9999");
      expect(res.status).toBe(404);
    });
  });

  describe("Repos API", () => {
    it("GET /api/repos returns repos with changes", async () => {
      store._setRepos([
        {
          path: "/home/user/project",
          branch: "main",
          stagedCount: 2,
          unstagedCount: 1,
          untrackedCount: 0,
          specialState: {},
          health: { lastError: null },
          upstream: null
        }
      ]);

      const res = await app.request("/api/repos");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBe(1);
    });

    it("GET /api/repos filters clean repos by default", async () => {
      store._setRepos([
        {
          path: "/clean",
          branch: "main",
          stagedCount: 0,
          unstagedCount: 0,
          untrackedCount: 0,
          specialState: {}
        }
      ]);

      const res = await app.request("/api/repos");
      const data = await res.json();
      expect(data.length).toBe(0);
    });
  });

  describe("Hook Sessions API", () => {
    it("GET /api/hooks/sessions returns sessions", async () => {
      hookStore.sessionStart("test-session", "", "/home/user/project");

      const res = await app.request("/api/hooks/sessions");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBe(1);
    });

    it("GET /api/hooks/sessions/:id returns session with tools", async () => {
      hookStore.sessionStart("test-session", "", "/home/user/project");

      const res = await app.request("/api/hooks/sessions/test-session");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session_id).toBe("test-session");
    });
  });

  describe("Hook Event Handlers", () => {
    it("POST /api/hooks/session-start creates session", async () => {
      const res = await app.request("/api/hooks/session-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "new-session",
          cwd: "/home/user/project"
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBe("continue");
    });

    it("POST /api/hooks/session-end ends session", async () => {
      hookStore.sessionStart("test-session", "", "/home/user/project");

      const res = await app.request("/api/hooks/session-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: "test-session" })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBe("continue");
    });

    it("POST /api/hooks/pre-tool-use records tool usage", async () => {
      hookStore.sessionStart("test-session", "", "/home/user/project");

      const res = await app.request("/api/hooks/pre-tool-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-session",
          tool_name: "Read",
          tool_input: { file_path: "/test.txt" },
          tool_use_id: "tool-1"
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBe("continue");
    });

    it("POST /api/hooks/post-tool-use completes tool usage", async () => {
      hookStore.sessionStart("test-session", "", "/home/user/project");
      hookStore.recordPreToolUse(
        "test-session",
        "tool-1",
        "Read",
        {},
        "/home/user/project"
      );

      const res = await app.request("/api/hooks/post-tool-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-session",
          tool_name: "Read",
          tool_use_id: "tool-1",
          tool_response: { content: "file contents" }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBe("continue");
    });
  });

  describe("Config API", () => {
    it("GET /api/config returns watcher configuration", async () => {
      const res = await app.request("/api/config");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.roots).toBeInstanceOf(Array);
      expect(data.repo).toHaveProperty("refresh_fast_seconds");
      expect(data.repo).toHaveProperty("refresh_slow_seconds");
      expect(data.watcher).toHaveProperty("host");
      expect(data.watcher).toHaveProperty("port");
      expect(data.watcher.port).toBe(8420);
    });

    it("GET /api/claude/settings returns settings info", async () => {
      const res = await app.request("/api/claude/settings");
      expect(res.status).toBe(200);
      const data = await res.json();
      // Should always have these fields
      expect(data).toHaveProperty("exists");
      expect(data).toHaveProperty("path");
      expect(typeof data.exists).toBe("boolean");
    });
  });

  describe("Ports API", () => {
    it("GET /api/ports returns empty list when no ports", async () => {
      store._setPorts([]);
      const res = await app.request("/api/ports");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });

    it("GET /api/ports returns ports", async () => {
      store._setPorts([
        {
          port: 3000,
          protocol: "tcp",
          state: "LISTEN",
          pid: 1234,
          name: "node"
        }
      ]);
      const res = await app.request("/api/ports");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBe(1);
      expect(data[0].port).toBe(3000);
    });

    it("GET /api/ports/:port returns 404 for unknown port", async () => {
      store._setPorts([]);
      const res = await app.request("/api/ports/9999");
      expect(res.status).toBe(404);
    });
  });

  describe("Hook Statistics API", () => {
    it("GET /api/hooks/tools/stats returns tool statistics", async () => {
      const res = await app.request("/api/hooks/tools/stats");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET /api/hooks/stats/daily returns daily stats", async () => {
      const res = await app.request("/api/hooks/stats/daily");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET /api/hooks/commits returns commits", async () => {
      const res = await app.request("/api/hooks/commits");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("Sandbox API", () => {
    it("GET /api/sandbox/status returns installation status", async () => {
      const res = await app.request("/api/sandbox/status");
      expect(res.status).toBe(200);
      const data = await res.json();
      // Should have docker, image, script status
      expect(data).toHaveProperty("docker");
      expect(data).toHaveProperty("image");
      expect(data).toHaveProperty("script");
      expect(data).toHaveProperty("ready");
      expect(typeof data.ready).toBe("boolean");
    });

    it("GET /api/sandbox/presets returns all presets", async () => {
      const res = await app.request("/api/sandbox/presets");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.presets).toBeInstanceOf(Array);
      expect(data.presets.length).toBe(4); // permissive, balanced, restrictive, custom
      // Check preset structure
      const preset = data.presets[0];
      expect(preset).toHaveProperty("id");
      expect(preset).toHaveProperty("name");
      expect(preset).toHaveProperty("description");
      expect(preset).toHaveProperty("riskLevel");
      expect(preset).toHaveProperty("sandbox");
      expect(preset).toHaveProperty("permissions");
    });

    it("GET /api/sandbox/presets/:id returns specific preset", async () => {
      const res = await app.request("/api/sandbox/presets/balanced");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe("balanced");
      expect(data.name).toBe("Balanced");
      expect(data.sandbox.enabled).toBe(true);
    });

    it("GET /api/sandbox/presets/:id returns 404 for unknown preset", async () => {
      const res = await app.request("/api/sandbox/presets/nonexistent");
      expect(res.status).toBe(404);
    });

    it("GET /api/sandbox/current returns current configuration", async () => {
      const res = await app.request("/api/sandbox/current");
      expect(res.status).toBe(200);
      const data = await res.json();
      // May or may not have settings depending on test environment
      expect(data).toHaveProperty("exists");
      expect(typeof data.exists).toBe("boolean");
    });
  });
});
