/**
 * Watcher configuration.
 *
 * Handles settings for real-time monitoring:
 * - Process/agent scanning and detection
 * - Repository scanning intervals
 * - Hook behavior and enhancements
 * - Notifications
 * - Test gate
 *
 * Reads from:
 * 1. ~/.config/agentwatch/watcher.toml (preferred)
 * 2. ~/.config/agentwatch/config.toml (fallback for shared/legacy)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

// =========== Agent/Process Scanning ===========

export interface AgentMatcherConfig {
  label: string;
  type: "cmd_regex" | "exe_path";
  pattern: string;
}

export interface AgentsConfig {
  refreshSeconds: number;
  activeCpuThreshold: number;
  stalledSeconds: number;
  matchers: AgentMatcherConfig[];
}

// =========== Repository Scanning ===========

export interface RepoConfig {
  refreshFastSeconds: number;
  refreshSlowSeconds: number;
  gitTimeoutFastMs: number;
  gitTimeoutSlowMs: number;
  concurrencyGit: number;
  includeUntracked: boolean;
  showClean: boolean;
}

// =========== Watcher Server ===========

export interface ServerConfig {
  host: string;
  port: number;
  pidFile: string;
  logDir: string;
}

// =========== Test Gate ===========

export interface TestGateConfig {
  enabled: boolean;
  testCommand: string;
  passFile: string;
  passFileMaxAgeSeconds: number;
}

// =========== Notifications ===========

export interface NotificationsConfig {
  enable: boolean;
  hookAwaitingInput: boolean;
  hookSessionEnd: boolean;
  hookToolFailure: boolean;
  hookLongRunning: boolean;
  hookStop: boolean;
  longRunningThresholdSeconds: number;
  // Educational notifications (all hooks)
  hookSessionStart: boolean;
  hookPreToolUse: boolean;
  hookPostToolUse: boolean;
  hookNotification: boolean;
  hookPermissionRequest: boolean;
  hookUserPromptSubmit: boolean;
  hookSubagentStop: boolean;
  hookPreCompact: boolean;
}

// =========== Hook Enhancements ===========

export interface CostControlsConfig {
  enabled: boolean;
  sessionLimitUsd: number;
  dailyLimitUsd: number;
  warningThreshold: number;
}

export interface NotificationHubConfig {
  enabled: boolean;
  desktop: boolean;
  webhook?: string;
}

export interface RulesConfig {
  enabled: boolean;
  rulesFile: string;
  enabledRuleSets: string[];
}

export interface HookEnhancementsConfig {
  costControls: CostControlsConfig;
  notificationHub: NotificationHubConfig;
  rules: RulesConfig;
  // Token tracking
  tokenTracking: {
    enabled: boolean;
    costWarningThresholdUsd: number;
  };
  // Auto-continue
  autoContinue: {
    enabled: boolean;
    onFailingTests: boolean;
    onLintErrors: boolean;
    maxAttempts: number;
  };
  // Stop blocking
  stopBlocking: {
    enabled: boolean;
    requireTestsPass: boolean;
    requireNoLintErrors: boolean;
    maxBlockAttempts: number;
  };
}

// =========== Main Config ===========

export interface WatcherConfig {
  roots: string[];
  agents: AgentsConfig;
  repo: RepoConfig;
  watcher: ServerConfig;
  testGate: TestGateConfig;
  notifications: NotificationsConfig;
  hookEnhancements: HookEnhancementsConfig;
}

const DEFAULT_CONFIG: WatcherConfig = {
  roots: [homedir()],
  agents: {
    refreshSeconds: 2,
    activeCpuThreshold: 1.0,
    stalledSeconds: 300,
    matchers: [
      { label: "claude", type: "cmd_regex", pattern: "\\bclaude\\b" },
      { label: "codex", type: "cmd_regex", pattern: "\\bcodex\\b" },
      { label: "cursor", type: "cmd_regex", pattern: "\\bcursor\\b" },
      { label: "opencode", type: "cmd_regex", pattern: "\\bopencode\\b" },
      { label: "gemini", type: "cmd_regex", pattern: "\\bgemini\\b" }
    ]
  },
  repo: {
    refreshFastSeconds: 2,
    refreshSlowSeconds: 30,
    gitTimeoutFastMs: 5000,
    gitTimeoutSlowMs: 30000,
    concurrencyGit: 4,
    includeUntracked: true,
    showClean: false
  },
  watcher: {
    host: "localhost",
    port: 8420,
    pidFile: "~/.agentwatch/watcher.pid",
    logDir: "~/.agentwatch/logs"
  },
  testGate: {
    enabled: false,
    testCommand: "",
    passFile: "~/.agentwatch/test-pass",
    passFileMaxAgeSeconds: 3600
  },
  notifications: {
    enable: false,
    hookAwaitingInput: true,
    hookSessionEnd: true,
    hookToolFailure: true,
    hookLongRunning: true,
    hookStop: true,
    longRunningThresholdSeconds: 300,
    hookSessionStart: false,
    hookPreToolUse: false,
    hookPostToolUse: false,
    hookNotification: false,
    hookPermissionRequest: false,
    hookUserPromptSubmit: false,
    hookSubagentStop: false,
    hookPreCompact: false
  },
  hookEnhancements: {
    costControls: {
      enabled: false,
      sessionLimitUsd: 5.0,
      dailyLimitUsd: 50.0,
      warningThreshold: 0.8
    },
    notificationHub: {
      enabled: false,
      desktop: true
    },
    rules: {
      enabled: false,
      rulesFile: "~/.agentwatch/rules.jsonl",
      enabledRuleSets: []
    },
    tokenTracking: {
      enabled: true,
      costWarningThresholdUsd: 5.0
    },
    autoContinue: {
      enabled: false,
      onFailingTests: false,
      onLintErrors: false,
      maxAttempts: 3
    },
    stopBlocking: {
      enabled: false,
      requireTestsPass: false,
      requireNoLintErrors: false,
      maxBlockAttempts: 3
    }
  }
};

function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Load watcher configuration.
 *
 * Priority:
 * 1. ~/.config/agentwatch/watcher.toml
 * 2. ~/.config/agentwatch/config.toml (legacy/shared)
 */
export function loadConfig(): WatcherConfig {
  const watcherPath = join(homedir(), ".config", "agentwatch", "watcher.toml");
  const sharedPath = join(homedir(), ".config", "agentwatch", "config.toml");

  // Try watcher-specific config first
  if (existsSync(watcherPath)) {
    try {
      const content = readFileSync(watcherPath, "utf-8");
      return parseWatcherConfig(content);
    } catch {
      // Fall through to shared config
    }
  }

  // Fall back to shared config
  if (existsSync(sharedPath)) {
    try {
      const content = readFileSync(sharedPath, "utf-8");
      return parseSharedConfig(content);
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * Parse watcher-specific TOML config.
 */
function parseWatcherConfig(content: string): WatcherConfig {
  const config = { ...DEFAULT_CONFIG };

  // Parse roots
  const rootsMatch = content.match(/roots\s*=\s*\[([\s\S]*?)\]/);
  if (rootsMatch?.[1]) {
    const roots = rootsMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    if (roots.length > 0) {
      config.roots = roots;
    }
  }

  // Parse [agents] section
  const agentsRefresh = parseNumberField(content, "agents", "refresh_seconds");
  if (agentsRefresh !== null) config.agents.refreshSeconds = agentsRefresh;

  const cpuThreshold = parseNumberField(
    content,
    "agents",
    "active_cpu_threshold"
  );
  if (cpuThreshold !== null) config.agents.activeCpuThreshold = cpuThreshold;

  const stalledSecs = parseNumberField(content, "agents", "stalled_seconds");
  if (stalledSecs !== null) config.agents.stalledSeconds = stalledSecs;

  // Parse [repo] section
  const repoFast = parseNumberField(content, "repo", "refresh_fast_seconds");
  if (repoFast !== null) config.repo.refreshFastSeconds = repoFast;

  const repoSlow = parseNumberField(content, "repo", "refresh_slow_seconds");
  if (repoSlow !== null) config.repo.refreshSlowSeconds = repoSlow;

  const includeUntracked = parseBoolField(content, "repo", "include_untracked");
  if (includeUntracked !== null)
    config.repo.includeUntracked = includeUntracked;

  const showClean = parseBoolField(content, "repo", "show_clean");
  if (showClean !== null) config.repo.showClean = showClean;

  // Parse [watcher] section
  const watcherHost = parseStringField(content, "watcher", "host");
  if (watcherHost) config.watcher.host = watcherHost;

  const watcherPort = parseNumberField(content, "watcher", "port");
  if (watcherPort !== null) config.watcher.port = watcherPort;

  const logDir = parseStringField(content, "watcher", "log_dir");
  if (logDir) config.watcher.logDir = logDir;

  // Parse [test_gate] section
  const testGateEnabled = parseBoolField(content, "test_gate", "enabled");
  if (testGateEnabled !== null) config.testGate.enabled = testGateEnabled;

  const testCommand = parseStringField(content, "test_gate", "test_command");
  if (testCommand) config.testGate.testCommand = testCommand;

  // Parse [notifications] section
  const notifyEnable = parseBoolField(content, "notifications", "enable");
  if (notifyEnable !== null) config.notifications.enable = notifyEnable;

  const hookStop = parseBoolField(content, "notifications", "hook_stop");
  if (hookStop !== null) config.notifications.hookStop = hookStop;

  // Parse [hook_enhancements.cost_controls] section
  const costEnabled = parseBoolField(
    content,
    "hook_enhancements.cost_controls",
    "enabled"
  );
  if (costEnabled !== null)
    config.hookEnhancements.costControls.enabled = costEnabled;

  const sessionLimit = parseNumberField(
    content,
    "hook_enhancements.cost_controls",
    "session_limit_usd"
  );
  if (sessionLimit !== null)
    config.hookEnhancements.costControls.sessionLimitUsd = sessionLimit;

  const dailyLimit = parseNumberField(
    content,
    "hook_enhancements.cost_controls",
    "daily_limit_usd"
  );
  if (dailyLimit !== null)
    config.hookEnhancements.costControls.dailyLimitUsd = dailyLimit;

  const warningThreshold = parseNumberField(
    content,
    "hook_enhancements.cost_controls",
    "warning_threshold"
  );
  if (warningThreshold !== null)
    config.hookEnhancements.costControls.warningThreshold = warningThreshold;

  // Parse [hook_enhancements.notification_hub] section
  const notificationHubEnabled = parseBoolField(
    content,
    "hook_enhancements.notification_hub",
    "enabled"
  );
  if (notificationHubEnabled !== null)
    config.hookEnhancements.notificationHub.enabled = notificationHubEnabled;

  const notificationHubDesktop = parseBoolField(
    content,
    "hook_enhancements.notification_hub",
    "desktop"
  );
  if (notificationHubDesktop !== null)
    config.hookEnhancements.notificationHub.desktop = notificationHubDesktop;

  const notificationHubWebhook = parseStringField(
    content,
    "hook_enhancements.notification_hub",
    "webhook"
  );
  if (notificationHubWebhook)
    config.hookEnhancements.notificationHub.webhook = notificationHubWebhook;

  // Parse [hook_enhancements.rules] section
  const rulesEnabled = parseBoolField(
    content,
    "hook_enhancements.rules",
    "enabled"
  );
  if (rulesEnabled !== null)
    config.hookEnhancements.rules.enabled = rulesEnabled;

  const rulesFile = parseStringField(
    content,
    "hook_enhancements.rules",
    "rules_file"
  );
  if (rulesFile) config.hookEnhancements.rules.rulesFile = rulesFile;

  const enabledRuleSets = parseStringArrayField(
    content,
    "hook_enhancements.rules",
    "enabled_rule_sets"
  );
  if (enabledRuleSets) {
    config.hookEnhancements.rules.enabledRuleSets = enabledRuleSets;
  }

  // Parse [hook_enhancements.token_tracking] section
  const tokenTrackingEnabled = parseBoolField(
    content,
    "hook_enhancements.token_tracking",
    "enabled"
  );
  if (tokenTrackingEnabled !== null)
    config.hookEnhancements.tokenTracking.enabled = tokenTrackingEnabled;

  const costWarningThreshold = parseNumberField(
    content,
    "hook_enhancements.token_tracking",
    "cost_warning_threshold_usd"
  );
  if (costWarningThreshold !== null)
    config.hookEnhancements.tokenTracking.costWarningThresholdUsd =
      costWarningThreshold;

  // Parse [hook_enhancements.auto_continue] section
  const autoContinueEnabled = parseBoolField(
    content,
    "hook_enhancements.auto_continue",
    "enabled"
  );
  if (autoContinueEnabled !== null)
    config.hookEnhancements.autoContinue.enabled = autoContinueEnabled;

  const autoContinueFailingTests = parseBoolField(
    content,
    "hook_enhancements.auto_continue",
    "on_failing_tests"
  );
  if (autoContinueFailingTests !== null)
    config.hookEnhancements.autoContinue.onFailingTests =
      autoContinueFailingTests;

  const autoContinueLintErrors = parseBoolField(
    content,
    "hook_enhancements.auto_continue",
    "on_lint_errors"
  );
  if (autoContinueLintErrors !== null)
    config.hookEnhancements.autoContinue.onLintErrors = autoContinueLintErrors;

  const autoContinueAttempts = parseNumberField(
    content,
    "hook_enhancements.auto_continue",
    "max_attempts"
  );
  if (autoContinueAttempts !== null)
    config.hookEnhancements.autoContinue.maxAttempts = autoContinueAttempts;

  // Parse [hook_enhancements.stop_blocking] section
  const stopBlockingEnabled = parseBoolField(
    content,
    "hook_enhancements.stop_blocking",
    "enabled"
  );
  if (stopBlockingEnabled !== null)
    config.hookEnhancements.stopBlocking.enabled = stopBlockingEnabled;

  const stopBlockingTestsPass = parseBoolField(
    content,
    "hook_enhancements.stop_blocking",
    "require_tests_pass"
  );
  if (stopBlockingTestsPass !== null)
    config.hookEnhancements.stopBlocking.requireTestsPass =
      stopBlockingTestsPass;

  const stopBlockingLintErrors = parseBoolField(
    content,
    "hook_enhancements.stop_blocking",
    "require_no_lint_errors"
  );
  if (stopBlockingLintErrors !== null)
    config.hookEnhancements.stopBlocking.requireNoLintErrors =
      stopBlockingLintErrors;

  const stopBlockingAttempts = parseNumberField(
    content,
    "hook_enhancements.stop_blocking",
    "max_block_attempts"
  );
  if (stopBlockingAttempts !== null)
    config.hookEnhancements.stopBlocking.maxBlockAttempts =
      stopBlockingAttempts;

  return config;
}

/**
 * Parse shared config.toml format (legacy daemon format).
 */
function parseSharedConfig(content: string): WatcherConfig {
  const config = { ...DEFAULT_CONFIG };

  // Parse roots
  const rootsMatch = content.match(/roots\s*=\s*\[([\s\S]*?)\]/);
  if (rootsMatch?.[1]) {
    const roots = rootsMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    if (roots.length > 0) {
      config.roots = roots;
    }
  }

  // Parse [daemon] section (maps to watcher)
  const daemonHost = parseStringField(content, "daemon", "host");
  if (daemonHost) config.watcher.host = daemonHost;

  const daemonPort = parseNumberField(content, "daemon", "port");
  if (daemonPort !== null) config.watcher.port = daemonPort;

  // Parse [repo] section
  const repoFast = parseNumberField(content, "repo", "refresh_fast_seconds");
  if (repoFast !== null) config.repo.refreshFastSeconds = repoFast;

  const repoSlow = parseNumberField(content, "repo", "refresh_slow_seconds");
  if (repoSlow !== null) config.repo.refreshSlowSeconds = repoSlow;

  // Parse [test_gate] section
  const testGateEnabled = parseBoolField(content, "test_gate", "enabled");
  if (testGateEnabled !== null) config.testGate.enabled = testGateEnabled;

  // Parse [notifications] section
  const notifyEnable = parseBoolField(content, "notifications", "enable");
  if (notifyEnable !== null) config.notifications.enable = notifyEnable;

  return config;
}

// =========== TOML Parsing Helpers ===========

function parseNumberField(
  content: string,
  section: string,
  field: string
): number | null {
  // Match [section] followed by field = number
  const sectionPattern = section.includes(".")
    ? section
        .split(".")
        .map((s) => `\\[${s}\\]`)
        .join("[\\s\\S]*?")
    : `\\[${section}\\]`;
  const regex = new RegExp(
    `${sectionPattern}[\\s\\S]*?${field}\\s*=\\s*(\\d+(?:\\.\\d+)?)`
  );
  const match = content.match(regex);
  return match ? Number(match[1]) : null;
}

function parseStringField(
  content: string,
  section: string,
  field: string
): string | null {
  const sectionPattern = section.includes(".")
    ? section
        .split(".")
        .map((s) => `\\[${s}\\]`)
        .join("[\\s\\S]*?")
    : `\\[${section}\\]`;
  const regex = new RegExp(
    `${sectionPattern}[\\s\\S]*?${field}\\s*=\\s*["']([^"']+)["']`
  );
  const match = content.match(regex);
  return match?.[1] ?? null;
}

function parseBoolField(
  content: string,
  section: string,
  field: string
): boolean | null {
  const sectionPattern = section.includes(".")
    ? section
        .split(".")
        .map((s) => `\\[${s}\\]`)
        .join("[\\s\\S]*?")
    : `\\[${section}\\]`;
  const regex = new RegExp(
    `${sectionPattern}[\\s\\S]*?${field}\\s*=\\s*(true|false)`
  );
  const match = content.match(regex);
  return match ? match[1] === "true" : null;
}

function parseStringArrayField(
  content: string,
  section: string,
  field: string
): string[] | null {
  const sectionPattern = section.includes(".")
    ? section
        .split(".")
        .map((s) => `\\[${s}\\]`)
        .join("[\\s\\S]*?")
    : `\\[${section}\\]`;
  const regex = new RegExp(
    `${sectionPattern}[\\s\\S]*?${field}\\s*=\\s*\\[([^\\]]*)\\]`
  );
  const match = content.match(regex);
  if (!match?.[1]) return null;

  const items = match[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

// =========== Config Saving ===========

/**
 * Save watcher configuration to watcher.toml.
 */
export function saveWatcherConfig(config: WatcherConfig): void {
  const configPath = join(homedir(), ".config", "agentwatch", "watcher.toml");
  const dir = dirname(configPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = [
    "# Watcher Configuration",
    "# Real-time monitoring settings for agent detection and hook processing",
    "",
    `roots = [${config.roots.map((r) => `"${r}"`).join(", ")}]`,
    "",
    "[agents]",
    `refresh_seconds = ${config.agents.refreshSeconds}`,
    `active_cpu_threshold = ${config.agents.activeCpuThreshold}`,
    `stalled_seconds = ${config.agents.stalledSeconds}`,
    "",
    "[repo]",
    `refresh_fast_seconds = ${config.repo.refreshFastSeconds}`,
    `refresh_slow_seconds = ${config.repo.refreshSlowSeconds}`,
    `include_untracked = ${config.repo.includeUntracked}`,
    `show_clean = ${config.repo.showClean}`,
    "",
    "[watcher]",
    `host = "${config.watcher.host}"`,
    `port = ${config.watcher.port}`,
    `log_dir = "${config.watcher.logDir}"`,
    "",
    "[test_gate]",
    `enabled = ${config.testGate.enabled}`,
    `test_command = "${config.testGate.testCommand}"`,
    `pass_file = "${config.testGate.passFile}"`,
    "",
    "[notifications]",
    `enable = ${config.notifications.enable}`,
    `hook_awaiting_input = ${config.notifications.hookAwaitingInput}`,
    `hook_session_end = ${config.notifications.hookSessionEnd}`,
    `hook_tool_failure = ${config.notifications.hookToolFailure}`,
    `hook_stop = ${config.notifications.hookStop}`,
    `long_running_threshold_seconds = ${config.notifications.longRunningThresholdSeconds}`,
    "",
    "[hook_enhancements.cost_controls]",
    `enabled = ${config.hookEnhancements.costControls.enabled}`,
    `session_limit_usd = ${config.hookEnhancements.costControls.sessionLimitUsd}`,
    `daily_limit_usd = ${config.hookEnhancements.costControls.dailyLimitUsd}`,
    `warning_threshold = ${config.hookEnhancements.costControls.warningThreshold}`,
    "",
    "[hook_enhancements.rules]",
    `enabled = ${config.hookEnhancements.rules.enabled}`,
    `rules_file = "${config.hookEnhancements.rules.rulesFile}"`,
    "",
    "[hook_enhancements.token_tracking]",
    `enabled = ${config.hookEnhancements.tokenTracking.enabled}`,
    `cost_warning_threshold_usd = ${config.hookEnhancements.tokenTracking.costWarningThresholdUsd}`
  ];

  writeFileSync(configPath, lines.join("\n") + "\n");
}

/**
 * Get config file path for display.
 */
export function getConfigPath(): string {
  const watcherPath = join(homedir(), ".config", "agentwatch", "watcher.toml");
  const sharedPath = join(homedir(), ".config", "agentwatch", "config.toml");

  if (existsSync(watcherPath)) {
    return watcherPath;
  }
  return sharedPath;
}
