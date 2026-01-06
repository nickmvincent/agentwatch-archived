export interface RepoStatus {
  repo_id: string;
  path: string;
  name: string;
  branch: string;
  dirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  conflict: boolean;
  rebase: boolean;
  merge: boolean;
  cherry_pick: boolean;
  revert: boolean;
  ahead: number;
  behind: number;
  upstream_name: string | null;
  last_error: string | null;
  timed_out: boolean;
  last_scan_time: number;
  last_change_time: number;
}

export interface HeuristicState {
  state: string;
  cpu_pct_recent: number;
  quiet_seconds: number;
}

export interface WrapperState {
  state: string;
  last_output_time: number;
  awaiting_user: boolean;
  cmdline: string | null;
  cwd: string | null;
  label: string | null;
  start_time: number | null;
}

export interface AgentProcess {
  pid: number;
  label: string;
  cmdline: string;
  exe: string;
  cpu_pct: number;
  rss_kb: number;
  threads: number;
  tty: string | null;
  cwd: string | null;
  repo_path: string | null;
  start_time: number | null;
  heuristic_state: HeuristicState | null;
  wrapper_state: WrapperState | null;
  sandboxed?: boolean;
  sandbox_type?: "docker" | "macos" | "unknown";
}

export interface SessionInfo {
  session_id: string;
  pid: number;
  label: string;
  start_time: number;
  end_time: number | null;
}

export interface ListeningPort {
  port: number;
  pid: number;
  process_name: string;
  cmdline?: string;
  bind_address: string;
  protocol: "tcp" | "tcp6";
  agent_pid?: number;
  agent_label?: string;
  first_seen: number;
  cwd?: string;
}

export interface SessionEvent {
  type: string;
  pid: number;
  ts: number;
  line?: string;
  cmd?: string;
  cwd?: string;
  label?: string;
  state?: string;
  awaiting_user?: boolean;
  code?: number;
}

// Claude Code Hook Integration Types

export interface HookSession {
  session_id: string;
  transcript_path: string;
  cwd: string;
  start_time: number;
  end_time: number | null;
  permission_mode: string;
  source: "startup" | "resume" | "clear" | "compact";
  tool_count: number;
  last_activity: number;
  awaiting_user: boolean;
  tools_used: Record<string, number>;
  active: boolean;
  commit_count?: number;
  commits?: string[];
  // Token/cost tracking (from Stop hooks)
  total_input_tokens?: number;
  total_output_tokens?: number;
  estimated_cost_usd?: number;
  auto_continue_attempts?: number;
  pid?: number;
}

export interface ToolUsage {
  tool_use_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  timestamp: number;
  session_id: string;
  cwd: string;
  success: boolean | null;
  duration_ms: number | null;
  tool_response: Record<string, unknown> | null;
  error: string | null;
}

export interface ToolStats {
  tool_name: string;
  total_calls: number;
  success_count: number;
  failure_count: number;
  avg_duration_ms: number;
  last_used: number;
  success_rate: number;
}

export interface DailyStats {
  date: string;
  session_count: number;
  tool_calls: number;
  tools_breakdown: Record<string, number>;
  active_minutes: number;
}

// Activity Event for real-time feed
export interface ActivityEvent {
  id: string;
  type: string;
  timestamp: number;
  session_id?: string;
  data: Record<string, unknown>;
}

export type WebSocketMessage =
  | { type: "repos_update"; repos: RepoStatus[] }
  | { type: "agents_update"; agents: AgentProcess[] }
  | { type: "hook_session_start"; session: HookSession }
  | { type: "hook_session_end"; session: HookSession }
  | { type: "hook_pre_tool_use"; usage: ToolUsage }
  | { type: "hook_post_tool_use"; usage: ToolUsage }
  | { type: "hook_notification"; session_id: string; notification_type: string }
  | {
      type: "hook_permission_request";
      session_id: string;
      tool_name: string;
      action: string;
      timestamp: number;
    }
  | {
      type: "hook_user_prompt_submit";
      session_id: string;
      prompt_length: number;
      timestamp: number;
    }
  | {
      type: "hook_stop";
      session_id: string;
      stop_reason: string;
      input_tokens: number;
      output_tokens: number;
      timestamp: number;
    }
  | {
      type: "hook_subagent_stop";
      session_id: string;
      subagent_id: string;
      stop_reason: string;
      input_tokens: number;
      output_tokens: number;
      timestamp: number;
    }
  | {
      type: "hook_pre_compact";
      session_id: string;
      compact_type: string;
      timestamp: number;
    }
  | {
      type: "notification_sent";
      session_id: string;
      notification_type: string;
      title: string;
      message: string;
      timestamp: number;
    }
  | { type: "ping" }
  | { type: "pong" };

// Contrib/Sanitization Types

export interface PatternInfo {
  name: string;
  category: string;
  placeholder: string;
  patternCount: number;
}

export interface SanitizeResult {
  original_length: number;
  sanitized_length: number;
  sanitized: string;
  redaction_count: number;
  categories: Record<string, number>;
}

export interface ResidueCheckResult {
  clean: boolean;
  issues: ResidueIssue[];
}

export interface ResidueIssue {
  type: string;
  description: string;
  locations: ResidueLocation[];
}

export interface ResidueLocation {
  line: number;
  column: number;
  context: string;
}

export interface TranscriptInfo {
  session_id: string;
  cwd: string;
  start_time: number;
  end_time: number | null;
  tool_count: number;
  active: boolean;
  estimated_size_bytes?: number;
}

export interface ExportResult {
  session_id: string;
  original_lines: number;
  sanitized_lines: number;
  redaction_count: number;
  categories: Record<string, number>;
  content: string;
}

// Cost Estimation Types

export interface SessionCostEstimate {
  session_id: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  estimated_cost_usd: number;
  message_count: number;
  model_breakdown: Record<
    string,
    {
      input_tokens: number;
      output_tokens: number;
      estimated_cost_usd: number;
      message_count: number;
    }
  >;
}

export interface AggregateCost {
  period_days: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  session_count: number;
  model_breakdown: Record<
    string,
    { cost: number; input: number; output: number }
  >;
  daily_costs: Record<string, number>;
}

// Sharing Types

export interface GistResult {
  success: boolean;
  url?: string;
  gist_id?: string;
  error?: string;
}

export interface BundleExportResult {
  bundle_id: string;
  session_count: number;
  tool_usage_count: number;
  redaction_count: number;
  categories: Record<string, number>;
  content: string;
}

// Field Schema Types

export interface FieldSchema {
  path: string;
  label: string;
  description: string;
  source?: string;
}

export interface FieldSchemasResult {
  schemas: {
    essential: FieldSchema[];
    recommended: FieldSchema[];
    optional: FieldSchema[];
    strip: FieldSchema[];
    always_strip: FieldSchema[];
  };
  default_selected: string[];
}

// Preparation Types

export interface ContributorMeta {
  contributor_id: string;
  license: string;
  ai_preference: string;
  rights_statement: string;
  rights_confirmed: boolean;
  reviewed_confirmed: boolean;
}

export interface PreparedSession {
  session_id: string;
  source: string;
  preview_original: string;
  preview_redacted: string;
  score: number;
  approx_chars: number;
  raw_sha256: string;
  /** Raw original JSON (before stripping/redaction) for JSON diff */
  raw_json_original?: string;
  /** Raw sanitized JSON for raw view mode */
  raw_json?: string;
}

export interface PreparationRedactionReport {
  total_redactions: number;
  counts_by_category: Record<string, number>;
  enabled_categories: string[];
  residue_warnings: string[];
  blocked: boolean;
}

export interface PreparationStats {
  totalSessions: number;
  totalRedactions: number;
  totalFieldsStripped: number;
  averageScore: number;
}

/** Information about a single redaction for UI display */
export interface RedactionInfo {
  placeholder: string;
  category: string;
  ruleName: string;
  originalLength: number;
}

export interface PreparationResult {
  sessions: PreparedSession[];
  redaction_report: PreparationRedactionReport;
  stripped_fields: string[];
  fields_present: string[];
  /** Fields grouped by source type (cc_hook, cc_transcript, codex_transcript, etc.) */
  fields_by_source?: Record<string, string[]>;
  /** Map of placeholder to redaction info for UI display */
  redaction_info_map?: Record<string, RedactionInfo>;
  stats: PreparationStats;
}

// HuggingFace Types

export interface HuggingFaceValidateResult {
  valid: boolean;
  username?: string;
  error?: string;
}

export interface HuggingFaceRepoCheckResult {
  exists: boolean;
  canWrite: boolean;
  error?: string;
}

export interface HuggingFaceUploadResult {
  success: boolean;
  bundle_id?: string;
  session_count?: number;
  redaction_count?: number;
  url?: string;
  pr_number?: number;
  commit_sha?: string;
  is_pull_request?: boolean;
  was_fallback?: boolean;
  error?: string;
}

// Claude Code Settings Types (~/.claude/settings.json)
// See: https://docs.anthropic.com/en/docs/claude-code/hooks

// Individual hook configuration (the innermost level)
export interface ClaudeSettingsHookConfig {
  type: string;
  command?: string;
  timeout?: number;
  [key: string]: unknown;
}

// Hook group (contains matcher + array of hooks)
export interface ClaudeSettingsHookGroup {
  matcher?: string;
  hooks: ClaudeSettingsHookConfig[];
}

// Legacy type alias for backwards compatibility
export type ClaudeSettingsHookEntry = ClaudeSettingsHookGroup;

export interface ClaudeSettings {
  hooks?: {
    PreToolUse?: ClaudeSettingsHookGroup[];
    PostToolUse?: ClaudeSettingsHookGroup[];
    PermissionRequest?: ClaudeSettingsHookGroup[];
    UserPromptSubmit?: ClaudeSettingsHookGroup[];
    Notification?: ClaudeSettingsHookGroup[];
    SessionStart?: ClaudeSettingsHookGroup[];
    SessionEnd?: ClaudeSettingsHookGroup[];
    Stop?: ClaudeSettingsHookGroup[];
    SubagentStop?: ClaudeSettingsHookGroup[];
    PreCompact?: ClaudeSettingsHookGroup[];
  };
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  env?: Record<string, string>;
  sandbox?: {
    enabled?: boolean;
    autoAllowBashIfSandboxed?: boolean;
    network?: {
      allowedDomains?: string[];
      allowLocalBinding?: boolean;
    };
  };
  [key: string]: unknown;
}

export interface ClaudeSettingsResponse {
  exists: boolean;
  path: string;
  settings: ClaudeSettings | null;
  raw: string | null;
  error: string | null;
}

export interface ClaudeSettingsUpdateResult {
  success: boolean;
  path?: string;
  settings?: ClaudeSettings;
  error?: string;
}

// MCP Server Types

export interface McpServerConfig {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface McpConfigResult {
  user: {
    exists: boolean;
    path: string;
    servers: Record<string, McpServerConfig> | null;
    error: string | null;
  };
  project: {
    exists: boolean;
    path: string | null;
    servers: Record<string, McpServerConfig> | null;
    error: string | null;
  } | null;
}

// Reference Data Types

export interface EnvVarReference {
  name: string;
  category: string;
  description: string;
  example: string;
}

export interface EnvVarsReferenceResult {
  env_vars: EnvVarReference[];
  categories: string[];
  source: string;
}

export interface PermissionPatternReference {
  pattern: string;
  description: string;
  example: string;
}

export interface PathTypeReference {
  prefix: string;
  description: string;
  example: string;
}

export interface PermissionsReferenceResult {
  patterns: PermissionPatternReference[];
  path_types: PathTypeReference[];
  notes: string[];
  source: string;
}

// Sandbox Types

export interface DockerStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
  error: string | null;
}

export interface ImageStatus {
  exists: boolean;
  imageId: string | null;
  created: string | null;
  size: string | null;
}

export interface ScriptStatus {
  installed: boolean;
  path: string;
  inPath: boolean;
  executable: boolean;
}

export interface SandboxStatus {
  docker: DockerStatus;
  image: ImageStatus;
  script: ScriptStatus;
  ready: boolean;
}

export interface SandboxConfig {
  enabled: boolean;
  autoAllowBashIfSandboxed: boolean;
  network?: {
    allowedDomains: string[];
    allowLocalBinding: boolean;
  };
}

export interface PermissionRules {
  allow: string[];
  deny: string[];
}

export interface PermissionPreset {
  name: string;
  id: string;
  description: string;
  shortDescription: string;
  riskLevel: "low" | "medium" | "high";
  sandbox: SandboxConfig;
  permissions: PermissionRules;
  useCase: string;
  recommendedFor: string[];
}

export interface SecurityLevel {
  name: string;
  id: string;
  isolation: string;
  protection: "Basic" | "Medium" | "Strong";
  useCase: string;
  pros: string[];
  cons: string[];
}

export interface CommandCategory {
  name: string;
  description: string;
  commands: string[];
  riskLevel: "safe" | "moderate" | "risky";
}

export interface SecurityOverview {
  activeLevel: string;
  sandbox: SandboxStatus;
  claudeSettings: {
    exists: boolean;
    sandboxEnabled: boolean;
    permissionsConfigured: boolean;
    hooksConfigured: boolean;
  };
  testGate: {
    enabled: boolean;
    testCommand: string;
    passFileMaxAgeSeconds: number;
  };
}

export interface PresetApplyResult {
  success: boolean;
  preset?: string;
  path?: string;
  applied?: Record<string, unknown>;
  error?: string;
}

// Local Transcript Types

export interface LocalTranscript {
  id: string;
  agent: string;
  path: string;
  name: string;
  project_dir: string | null;
  modified_at: number;
  size_bytes: number;
  message_count: number | null;
  start_time: number | null;
  end_time: number | null;
}

export interface LocalTranscriptMessage {
  role: string;
  content: string;
  timestamp: string;
  meta?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  };
  /** True if this message is from a sub-agent sidechain (e.g., Task tool) */
  isSidechain?: boolean;
  /** Sub-agent ID if this is a sidechain message */
  agentId?: string;
  /** Original message type from transcript (user, assistant, tool_use, tool_result, etc.) */
  messageType?: string;
  /** Whether this message contains thinking content */
  hasThinking?: boolean;
  /** Tool name if this is a tool_use message */
  toolName?: string;
  /** Tool input if this is a tool_use message */
  toolInput?: Record<string, unknown>;
}

export interface ParsedLocalTranscript {
  id: string;
  agent: string;
  name: string;
  path: string;
  project_dir: string | null;
  messages: LocalTranscriptMessage[];
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
}

// Format Schema Types (Data Dictionaries)

export interface FieldDefinition {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
  children?: FieldDefinition[];
}

export interface MessageTypeSchema {
  name: string;
  description: string;
  fields: FieldDefinition[];
}

export interface FormatSchema {
  agent: string;
  displayName: string;
  description: string;
  fileFormat: "jsonl" | "json";
  fileExtension: string;
  fileLocation: string;
  filePattern: string;
  messageTypes: MessageTypeSchema[];
  notes: string[];
  sampleEntry?: string;
}

export interface FormatSchemasResult {
  supported: FormatSchema[];
  planned: FormatSchema[];
  all: FormatSchema[];
}

// Hook Enhancements Types

export interface HookEnhancementsConfig {
  rules: {
    enabled: boolean;
    rules_file: string;
    enabled_rule_sets: string[];
  };
  auto_permissions: {
    enabled: boolean;
    auto_approve_read_only: boolean;
  };
  context_injection: {
    inject_git_context: boolean;
    inject_project_context: boolean;
    max_context_lines: number;
  };
  input_modification: {
    enabled: boolean;
    add_dry_run_flags: boolean;
    enforce_commit_format: boolean;
    commit_message_prefix: string;
  };
  stop_blocking: {
    enabled: boolean;
    require_tests_pass: boolean;
    require_no_lint_errors: boolean;
    require_coverage_threshold: number | null;
    max_block_attempts: number;
  };
  prompt_validation: {
    enabled: boolean;
    block_patterns: unknown[];
    warn_patterns: unknown[];
    min_length: number;
    max_length: number;
  };
  cost_controls: {
    enabled: boolean;
    session_budget_usd: number | null;
    daily_budget_usd: number | null;
    monthly_budget_usd: number | null;
    alert_thresholds: number[];
    over_budget_action: "warn" | "block" | "notify";
  };
  llm_evaluation: {
    enabled: boolean;
    provider: "anthropic" | "openai" | "ollama";
    model: string;
    trigger_hooks: string[];
  };
  notification_hub: {
    enabled: boolean;
    desktop: {
      enabled: boolean;
      format: {
        show_project_name: boolean;
        show_session_id: boolean;
        show_cwd: boolean;
        show_tool_details: boolean;
        show_stats: boolean;
      };
    };
    webhooks: unknown[];
    routing: unknown[];
  };
}

export interface NotificationsConfig {
  enable: boolean;
  hook_awaiting_input: boolean;
  hook_session_end: boolean;
  hook_tool_failure: boolean;
  hook_long_running: boolean;
  long_running_threshold_seconds: number;
  // Per-hook notifications
  hook_session_start: boolean;
  hook_pre_tool_use: boolean;
  hook_post_tool_use: boolean;
  hook_notification: boolean;
  hook_permission_request: boolean;
  hook_user_prompt_submit: boolean;
  hook_stop: boolean;
  hook_subagent_stop: boolean;
  hook_pre_compact: boolean;
}

export interface CostPeriod {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  session_count: number;
}

export interface CostAlert {
  type: "warning" | "exceeded";
  budget: "session" | "daily" | "monthly";
  current_usd: number;
  limit_usd: number;
  percentage: number;
  timestamp: number;
}

export interface CostStatus {
  enabled: boolean;
  daily: CostPeriod | null;
  monthly: CostPeriod | null;
  limits: {
    session_usd: number | null;
    daily_usd: number | null;
    monthly_usd: number | null;
  };
  alerts: CostAlert[];
}

export interface RuleSummary {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  hook_types: string[];
  conditions_count: number;
  action: string;
}

export interface RulesListResult {
  rules: RuleSummary[];
  total: number;
}

export interface NotificationProvidersResult {
  providers: string[];
  available: boolean;
}

// Annotation & Heuristic Scoring Types

export interface SessionAnnotation {
  sessionId: string;
  feedback: "positive" | "negative" | null;
  notes?: string;
  updatedAt: string;
}

export interface HeuristicSignal {
  value: boolean;
  weight: number;
}

export interface HeuristicScore {
  score: number;
  classification: "likely_success" | "likely_failed" | "uncertain";
  signals: {
    noFailures: HeuristicSignal;
    hasCommits: HeuristicSignal;
    normalEnd: HeuristicSignal;
    reasonableToolCount: HeuristicSignal;
    healthyPacing: HeuristicSignal;
  };
}

export interface SessionAnnotationData {
  annotation: SessionAnnotation | null;
  heuristic: HeuristicScore | null;
}

export interface AnnotationStats {
  total: number;
  positive: number;
  negative: number;
  unlabeled: number;
  likelySuccess: number;
  likelyFailed: number;
  uncertain: number;
}

// Process Snapshot Types (lightweight sessions data)

export interface ProcessSnapshot {
  timestamp: number;
  pid: number;
  label: string;
  cmdline: string;
  exe: string;
  cpu_pct: number;
  rss_kb?: number;
  threads?: number;
  cwd?: string;
  repo_path?: string;
  state?: string;
  sandboxed?: boolean;
  sandbox_type?: string;
  start_time?: number;
}

export interface ProcessLifecycleEvent {
  type: "process_start" | "process_end";
  timestamp: number;
  pid: number;
  label: string;
  cmdline: string;
  cwd?: string;
  repo_path?: string;
  duration_ms?: number;
}

export interface ProcessLogFileInfo {
  filename: string;
  date: string;
  size_bytes: number;
  modified_at: number;
}

export interface ProcessLogSummary {
  snapshot_file_count: number;
  event_file_count: number;
  total_snapshots: number;
  total_events: number;
  total_size_bytes: number;
  earliest_date: string | null;
  latest_date: string | null;
  log_dir: string;
}

export interface ProcessLogFilesResult {
  snapshot_files: ProcessLogFileInfo[];
  event_files: ProcessLogFileInfo[];
}

export interface ProcessLogPrepareResult {
  start_date: string;
  end_date: string;
  snapshot_count: number;
  event_count: number;
  preview: string;
  snapshots: ProcessSnapshot[];
  events: ProcessLifecycleEvent[];
}

// Project Types

export interface Project {
  id: string;
  name: string;
  paths: string[];
  description?: string;
}

export interface ProjectRef {
  id: string;
  name: string;
}

// Managed Session Types (from `aw run`)

export interface ManagedSession {
  id: string;
  prompt: string;
  agent: string;
  pid: number | null;
  cwd: string;
  started_at: number;
  ended_at: number | null;
  exit_code: number | null;
  status: "running" | "completed" | "failed";
  duration_ms: number;
}

// Conversation Types (unified view of hooks + transcripts + process snapshots)

/** Summary of a process snapshot attached to a conversation */
export interface ProcessSnapshotSummary {
  timestamp: number;
  pid: number;
  label: string;
  cpu_pct: number;
  rss_kb?: number;
  threads?: number;
  state?: string;
}

export interface Conversation {
  correlation_id: string;
  match_type: "exact" | "confident" | "uncertain" | "unmatched";
  match_details: {
    path_match: boolean;
    time_match: boolean;
    cwd_match: boolean;
    tool_count_match: boolean;
    score: number;
  };
  start_time: number;
  cwd: string | null;
  agent: string;
  hook_session: HookSession | null;
  transcript: LocalTranscript | null;
  process_snapshots: ProcessSnapshotSummary[] | null;
  managed_session: ManagedSession | null;
  project: ProjectRef | null;
  tool_count: number;
  snapshot_count: number;
}

export interface ConversationStats {
  total: number;
  exact: number;
  confident: number;
  uncertain: number;
  unmatched: number;
  hook_only: number;
  transcript_only: number;
  managed_only: number;
  with_managed_session: number;
}

export interface ConversationsResult {
  sessions: Conversation[];
  stats: ConversationStats;
}

// Agent Metadata Types (for renaming/annotating agents)

export interface AgentMetadata {
  agentId: string;
  customName?: string;
  aliases?: string[];
  notes?: string;
  tags?: string[];
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMetadataInput {
  customName?: string | null;
  aliases?: string[] | null;
  notes?: string | null;
  tags?: string[] | null;
  color?: string | null;
}

export interface AgentRenameEvent {
  timestamp: string;
  agentId: string;
  previousName: string | null;
  newName: string;
  reason?: string;
}

// Conversation Metadata Types (for naming conversations)

export interface ConversationMetadata {
  conversationId: string;
  customName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMetadataInput {
  customName?: string | null;
}

// =============================================================================
// Enrichment Types (Agentwatch Objects)
// =============================================================================

export type TaskType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "test"
  | "docs"
  | "config"
  | "exploration"
  | "unknown";

export type FeedbackType = "positive" | "negative" | null;

export type WorkflowStatus =
  | "pending"
  | "reviewed"
  | "ready_to_contribute"
  | "skipped";

export type QualityClassification =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "unknown";

export interface AutoTag {
  name: string;
  category: string;
  inferredFrom: string;
  confidence: number;
}

export interface AutoTagsEnrichment {
  tags: AutoTag[];
  taskType: TaskType;
  userTags: string[];
  computedAt: string;
}

export interface TestResults {
  ran: boolean;
  passed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  lastRunAt: string;
  testCommand?: string;
}

export interface OutcomeSignalsEnrichment {
  testResults?: TestResults;
  lintResults?: {
    ran: boolean;
    errors: number;
    warnings: number;
    autoFixed: number;
    linter?: string;
  };
  buildStatus?: {
    ran: boolean;
    success: boolean;
    durationMs: number;
    buildTool?: string;
  };
  exitCodes: {
    successCount: number;
    failureCount: number;
    lastFailure?: {
      code: number;
      command: string;
      timestamp: number;
    };
  };
  timeToGreenMs?: number;
  gitOutcomes?: {
    commitsCreated: number;
    commitsPushed: number;
    mergeConflicts: boolean;
    rebaseAttempts: number;
    stashOperations: number;
  };
  computedAt: string;
}

export interface QualityScoreEnrichment {
  overall: number;
  classification: QualityClassification;
  dimensions: {
    completion: number;
    codeQuality: number;
    efficiency: number;
    safety: number;
  };
  heuristicSignals: Record<
    string,
    { value: boolean; weight: number; description?: string }
  >;
  computedAt: string;
}

export interface ManualAnnotationEnrichment {
  feedback: FeedbackType;
  notes?: string;
  userTags: string[];
  extraData?: Record<string, unknown>;
  rating?: number;
  taskDescription?: string;
  goalAchieved?: boolean;
  workflowStatus?: WorkflowStatus;
  updatedAt: string;
}

export interface LoopPattern {
  patternType: "retry" | "oscillation" | "dead_end" | "permission_loop";
  involvedOperations: string[];
  iterations: number;
  startedAt: number;
  endedAt: number | null;
  resolution?: "success" | "user_intervention" | "timeout" | "abandoned";
  normalizedPattern?: string;
}

export interface LoopDetectionEnrichment {
  loopsDetected: boolean;
  patterns: LoopPattern[];
  totalRetries: number;
  timeInLoopsMs: number;
  computedAt: string;
}

export interface GitStateSnapshot {
  branch: string;
  commitHash: string;
  isDirty: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  capturedAt: number;
}

export interface DiffSnapshotEnrichment {
  start: GitStateSnapshot;
  end: GitStateSnapshot | null;
  summary: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    filesCreated: number;
    filesDeleted: number;
    commitsCreated: number;
  };
  fileChanges: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    insertions: number;
    deletions: number;
  }>;
  computedAt: string;
}

export interface SessionEnrichments {
  session_ref: {
    correlationId?: string;
    hookSessionId?: string;
    transcriptId?: string;
  };
  auto_tags?: AutoTagsEnrichment;
  outcome_signals?: OutcomeSignalsEnrichment;
  quality_score?: QualityScoreEnrichment;
  manual_annotation?: ManualAnnotationEnrichment;
  loop_detection?: LoopDetectionEnrichment;
  diff_snapshot?: DiffSnapshotEnrichment;
  updated_at: string;
}

export interface EnrichmentListItem {
  id: string;
  session_ref: SessionEnrichments["session_ref"];
  has_auto_tags: boolean;
  has_outcome_signals: boolean;
  has_quality_score: boolean;
  has_manual_annotation: boolean;
  has_loop_detection: boolean;
  has_diff_snapshot: boolean;
  quality_score?: number;
  feedback?: FeedbackType;
  workflow_status?: WorkflowStatus;
  task_type?: TaskType;
  updated_at: string;
}

export interface EnrichmentStats {
  totalSessions: number;
  byType: {
    autoTags: number;
    outcomeSignals: number;
    qualityScore: number;
    manualAnnotation: number;
    loopDetection: number;
    diffSnapshot: number;
  };
  annotated: {
    positive: number;
    negative: number;
    unlabeled: number;
  };
  qualityDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
}

export interface EnrichmentsListResult {
  sessions: EnrichmentListItem[];
  stats: EnrichmentStats;
}

// =============================================================================
// Analytics Types
// =============================================================================

export interface AnalyticsDashboard {
  time_range: {
    start: string;
    end: string;
    days: number;
  };
  summary: {
    total_sessions: number;
    success_rate: number;
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    avg_duration_ms: number;
  };
  enrichment_stats: EnrichmentStats;
  sources?: {
    hook_sessions: number;
    local_transcripts: number;
  };
}

export interface SuccessTrendPoint {
  date: string;
  success_count: number;
  failure_count: number;
  total: number;
  rate: number;
}

export interface SuccessTrendResult {
  days: number;
  trend: SuccessTrendPoint[];
}

export interface CostByTypeItem {
  task_type: TaskType;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  session_count: number;
  avg_cost_usd: number;
}

export interface CostByTypeResult {
  days: number;
  breakdown: CostByTypeItem[];
}

export interface ToolRetryPattern {
  tool_name: string;
  total_calls: number;
  failures: number;
  failure_rate: number;
  common_errors: string[];
}

export interface ToolRetriesResult {
  days: number;
  patterns: ToolRetryPattern[];
}

export interface QualityDistributionBucket {
  range: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface QualityDistributionResult {
  days: number;
  total_scored: number;
  distribution: QualityDistributionBucket[];
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

export interface QualityConfigResult {
  dimension_weights: {
    completion: number;
    code_quality: number;
    efficiency: number;
    safety: number;
  };
  signal_weights: {
    no_failures: number;
    has_commits: number;
    normal_end: number;
    reasonable_tool_count: number;
    healthy_pacing: number;
  };
  dimension_descriptions: Record<string, string>;
  signal_descriptions: Record<string, string>;
}

export interface LoopsAnalyticsResult {
  days: number;
  sessions_with_loops: number;
  total_loops: number;
  total_retries: number;
  by_pattern_type: Record<string, number>;
}

export interface ProjectAnalyticsItem {
  project_id: string;
  project_name: string;
  session_count: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  success_count: number;
  failure_count: number;
}

export interface AnalyticsByProjectResult {
  days: number;
  breakdown: ProjectAnalyticsItem[];
  unassigned: {
    session_count: number;
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    success_count: number;
    failure_count: number;
  };
}

/**
 * Combined analytics result - all analytics data in one request.
 * Reduces 9 API calls to 1 for faster page loads.
 */
export interface AnalyticsCombinedResult {
  days: number;
  dashboard: AnalyticsDashboard;
  success_trend: SuccessTrendPoint[];
  cost_by_type: CostByTypeItem[];
  tool_retries: ToolRetryPattern[];
  quality_distribution: {
    total_scored: number;
    distribution: QualityDistributionBucket[];
    percentiles: {
      p25: number;
      p50: number;
      p75: number;
      p90: number;
    };
  };
  loops: {
    sessions_with_loops: number;
    total_loops: number;
    total_retries: number;
    by_pattern_type: Record<string, number>;
  };
  by_project?: {
    breakdown: ProjectAnalyticsItem[];
    unassigned: {
      session_count: number;
      total_cost_usd: number;
      total_input_tokens: number;
      total_output_tokens: number;
      success_count: number;
      failure_count: number;
    };
  };
}

// Audit Log Types

export type AuditCategory =
  | "transcript"
  | "hook_session"
  | "tool_usage"
  | "enrichment"
  | "annotation"
  | "conversation"
  | "agent"
  | "managed_session"
  | "process"
  | "config"
  | "contributor"
  | "daemon"
  | "system";

export type AuditAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "start"
  | "end"
  | "discover"
  | "rename"
  | "annotate"
  | "compute"
  | "export"
  | "import";

export interface AuditEntry {
  timestamp: string;
  category: AuditCategory;
  action: AuditAction;
  entity_id: string;
  description: string;
  details?: Record<string, unknown>;
  source: "hook" | "api" | "scanner" | "inferred" | "daemon" | "user";
}

export interface AuditStats {
  total_events: number;
  by_category: Record<string, number>;
  by_action: Record<string, number>;
  oldest_event?: string;
  newest_event?: string;
}

export interface AuditLogResult {
  events: AuditEntry[];
  stats: AuditStats;
  sources: { logged: number; inferred: number };
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface AuditCalculationsResult {
  quality_score: {
    description: string;

    dimension_weights: Record<string, number>;

    signal_weights: Record<string, number>;

    scoring_rules: string[];

    penalties: string[];
  };

  cost_estimation: {
    description: string;

    pricing_table: Record<
      string,
      { inputPerMillion: number; outputPerMillion: number }
    >;

    formulas: string[];

    disclaimer: string;
  };
}

export interface AuditCategoriesResult {
  categories: Record<string, { description: string; actions: string[] }>;
}

export interface DataSourceFileInfo {
  exists: boolean;
  size?: number;
  modified?: string;
  created?: string;
  path?: string;
  format?: string;
  description?: string;
  source_code?: string;
  edge_cases?: string[];
  snapshot_files?: number;
  event_files?: number;
  file_count?: number;
  project_count?: number;
}

export interface DataSourcesResult {
  data_dir: string;
  sources: {
    agentwatch_dir: DataSourceFileInfo;
    hooks: Record<string, DataSourceFileInfo>;
    enrichments: Record<string, DataSourceFileInfo>;
    metadata: Record<string, DataSourceFileInfo>;
    processes: Record<string, DataSourceFileInfo>;
    logs: Record<string, DataSourceFileInfo>;
    contributor: Record<string, DataSourceFileInfo>;
    config: Record<string, DataSourceFileInfo>;
    local_transcripts: Record<string, DataSourceFileInfo>;
    audit: Record<string, DataSourceFileInfo>;
  };
  timestamp: string;
}

export interface EdgeCase {
  title: string;
  description: string;
  behavior: string[];
  source_code: string;
}

export interface EdgeCasesResult {
  edge_cases: Record<string, EdgeCase>;
}

// Privacy Flags Types

export type PrivacyConcernType =
  | "pii"
  | "secrets"
  | "proprietary"
  | "sensitive"
  | "other";

export interface PrivacyFlag {
  id: string;
  sessionId: string;
  messageId: string;
  createdAt: string;
  concernType: PrivacyConcernType;
  notes: string;
  excludeFromExport: boolean;
  redactFields?: string[];
  resolved?: boolean;
  resolvedNotes?: string;
  resolvedAt?: string;
}

export interface PrivacyFlagStats {
  total: number;
  byType: Record<string, number>;
  unresolved: number;
  sessionsWithFlags: number;
}

export interface PrivacyFlagsResponse {
  flags: PrivacyFlag[];
  stats: PrivacyFlagStats;
}

// =============================================================================
// Command Center / Prediction Types
// =============================================================================

export type ConfidenceLevel = "low" | "medium" | "high";

export interface RunPrediction {
  id: string;
  managedSessionId: string;
  createdAt: number;
  predictedDurationMinutes: number;
  durationConfidence: ConfidenceLevel;
  predictedTokens: number;
  tokenConfidence: ConfidenceLevel;
  successConditions: string;
  intentions: string;
  selectedPrinciples?: string[];
  principlesPath?: string;
}

export interface RunOutcome {
  predictionId: string;
  managedSessionId: string;
  recordedAt: number;
  actualDurationMinutes: number;
  actualTokens: number;
  exitCode: number;
  userMarkedSuccess: boolean;
  outcomeNotes?: string;
}

export interface CalibrationResult {
  predictionId: string;
  durationError: number;
  durationWithinConfidence: boolean;
  durationScore: number;
  tokenError: number;
  tokenWithinConfidence: boolean;
  tokenScore: number;
  successPredictionCorrect: boolean;
  successScore: number;
  overallScore: number;
}

export interface CalibrationStats {
  totalPredictions: number;
  completedPredictions: number;
  overallCalibrationScore: number;
  recentTrend: "improving" | "stable" | "declining";
  history: Array<{ date: string; score: number; count: number }>;
}

export interface Principle {
  id: string;
  text: string;
  category?: string;
}

export interface PrinciplesFile {
  path: string;
  principles: Principle[];
  lastModified: number;
}
