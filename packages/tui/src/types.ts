/**
 * Types for TUI - matches watcher API responses
 */

export interface AgentProcess {
  pid: number;
  label: string;
  cmdline: string;
  cpu_pct: number;
  wrapper_state: WrapperState | null;
  heuristic_state: {
    state: "WORKING" | "WAITING" | "STALLED";
    cpu_pct_recent: number;
    quiet_seconds: number;
  } | null;
}

export interface WrapperState {
  state: string;
  awaiting_user: boolean;
}

export interface RepoStatus {
  repo_id: string;
  path: string;
  name: string;
  branch?: string;
  dirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
}

export interface HookSession {
  session_id: string;
  cwd: string;
  tool_count: number;
  awaiting_user: boolean;
  active: boolean;
  total_input_tokens?: number;
  total_output_tokens?: number;
  estimated_cost_usd?: number;
}

export interface ListeningPort {
  port: number;
  pid: number;
  process_name: string;
  cmdline?: string;
  bind_address: string;
  protocol: string;
  agent_pid?: number;
  agent_label?: string;
  first_seen: number;
  cwd?: string;
}
