/**
 * Storage for user-managed agent sessions.
 * Tracks sessions launched via `aw run` with their original prompts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type SessionStatus = "running" | "completed" | "failed";

export interface ManagedSession {
  id: string;
  prompt: string;
  agent: string;
  pid?: number;
  cwd: string;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  status: SessionStatus;
}

export type SessionChangeCallback = (session: ManagedSession) => void;

/**
 * Storage for user-managed agent sessions.
 */
export class SessionStore {
  private dataDir: string;
  private sessions: Map<string, ManagedSession> = new Map();
  private onSessionChange?: SessionChangeCallback;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(homedir(), ".agentwatch", "sessions");
    mkdirSync(this.dataDir, { recursive: true });
    this.loadSessions();
  }

  /**
   * Set callback for session changes.
   */
  setCallback(callback: SessionChangeCallback): void {
    this.onSessionChange = callback;
  }

  /**
   * Create a new managed session.
   */
  createSession(prompt: string, agent: string, cwd: string): ManagedSession {
    const id = this.generateId();
    const session: ManagedSession = {
      id,
      prompt,
      agent,
      cwd,
      startedAt: Date.now(),
      status: "running"
    };

    this.sessions.set(id, session);
    this.persistSession(session);
    this.saveIndex();

    if (this.onSessionChange) {
      try {
        this.onSessionChange(session);
      } catch {
        // Callback error
      }
    }

    return session;
  }

  /**
   * Update a session with partial data.
   */
  updateSession(
    id: string,
    updates: Partial<ManagedSession>
  ): ManagedSession | null {
    const session = this.sessions.get(id);
    if (!session) return null;

    Object.assign(session, updates);
    this.persistSession(session);
    this.saveIndex();

    if (this.onSessionChange) {
      try {
        this.onSessionChange(session);
      } catch {
        // Callback error
      }
    }

    return session;
  }

  /**
   * End a session with an exit code.
   */
  endSession(id: string, exitCode: number): ManagedSession | null {
    const session = this.sessions.get(id);
    if (!session) return null;

    session.endedAt = Date.now();
    session.exitCode = exitCode;
    session.status = exitCode === 0 ? "completed" : "failed";

    this.persistSession(session);
    this.saveIndex();

    if (this.onSessionChange) {
      try {
        this.onSessionChange(session);
      } catch {
        // Callback error
      }
    }

    return session;
  }

  /**
   * Get a session by ID.
   */
  getSession(id: string): ManagedSession | null {
    return this.sessions.get(id) ?? null;
  }

  /**
   * Get a session by PID.
   */
  getSessionByPid(pid: number): ManagedSession | null {
    for (const session of this.sessions.values()) {
      if (session.pid === pid) {
        return session;
      }
    }
    return null;
  }

  /**
   * List sessions with optional filtering.
   */
  listSessions(options?: {
    active?: boolean;
    limit?: number;
    agent?: string;
  }): ManagedSession[] {
    let sessions = [...this.sessions.values()];

    if (options?.active) {
      sessions = sessions.filter((s) => s.status === "running");
    }

    if (options?.agent) {
      sessions = sessions.filter((s) => s.agent === options.agent);
    }

    // Sort by start time, newest first
    sessions.sort((a, b) => b.startedAt - a.startedAt);

    if (options?.limit) {
      sessions = sessions.slice(0, options.limit);
    }

    return sessions;
  }

  /**
   * Mark stale running sessions as failed.
   * Called when process scanner indicates a PID is no longer running.
   *
   * Sessions are marked stale if:
   * - They have a PID that's not in the live PIDs set, OR
   * - They have no PID and are older than staleThresholdMs (default 1 hour)
   */
  markStaleSessions(livePids: Set<number>, staleThresholdMs = 3600000): string[] {
    const ended: string[] = [];
    const now = Date.now();

    for (const session of this.sessions.values()) {
      if (session.status !== "running") continue;

      let isStale = false;

      if (session.pid !== undefined) {
        // Has PID - check if process is still running
        isStale = !livePids.has(session.pid);
      } else {
        // No PID - consider stale if older than threshold
        isStale = now - session.startedAt > staleThresholdMs;
      }

      if (isStale) {
        session.endedAt = now;
        session.status = "failed";
        session.exitCode = -1; // Unknown exit
        this.persistSession(session);
        ended.push(session.id);

        if (this.onSessionChange) {
          try {
            this.onSessionChange(session);
          } catch {
            // Callback error
          }
        }
      }
    }

    if (ended.length > 0) {
      this.saveIndex();
    }

    return ended;
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private generateId(): string {
    // Short readable ID: 8 chars
    return Math.random().toString(36).substring(2, 10);
  }

  private persistSession(session: ManagedSession): void {
    try {
      const file = join(this.dataDir, `${session.id}.json`);
      writeFileSync(file, JSON.stringify(session, null, 2));
    } catch {
      // Ignore persistence errors
    }
  }

  private saveIndex(): void {
    try {
      const index = [...this.sessions.values()].map((s) => ({
        id: s.id,
        prompt: s.prompt.slice(0, 100), // Truncate for index
        agent: s.agent,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt
      }));
      const file = join(this.dataDir, "index.json");
      writeFileSync(file, JSON.stringify(index, null, 2));
    } catch {
      // Ignore persistence errors
    }
  }

  private loadSessions(): void {
    try {
      const indexFile = join(this.dataDir, "index.json");
      if (!existsSync(indexFile)) return;

      const index = JSON.parse(readFileSync(indexFile, "utf-8")) as Array<{
        id: string;
      }>;
      const cutoff = Date.now() - 7 * 86400000; // 7 days

      for (const entry of index) {
        try {
          const sessionFile = join(this.dataDir, `${entry.id}.json`);
          if (!existsSync(sessionFile)) continue;

          const session = JSON.parse(
            readFileSync(sessionFile, "utf-8")
          ) as ManagedSession;

          // Only load recent sessions
          if (session.startedAt > cutoff) {
            this.sessions.set(session.id, session);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore load errors
    }
  }

  /**
   * Clean up old session files.
   */
  cleanup(maxDays = 30): void {
    const cutoff = Date.now() - maxDays * 86400000;
    const toDelete: string[] = [];

    for (const [id, session] of this.sessions) {
      if (session.startedAt < cutoff) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.sessions.delete(id);
      try {
        const file = join(this.dataDir, `${id}.json`);
        if (existsSync(file)) {
          // Use unlink from fs
          require("fs").unlinkSync(file);
        }
      } catch {
        // Ignore delete errors
      }
    }

    if (toDelete.length > 0) {
      this.saveIndex();
    }
  }
}
