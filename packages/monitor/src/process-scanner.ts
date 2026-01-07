/**
 * Process scanner for detecting AI coding agents.
 * Ported from agentwatch/process_scanner.py
 */

import type {
  AgentHeuristicState,
  AgentMatcher,
  AgentProcess,
  AgentState
} from "@agentwatch/core";
import type { DataStore } from "./store";

interface ProcessInfo {
  pid: number;
  ppid: number;
  tty: string | null;
  exe: string;
  cmdline: string;
  etimeSeconds: number;
  cpuPct: number;
  rssKb: number | null;
  threads: number | null;
}

interface ProcessScannerConfig {
  refreshSeconds: number;
  matchers: AgentMatcher[];
  heuristic: {
    activeCpuPct: number;
    stalledSeconds: number;
  };
  cwdResolution: "on" | "off";
}

const DEFAULT_CONFIG: ProcessScannerConfig = {
  refreshSeconds: 1,
  matchers: [
    { label: "claude", type: "cmd_regex", pattern: "\\bclaude\\b" },
    { label: "codex", type: "cmd_regex", pattern: "\\bcodex\\b" },
    { label: "cursor", type: "cmd_regex", pattern: "\\bcursor\\b" },
    { label: "opencode", type: "cmd_regex", pattern: "\\bopencode\\b" },
    { label: "gemini", type: "cmd_regex", pattern: "\\bgemini\\b" }
  ],
  heuristic: {
    activeCpuPct: 1.0,
    stalledSeconds: 30
  },
  cwdResolution: "on"
};

/**
 * Scanner that detects running AI coding agents via process inspection.
 */
export class ProcessScanner {
  private config: ProcessScannerConfig;
  private store: DataStore;
  private running = false;
  private paused = false;
  private intervalId?: Timer;

  // State tracking
  private lastActive: Map<number, number> = new Map();
  private cwdCache: Map<number, { timestamp: number; cwd: string | null }> =
    new Map();
  private regexCache: Map<string, RegExp> = new Map();

  constructor(store: DataStore, config: Partial<ProcessScannerConfig> = {}) {
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
      const repos = this.store.snapshotRepos();
      const repoPaths = repos.map((r) => r.path);
      const agents = await this.scanProcesses(repoPaths, now);
      this.store.updateAgents(agents);
    };

    // Run immediately, then on interval
    scan();
    this.intervalId = setInterval(scan, this.config.refreshSeconds * 1000);
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
   * Scan for agent processes.
   */
  private async scanProcesses(
    repoPaths: string[],
    now: number
  ): Promise<Map<number, AgentProcess>> {
    const processes = await psList();
    const agents = new Map<number, AgentProcess>();
    const seenPids: number[] = [];

    // First pass: identify all matching agents with their labels
    const matchedAgents: Array<{
      proc: ProcessInfo;
      label: string;
    }> = [];

    for (const proc of processes) {
      seenPids.push(proc.pid);
      const label = this.matchLabel(proc.cmdline, proc.exe);
      if (label) {
        matchedAgents.push({ proc, label });
      }
    }

    // Build a set of PIDs that are agent processes by label
    // Used for parent-child deduplication
    const agentPidsByLabel = new Map<string, Set<number>>();
    for (const { proc, label } of matchedAgents) {
      if (!agentPidsByLabel.has(label)) {
        agentPidsByLabel.set(label, new Set());
      }
      agentPidsByLabel.get(label)!.add(proc.pid);
    }

    // Second pass: filter out child processes whose parent is same agent type
    // Keep the process with the smallest PID (usually the parent) when both match
    for (const { proc, label } of matchedAgents) {
      const sameLabelPids = agentPidsByLabel.get(label);
      // Skip if parent process is already detected as same agent type
      if (sameLabelPids && sameLabelPids.has(proc.ppid)) {
        continue;
      }

      const startTime = now - proc.etimeSeconds * 1000;
      const cwd = await this.resolveCwd(proc.pid, now);
      const repoPath = resolveRepoFromCwd(cwd, repoPaths);
      const state = this.heuristicState(
        proc.pid,
        proc.cpuPct,
        now,
        proc.etimeSeconds
      );

      const sandbox = this.detectSandbox(proc.cmdline);
      agents.set(proc.pid, {
        pid: proc.pid,
        label,
        cmdline: proc.cmdline,
        exe: proc.exe,
        startTime,
        cpuPct: proc.cpuPct,
        rssKb: proc.rssKb ?? undefined,
        threads: proc.threads ?? undefined,
        tty: proc.tty ?? undefined,
        cwd: cwd ?? undefined,
        repoPath: repoPath ?? undefined,
        heuristicState: state,
        sandboxed: sandbox.sandboxed,
        sandboxType: sandbox.type
      });
    }

    this.pruneCache(seenPids);
    return agents;
  }

  /**
   * Match process against configured matchers.
   */
  private matchLabel(cmdline: string, exe: string): string | null {
    // Skip shell wrappers - these are parent processes that spawn the actual agent
    const shellWrappers = [
      /^\/bin\/(ba)?sh\b/,
      /^\/usr\/bin\/(ba)?sh\b/,
      /^\/bin\/zsh\b/,
      /^\/usr\/bin\/zsh\b/,
      /^bash\b/,
      /^zsh\b/,
      /^sh\b/,
      /^SCREEN\b/i,
      /^screen\b/,
      /^tmux\b/,
      /^login\b/,
      /^su\b/,
      /^sudo\b/,
      /^env\b/,
      /^nohup\b/
    ];

    for (const wrapper of shellWrappers) {
      if (wrapper.test(cmdline) || wrapper.test(exe)) {
        return null;
      }
    }

    for (const matcher of this.config.matchers) {
      if (this.matchMatcher(matcher, cmdline, exe)) {
        return matcher.label;
      }
    }
    return null;
  }

  /**
   * Check if a process matches a specific matcher.
   */
  private matchMatcher(
    matcher: AgentMatcher,
    cmdline: string,
    exe: string
  ): boolean {
    const target = cmdline || exe;

    if (matcher.type === "exe_prefix") {
      return exe.startsWith(matcher.pattern);
    }
    if (matcher.type === "exe_suffix") {
      return exe.endsWith(matcher.pattern);
    }

    // cmd_regex
    let regex = this.regexCache.get(matcher.pattern);
    if (!regex) {
      regex = new RegExp(matcher.pattern, "i");
      this.regexCache.set(matcher.pattern, regex);
    }
    return regex.test(target);
  }

  /**
   * Calculate heuristic state based on CPU activity.
   */
  private heuristicState(
    pid: number,
    cpuPct: number,
    now: number,
    etimeSeconds: number
  ): AgentHeuristicState {
    const startupGraceSeconds = 5.0;

    if (cpuPct >= this.config.heuristic.activeCpuPct) {
      this.lastActive.set(pid, now);
      return { state: "WORKING", cpuPctRecent: cpuPct, quietSeconds: 0 };
    }

    // Initialize lastActive for new processes
    if (!this.lastActive.has(pid)) {
      this.lastActive.set(
        pid,
        now - etimeSeconds * 1000 + startupGraceSeconds * 1000
      );
    }

    const lastActiveTime = this.lastActive.get(pid)!;
    const quietSeconds = Math.max(0, (now - lastActiveTime) / 1000);

    if (
      quietSeconds > this.config.heuristic.stalledSeconds &&
      etimeSeconds > 10
    ) {
      return { state: "STALLED", cpuPctRecent: cpuPct, quietSeconds };
    }

    return { state: "WAITING", cpuPctRecent: cpuPct, quietSeconds };
  }

  /**
   * Resolve working directory for a process.
   */
  private async resolveCwd(pid: number, now: number): Promise<string | null> {
    if (this.config.cwdResolution === "off") return null;

    const cached = this.cwdCache.get(pid);
    if (cached && now - cached.timestamp < 10000) {
      return cached.cwd;
    }

    const cwd = await lsofCwd(pid);
    this.cwdCache.set(pid, { timestamp: now, cwd });
    return cwd;
  }

  /**
   * Detect if an agent is running in a sandbox.
   */
  private detectSandbox(cmdline: string): {
    sandboxed: boolean;
    type?: "docker" | "macos" | "unknown";
  } {
    // Docker sandbox detection
    if (/docker\s+(run|exec)/i.test(cmdline)) {
      if (/claude-sandbox|claude-code-config/i.test(cmdline)) {
        return { sandboxed: true, type: "docker" };
      }
      // Generic docker container with claude
      if (/\bclaude\b/i.test(cmdline)) {
        return { sandboxed: true, type: "docker" };
      }
    }

    // macOS sandbox-exec detection
    if (/sandbox-exec/i.test(cmdline)) {
      return { sandboxed: true, type: "macos" };
    }

    // Check for --sandbox flag (Claude's native sandbox)
    if (/--sandbox\b/.test(cmdline)) {
      return { sandboxed: true, type: "macos" };
    }

    return { sandboxed: false };
  }

  /**
   * Clean up caches for dead processes.
   */
  private pruneCache(seenPids: number[]): void {
    const seenSet = new Set(seenPids);

    for (const pid of this.lastActive.keys()) {
      if (!seenSet.has(pid)) {
        this.lastActive.delete(pid);
      }
    }

    for (const pid of this.cwdCache.keys()) {
      if (!seenSet.has(pid)) {
        this.cwdCache.delete(pid);
      }
    }
  }
}

/**
 * Get list of processes using `ps`.
 */
async function psList(): Promise<ProcessInfo[]> {
  // Include ppid for parent-child deduplication
  const formats = [
    {
      format: "pid=,ppid=,tty=,comm=,etime=,pcpu=,rss=,thcount=,args=",
      splitMax: 8
    },
    {
      format: "pid=,ppid=,tty=,comm=,etime=,pcpu=,rss=,nlwp=,args=",
      splitMax: 8
    },
    { format: "pid=,ppid=,tty=,comm=,etime=,pcpu=,rss=,args=", splitMax: 7 }
  ];

  for (const { format, splitMax } of formats) {
    try {
      const proc = Bun.spawn(["ps", "-axo", format], {
        stdout: "pipe",
        stderr: "pipe"
      });

      const exitCode = await proc.exited;
      if (exitCode !== 0) continue;

      const output = await new Response(proc.stdout).text();
      return parseOutput(output, splitMax);
    } catch (e) {
      console.error(`Failed to spawn ps with format ${format}:`, e);
      continue;
    }
  }

  return [];
}

/**
 * Parse ps output into ProcessInfo objects.
 * Format: pid, ppid, tty, comm, etime, pcpu, rss, [threads,] args
 */
function parseOutput(output: string, splitMax: number): ProcessInfo[] {
  const processes: ProcessInfo[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < splitMax + 1) continue;

    const pid = Number.parseInt(parts[0]!, 10);
    if (isNaN(pid)) continue;

    const ppid = Number.parseInt(parts[1]!, 10);
    const tty = parts[2] === "?" || parts[2] === "??" ? null : parts[2]!;
    const exe = parts[3]!;
    const etimeSeconds = parseEtime(parts[4]!);
    const cpuPct = Number.parseFloat(parts[5]!);
    const rssKb = Number.parseInt(parts[6]!, 10);

    let threads: number | null = null;
    let cmdline: string;

    if (splitMax === 8) {
      threads = Number.parseInt(parts[7]!, 10);
      cmdline = parts.slice(8).join(" ");
    } else {
      cmdline = parts.slice(7).join(" ");
    }

    processes.push({
      pid,
      ppid: isNaN(ppid) ? 1 : ppid,
      tty,
      exe,
      cmdline,
      etimeSeconds,
      cpuPct: isNaN(cpuPct) ? 0 : cpuPct,
      rssKb: isNaN(rssKb) ? null : rssKb,
      threads: threads && !isNaN(threads) ? threads : null
    });
  }

  return processes;
}

/**
 * Parse elapsed time string from ps (format: [[dd-]hh:]mm:ss).
 */
function parseEtime(value: string): number {
  let days = 0;

  if (value.includes("-")) {
    const [dayPart, rest] = value.split("-");
    days = Number.parseInt(dayPart!, 10);
    value = rest!;
  }

  const parts = value.split(":").map((p) => Number.parseInt(p, 10));

  let hours = 0,
    minutes = 0,
    seconds = 0;

  if (parts.length === 3) {
    [hours, minutes, seconds] = parts as [number, number, number];
  } else if (parts.length === 2) {
    [minutes, seconds] = parts as [number, number];
  } else {
    seconds = parts[0]!;
  }

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Get working directory for a process using lsof.
 */
async function lsofCwd(pid: number): Promise<string | null> {
  try {
    const proc = Bun.spawn(
      ["lsof", "-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      {
        stdout: "pipe",
        stderr: "pipe"
      }
    );

    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;

    const output = await new Response(proc.stdout).text();
    for (const line of output.split("\n")) {
      if (line.startsWith("n")) {
        return line.slice(1);
      }
    }
  } catch (e) {
    // lsof failed
    if (process.env.DEBUG) {
      console.error(`lsof failed for pid ${pid}:`, e);
    }
  }
  return null;
}

/**
 * Match cwd to a known repo path.
 */
function resolveRepoFromCwd(
  cwd: string | null,
  repoPaths: string[]
): string | null {
  if (!cwd) return null;

  let best: string | null = null;
  for (const repo of repoPaths) {
    if (cwd === repo || cwd.startsWith(repo + "/")) {
      if (!best || repo.length > best.length) {
        best = repo;
      }
    }
  }
  return best;
}

export { DEFAULT_CONFIG as DEFAULT_PROCESS_SCANNER_CONFIG };
