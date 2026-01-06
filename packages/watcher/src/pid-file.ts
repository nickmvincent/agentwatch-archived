/**
 * PID file management for watcher daemon process.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from "fs";
import { dirname } from "path";

export class PidFile {
  constructor(public readonly path: string) {
    this.ensureDir();
  }

  private ensureDir(): void {
    const dir = dirname(this.path);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  read(): number | null {
    try {
      const content = readFileSync(this.path, "utf-8");
      const pid = Number.parseInt(content.trim(), 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  write(pid?: number): void {
    writeFileSync(this.path, String(pid ?? process.pid));
  }

  remove(): void {
    try {
      unlinkSync(this.path);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  isRunning(): boolean {
    const pid = this.read();
    if (pid === null) return false;

    try {
      // Signal 0 tests if process exists without sending a signal
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  getRunningPid(): number | null {
    return this.isRunning() ? this.read() : null;
  }

  async stopRunning(timeout = 5000): Promise<boolean> {
    const pid = this.getRunningPid();
    if (pid === null) return false;

    try {
      process.kill(pid, "SIGTERM");
    } catch {
      this.remove();
      return false;
    }

    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!this.isRunning()) {
        this.remove();
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Force kill if still running
    try {
      process.kill(pid, "SIGKILL");
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // Ignore
    }
    this.remove();
    return true;
  }
}
