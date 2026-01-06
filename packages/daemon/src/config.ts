/**
 * Configuration types and loading for the daemon.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import {
  API_DEFAULTS,
  DAEMON,
  NOTIFICATIONS,
  PROCESS_SCANNER,
  REPO_SCANNER,
  SECURITY_GATES,
  SESSION,
  SUGGESTIONS,
  UI
} from "@agentwatch/core";
import { logAuditEvent } from "./audit-log";

export interface TestGateConfig {
  enabled: boolean;
  testCommand: string;
  passFile: string;
  passFileMaxAgeSeconds: number;
}

export interface NotificationsConfig {
  enable: boolean;
  // Core hook notifications
  hookAwaitingInput: boolean;
  hookSessionEnd: boolean;
  hookToolFailure: boolean;
  hookLongRunning: boolean;
  longRunningThresholdSeconds: number;
  // Educational hook notifications (all hooks for learning)
  hookSessionStart: boolean;
  hookPreToolUse: boolean;
  hookPostToolUse: boolean;
  hookNotification: boolean;
  hookPermissionRequest: boolean;
  hookUserPromptSubmit: boolean;
  hookStop: boolean;
  hookSubagentStop: boolean;
  hookPreCompact: boolean;
}

export interface DaemonConfig {
  host: string;
  port: number;
  pidFile: string;
  logDir: string;
}

export interface AgentMatcherConfig {
  label: string;
  type: "cmd_regex" | "exe_path";
  pattern: string;
}

export interface AgentsConfig {
  refreshSeconds: number;
  /** Minimum CPU % to consider agent "active" */
  activeCpuThreshold: number;
  /** Seconds before marking agent as "stalled" */
  stalledSeconds: number;
  matchers: AgentMatcherConfig[];
}

export interface RepoConfig {
  refreshFastSeconds: number;
  refreshSlowSeconds: number;
  /** Git fast operation timeout (ms) */
  gitTimeoutFastMs: number;
  /** Git slow operation timeout (ms) */
  gitTimeoutSlowMs: number;
  /** Max concurrent git operations */
  concurrencyGit: number;
  includeUntracked: boolean;
  showClean: boolean;
}

export interface WrapperConfig {
  socketPath: string;
  keepDoneSeconds: number;
}

export interface ApiConfig {
  /** Default output lines to fetch */
  outputLimit: number;
  /** Default session/event list limit */
  listLimit: number;
  /** Default days for time-based queries */
  defaultDays: number;
}

export interface SuggestionsConfig {
  /** Minimum tool calls before calculating failure rate */
  minCallsForFailureRate: number;
  /** Failure rate threshold for warnings (0-1) */
  highFailureRate: number;
  /** Read tool calls to suggest caching */
  heavyReadThreshold: number;
  /** Edit operations to note significant changes */
  manyEditsThreshold: number;
  /** Minutes before session is "long" */
  longSessionMinutes: number;
}

/** Configuration for advanced hook response features */
export interface HookEnhancementsConfig {
  // Context injection
  contextInjection: {
    /** Inject git status/diff on session start */
    injectGitContext: boolean;
    /** Inject project README/CLAUDE.md on session start */
    injectProjectContext: boolean;
    /** Inject recent errors on prompt submit */
    injectRecentErrors: boolean;
    /** Max lines of context to inject */
    maxContextLines: number;
  };
  // Token/cost tracking
  tokenTracking: {
    /** Enable per-session token tracking */
    enabled: boolean;
    /** Warn when session cost exceeds this USD amount */
    costWarningThresholdUsd: number;
  };
  // Auto-continue via Stop hook
  autoContinue: {
    /** Enable auto-continue when conditions aren't met */
    enabled: boolean;
    /** Auto-continue if tests are failing */
    onFailingTests: boolean;
    /** Auto-continue if lint errors exist */
    onLintErrors: boolean;
    /** Max auto-continue attempts per session */
    maxAttempts: number;
  };
  // PreToolUse input modification
  inputModification: {
    /** Enable input modification for PreToolUse */
    enabled: boolean;
    /** Auto-add dry-run flags to destructive commands */
    addDryRunFlags: boolean;
    /** Enforce commit message format */
    enforceCommitFormat: boolean;
    /** Commit message prefix (e.g., "feat:", "fix:") */
    commitMessagePrefix: string;
  };
  // PermissionRequest auto-decisions
  autoPermissions: {
    /** Enable auto-approve for permissions */
    enabled: boolean;
    /** Auto-approve read-only operations */
    autoApproveReadOnly: boolean;
  };
  // SubagentStop quality gates
  subagentQuality: {
    /** Enable quality validation for subagents */
    enabled: boolean;
    /** Require subagent to complete successfully */
    requireSuccess: boolean;
    /** Maximum tokens allowed for subagent */
    maxTokens: number | null;
  };

  // Rule engine configuration
  rules: {
    /** Enable rule engine */
    enabled: boolean;
    /** Custom rules file path (JSONL) */
    rulesFile: string;
    /** Built-in rule sets to enable */
    enabledRuleSets: string[];
  };

  // Stop hook blocking
  stopBlocking: {
    /** Enable stop blocking */
    enabled: boolean;
    /** Block if tests not passing */
    requireTestsPass: boolean;
    /** Block if lint errors exist */
    requireNoLintErrors: boolean;
    /** Block if coverage below threshold (null = disabled) */
    requireCoverageThreshold: number | null;
    /** Max blocking attempts before giving up */
    maxBlockAttempts: number;
  };

  // Prompt validation for UserPromptSubmit
  promptValidation: {
    /** Enable prompt validation */
    enabled: boolean;
    /** Block patterns (array of regex strings) */
    blockPatterns: PatternRule[];
    /** Warn patterns (array of regex strings) */
    warnPatterns: PatternRule[];
    /** Minimum prompt length */
    minLength: number;
    /** Maximum prompt length */
    maxLength: number;
  };

  // Environment file injection for SessionStart
  envFileInjection: {
    /** Enable env file injection */
    enabled: boolean;
    /** Static variables to inject */
    staticVars: Record<string, string>;
  };

  // PreCompact intelligence
  preCompact: {
    /** Enable PreCompact enhancements */
    enabled: boolean;
    /** Patterns to preserve during compaction */
    preservePatterns: string[];
    /** Suggest compaction strategy */
    suggestStrategy: boolean;
  };

  // Cost controls
  costControls: {
    /** Enable cost controls */
    enabled: boolean;
    /** Per-session budget in USD (null = unlimited) */
    sessionBudgetUsd: number | null;
    /** Daily budget in USD (null = unlimited) */
    dailyBudgetUsd: number | null;
    /** Monthly budget in USD (null = unlimited) */
    monthlyBudgetUsd: number | null;
    /** Alert thresholds (percentages) */
    alertThresholds: number[];
    /** Action when budget exceeded */
    overBudgetAction: "warn" | "block" | "notify";
  };

  // Notification hub
  notificationHub: {
    /** Enable notification hub */
    enabled: boolean;
    /** Desktop notifications */
    desktop: {
      enabled: boolean;
      format: DesktopFormatConfig;
    };
    /** Webhook configurations */
    webhooks: WebhookConfig[];
    /** Notification routing rules */
    routing: NotificationRoutingRule[];
  };

  // LLM evaluation
  llmEvaluation: {
    /** Enable LLM evaluation */
    enabled: boolean;
    /** LLM provider */
    provider: "anthropic" | "openai" | "ollama";
    /** Model to use */
    model: string;
    /** API key environment variable name */
    apiKeyEnvVar: string;
    /** Max tokens for evaluation */
    maxTokens: number;
    /** Evaluation timeout (ms) */
    timeoutMs: number;
    /** Hook types that can trigger LLM evaluation */
    triggerHooks: string[];
  };
}

/** Pattern rule for prompt validation */
export interface PatternRule {
  pattern: string;
  isRegex: boolean;
  caseSensitive: boolean;
  message: string;
}

/** Desktop notification format configuration */
export interface DesktopFormatConfig {
  /** Show project name (derived from cwd) in title */
  showProjectName: boolean;
  /** Show abbreviated session ID */
  showSessionId: boolean;
  /** Show full cwd path */
  showCwd: boolean;
  /** Show tool details (command preview, etc.) */
  showToolDetails: boolean;
  /** Show stats (tool count, cost) */
  showStats: boolean;
}

/** Webhook configuration */
export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  method: "POST" | "PUT";
  headers: Record<string, string>;
  enabled: boolean;
}

/** Notification routing rule */
export interface NotificationRoutingRule {
  id: string;
  hookTypes?: string[];
  notificationTypes?: ("info" | "warning" | "error" | "success")[];
  providers: string[];
  enabled: boolean;
}

export interface ConversationsConfig {
  /** Number of days of transcripts to show (1, 7, 14, 30, 90) */
  transcriptDays: number;
  /** Include process snapshots to show activity even without hooks/transcripts */
  includeProcessSnapshots: boolean;
}

/** UI preferences (replaces localStorage) */
export interface UiConfig {
  /** Hidden tabs in the main UI */
  hiddenTabs: string[];
  /** Hidden port numbers in the ports panel */
  hiddenPorts: number[];
}

/** Redaction configuration for sharing */
export interface RedactionConfig {
  /** Redact API keys, tokens, etc. */
  redactSecrets: boolean;
  /** Redact emails, IPs, etc. */
  redactPii: boolean;
  /** Redact file paths */
  redactPaths: boolean;
  /** Enable high-entropy string detection */
  enableHighEntropy: boolean;
}

/** Sharing preferences */
export interface SharingConfig {
  /** Redaction settings for exports */
  redactionConfig: RedactionConfig;
}

/** A project definition linking directories to a named project */
export interface ProjectConfig {
  /** Unique project identifier (user-defined slug) */
  id: string;
  /** Display name for the project */
  name: string;
  /** One or more paths that belong to this project */
  paths: string[];
  /** Optional description */
  description?: string;
}

/** Projects configuration */
export interface ProjectsConfig {
  /** List of configured projects */
  projects: ProjectConfig[];
}

export interface Config {
  roots: string[];
  repo: RepoConfig;
  agents: AgentsConfig;
  daemon: DaemonConfig;
  wrapper: WrapperConfig;
  api: ApiConfig;
  suggestions: SuggestionsConfig;
  testGate: TestGateConfig;
  notifications: NotificationsConfig;
  hookEnhancements: HookEnhancementsConfig;
  conversations: ConversationsConfig;
  projects: ProjectsConfig;
  ui: UiConfig;
  sharing: SharingConfig;
}

const DEFAULT_CONFIG: Config = {
  roots: [],
  repo: {
    refreshFastSeconds: REPO_SCANNER.REFRESH_FAST_SECONDS,
    refreshSlowSeconds: REPO_SCANNER.REFRESH_SLOW_SECONDS,
    gitTimeoutFastMs: REPO_SCANNER.GIT_TIMEOUT_FAST_MS,
    gitTimeoutSlowMs: REPO_SCANNER.GIT_TIMEOUT_SLOW_MS,
    concurrencyGit: REPO_SCANNER.CONCURRENCY_GIT,
    includeUntracked: true, // Include untracked files in dirty count for more intuitive UX
    showClean: false
  },
  agents: {
    refreshSeconds: PROCESS_SCANNER.REFRESH_SECONDS,
    activeCpuThreshold: PROCESS_SCANNER.ACTIVE_CPU_THRESHOLD,
    stalledSeconds: PROCESS_SCANNER.STALLED_SECONDS,
    matchers: [
      { label: "claude", type: "cmd_regex", pattern: "\\bclaude\\b" },
      { label: "codex", type: "cmd_regex", pattern: "\\bcodex\\b" },
      { label: "cursor", type: "cmd_regex", pattern: "\\bcursor\\b" },
      { label: "opencode", type: "cmd_regex", pattern: "\\bopencode\\b" },
      { label: "gemini", type: "cmd_regex", pattern: "\\bgemini\\b" }
    ]
  },
  daemon: {
    host: DAEMON.HOST,
    port: DAEMON.PORT,
    pidFile: DAEMON.PID_FILE,
    logDir: DAEMON.LOG_DIR
  },
  wrapper: {
    socketPath: "~/.agentwatch/wrapper.sock",
    keepDoneSeconds: SESSION.KEEP_DONE_SECONDS
  },
  api: {
    outputLimit: API_DEFAULTS.OUTPUT_LIMIT,
    listLimit: API_DEFAULTS.LIST_LIMIT,
    defaultDays: API_DEFAULTS.DEFAULT_DAYS
  },
  suggestions: {
    minCallsForFailureRate: SUGGESTIONS.MIN_CALLS_FOR_FAILURE_RATE,
    highFailureRate: SUGGESTIONS.HIGH_FAILURE_RATE,
    heavyReadThreshold: SUGGESTIONS.HEAVY_READ_THRESHOLD,
    manyEditsThreshold: SUGGESTIONS.MANY_EDITS_THRESHOLD,
    longSessionMinutes: SUGGESTIONS.LONG_SESSION_MINUTES
  },
  testGate: {
    enabled: false,
    testCommand: "",
    passFile: "~/.agentwatch/test-pass",
    passFileMaxAgeSeconds: SECURITY_GATES.TEST_PASS_MAX_AGE_SECONDS
  },
  notifications: {
    enable: false,
    // Core notifications - useful signals, enabled by default
    hookAwaitingInput: true,
    hookSessionEnd: true,
    hookToolFailure: true,
    hookLongRunning: true,
    hookStop: true, // Claude finished a turn
    longRunningThresholdSeconds: NOTIFICATIONS.LONG_RUNNING_THRESHOLD_SECONDS,
    // Educational/verbose notifications - disabled by default
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
    contextInjection: {
      injectGitContext: false,
      injectProjectContext: false,
      injectRecentErrors: false,
      maxContextLines: 100
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
    inputModification: {
      enabled: false,
      addDryRunFlags: false,
      enforceCommitFormat: false,
      commitMessagePrefix: ""
    },
    autoPermissions: {
      enabled: false,
      autoApproveReadOnly: false
    },
    subagentQuality: {
      enabled: false,
      requireSuccess: false,
      maxTokens: null
    },
    rules: {
      enabled: false,
      rulesFile: "~/.agentwatch/rules.jsonl",
      enabledRuleSets: []
    },
    stopBlocking: {
      enabled: false,
      requireTestsPass: false,
      requireNoLintErrors: false,
      requireCoverageThreshold: null,
      maxBlockAttempts: 3
    },
    promptValidation: {
      enabled: false,
      blockPatterns: [],
      warnPatterns: [],
      minLength: 0,
      maxLength: 100000
    },
    envFileInjection: {
      enabled: false,
      staticVars: {}
    },
    preCompact: {
      enabled: false,
      preservePatterns: [],
      suggestStrategy: false
    },
    costControls: {
      enabled: false,
      sessionBudgetUsd: null,
      dailyBudgetUsd: null,
      monthlyBudgetUsd: null,
      alertThresholds: [50, 80, 95],
      overBudgetAction: "warn"
    },
    notificationHub: {
      enabled: false,
      desktop: {
        enabled: true,
        format: {
          showProjectName: true,
          showSessionId: true,
          showCwd: false,
          showToolDetails: true,
          showStats: false
        }
      },
      webhooks: [],
      routing: []
    },
    llmEvaluation: {
      enabled: false,
      provider: "anthropic",
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      maxTokens: 500,
      timeoutMs: 10000,
      triggerHooks: []
    }
  },
  conversations: {
    transcriptDays: 30,
    includeProcessSnapshots: false
  },
  projects: {
    projects: []
  },
  ui: {
    hiddenTabs: [],
    hiddenPorts: []
  },
  sharing: {
    redactionConfig: {
      redactSecrets: true,
      redactPii: true,
      redactPaths: true,
      enableHighEntropy: true
    }
  }
};

function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

export function loadConfig(configPath?: string): Config {
  const path = configPath ?? "~/.config/agentwatch/config.toml";
  const expandedPath = expandPath(path);

  if (!existsSync(expandedPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(expandedPath, "utf-8");
    const parsed = parseToml(content);
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function parseToml(content: string): Record<string, unknown> {
  // Simple TOML parser for our config format
  // For production, use a proper TOML library
  const result: Record<string, unknown> = {};
  let currentSection: string[] = [];
  let currentArray: Record<string, unknown>[] | null = null;
  let currentArrayKey: string | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Array of tables [[section]]
    const arrayMatch = trimmed.match(/^\[\[([^\]]+)\]\]$/);
    if (arrayMatch) {
      const path = arrayMatch[1]!.split(".");
      currentSection = path.slice(0, -1);
      const arrayKey = path[path.length - 1]!;

      // Navigate to parent
      let obj = result;
      for (const key of currentSection) {
        if (!(key in obj)) obj[key] = {};
        obj = obj[key] as Record<string, unknown>;
      }

      // Create array if needed
      if (!Array.isArray(obj[arrayKey])) {
        obj[arrayKey] = [];
      }
      currentArray = obj[arrayKey] as Record<string, unknown>[];
      currentArray.push({});
      currentArrayKey = arrayKey;
      currentSection = [...currentSection, arrayKey];
      continue;
    }

    // Section header [section]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!.split(".");
      currentArray = null;
      currentArrayKey = null;
      continue;
    }

    // Key = value
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      const value = parseTomlValue(rawValue!);

      if (currentArray && currentArrayKey) {
        // Add to current array item
        const item = currentArray[currentArray.length - 1]!;
        item[key!] = value;
      } else {
        // Add to section
        let obj = result;
        for (const part of currentSection) {
          if (!(part in obj)) obj[part] = {};
          obj = obj[part] as Record<string, unknown>;
        }
        obj[key!] = value;
      }
    }
  }

  return result;
}

function parseTomlValue(raw: string): unknown {
  const trimmed = raw.trim();

  // String
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  // Boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Number
  const num = Number(trimmed);
  if (!isNaN(num)) return num;

  // Array
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1);
    if (!inner.trim()) return [];
    return inner.split(",").map((v) => parseTomlValue(v.trim()));
  }

  return trimmed;
}

function mergeConfig(
  defaults: Config,
  overrides: Record<string, unknown>
): Config {
  const config = { ...defaults };

  // Merge roots
  if (Array.isArray(overrides.roots)) {
    config.roots = overrides.roots.map(String);
  }

  // Merge repo
  if (typeof overrides.repo === "object" && overrides.repo) {
    const repo = overrides.repo as Record<string, unknown>;
    config.repo = {
      ...config.repo,
      ...(typeof repo.refresh_fast_seconds === "number" && {
        refreshFastSeconds: repo.refresh_fast_seconds
      }),
      ...(typeof repo.refresh_slow_seconds === "number" && {
        refreshSlowSeconds: repo.refresh_slow_seconds
      }),
      ...(typeof repo.git_timeout_fast_ms === "number" && {
        gitTimeoutFastMs: repo.git_timeout_fast_ms
      }),
      ...(typeof repo.git_timeout_slow_ms === "number" && {
        gitTimeoutSlowMs: repo.git_timeout_slow_ms
      }),
      ...(typeof repo.concurrency_git === "number" && {
        concurrencyGit: repo.concurrency_git
      }),
      ...(typeof repo.include_untracked === "boolean" && {
        includeUntracked: repo.include_untracked
      }),
      ...(typeof repo.show_clean === "boolean" && {
        showClean: repo.show_clean
      })
    };
  }

  // Merge agents
  if (typeof overrides.agents === "object" && overrides.agents) {
    const agents = overrides.agents as Record<string, unknown>;
    config.agents = {
      ...config.agents,
      ...(typeof agents.refresh_seconds === "number" && {
        refreshSeconds: agents.refresh_seconds
      }),
      ...(typeof agents.active_cpu_threshold === "number" && {
        activeCpuThreshold: agents.active_cpu_threshold
      }),
      ...(typeof agents.stalled_seconds === "number" && {
        stalledSeconds: agents.stalled_seconds
      })
    };
    if (Array.isArray(agents.matchers)) {
      config.agents.matchers = agents.matchers
        .filter(
          (m): m is Record<string, unknown> =>
            typeof m === "object" && m !== null
        )
        .map((m) => ({
          label: String(m.label ?? ""),
          type: (m.type as "cmd_regex" | "exe_path") ?? "cmd_regex",
          pattern: String(m.pattern ?? "")
        }));
    }
  }

  // Merge api
  if (typeof overrides.api === "object" && overrides.api) {
    const api = overrides.api as Record<string, unknown>;
    config.api = {
      ...config.api,
      ...(typeof api.output_limit === "number" && {
        outputLimit: api.output_limit
      }),
      ...(typeof api.list_limit === "number" && {
        listLimit: api.list_limit
      }),
      ...(typeof api.default_days === "number" && {
        defaultDays: api.default_days
      })
    };
  }

  // Merge suggestions
  if (typeof overrides.suggestions === "object" && overrides.suggestions) {
    const s = overrides.suggestions as Record<string, unknown>;
    config.suggestions = {
      ...config.suggestions,
      ...(typeof s.min_calls_for_failure_rate === "number" && {
        minCallsForFailureRate: s.min_calls_for_failure_rate
      }),
      ...(typeof s.high_failure_rate === "number" && {
        highFailureRate: s.high_failure_rate
      }),
      ...(typeof s.heavy_read_threshold === "number" && {
        heavyReadThreshold: s.heavy_read_threshold
      }),
      ...(typeof s.many_edits_threshold === "number" && {
        manyEditsThreshold: s.many_edits_threshold
      }),
      ...(typeof s.long_session_minutes === "number" && {
        longSessionMinutes: s.long_session_minutes
      })
    };
  }

  // Merge daemon
  if (typeof overrides.daemon === "object" && overrides.daemon) {
    const daemon = overrides.daemon as Record<string, unknown>;
    config.daemon = {
      ...config.daemon,
      ...(typeof daemon.host === "string" && { host: daemon.host }),
      ...(typeof daemon.port === "number" && { port: daemon.port }),
      ...(typeof daemon.pid_file === "string" && { pidFile: daemon.pid_file }),
      ...(typeof daemon.log_dir === "string" && { logDir: daemon.log_dir })
    };
  }

  // Merge test gate (supports both new test_gate and legacy security_gates.test_gate)
  if (typeof overrides.test_gate === "object" && overrides.test_gate) {
    const tg = overrides.test_gate as Record<string, unknown>;
    config.testGate = {
      ...config.testGate,
      ...(typeof tg.enabled === "boolean" && { enabled: tg.enabled }),
      ...(typeof tg.test_command === "string" && {
        testCommand: tg.test_command
      }),
      ...(typeof tg.pass_file === "string" && { passFile: tg.pass_file }),
      ...(typeof tg.pass_file_max_age_seconds === "number" && {
        passFileMaxAgeSeconds: tg.pass_file_max_age_seconds
      })
    };
  }
  // Legacy: support security_gates.test_gate for backwards compatibility
  if (
    typeof overrides.security_gates === "object" &&
    overrides.security_gates
  ) {
    const sg = overrides.security_gates as Record<string, unknown>;
    if (typeof sg.test_gate === "object" && sg.test_gate) {
      const tg = sg.test_gate as Record<string, unknown>;
      config.testGate = {
        ...config.testGate,
        ...(typeof tg.enabled === "boolean" && { enabled: tg.enabled }),
        ...(typeof tg.test_command === "string" && {
          testCommand: tg.test_command
        }),
        ...(typeof tg.pass_file === "string" && { passFile: tg.pass_file }),
        ...(typeof tg.pass_file_max_age_seconds === "number" && {
          passFileMaxAgeSeconds: tg.pass_file_max_age_seconds
        })
      };
    }
  }

  // Merge notifications
  if (typeof overrides.notifications === "object" && overrides.notifications) {
    const n = overrides.notifications as Record<string, unknown>;
    config.notifications = {
      ...config.notifications,
      ...(typeof n.enable === "boolean" && { enable: n.enable }),
      ...(typeof n.hook_awaiting_input === "boolean" && {
        hookAwaitingInput: n.hook_awaiting_input
      }),
      ...(typeof n.hook_session_end === "boolean" && {
        hookSessionEnd: n.hook_session_end
      }),
      ...(typeof n.hook_tool_failure === "boolean" && {
        hookToolFailure: n.hook_tool_failure
      }),
      ...(typeof n.hook_long_running === "boolean" && {
        hookLongRunning: n.hook_long_running
      }),
      ...(typeof n.long_running_threshold_seconds === "number" && {
        longRunningThresholdSeconds: n.long_running_threshold_seconds
      }),
      // Educational hook notifications
      ...(typeof n.hook_session_start === "boolean" && {
        hookSessionStart: n.hook_session_start
      }),
      ...(typeof n.hook_pre_tool_use === "boolean" && {
        hookPreToolUse: n.hook_pre_tool_use
      }),
      ...(typeof n.hook_post_tool_use === "boolean" && {
        hookPostToolUse: n.hook_post_tool_use
      }),
      ...(typeof n.hook_notification === "boolean" && {
        hookNotification: n.hook_notification
      }),
      ...(typeof n.hook_permission_request === "boolean" && {
        hookPermissionRequest: n.hook_permission_request
      }),
      ...(typeof n.hook_user_prompt_submit === "boolean" && {
        hookUserPromptSubmit: n.hook_user_prompt_submit
      }),
      ...(typeof n.hook_stop === "boolean" && {
        hookStop: n.hook_stop
      }),
      ...(typeof n.hook_subagent_stop === "boolean" && {
        hookSubagentStop: n.hook_subagent_stop
      }),
      ...(typeof n.hook_pre_compact === "boolean" && {
        hookPreCompact: n.hook_pre_compact
      })
    };
  }

  // Merge hook enhancements
  if (
    typeof overrides.hook_enhancements === "object" &&
    overrides.hook_enhancements
  ) {
    const he = overrides.hook_enhancements as Record<string, unknown>;

    // Context injection
    if (typeof he.context_injection === "object" && he.context_injection) {
      const ci = he.context_injection as Record<string, unknown>;
      config.hookEnhancements.contextInjection = {
        ...config.hookEnhancements.contextInjection,
        ...(typeof ci.inject_git_context === "boolean" && {
          injectGitContext: ci.inject_git_context
        }),
        ...(typeof ci.inject_project_context === "boolean" && {
          injectProjectContext: ci.inject_project_context
        }),
        ...(typeof ci.inject_recent_errors === "boolean" && {
          injectRecentErrors: ci.inject_recent_errors
        }),
        ...(typeof ci.max_context_lines === "number" && {
          maxContextLines: ci.max_context_lines
        })
      };
    }

    // Token tracking
    if (typeof he.token_tracking === "object" && he.token_tracking) {
      const tt = he.token_tracking as Record<string, unknown>;
      config.hookEnhancements.tokenTracking = {
        ...config.hookEnhancements.tokenTracking,
        ...(typeof tt.enabled === "boolean" && { enabled: tt.enabled }),
        ...(typeof tt.cost_warning_threshold_usd === "number" && {
          costWarningThresholdUsd: tt.cost_warning_threshold_usd
        })
      };
    }

    // Auto-continue
    if (typeof he.auto_continue === "object" && he.auto_continue) {
      const ac = he.auto_continue as Record<string, unknown>;
      config.hookEnhancements.autoContinue = {
        ...config.hookEnhancements.autoContinue,
        ...(typeof ac.enabled === "boolean" && { enabled: ac.enabled }),
        ...(typeof ac.on_failing_tests === "boolean" && {
          onFailingTests: ac.on_failing_tests
        }),
        ...(typeof ac.on_lint_errors === "boolean" && {
          onLintErrors: ac.on_lint_errors
        }),
        ...(typeof ac.max_attempts === "number" && {
          maxAttempts: ac.max_attempts
        })
      };
    }

    // Input modification
    if (typeof he.input_modification === "object" && he.input_modification) {
      const im = he.input_modification as Record<string, unknown>;
      config.hookEnhancements.inputModification = {
        ...config.hookEnhancements.inputModification,
        ...(typeof im.enabled === "boolean" && { enabled: im.enabled }),
        ...(typeof im.add_dry_run_flags === "boolean" && {
          addDryRunFlags: im.add_dry_run_flags
        }),
        ...(typeof im.enforce_commit_format === "boolean" && {
          enforceCommitFormat: im.enforce_commit_format
        }),
        ...(typeof im.commit_message_prefix === "string" && {
          commitMessagePrefix: im.commit_message_prefix
        })
      };
    }

    // Auto permissions
    if (typeof he.auto_permissions === "object" && he.auto_permissions) {
      const ap = he.auto_permissions as Record<string, unknown>;
      config.hookEnhancements.autoPermissions = {
        ...config.hookEnhancements.autoPermissions,
        ...(typeof ap.enabled === "boolean" && { enabled: ap.enabled }),
        ...(typeof ap.auto_approve_read_only === "boolean" && {
          autoApproveReadOnly: ap.auto_approve_read_only
        })
      };
    }

    // Subagent quality
    if (typeof he.subagent_quality === "object" && he.subagent_quality) {
      const sq = he.subagent_quality as Record<string, unknown>;
      config.hookEnhancements.subagentQuality = {
        ...config.hookEnhancements.subagentQuality,
        ...(typeof sq.enabled === "boolean" && { enabled: sq.enabled }),
        ...(typeof sq.require_success === "boolean" && {
          requireSuccess: sq.require_success
        }),
        ...(typeof sq.max_tokens === "number" && {
          maxTokens: sq.max_tokens
        })
      };
    }

    // Rules
    if (typeof he.rules === "object" && he.rules) {
      const r = he.rules as Record<string, unknown>;
      config.hookEnhancements.rules = {
        ...config.hookEnhancements.rules,
        ...(typeof r.enabled === "boolean" && { enabled: r.enabled }),
        ...(typeof r.rules_file === "string" && { rulesFile: r.rules_file }),
        ...(Array.isArray(r.enabled_rule_sets) && {
          enabledRuleSets: r.enabled_rule_sets.map(String)
        })
      };
    }

    // Stop blocking
    if (typeof he.stop_blocking === "object" && he.stop_blocking) {
      const sb = he.stop_blocking as Record<string, unknown>;
      config.hookEnhancements.stopBlocking = {
        ...config.hookEnhancements.stopBlocking,
        ...(typeof sb.enabled === "boolean" && { enabled: sb.enabled }),
        ...(typeof sb.require_tests_pass === "boolean" && {
          requireTestsPass: sb.require_tests_pass
        }),
        ...(typeof sb.require_no_lint_errors === "boolean" && {
          requireNoLintErrors: sb.require_no_lint_errors
        }),
        ...(typeof sb.require_coverage_threshold === "number" && {
          requireCoverageThreshold: sb.require_coverage_threshold
        }),
        ...(typeof sb.max_block_attempts === "number" && {
          maxBlockAttempts: sb.max_block_attempts
        })
      };
    }

    // Prompt validation
    if (typeof he.prompt_validation === "object" && he.prompt_validation) {
      const pv = he.prompt_validation as Record<string, unknown>;
      config.hookEnhancements.promptValidation = {
        ...config.hookEnhancements.promptValidation,
        ...(typeof pv.enabled === "boolean" && { enabled: pv.enabled }),
        ...(typeof pv.min_length === "number" && { minLength: pv.min_length }),
        ...(typeof pv.max_length === "number" && { maxLength: pv.max_length }),
        ...(Array.isArray(pv.block_patterns) && {
          blockPatterns: pv.block_patterns.map((p: unknown) =>
            parsePatternRule(p)
          )
        }),
        ...(Array.isArray(pv.warn_patterns) && {
          warnPatterns: pv.warn_patterns.map((p: unknown) =>
            parsePatternRule(p)
          )
        })
      };
    }

    // Env file injection
    if (typeof he.env_file_injection === "object" && he.env_file_injection) {
      const ef = he.env_file_injection as Record<string, unknown>;
      config.hookEnhancements.envFileInjection = {
        ...config.hookEnhancements.envFileInjection,
        ...(typeof ef.enabled === "boolean" && { enabled: ef.enabled }),
        ...(typeof ef.static_vars === "object" &&
          ef.static_vars && {
            staticVars: ef.static_vars as Record<string, string>
          })
      };
    }

    // PreCompact
    if (typeof he.pre_compact === "object" && he.pre_compact) {
      const pc = he.pre_compact as Record<string, unknown>;
      config.hookEnhancements.preCompact = {
        ...config.hookEnhancements.preCompact,
        ...(typeof pc.enabled === "boolean" && { enabled: pc.enabled }),
        ...(Array.isArray(pc.preserve_patterns) && {
          preservePatterns: pc.preserve_patterns.map(String)
        }),
        ...(typeof pc.suggest_strategy === "boolean" && {
          suggestStrategy: pc.suggest_strategy
        })
      };
    }

    // Cost controls
    if (typeof he.cost_controls === "object" && he.cost_controls) {
      const cc = he.cost_controls as Record<string, unknown>;
      config.hookEnhancements.costControls = {
        ...config.hookEnhancements.costControls,
        ...(typeof cc.enabled === "boolean" && { enabled: cc.enabled }),
        ...(typeof cc.session_budget_usd === "number" && {
          sessionBudgetUsd: cc.session_budget_usd
        }),
        ...(typeof cc.daily_budget_usd === "number" && {
          dailyBudgetUsd: cc.daily_budget_usd
        }),
        ...(typeof cc.monthly_budget_usd === "number" && {
          monthlyBudgetUsd: cc.monthly_budget_usd
        }),
        ...(Array.isArray(cc.alert_thresholds) && {
          alertThresholds: cc.alert_thresholds.map(Number)
        }),
        ...(typeof cc.over_budget_action === "string" && {
          overBudgetAction: cc.over_budget_action as "warn" | "block" | "notify"
        })
      };
    }

    // Notification hub
    if (typeof he.notification_hub === "object" && he.notification_hub) {
      const nh = he.notification_hub as Record<string, unknown>;
      config.hookEnhancements.notificationHub = {
        ...config.hookEnhancements.notificationHub,
        ...(typeof nh.enabled === "boolean" && { enabled: nh.enabled })
      };
      if (typeof nh.desktop === "object" && nh.desktop) {
        const d = nh.desktop as Record<string, unknown>;
        config.hookEnhancements.notificationHub.desktop = {
          ...config.hookEnhancements.notificationHub.desktop,
          enabled: typeof d.enabled === "boolean" ? d.enabled : true
        };
        // Parse format options
        if (typeof d.format === "object" && d.format) {
          const f = d.format as Record<string, unknown>;
          config.hookEnhancements.notificationHub.desktop.format = {
            ...config.hookEnhancements.notificationHub.desktop.format,
            ...(typeof f.show_project_name === "boolean" && {
              showProjectName: f.show_project_name
            }),
            ...(typeof f.show_session_id === "boolean" && {
              showSessionId: f.show_session_id
            }),
            ...(typeof f.show_cwd === "boolean" && { showCwd: f.show_cwd }),
            ...(typeof f.show_tool_details === "boolean" && {
              showToolDetails: f.show_tool_details
            }),
            ...(typeof f.show_stats === "boolean" && {
              showStats: f.show_stats
            })
          };
        }
      }
      if (Array.isArray(nh.webhooks)) {
        config.hookEnhancements.notificationHub.webhooks = nh.webhooks.map(
          (w: unknown) => parseWebhookConfig(w)
        );
      }
    }

    // LLM evaluation
    if (typeof he.llm_evaluation === "object" && he.llm_evaluation) {
      const le = he.llm_evaluation as Record<string, unknown>;
      config.hookEnhancements.llmEvaluation = {
        ...config.hookEnhancements.llmEvaluation,
        ...(typeof le.enabled === "boolean" && { enabled: le.enabled }),
        ...(typeof le.provider === "string" && {
          provider: le.provider as "anthropic" | "openai" | "ollama"
        }),
        ...(typeof le.model === "string" && { model: le.model }),
        ...(typeof le.api_key_env_var === "string" && {
          apiKeyEnvVar: le.api_key_env_var
        }),
        ...(typeof le.max_tokens === "number" && { maxTokens: le.max_tokens }),
        ...(typeof le.timeout_ms === "number" && { timeoutMs: le.timeout_ms }),
        ...(Array.isArray(le.trigger_hooks) && {
          triggerHooks: le.trigger_hooks.map(String)
        })
      };
    }
  }

  // Merge conversations
  if (typeof overrides.conversations === "object" && overrides.conversations) {
    const c = overrides.conversations as Record<string, unknown>;
    config.conversations = {
      ...config.conversations,
      ...(typeof c.transcript_days === "number" && {
        transcriptDays: c.transcript_days
      }),
      ...(typeof c.include_process_snapshots === "boolean" && {
        includeProcessSnapshots: c.include_process_snapshots
      })
    };
  }

  // Merge projects
  if (typeof overrides.projects === "object" && overrides.projects) {
    const proj = overrides.projects as Record<string, unknown>;
    if (Array.isArray(proj.projects)) {
      config.projects.projects = proj.projects
        .filter(
          (p): p is Record<string, unknown> =>
            typeof p === "object" && p !== null
        )
        .map((p) => ({
          id: String(p.id ?? ""),
          name: String(p.name ?? ""),
          paths: Array.isArray(p.paths) ? p.paths.map(String) : [],
          description:
            typeof p.description === "string" ? p.description : undefined
        }));
    }
  }

  // Merge ui
  if (typeof overrides.ui === "object" && overrides.ui) {
    const u = overrides.ui as Record<string, unknown>;
    config.ui = {
      ...config.ui,
      ...(Array.isArray(u.hidden_tabs) && {
        hiddenTabs: u.hidden_tabs.map(String)
      }),
      ...(Array.isArray(u.hidden_ports) && {
        hiddenPorts: u.hidden_ports.map(Number)
      })
    };
  }

  // Merge sharing
  if (typeof overrides.sharing === "object" && overrides.sharing) {
    const s = overrides.sharing as Record<string, unknown>;
    if (typeof s.redaction_config === "object" && s.redaction_config) {
      const rc = s.redaction_config as Record<string, unknown>;
      config.sharing.redactionConfig = {
        ...config.sharing.redactionConfig,
        ...(typeof rc.redact_secrets === "boolean" && {
          redactSecrets: rc.redact_secrets
        }),
        ...(typeof rc.redact_pii === "boolean" && {
          redactPii: rc.redact_pii
        }),
        ...(typeof rc.redact_paths === "boolean" && {
          redactPaths: rc.redact_paths
        }),
        ...(typeof rc.enable_high_entropy === "boolean" && {
          enableHighEntropy: rc.enable_high_entropy
        })
      };
    }
  }

  return config;
}

function parsePatternRule(p: unknown): PatternRule {
  if (typeof p === "string") {
    return { pattern: p, isRegex: false, caseSensitive: true, message: "" };
  }
  if (typeof p === "object" && p !== null) {
    const obj = p as Record<string, unknown>;
    return {
      pattern: String(obj.pattern ?? ""),
      isRegex: Boolean(obj.is_regex ?? obj.isRegex ?? false),
      caseSensitive: Boolean(obj.case_sensitive ?? obj.caseSensitive ?? true),
      message: String(obj.message ?? "")
    };
  }
  return { pattern: "", isRegex: false, caseSensitive: true, message: "" };
}

function parseWebhookConfig(w: unknown): WebhookConfig {
  if (typeof w === "object" && w !== null) {
    const obj = w as Record<string, unknown>;
    return {
      id: String(obj.id ?? obj.name ?? ""),
      name: String(obj.name ?? ""),
      url: String(obj.url ?? ""),
      method: (obj.method as "POST" | "PUT") ?? "POST",
      headers:
        typeof obj.headers === "object" && obj.headers
          ? (obj.headers as Record<string, string>)
          : {},
      enabled: Boolean(obj.enabled ?? true)
    };
  }
  return {
    id: "",
    name: "",
    url: "",
    method: "POST",
    headers: {},
    enabled: false
  };
}

export function saveConfig(config: Config, configPath?: string): void {
  const path = configPath ?? "~/.config/agentwatch/config.toml";
  const expandedPath = expandPath(path);

  const dir = dirname(expandedPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Log audit event before saving
  logAuditEvent(
    "config",
    "update",
    "config.toml",
    "Configuration saved",
    {
      path: expandedPath,
      roots: config.roots,
      daemonPort: config.daemon.port,
      transcriptDays: config.conversations.transcriptDays,
      projectCount: config.projects.projects.length
    },
    "api"
  );

  // Generate TOML
  const lines: string[] = [];

  lines.push(`roots = [${config.roots.map((r) => `"${r}"`).join(", ")}]`);
  lines.push("");

  lines.push("[repo]");
  lines.push(`refresh_fast_seconds = ${config.repo.refreshFastSeconds}`);
  lines.push(`refresh_slow_seconds = ${config.repo.refreshSlowSeconds}`);
  lines.push(`include_untracked = ${config.repo.includeUntracked}`);
  lines.push(`show_clean = ${config.repo.showClean}`);
  lines.push("");

  lines.push("[daemon]");
  lines.push(`host = "${config.daemon.host}"`);
  lines.push(`port = ${config.daemon.port}`);
  lines.push(`pid_file = "${config.daemon.pidFile}"`);
  lines.push(`log_dir = "${config.daemon.logDir}"`);
  lines.push("");

  lines.push("[test_gate]");
  lines.push(`enabled = ${config.testGate.enabled}`);
  if (config.testGate.testCommand) {
    lines.push(`test_command = "${config.testGate.testCommand}"`);
  }
  lines.push(`pass_file = "${config.testGate.passFile}"`);
  lines.push(
    `pass_file_max_age_seconds = ${config.testGate.passFileMaxAgeSeconds}`
  );
  lines.push("");

  lines.push("[notifications]");
  lines.push(`enable = ${config.notifications.enable}`);
  lines.push(`hook_awaiting_input = ${config.notifications.hookAwaitingInput}`);
  lines.push(`hook_session_end = ${config.notifications.hookSessionEnd}`);
  lines.push(`hook_tool_failure = ${config.notifications.hookToolFailure}`);
  lines.push(`hook_long_running = ${config.notifications.hookLongRunning}`);
  lines.push(
    `long_running_threshold_seconds = ${config.notifications.longRunningThresholdSeconds}`
  );
  lines.push(`hook_session_start = ${config.notifications.hookSessionStart}`);
  lines.push(`hook_pre_tool_use = ${config.notifications.hookPreToolUse}`);
  lines.push(`hook_post_tool_use = ${config.notifications.hookPostToolUse}`);
  lines.push(`hook_notification = ${config.notifications.hookNotification}`);
  lines.push(
    `hook_permission_request = ${config.notifications.hookPermissionRequest}`
  );
  lines.push(
    `hook_user_prompt_submit = ${config.notifications.hookUserPromptSubmit}`
  );
  lines.push(`hook_stop = ${config.notifications.hookStop}`);
  lines.push(`hook_subagent_stop = ${config.notifications.hookSubagentStop}`);
  lines.push(`hook_pre_compact = ${config.notifications.hookPreCompact}`);
  lines.push("");

  // Hook enhancements - notification hub
  lines.push("[hook_enhancements.notification_hub]");
  lines.push(`enabled = ${config.hookEnhancements.notificationHub.enabled}`);
  lines.push("");

  lines.push("[hook_enhancements.notification_hub.desktop]");
  lines.push(
    `enabled = ${config.hookEnhancements.notificationHub.desktop.enabled}`
  );
  lines.push("");

  lines.push("[hook_enhancements.notification_hub.desktop.format]");
  lines.push(
    `show_project_name = ${config.hookEnhancements.notificationHub.desktop.format.showProjectName}`
  );
  lines.push(
    `show_session_id = ${config.hookEnhancements.notificationHub.desktop.format.showSessionId}`
  );
  lines.push(
    `show_cwd = ${config.hookEnhancements.notificationHub.desktop.format.showCwd}`
  );
  lines.push(
    `show_tool_details = ${config.hookEnhancements.notificationHub.desktop.format.showToolDetails}`
  );
  lines.push(
    `show_stats = ${config.hookEnhancements.notificationHub.desktop.format.showStats}`
  );
  lines.push("");

  // Conversations
  lines.push("[conversations]");
  lines.push(`transcript_days = ${config.conversations.transcriptDays}`);
  lines.push(
    `include_process_snapshots = ${config.conversations.includeProcessSnapshots}`
  );

  // Projects (array of tables)
  for (const project of config.projects.projects) {
    lines.push("");
    lines.push("[[projects.projects]]");
    lines.push(`id = "${project.id}"`);
    lines.push(`name = "${project.name}"`);
    lines.push(`paths = [${project.paths.map((p) => `"${p}"`).join(", ")}]`);
    if (project.description) {
      lines.push(`description = "${project.description}"`);
    }
  }

  // UI preferences
  lines.push("");
  lines.push("[ui]");
  lines.push(
    `hidden_tabs = [${config.ui.hiddenTabs.map((t) => `"${t}"`).join(", ")}]`
  );
  lines.push(`hidden_ports = [${config.ui.hiddenPorts.join(", ")}]`);

  // Sharing preferences
  lines.push("");
  lines.push("[sharing.redaction_config]");
  lines.push(
    `redact_secrets = ${config.sharing.redactionConfig.redactSecrets}`
  );
  lines.push(`redact_pii = ${config.sharing.redactionConfig.redactPii}`);
  lines.push(`redact_paths = ${config.sharing.redactionConfig.redactPaths}`);
  lines.push(
    `enable_high_entropy = ${config.sharing.redactionConfig.enableHighEntropy}`
  );

  writeFileSync(expandedPath, lines.join("\n") + "\n");
}
