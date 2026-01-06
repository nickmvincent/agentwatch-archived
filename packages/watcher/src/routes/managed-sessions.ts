/**
 * Managed session routes.
 *
 * These endpoints back `aw run` and the Watcher UI's command center by
 * persisting user-launched sessions (prompt, agent, cwd, pid, status).
 */

import type { Hono } from "hono";
import type { ManagedSession, SessionStore } from "@agentwatch/monitor";

function sessionToDict(session: ManagedSession) {
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

/**
 * Register managed session routes.
 */
export function registerManagedSessionRoutes(
  app: Hono,
  sessionStore: SessionStore
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

    return c.json(sessions.map(sessionToDict));
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
    return c.json(sessionToDict(session));
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
      return c.json(
        { error: "prompt, agent, and cwd are required" },
        400
      );
    }

    const session = sessionStore.createSession(
      body.prompt,
      body.agent,
      body.cwd
    );

    return c.json({ id: session.id, ...sessionToDict(session) });
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
    return c.json(sessionToDict(session));
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
    return c.json(sessionToDict(session));
  });
}
