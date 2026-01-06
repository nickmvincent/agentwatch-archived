/**
 * Session logger for persisting agent output to JSONL files.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync
} from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

export interface SessionInfo {
  sessionId: string;
  pid: number;
  label: string;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  path: string;
}

interface SessionFile {
  sessionId: string;
  pid: number;
  label: string;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  path: string;
}

export class SessionLogger {
  private logDir: string;
  private sessions = new Map<number, SessionFile>();

  constructor(logDir = "~/.agentwatch/logs") {
    this.logDir = logDir.startsWith("~")
      ? join(homedir(), logDir.slice(1))
      : resolve(logDir);

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  startSession(pid: number, event: Record<string, unknown>): string {
    const label = String(event.label ?? "agent");
    const ts = Number(event.ts ?? Date.now() / 1000);
    const sessionId = `${Math.floor(ts)}_${pid}_${label}`;
    const filePath = join(this.logDir, `${sessionId}.jsonl`);

    const sf: SessionFile = {
      sessionId,
      pid,
      label,
      startTime: ts,
      path: filePath
    };

    this.writeEvent(filePath, event);
    this.sessions.set(pid, sf);

    return sessionId;
  }

  logEvent(pid: number, event: Record<string, unknown>): void {
    const sf = this.sessions.get(pid);
    if (sf) {
      this.writeEvent(sf.path, event);
    }
  }

  endSession(pid: number, event: Record<string, unknown>): void {
    const sf = this.sessions.get(pid);
    if (sf) {
      this.writeEvent(sf.path, event);
      sf.endTime = Number(event.ts ?? Date.now() / 1000);
      sf.exitCode = typeof event.code === "number" ? event.code : undefined;
      this.sessions.delete(pid);
    }
  }

  private writeEvent(path: string, event: Record<string, unknown>): void {
    appendFileSync(path, JSON.stringify(event) + "\n");
  }

  listSessions(limit = 100): SessionInfo[] {
    const sessions: SessionInfo[] = [];

    try {
      const files: { mtime: number; name: string; path: string }[] = [];

      for (const name of readdirSync(this.logDir)) {
        if (!name.endsWith(".jsonl")) continue;

        const filePath = join(this.logDir, name);
        const stats = statSync(filePath);
        files.push({ mtime: stats.mtimeMs / 1000, name, path: filePath });
      }

      // Sort by modification time descending
      files.sort((a, b) => b.mtime - a.mtime);

      for (const { mtime, name, path } of files.slice(0, limit)) {
        // Parse session info from filename: {timestamp}_{pid}_{label}.jsonl
        const baseName = name.slice(0, -6); // Remove .jsonl
        const parts = baseName.split("_");

        let ts: number, pid: number, label: string;

        if (parts.length >= 3) {
          ts = Number.parseInt(parts[0]!, 10);
          pid = Number.parseInt(parts[1]!, 10);
          label = parts.slice(2).join("_");

          if (isNaN(ts)) ts = mtime;
          if (isNaN(pid)) pid = 0;
        } else {
          ts = mtime;
          pid = 0;
          label = name;
        }

        sessions.push({
          sessionId: baseName,
          pid,
          label,
          startTime: ts,
          endTime: mtime,
          path
        });
      }
    } catch {
      // Ignore errors
    }

    return sessions;
  }

  readSession(sessionId: string): Record<string, unknown>[] {
    const filename = sessionId.endsWith(".jsonl")
      ? sessionId
      : `${sessionId}.jsonl`;
    const filePath = join(this.logDir, filename);

    const events: Record<string, unknown>[] = [];

    try {
      const content = readFileSync(filePath, "utf-8");
      for (const line of content.split("\n")) {
        if (line.trim()) {
          try {
            events.push(JSON.parse(line));
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // File not found or unreadable
    }

    return events;
  }

  rotateLogs(maxFiles = 500, maxAgeDays = 30): number {
    let deleted = 0;
    const now = Date.now() / 1000;
    const maxAgeSeconds = maxAgeDays * 24 * 60 * 60;

    try {
      const files: { mtime: number; path: string; age: number }[] = [];

      for (const name of readdirSync(this.logDir)) {
        if (!name.endsWith(".jsonl")) continue;

        const filePath = join(this.logDir, name);
        const stats = statSync(filePath);
        const mtime = stats.mtimeMs / 1000;
        const age = now - mtime;
        files.push({ mtime, path: filePath, age });
      }

      // Delete files older than maxAgeDays
      for (const { path, age } of files) {
        if (age > maxAgeSeconds) {
          try {
            unlinkSync(path);
            deleted++;
          } catch {
            // Ignore deletion errors
          }
        }
      }

      // If still too many files, delete oldest
      const remaining = files.filter(({ path }) => existsSync(path));
      remaining.sort((a, b) => b.mtime - a.mtime);

      while (remaining.length > maxFiles) {
        const oldest = remaining.pop();
        if (oldest) {
          try {
            unlinkSync(oldest.path);
            deleted++;
          } catch {
            // Ignore deletion errors
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return deleted;
  }

  closeAll(): void {
    this.sessions.clear();
  }
}
