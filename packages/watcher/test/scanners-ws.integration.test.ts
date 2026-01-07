import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  DataStore,
  HookStore,
  PortScanner,
  ProcessScanner,
  RepoScanner
} from "@agentwatch/monitor";
import {
  agentToDict,
  hookSessionToDict,
  portToDict,
  repoToDict,
  toolUsageToDict
} from "@agentwatch/shared-api";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectionManager } from "../src/connection-manager";
import { createWatcherApp, websocket } from "../src/api";

interface TestResources {
  tempDir: string;
  repoDir: string;
  agentProcess?: ReturnType<typeof Bun.spawn>;
  processScanner?: ProcessScanner;
  repoScanner?: RepoScanner;
  portScanner?: PortScanner;
  server?: ReturnType<typeof Bun.serve>;
  portServer?: ReturnType<typeof Bun.serve>;
  ws?: WebSocket;
}

async function waitForMessage<T>(
  messages: T[],
  predicate: (msg: T) => boolean,
  timeoutMs = 5000
): Promise<T> {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const match = messages.find(predicate);
      if (match) {
        resolve(match);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for websocket message"));
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

describe("Watcher Integration: Scanners + WebSocket Broadcasts", () => {
  let resources: TestResources;

  beforeEach(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "agentwatch-ws-"));
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });
    resources = { tempDir, repoDir };
  });

  afterEach(async () => {
    resources.processScanner?.stop();
    resources.repoScanner?.stop();
    resources.portScanner?.stop();
    resources.ws?.close();
    resources.server?.stop();
    resources.portServer?.stop();
    resources.agentProcess?.kill();

    if (resources.tempDir) {
      await rm(resources.tempDir, { recursive: true, force: true });
    }
  });

  it("broadcasts updates from scanners over WebSocket", async () => {
    const store = new DataStore();
    const hookStore = new HookStore(join(resources.tempDir, "hooks"));
    const connectionManager = new ConnectionManager();
    const sessionStore = {
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

    store.setCallbacks({
      onReposChange: (repos) => {
        connectionManager.broadcast({
          type: "repos_update",
          repos: repos.map((r) => repoToDict(r))
        });
      },
      onAgentsChange: (agents) => {
        connectionManager.broadcast({
          type: "agents_update",
          agents: agents.map((a) => agentToDict(a))
        });
      },
      onPortsChange: (ports) => {
        connectionManager.broadcast({
          type: "ports_update",
          ports: ports.map((p) => portToDict(p))
        });
      }
    });

    hookStore.setCallbacks({
      onSessionChange: (session) => {
        connectionManager.broadcast({
          type: "hook_session_update",
          session: hookSessionToDict(session)
        });
      },
      onToolUsage: (usage) => {
        connectionManager.broadcast({
          type: "hook_tool_complete",
          usage: toolUsageToDict(usage)
        });
      }
    });

    const app = createWatcherApp({
      store,
      hookStore,
      sessionStore: sessionStore as any,
      sessionLogger: {
        rotateLogs: () => {},
        closeAll: () => {}
      } as any,
      connectionManager,
      config: {
        roots: [resources.repoDir],
        repo: {
          refreshFastSeconds: 1,
          refreshSlowSeconds: 1,
          includeUntracked: true,
          showClean: true
        },
        watcher: {
          host: "127.0.0.1",
          port: 0,
          logDir: join(resources.tempDir, "logs")
        },
        hookEnhancements: {
          costControls: {
            enabled: false,
            sessionLimitUsd: 5,
            dailyLimitUsd: 50,
            warningThreshold: 0.8
          },
          notificationHub: { enabled: false, desktop: false }
        },
        notifications: {
          enable: false,
          hookAwaitingInput: false,
          hookSessionEnd: false,
          hookToolFailure: false,
          hookLongRunning: false,
          longRunningThresholdSeconds: 300
        }
      },
      startedAt: Date.now()
    });

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: app.fetch,
      websocket
    });
    resources.server = server;

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    resources.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("ws error")));
    });

    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    ws.addEventListener("message", (event) => {
      try {
        messages.push(JSON.parse(String(event.data)));
      } catch {
        // ignore
      }
    });

    // Seed a git repo and dirty state
    const gitInit = Bun.spawn(["git", "init"], {
      cwd: resources.repoDir,
      stdout: "ignore",
      stderr: "ignore"
    });
    await gitInit.exited;
    await writeFile(join(resources.repoDir, "README.md"), "fixture");

    // Start a process that matches the scanner regex.
    const agentScript = join(resources.tempDir, "claude-test-agent");
    await writeFile(agentScript, "#!/bin/sh\nsleep 5\n");
    await Bun.spawn(["chmod", "+x", agentScript]).exited;
    resources.agentProcess = Bun.spawn([agentScript], {
      stdout: "ignore",
      stderr: "ignore"
    });

    // Start a listening port for port scanner.
    resources.portServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("ok")
    });

    const processScanner = new ProcessScanner(store, {
      refreshSeconds: 0.2,
      matchers: [
        {
          label: "claude-test",
          type: "cmd_regex",
          pattern: "claude-test-agent"
        }
      ],
      heuristic: { activeCpuPct: 0.1, stalledSeconds: 2 },
      cwdResolution: "off"
    });

    const repoScanner = new RepoScanner(store, {
      roots: [resources.repoDir],
      refreshFastSeconds: 0.2,
      refreshSlowSeconds: 0.2,
      includeUntracked: true,
      showClean: true,
      gitTimeoutFastMs: 2000,
      gitTimeoutSlowMs: 2000,
      concurrencyGit: 2,
      fetchPolicy: "never"
    });

    const portScanner = new PortScanner(store, {
      refreshSeconds: 0.2,
      minPort: 1024
    });

    processScanner.start();
    repoScanner.start();
    portScanner.start();

    resources.processScanner = processScanner;
    resources.repoScanner = repoScanner;
    resources.portScanner = portScanner;

    const reposMessage = await waitForMessage(
      messages,
      (msg) =>
        msg.type === "repos_update" &&
        Array.isArray(msg.repos) &&
        msg.repos.some((repo: any) => repo.path === resources.repoDir)
    );
    expect(reposMessage.type).toBe("repos_update");

    const agentsMessage = await waitForMessage(
      messages,
      (msg) =>
        msg.type === "agents_update" &&
        Array.isArray(msg.agents) &&
        msg.agents.some((agent: any) => agent.label === "claude-test")
    );
    expect(agentsMessage.type).toBe("agents_update");

    const portsMessage = await waitForMessage(
      messages,
      (msg) => msg.type === "ports_update"
    );
    expect(portsMessage.type).toBe("ports_update");
  });
});
