/**
 * Repository scanner for monitoring git repos.
 * Ported from agentwatch/repo_scanner.py
 */

import type { RepoStatus } from "@agentwatch/core";
import {
  discoverRepos,
  getBranchName,
  getLastChangeTime,
  getRepoStatus,
  getUpstreamCounts,
  initRepoStatus
} from "./git";
import type { DataStore } from "./store";

interface RepoScannerConfig {
  roots: string[];
  ignoreDirs: string[];
  refreshFastSeconds: number;
  refreshSlowSeconds: number;
  includeUntracked: boolean;
  showClean: boolean;
  gitTimeoutFastMs: number;
  gitTimeoutSlowMs: number;
  concurrencyGit: number;
  fetchPolicy: "never" | "auto" | "always";
  ignoreReposFile?: string;
}

const DEFAULT_CONFIG: RepoScannerConfig = {
  roots: ["~/Documents/GitHub"],
  ignoreDirs: [
    "node_modules",
    ".git",
    "venv",
    ".venv",
    "__pycache__",
    "dist",
    "build"
  ],
  refreshFastSeconds: 3,
  refreshSlowSeconds: 45,
  includeUntracked: true, // Include untracked files for more intuitive dirty status
  showClean: false,
  gitTimeoutFastMs: 800,
  gitTimeoutSlowMs: 2500,
  concurrencyGit: 12,
  fetchPolicy: "never"
};

/**
 * Scanner that monitors git repositories for changes.
 */
export class RepoScanner {
  private config: RepoScannerConfig;
  private store: DataStore;
  private running = false;
  private paused = false;
  private intervalId?: Timer;

  // State
  private repos: Map<string, RepoStatus> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private lastDiscovery = 0;
  private lastSlowScan: Map<string, number> = new Map();
  private scanIndex = 0;
  private ignoredCount = 0;
  private reminders: string[] = [];

  constructor(store: DataStore, config: Partial<RepoScannerConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the scanner.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const scan = async () => {
      if (this.paused) return;

      const now = Date.now();

      // Re-discover repos periodically
      if (now - this.lastDiscovery > 300000) {
        // 5 minutes
        this.discover();
        this.lastDiscovery = now;
      }

      // Fast scan (staged/unstaged/untracked counts)
      const targets = this.selectFastTargets(now);
      const errors: string[] = [];

      if (targets.length > 0) {
        await Promise.all(
          targets.map(async (path) => {
            try {
              const status = await this.scanRepoFast(path, now);
              this.repos.set(path, status);
              this.errorCounts.delete(path);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              this.recordError(path, msg);
              errors.push(`${path}: ${msg}`);
            }
          })
        );
      }

      // Slow scan (branch, upstream)
      await this.scanSlow(now);

      // Update store
      this.store.updateRepos(
        this.repos,
        errors,
        this.ignoredCount,
        this.reminders
      );
    };

    // Run discovery immediately
    this.discover();
    this.lastDiscovery = Date.now();

    // Then scan on interval
    scan();
    this.intervalId = setInterval(scan, this.config.refreshFastSeconds * 1000);
  }

  /**
   * Stop the scanner.
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Pause/resume scanning.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /**
   * Trigger immediate re-discovery.
   */
  rescan(): void {
    this.lastDiscovery = 0; // Force re-discovery on next tick
  }

  /**
   * Discover git repositories.
   */
  private discover(): void {
    // TODO: Load ignore list from file if configured

    const found = discoverRepos(this.config.roots, this.config.ignoreDirs);
    const foundSet = new Set(found);

    // Remove repos that no longer exist
    for (const path of this.repos.keys()) {
      if (!foundSet.has(path)) {
        this.repos.delete(path);
      }
    }

    // Add new repos
    for (const path of found) {
      if (!this.repos.has(path)) {
        this.repos.set(path, initRepoStatus(path));
      }
    }
  }

  /**
   * Select repos for fast scanning.
   */
  private selectFastTargets(now: number): string[] {
    const paths = [...this.repos.keys()];
    if (paths.length === 0) return [];

    // Always include dirty repos
    const dirty = paths.filter((p) => {
      const repo = this.repos.get(p);
      return (
        repo && repo.stagedCount + repo.unstagedCount + repo.untrackedCount > 0
      );
    });

    // Fill remaining slots with round-robin rotation
    const maxPerTick = Math.max(10, this.config.concurrencyGit * 3);
    const remainingSlots = Math.max(0, maxPerTick - dirty.length);

    const rotation: string[] = [];
    for (let i = 0; i < remainingSlots && paths.length > 0; i++) {
      this.scanIndex = this.scanIndex % paths.length;
      rotation.push(paths[this.scanIndex]!);
      this.scanIndex++;
    }

    // Deduplicate and filter by backoff
    const targets = [...new Set([...dirty, ...rotation])];
    return targets.filter((p) => {
      const repo = this.repos.get(p);
      return !repo || now >= repo.health.backoffUntil;
    });
  }

  /**
   * Fast scan a single repo.
   */
  private async scanRepoFast(path: string, now: number): Promise<RepoStatus> {
    const repo = this.repos.get(path) ?? initRepoStatus(path);

    const status = await getRepoStatus(
      path,
      this.config.includeUntracked,
      this.config.gitTimeoutFastMs
    );

    return {
      ...repo,
      stagedCount: status.staged,
      unstagedCount: status.unstaged,
      untrackedCount: status.untracked,
      specialState: status.specialState,
      lastScanTime: now,
      lastChangeTime: getLastChangeTime(path),
      health: {
        ...repo.health,
        lastError: undefined,
        timedOut: false,
        backoffUntil: 0
      }
    };
  }

  /**
   * Slow scan for branch and upstream info.
   */
  private async scanSlow(now: number): Promise<void> {
    const due: string[] = [];

    for (const [path, repo] of this.repos) {
      const lastSlow = this.lastSlowScan.get(path) ?? 0;
      if (now - lastSlow < this.config.refreshSlowSeconds * 1000) continue;

      // Only slow-scan dirty repos or when fetching is enabled
      const isDirty =
        repo.stagedCount + repo.unstagedCount + repo.untrackedCount > 0;
      if (isDirty || this.config.fetchPolicy !== "never") {
        due.push(path);
      }
    }

    for (const path of due) {
      const repo = this.repos.get(path);
      if (!repo || now < repo.health.backoffUntil) continue;

      try {
        const branch = await getBranchName(path, this.config.gitTimeoutSlowMs);
        if (branch) {
          repo.branch = branch;
        }

        if (this.config.fetchPolicy !== "never") {
          repo.upstream = await getUpstreamCounts(
            path,
            this.config.gitTimeoutSlowMs
          );
        }

        this.lastSlowScan.set(path, now);
      } catch {
        // Ignore slow scan errors
      }
    }
  }

  /**
   * Record an error for a repo with exponential backoff.
   */
  private recordError(path: string, msg: string): void {
    const repo = this.repos.get(path) ?? initRepoStatus(path);
    repo.health.lastError = msg;
    repo.health.timedOut = msg.includes("timed out");

    const count = (this.errorCounts.get(path) ?? 0) + 1;
    this.errorCounts.set(path, count);

    // Exponential backoff: 5s, 10s, 20s, 40s... up to 60s
    const backoff = Math.min(60000, 5000 * Math.pow(2, Math.max(0, count - 1)));
    repo.health.backoffUntil = Date.now() + backoff;

    this.repos.set(path, repo);
  }
}

export { DEFAULT_CONFIG as DEFAULT_REPO_SCANNER_CONFIG };
