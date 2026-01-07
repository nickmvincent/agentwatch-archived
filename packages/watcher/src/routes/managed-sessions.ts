/**
 * Managed session routes.
 *
 * These endpoints back `aw run` and the Watcher UI's command center by
 * persisting user-launched sessions (prompt, agent, cwd, pid, status).
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import type { Hono } from "hono";
import type {
  ManagedSession,
  PredictionStore,
  SessionStore
} from "@agentwatch/monitor";

const AGENT_COMMANDS: Record<
  string,
  { interactive: string[]; print: string[] }
> = {
  claude: { interactive: ["claude"], print: ["claude", "--print"] },
  codex: { interactive: ["codex"], print: ["codex", "--quiet"] },
  gemini: { interactive: ["gemini"], print: ["gemini"] }
};

export function managedSessionToDict(session: ManagedSession) {
  const end = session.endedAt ?? Date.now();
  return {
    id: session.id,
    prompt: session.prompt,
    agent: session.agent,
    pid: session.pid ?? null,
    cwd: session.cwd,
    started_at: session.startedAt,
    ended_at: session.endedAt ?? null,
    exit_code: session.exitCode ?? null,
    status: session.status,
    duration_ms: Math.max(0, end - session.startedAt)
  };
}

function getAgentCommand(
  agent: string,
  mode: "interactive" | "print"
): string[] | null {
  const config = AGENT_COMMANDS[agent];
  if (!config) return null;
  return mode === "print" ? config.print : config.interactive;
}

function ensureCwd(path: string | undefined): string | null {
  if (!path) return process.cwd();
  if (!existsSync(path)) return null;
  return path;
}

function isTmuxAvailable(): boolean {
  try {
    execSync("tmux -V", { encoding: "utf-8", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Register managed session routes.
 */
export function registerManagedSessionRoutes(
  app: Hono,
  sessionStore: SessionStore,
  options?: { predictionStore?: PredictionStore }
): void {
  /**
   * GET /api/managed-sessions
   * List managed sessions with optional filters.
   */
  app.get("/api/managed-sessions", (c) => {
    const active = c.req.query("active") === "true";
    const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const agent = c.req.query("agent") ?? undefined;

    const sessions = sessionStore.listSessions({
      active,
      limit,
      agent
    });

    return c.json(sessions.map(managedSessionToDict));
  });

  /**
   * GET /api/managed-sessions/:id
   * Get a specific managed session.
   */
  app.get("/api/managed-sessions/:id", (c) => {
    const id = c.req.param("id");
    const session = sessionStore.getSession(id);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json(managedSessionToDict(session));
  });

  /**
   * POST /api/managed-sessions
   * Create a new managed session.
   */
  app.post("/api/managed-sessions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      prompt?: string;
      agent?: string;
      cwd?: string;
    };

    if (!body.prompt || !body.agent || !body.cwd) {
      return c.json({ error: "prompt, agent, and cwd are required" }, 400);
    }

    const session = sessionStore.createSession(
      body.prompt,
      body.agent,
      body.cwd
    );

    return c.json(managedSessionToDict(session));
  });

  /**
   * PATCH /api/managed-sessions/:id
   * Update a managed session (pid or status).
   */
  app.patch("/api/managed-sessions/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      pid?: number;
      status?: ManagedSession["status"];
      cwd?: string;
    };

    const updates: Partial<ManagedSession> = {};
    if (typeof body.pid === "number") updates.pid = body.pid;
    if (typeof body.status === "string") updates.status = body.status;
    if (typeof body.cwd === "string") updates.cwd = body.cwd;

    const session = sessionStore.updateSession(id, updates);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json(managedSessionToDict(session));
  });

  /**
   * POST /api/managed-sessions/:id/end
   * Mark a managed session as finished.
   */
  app.post("/api/managed-sessions/:id/end", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      exit_code?: number;
    };
    const exitCode = typeof body.exit_code === "number" ? body.exit_code : -1;

    const session = sessionStore.endSession(id, exitCode);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json(managedSessionToDict(session));
  });

  /**
   * POST /api/managed-sessions/run
   * Launch a non-interactive managed session.
   */
  app.post("/api/managed-sessions/run", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      prompt?: string;
      agent?: string;
      cwd?: string;
      intentions?: string;
      principlesInjection?: string[];
      prediction?: {
        predictedDurationMinutes?: number;
        durationConfidence?: "low" | "medium" | "high";
        predictedTokens?: number;
        tokenConfidence?: "low" | "medium" | "high";
        successConditions?: string;
        intentions?: string;
        selectedPrinciples?: string[];
        principlesPath?: string;
      };
    };

    if (!body.prompt || !body.agent) {
      return c.json({ error: "prompt and agent are required" }, 400);
    }

    const cmdArgs = getAgentCommand(body.agent, "print");
    if (!cmdArgs) {
      return c.json({ error: `Unsupported agent: ${body.agent}` }, 400);
    }

    const cwd = ensureCwd(body.cwd);
    if (!cwd) {
      return c.json({ error: "cwd does not exist" }, 400);
    }

    const session = sessionStore.createSession(body.prompt, body.agent, cwd);

    const predictionStore = options?.predictionStore;
    if (predictionStore && body.prediction) {
      predictionStore.createPrediction({
        managedSessionId: session.id,
        predictedDurationMinutes:
          body.prediction.predictedDurationMinutes ?? 30,
        durationConfidence: body.prediction.durationConfidence ?? "medium",
        predictedTokens: body.prediction.predictedTokens ?? 50000,
        tokenConfidence: body.prediction.tokenConfidence ?? "medium",
        successConditions: body.prediction.successConditions ?? "",
        intentions: body.prediction.intentions ?? body.intentions ?? "",
        selectedPrinciples:
          body.prediction.selectedPrinciples ?? body.principlesInjection,
        principlesPath: body.prediction.principlesPath
      });
    }

    try {
      const proc = Bun.spawn([...cmdArgs, body.prompt], {
        cwd,
        stdio: ["ignore", "ignore", "ignore"],
        env: process.env
      });

      sessionStore.updateSession(session.id, { pid: proc.pid });

      proc.exited
        .then((exitCode) => sessionStore.endSession(session.id, exitCode))
        .catch(() => sessionStore.endSession(session.id, -1));
    } catch (error) {
      sessionStore.endSession(session.id, -1);
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to spawn agent"
        },
        500
      );
    }

    return c.json({
      success: true,
      session: managedSessionToDict(
        sessionStore.getSession(session.id) ?? session
      )
    });
  });

  /**
   * POST /api/managed-sessions/run-interactive
   * Launch an interactive managed session via tmux.
   */
  app.post("/api/managed-sessions/run-interactive", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      prompt?: string;
      agent?: string;
      cwd?: string;
      intentions?: string;
      principlesInjection?: string[];
      prediction?: {
        predictedDurationMinutes?: number;
        durationConfidence?: "low" | "medium" | "high";
        predictedTokens?: number;
        tokenConfidence?: "low" | "medium" | "high";
        successConditions?: string;
        intentions?: string;
        selectedPrinciples?: string[];
        principlesPath?: string;
      };
    };

    if (!body.prompt || !body.agent) {
      return c.json({ error: "prompt and agent are required" }, 400);
    }

    if (!isTmuxAvailable()) {
      return c.json({ error: "tmux is not available" }, 400);
    }

    const cmdArgs = getAgentCommand(body.agent, "interactive");
    if (!cmdArgs) {
      return c.json({ error: `Unsupported agent: ${body.agent}` }, 400);
    }

    const cwd = ensureCwd(body.cwd);
    if (!cwd) {
      return c.json({ error: "cwd does not exist" }, 400);
    }

    const session = sessionStore.createSession(body.prompt, body.agent, cwd);
    const tmuxSession = `aw-${session.id}`;

    const predictionStore = options?.predictionStore;
    if (predictionStore && body.prediction) {
      predictionStore.createPrediction({
        managedSessionId: session.id,
        predictedDurationMinutes:
          body.prediction.predictedDurationMinutes ?? 30,
        durationConfidence: body.prediction.durationConfidence ?? "medium",
        predictedTokens: body.prediction.predictedTokens ?? 50000,
        tokenConfidence: body.prediction.tokenConfidence ?? "medium",
        successConditions: body.prediction.successConditions ?? "",
        intentions: body.prediction.intentions ?? body.intentions ?? "",
        selectedPrinciples:
          body.prediction.selectedPrinciples ?? body.principlesInjection,
        principlesPath: body.prediction.principlesPath
      });
    }

    const tmuxArgs = [
      "tmux",
      "new-session",
      "-d",
      "-s",
      tmuxSession,
      "-c",
      cwd,
      ...cmdArgs,
      body.prompt
    ];

    try {
      const proc = Bun.spawn(tmuxArgs, { stdout: "pipe", stderr: "pipe" });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const errorText = proc.stderr
          ? await new Response(proc.stderr).text()
          : "tmux launch failed";
        sessionStore.endSession(session.id, -1);
        return c.json({ error: errorText.trim() || "tmux launch failed" }, 500);
      }

      try {
        const pidText = execSync(
          `tmux list-panes -t ${tmuxSession} -F '#{pane_pid}'`,
          { encoding: "utf-8" }
        ).trim();
        const pid = Number.parseInt(pidText.split("\n")[0] ?? "", 10);
        if (!Number.isNaN(pid)) {
          sessionStore.updateSession(session.id, { pid });
        }
      } catch {
        // Ignore PID lookup failures
      }
    } catch (error) {
      sessionStore.endSession(session.id, -1);
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to launch tmux"
        },
        500
      );
    }

    return c.json({
      success: true,
      session: managedSessionToDict(
        sessionStore.getSession(session.id) ?? session
      ),
      attach_command: `tmux attach -t ${tmuxSession}`
    });
  });
}
