/**
 * Process Runner: Daemon-side agent process spawning
 *
 * Enables the web UI to launch agent runs by handling:
 * - Agent command construction (always print mode from web)
 * - Principles injection into prompts
 * - Process lifecycle tracking
 * - Output collection
 */

import type { SessionStore } from "@agentwatch/monitor";

/** Supported agent types */
export type AgentType = "claude" | "codex" | "gemini";

/** Agent command configurations */
export const AGENT_COMMANDS: Record<
  AgentType,
  { interactive: string[]; print: string[] }
> = {
  claude: {
    interactive: ["claude"],
    print: ["claude", "--print"]
  },
  codex: {
    interactive: ["codex"],
    print: ["codex", "--quiet"]
  },
  gemini: {
    interactive: ["gemini"],
    print: ["gemini"]
  }
};

/** Options for launching a run */
export interface RunOptions {
  /** Session ID (from SessionStore) */
  sessionId: string;
  /** User prompt */
  prompt: string;
  /** Agent to use */
  agent: AgentType;
  /** Working directory */
  cwd: string;
  /** Optional principles to inject into prompt */
  principlesInjection?: string;
  /** Optional intentions to inject into prompt */
  intentions?: string;
}

/** Result from a completed run */
export interface RunResult {
  /** Session ID */
  sessionId: string;
  /** Exit code */
  exitCode: number;
  /** Collected stdout (for print mode) */
  output?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/** Callback for when a run completes */
export type RunCompleteCallback = (result: RunResult) => void;

/**
 * Builds a prompt with injected principles and intentions.
 */
export function buildEnhancedPrompt(
  prompt: string,
  principlesInjection?: string,
  intentions?: string
): string {
  const parts: string[] = [];

  if (principlesInjection) {
    parts.push("[PRINCIPLES - Keep these in mind]");
    parts.push(principlesInjection);
    parts.push("");
  }

  if (intentions) {
    parts.push("[INTENTION]");
    parts.push(intentions);
    parts.push("");
  }

  if (parts.length > 0) {
    parts.push("---");
    parts.push("");
    parts.push("[USER PROMPT BELOW]");
  }

  parts.push(prompt);

  return parts.join("\n");
}

/**
 * Process Runner for daemon-side agent spawning.
 */
export class ProcessRunner {
  private sessionStore: SessionStore;
  private runningProcesses: Map<
    string,
    { proc: ReturnType<typeof Bun.spawn>; startedAt: number }
  > = new Map();
  private onRunComplete?: RunCompleteCallback;

  constructor(sessionStore: SessionStore) {
    this.sessionStore = sessionStore;
  }

  /**
   * Set callback for run completion.
   */
  setCallback(callback: RunCompleteCallback): void {
    this.onRunComplete = callback;
  }

  /**
   * Check if an agent type is supported.
   */
  isValidAgent(agent: string): agent is AgentType {
    return agent in AGENT_COMMANDS;
  }

  /**
   * Get list of supported agents.
   */
  getSupportedAgents(): AgentType[] {
    return Object.keys(AGENT_COMMANDS) as AgentType[];
  }

  /**
   * Launch an agent run (always print mode from web).
   * Returns immediately; monitors completion in background.
   */
  async run(options: RunOptions): Promise<{ pid: number }> {
    const { sessionId, prompt, agent, cwd, principlesInjection, intentions } =
      options;

    if (!this.isValidAgent(agent)) {
      throw new Error(`Unknown agent: ${agent}`);
    }

    // Build enhanced prompt with principles/intentions
    const fullPrompt = buildEnhancedPrompt(
      prompt,
      principlesInjection,
      intentions
    );

    // Get agent command (always print mode for web)
    const agentConfig = AGENT_COMMANDS[agent];
    const cmdArgs = [...agentConfig.print, fullPrompt];

    // Spawn the process
    const startedAt = Date.now();
    const proc = Bun.spawn(cmdArgs, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env
    });

    // Update session with PID
    this.sessionStore.updateSession(sessionId, { pid: proc.pid });

    // Track running process
    this.runningProcesses.set(sessionId, { proc, startedAt });

    // Monitor completion in background
    this.monitorProcess(sessionId, proc, startedAt);

    return { pid: proc.pid };
  }

  /**
   * Monitor process completion and update session.
   */
  private async monitorProcess(
    sessionId: string,
    proc: ReturnType<typeof Bun.spawn>,
    startedAt: number
  ): Promise<void> {
    try {
      const exitCode = await proc.exited;
      const durationMs = Date.now() - startedAt;

      // Collect output
      let output: string | undefined;
      if (proc.stdout && typeof proc.stdout !== "number") {
        try {
          output = await new Response(proc.stdout).text();
        } catch {
          // Ignore output collection errors
        }
      }

      // End session
      this.sessionStore.endSession(sessionId, exitCode);

      // Remove from tracking
      this.runningProcesses.delete(sessionId);

      // Notify callback
      if (this.onRunComplete) {
        try {
          this.onRunComplete({
            sessionId,
            exitCode,
            output,
            durationMs
          });
        } catch {
          // Ignore callback errors
        }
      }
    } catch (error) {
      // Process monitoring failed - mark session as failed
      this.sessionStore.endSession(sessionId, -1);
      this.runningProcesses.delete(sessionId);
    }
  }

  /**
   * Get running process info for a session.
   */
  getRunningProcess(
    sessionId: string
  ): { pid: number; durationMs: number } | null {
    const running = this.runningProcesses.get(sessionId);
    if (!running) return null;

    return {
      pid: running.proc.pid,
      durationMs: Date.now() - running.startedAt
    };
  }

  /**
   * Get all running sessions.
   */
  getRunningSessionIds(): string[] {
    return [...this.runningProcesses.keys()];
  }

  /**
   * Kill a running process by session ID.
   */
  async kill(sessionId: string): Promise<boolean> {
    const running = this.runningProcesses.get(sessionId);
    if (!running) return false;

    try {
      running.proc.kill();
      return true;
    } catch {
      return false;
    }
  }
}
