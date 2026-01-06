/**
 * Mock data fixtures for screenshot tests.
 * These can be used to seed the legacy daemon with test data.
 */

export const mockAgents = [
  {
    pid: 12345,
    label: "Claude Code",
    cmdline: "claude-code --watch",
    exe: "/usr/local/bin/claude-code",
    cpu_pct: 12.5,
    rss_kb: 256000,
    threads: 4,
    tty: "/dev/ttys001",
    cwd: "/Users/demo/projects/my-app",
    repo_path: "/Users/demo/projects/my-app",
    start_time: Date.now() - 3600000, // 1 hour ago
    heuristic_state: { state: "WORKING", cpu_pct_recent: 15, quiet_seconds: 2 },
    wrapper_state: {
      state: "active",
      last_output_time: Date.now(),
      awaiting_user: false
    },
    sandboxed: true
  },
  {
    pid: 12346,
    label: "Claude Code",
    cmdline: "claude-code --auto",
    exe: "/usr/local/bin/claude-code",
    cpu_pct: 0.5,
    rss_kb: 128000,
    threads: 2,
    tty: "/dev/ttys002",
    cwd: "/Users/demo/projects/api-server",
    repo_path: "/Users/demo/projects/api-server",
    start_time: Date.now() - 7200000, // 2 hours ago
    heuristic_state: {
      state: "WAITING",
      cpu_pct_recent: 0.2,
      quiet_seconds: 120
    },
    wrapper_state: {
      state: "waiting",
      last_output_time: Date.now() - 120000,
      awaiting_user: true
    },
    sandboxed: false
  },
  {
    pid: 12347,
    label: "Codex",
    cmdline: "codex run --agent",
    exe: "/usr/local/bin/codex",
    cpu_pct: 45.0,
    rss_kb: 512000,
    threads: 8,
    tty: "/dev/ttys003",
    cwd: "/Users/demo/projects/ml-pipeline",
    repo_path: "/Users/demo/projects/ml-pipeline",
    start_time: Date.now() - 1800000, // 30 min ago
    heuristic_state: { state: "WORKING", cpu_pct_recent: 42, quiet_seconds: 5 },
    sandboxed: true
  }
];

export const mockHookSessions = [
  {
    session_id: "sess_abc123",
    transcript_path: "/Users/demo/.claude/projects/my-app/session.jsonl",
    cwd: "/Users/demo/projects/my-app",
    start_time: Date.now() - 3600000,
    end_time: null,
    permission_mode: "auto",
    source: "startup" as const,
    tool_count: 42,
    last_activity: Date.now() - 30000,
    awaiting_user: false,
    tools_used: { Bash: 15, Read: 12, Write: 8, Grep: 4, Edit: 3 },
    active: true,
    commit_count: 2
  },
  {
    session_id: "sess_def456",
    transcript_path: "/Users/demo/.claude/projects/api-server/session.jsonl",
    cwd: "/Users/demo/projects/api-server",
    start_time: Date.now() - 7200000,
    end_time: null,
    permission_mode: "plan",
    source: "prompt" as const,
    tool_count: 18,
    last_activity: Date.now() - 300000,
    awaiting_user: true,
    tools_used: { Read: 10, Grep: 5, Write: 3 },
    active: true,
    commit_count: 0
  },
  {
    session_id: "sess_old789",
    transcript_path: "/Users/demo/.claude/projects/legacy/session.jsonl",
    cwd: "/Users/demo/projects/legacy",
    start_time: Date.now() - 86400000, // 1 day ago
    end_time: Date.now() - 82800000,
    permission_mode: "auto",
    source: "startup" as const,
    tool_count: 156,
    last_activity: Date.now() - 82800000,
    awaiting_user: false,
    tools_used: { Bash: 50, Read: 40, Write: 30, Edit: 20, Grep: 16 },
    active: false,
    commit_count: 5
  }
];

export const mockRepos = [
  {
    repo_id: "repo_myapp",
    path: "/Users/demo/projects/my-app",
    name: "my-app",
    branch: "feature/new-dashboard",
    dirty: true,
    staged: 2,
    unstaged: 5,
    untracked: 3,
    conflict: false,
    rebase: false,
    merge: false,
    cherry_pick: false,
    revert: false,
    ahead: 3,
    behind: 0,
    upstream_name: "origin/feature/new-dashboard",
    last_error: null,
    timed_out: false,
    last_scan_time: Date.now(),
    last_change_time: Date.now() - 60000
  },
  {
    repo_id: "repo_api",
    path: "/Users/demo/projects/api-server",
    name: "api-server",
    branch: "main",
    dirty: false,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflict: false,
    rebase: false,
    merge: false,
    cherry_pick: false,
    revert: false,
    ahead: 0,
    behind: 2,
    upstream_name: "origin/main",
    last_error: null,
    timed_out: false,
    last_scan_time: Date.now(),
    last_change_time: Date.now() - 3600000
  },
  {
    repo_id: "repo_ml",
    path: "/Users/demo/projects/ml-pipeline",
    name: "ml-pipeline",
    branch: "develop",
    dirty: true,
    staged: 0,
    unstaged: 12,
    untracked: 0,
    conflict: true,
    rebase: true,
    merge: false,
    cherry_pick: false,
    revert: false,
    ahead: 1,
    behind: 5,
    upstream_name: "origin/develop",
    last_error: null,
    timed_out: false,
    last_scan_time: Date.now(),
    last_change_time: Date.now() - 120000
  }
];

export const mockPorts = [
  {
    port: 5173,
    pid: 12345,
    process_name: "vite",
    cmdline: "vite dev",
    bind_address: "127.0.0.1",
    protocol: "tcp",
    agent_pid: 12345,
    agent_label: "Claude Code",
    first_seen: Date.now() - 3600000,
    cwd: "/Users/demo/projects/my-app"
  },
  {
    port: 3000,
    pid: 12346,
    process_name: "node",
    cmdline: "node server.js",
    bind_address: "0.0.0.0",
    protocol: "tcp",
    agent_pid: 12346,
    agent_label: "Claude Code",
    first_seen: Date.now() - 7200000,
    cwd: "/Users/demo/projects/api-server"
  },
  {
    port: 8080,
    pid: 54321,
    process_name: "nginx",
    cmdline: "nginx -g daemon off",
    bind_address: "0.0.0.0",
    protocol: "tcp",
    agent_pid: null,
    agent_label: null,
    first_seen: Date.now() - 86400000,
    cwd: "/etc/nginx"
  },
  {
    port: 5432,
    pid: 98765,
    process_name: "postgres",
    cmdline: "postgres -D /var/lib/postgresql",
    bind_address: "127.0.0.1",
    protocol: "tcp",
    agent_pid: null,
    agent_label: null,
    first_seen: Date.now() - 86400000 * 7,
    cwd: "/var/lib/postgresql"
  }
];

export const mockToolUsage = [
  {
    tool_name: "Bash",
    success: true,
    duration_ms: 245,
    timestamp: Date.now() - 30000
  },
  {
    tool_name: "Read",
    success: true,
    duration_ms: 12,
    timestamp: Date.now() - 25000
  },
  {
    tool_name: "Grep",
    success: true,
    duration_ms: 89,
    timestamp: Date.now() - 20000
  },
  {
    tool_name: "Write",
    success: true,
    duration_ms: 34,
    timestamp: Date.now() - 15000
  },
  {
    tool_name: "Bash",
    success: false,
    duration_ms: 5000,
    timestamp: Date.now() - 10000
  },
  {
    tool_name: "Edit",
    success: true,
    duration_ms: 56,
    timestamp: Date.now() - 5000
  }
];

export const mockToolStats = {
  Bash: { total: 150, success: 142, avg_duration_ms: 350 },
  Read: { total: 280, success: 280, avg_duration_ms: 15 },
  Write: { total: 85, success: 83, avg_duration_ms: 42 },
  Edit: { total: 45, success: 44, avg_duration_ms: 28 },
  Grep: { total: 120, success: 118, avg_duration_ms: 95 },
  Glob: { total: 60, success: 60, avg_duration_ms: 25 },
  Task: { total: 12, success: 11, avg_duration_ms: 45000 },
  WebFetch: { total: 8, success: 7, avg_duration_ms: 2500 }
};

export const mockDailyStats = Array.from({ length: 14 }, (_, i) => ({
  date: new Date(Date.now() - (13 - i) * 86400000).toISOString().split("T")[0],
  sessions: Math.floor(Math.random() * 10) + 1,
  tools: Math.floor(Math.random() * 200) + 50,
  tokens: Math.floor(Math.random() * 50000) + 10000
}));
