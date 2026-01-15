/**
 * Analyzer configuration.
 *
 * Handles settings for analysis and data browsing:
 * - Transcript discovery and filtering
 * - Enrichment computation
 * - Project definitions
 * - Sharing/export preferences
 * - UI preferences
 *
 * Reads from:
 * 1. ~/.config/agentwatch/analyzer.toml (preferred)
 * 2. ~/.config/agentwatch/config.toml (fallback for shared/legacy)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

// =========== Projects ===========

/**
 * Project configuration for grouping sessions by repository/workspace.
 */
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

// =========== Conversations/Transcripts ===========

export interface ConversationsConfig {
  /** Number of days of transcripts to show (1, 7, 14, 30, 90) */
  transcriptDays: number;
  /** Include process snapshots to show activity even without hooks/transcripts */
  includeProcessSnapshots: boolean;
}

export type TranscriptIndexMode = "auto" | "manual";

export interface TranscriptIndexConfig {
  /** Indexing mode for local transcripts */
  indexingMode: TranscriptIndexMode;
}

// =========== UI Preferences ===========

export interface UiConfig {
  /** Hidden tabs in the main UI */
  hiddenTabs: string[];
  /** Hidden port numbers in the ports panel */
  hiddenPorts: number[];
}

// =========== Sharing/Export ===========

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

export interface SharingConfig {
  /** Redaction settings for exports */
  redactionConfig: RedactionConfig;
  /** Default research profile for exports */
  defaultProfile: string;
  /** HuggingFace settings */
  huggingface: {
    /** Default repository */
    defaultRepo: string;
    /** Create PR instead of direct commit */
    usePullRequest: boolean;
  };
}

// =========== Main Config ===========

/**
 * Analyzer-specific configuration.
 */
export interface AnalyzerConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to */
  host: string;
  /** Watcher API URL */
  watcherUrl: string;
  /** Configured projects */
  projects: ProjectConfig[];
  /** Data directory */
  dataDir: string;
  /** Conversations/transcript settings */
  conversations: ConversationsConfig;
  /** Transcript indexing settings */
  transcripts: TranscriptIndexConfig;
  /** UI preferences */
  ui: UiConfig;
  /** Sharing/export preferences */
  sharing: SharingConfig;
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  port: 8421,
  host: "localhost",
  watcherUrl: "http://localhost:8420",
  projects: [],
  dataDir: join(homedir(), ".agentwatch"),
  conversations: {
    transcriptDays: 30,
    includeProcessSnapshots: false
  },
  transcripts: {
    indexingMode: "auto"
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
    },
    defaultProfile: "tool-usage",
    huggingface: {
      defaultRepo: "",
      usePullRequest: true
    }
  }
};

/**
 * Load analyzer configuration.
 *
 * Priority:
 * 1. ~/.config/agentwatch/analyzer.toml
 * 2. ~/.config/agentwatch/config.toml (legacy/shared)
 */
export function loadAnalyzerConfig(): AnalyzerConfig {
  const analyzerPath = join(
    homedir(),
    ".config",
    "agentwatch",
    "analyzer.toml"
  );
  const sharedPath = join(homedir(), ".config", "agentwatch", "config.toml");

  // Try analyzer-specific config first
  if (existsSync(analyzerPath)) {
    try {
      const content = readFileSync(analyzerPath, "utf-8");
      return parseAnalyzerConfig(content);
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
 * Parse analyzer-specific TOML config.
 */
function parseAnalyzerConfig(content: string): AnalyzerConfig {
  const config = structuredClone(DEFAULT_CONFIG);

  // Parse [analyzer] section
  const port = parseNumberField(content, "analyzer", "port");
  if (port !== null) config.port = port;

  const host = parseStringField(content, "analyzer", "host");
  if (host) config.host = host;

  const watcherUrl = parseStringField(content, "analyzer", "watcher_url");
  if (watcherUrl) config.watcherUrl = watcherUrl;

  const dataDir = parseStringField(content, "analyzer", "data_dir");
  if (dataDir) config.dataDir = dataDir;

  // Parse [conversations] section
  const transcriptDays = parseNumberField(
    content,
    "conversations",
    "transcript_days"
  );
  if (transcriptDays !== null)
    config.conversations.transcriptDays = transcriptDays;

  const includeProcessSnapshots = parseBoolField(
    content,
    "conversations",
    "include_process_snapshots"
  );
  if (includeProcessSnapshots !== null)
    config.conversations.includeProcessSnapshots = includeProcessSnapshots;

  // Parse shared [transcripts] section
  const indexingMode = parseStringField(
    content,
    "transcripts",
    "indexing_mode"
  );
  if (indexingMode === "auto" || indexingMode === "manual") {
    config.transcripts.indexingMode = indexingMode;
  }

  // Parse [ui] section
  const hiddenTabs = parseArrayField(content, "ui", "hidden_tabs");
  if (hiddenTabs) config.ui.hiddenTabs = hiddenTabs;

  const hiddenPorts = parseArrayField(content, "ui", "hidden_ports");
  if (hiddenPorts) config.ui.hiddenPorts = hiddenPorts.map(Number);

  // Parse [sharing.redaction_config] section
  const redactSecrets = parseBoolField(
    content,
    "sharing.redaction_config",
    "redact_secrets"
  );
  if (redactSecrets !== null)
    config.sharing.redactionConfig.redactSecrets = redactSecrets;

  const redactPii = parseBoolField(
    content,
    "sharing.redaction_config",
    "redact_pii"
  );
  if (redactPii !== null) config.sharing.redactionConfig.redactPii = redactPii;

  const redactPaths = parseBoolField(
    content,
    "sharing.redaction_config",
    "redact_paths"
  );
  if (redactPaths !== null)
    config.sharing.redactionConfig.redactPaths = redactPaths;

  // Parse [sharing] section
  const defaultProfile = parseStringField(
    content,
    "sharing",
    "default_profile"
  );
  if (defaultProfile) config.sharing.defaultProfile = defaultProfile;

  // Parse projects
  config.projects = parseProjects(content);

  return config;
}

/**
 * Parse shared config.toml format (legacy daemon format).
 */
function parseSharedConfig(content: string): AnalyzerConfig {
  const config = structuredClone(DEFAULT_CONFIG);

  // Parse [conversations] section
  const transcriptDays = parseNumberField(
    content,
    "conversations",
    "transcript_days"
  );
  if (transcriptDays !== null)
    config.conversations.transcriptDays = transcriptDays;

  const includeProcessSnapshots = parseBoolField(
    content,
    "conversations",
    "include_process_snapshots"
  );
  if (includeProcessSnapshots !== null)
    config.conversations.includeProcessSnapshots = includeProcessSnapshots;

  // Parse [ui] section
  const hiddenTabs = parseArrayField(content, "ui", "hidden_tabs");
  if (hiddenTabs) config.ui.hiddenTabs = hiddenTabs;

  // Parse [sharing.redaction_config] section
  const redactSecrets = parseBoolField(
    content,
    "sharing.redaction_config",
    "redact_secrets"
  );
  if (redactSecrets !== null)
    config.sharing.redactionConfig.redactSecrets = redactSecrets;

  // Parse projects from [[projects.projects]]
  config.projects = parseProjects(content);

  return config;
}

/**
 * Parse [[projects]] array from TOML.
 */
function parseProjects(content: string): ProjectConfig[] {
  const projects: ProjectConfig[] = [];

  // Match [[projects]] or [[projects.projects]] sections
  const projectsMatch = content.match(
    /\[\[projects(?:\.projects)?\]\][\s\S]*?(?=\[\[|\[(?!\[)|$)/g
  );

  if (projectsMatch) {
    for (const section of projectsMatch) {
      const idMatch = section.match(/id\s*=\s*["']([^"']+)["']/);
      const nameMatch = section.match(/name\s*=\s*["']([^"']+)["']/);
      const pathsMatch = section.match(/paths\s*=\s*\[([\s\S]*?)\]/);
      const descMatch = section.match(/description\s*=\s*["']([^"']+)["']/);

      const id = idMatch?.[1] ?? "";
      const name = nameMatch?.[1] ?? id;
      const paths =
        pathsMatch?.[1]
          ?.split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean) ?? [];

      if (id && paths.length > 0) {
        projects.push({
          id,
          name,
          paths,
          description: descMatch?.[1]
        });
      }
    }
  }

  return projects;
}

// =========== TOML Parsing Helpers ===========

function parseNumberField(
  content: string,
  section: string,
  field: string
): number | null {
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

function parseArrayField(
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
    `${sectionPattern}[\\s\\S]*?${field}\\s*=\\s*\\[([^\\]]*?)\\]`
  );
  const match = content.match(regex);
  if (!match?.[1]) return null;

  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

// =========== Config Saving ===========

/**
 * Save analyzer configuration to analyzer.toml.
 */
export function saveAnalyzerConfig(config: AnalyzerConfig): void {
  const configPath = join(homedir(), ".config", "agentwatch", "analyzer.toml");
  const dir = dirname(configPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = [
    "# Analyzer Configuration",
    "# Settings for transcript analysis, enrichment, and data sharing",
    "",
    "[analyzer]",
    `port = ${config.port}`,
    `host = "${config.host}"`,
    `watcher_url = "${config.watcherUrl}"`,
    `data_dir = "${config.dataDir}"`,
    "",
    "[conversations]",
    `transcript_days = ${config.conversations.transcriptDays}`,
    `include_process_snapshots = ${config.conversations.includeProcessSnapshots}`,
    "",
    "[transcripts]",
    `indexing_mode = "${config.transcripts.indexingMode}"`,
    "",
    "[ui]",
    `hidden_tabs = [${config.ui.hiddenTabs.map((t) => `"${t}"`).join(", ")}]`,
    `hidden_ports = [${config.ui.hiddenPorts.join(", ")}]`,
    "",
    "[sharing]",
    `default_profile = "${config.sharing.defaultProfile}"`,
    "",
    "[sharing.redaction_config]",
    `redact_secrets = ${config.sharing.redactionConfig.redactSecrets}`,
    `redact_pii = ${config.sharing.redactionConfig.redactPii}`,
    `redact_paths = ${config.sharing.redactionConfig.redactPaths}`,
    `enable_high_entropy = ${config.sharing.redactionConfig.enableHighEntropy}`,
    "",
    "[sharing.huggingface]",
    `default_repo = "${config.sharing.huggingface.defaultRepo}"`,
    `use_pull_request = ${config.sharing.huggingface.usePullRequest}`
  ];

  // Add projects
  for (const project of config.projects) {
    lines.push("");
    lines.push("[[projects]]");
    lines.push(`id = "${project.id}"`);
    lines.push(`name = "${project.name}"`);
    lines.push(`paths = [${project.paths.map((p) => `"${p}"`).join(", ")}]`);
    if (project.description) {
      lines.push(`description = "${project.description}"`);
    }
  }

  writeFileSync(configPath, lines.join("\n") + "\n");
}

/**
 * Get config file path for display.
 */
export function getConfigPath(): string {
  const analyzerPath = join(
    homedir(),
    ".config",
    "agentwatch",
    "analyzer.toml"
  );
  const sharedPath = join(homedir(), ".config", "agentwatch", "config.toml");

  if (existsSync(analyzerPath)) {
    return analyzerPath;
  }
  return sharedPath;
}

/**
 * Add a project to the config.
 */
export function addProject(project: ProjectConfig): void {
  const config = loadAnalyzerConfig();
  config.projects.push(project);
  saveAnalyzerConfig(config);
}

/**
 * Remove a project from the config.
 */
export function removeProject(projectId: string): boolean {
  const config = loadAnalyzerConfig();
  const index = config.projects.findIndex((p) => p.id === projectId);
  if (index === -1) return false;

  config.projects.splice(index, 1);
  saveAnalyzerConfig(config);
  return true;
}

/**
 * Update a project in the config.
 */
export function updateProject(
  projectId: string,
  updates: Partial<ProjectConfig>
): boolean {
  const config = loadAnalyzerConfig();
  const project = config.projects.find((p) => p.id === projectId);
  if (!project) return false;

  Object.assign(project, updates);
  saveAnalyzerConfig(config);
  return true;
}
