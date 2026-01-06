import type {
  AgentProcess,
  AggregateCost,
  AnalyticsByProjectResult,
  AnalyticsCombinedResult,
  AnalyticsDashboard,
  AuditCalculationsResult,
  AuditCategoriesResult,
  // Audit types
  AuditEntry,
  AuditLogResult,
  AuditStats,
  BundleExportResult,
  ClaudeSettings,
  ClaudeSettingsResponse,
  ClaudeSettingsUpdateResult,
  CommandCategory,
  ContributorMeta,
  CostByTypeResult,
  DailyStats,
  DataSourcesResult,
  EdgeCasesResult,
  EnrichmentsListResult,
  EnvVarsReferenceResult,
  ExportResult,
  FeedbackType,
  WorkflowStatus,
  FieldSchemasResult,
  FormatSchema,
  FormatSchemasResult,
  GistResult,
  HuggingFaceRepoCheckResult,
  HuggingFaceUploadResult,
  HuggingFaceValidateResult,
  ListeningPort,
  LocalTranscript,
  LoopsAnalyticsResult,
  McpConfigResult,
  ParsedLocalTranscript,
  PatternInfo,
  PermissionPreset,
  PermissionsReferenceResult,
  PreparationResult,
  PresetApplyResult,
  // Project types
  Project,
  QualityConfigResult,
  QualityDistributionResult,
  RepoStatus,
  ResidueCheckResult,
  SandboxStatus,
  SanitizeResult,
  SecurityLevel,
  SecurityOverview,
  SessionCostEstimate,
  // Enrichment & Analytics types
  SessionEnrichments,
  SessionEvent,
  SessionInfo,
  SuccessTrendResult,
  ToolRetriesResult,
  // Hook stats types
  ToolStats,
  TranscriptInfo
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

// Config types
export interface ConfigData {
  roots: string[];
  repo: {
    refresh_fast_seconds: number;
    refresh_slow_seconds: number;
    include_untracked: boolean;
    show_clean: boolean;
  };
  daemon: {
    host: string;
    port: number;
  };
  watcher?: {
    host: string;
    port: number;
    log_dir: string;
  };
  test_gate: {
    enabled: boolean;
    test_command: string;
    pass_file: string;
    pass_file_max_age_seconds: number;
  };
  notifications: {
    enable: boolean;
    hook_awaiting_input: boolean;
    hook_session_end: boolean;
    hook_tool_failure: boolean;
    hook_long_running: boolean;
    long_running_threshold_seconds: number;
    // Educational hook notifications
    hook_session_start: boolean;
    hook_pre_tool_use: boolean;
    hook_post_tool_use: boolean;
    hook_notification: boolean;
    hook_permission_request: boolean;
    hook_user_prompt_submit: boolean;
    hook_stop: boolean;
    hook_subagent_stop: boolean;
    hook_pre_compact: boolean;
  };
  agents: {
    refresh_seconds: number;
    matchers: Array<{ label: string; type: string; pattern: string }>;
  };
  hook_enhancements?: {
    notification_hub?: {
      enabled: boolean;
      desktop?: {
        enabled: boolean;
        format?: {
          show_project_name: boolean;
          show_session_id: boolean;
          show_cwd: boolean;
          show_tool_details: boolean;
          show_stats: boolean;
        };
      };
    };
  };
  conversations?: {
    transcript_days: number;
    include_process_snapshots: boolean;
  };
}

export async function fetchConfig(): Promise<ConfigData> {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
}

export async function updateConfig(
  updates: Record<string, unknown>
): Promise<{ success: boolean; updates: string[] }> {
  const res = await fetch(`${API_BASE}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error("Failed to update config");
  return res.json();
}

// Raw config types
export interface RawConfigResponse {
  exists: boolean;
  path: string;
  content: string;
}

export interface RawConfigSaveResult {
  success: boolean;
  path: string;
  message: string;
}

export async function fetchRawConfig(): Promise<RawConfigResponse> {
  const res = await fetch(`${API_BASE}/config/raw`);
  if (!res.ok) throw new Error("Failed to fetch raw config");
  return res.json();
}

export async function saveRawConfig(
  content: string
): Promise<RawConfigSaveResult> {
  const res = await fetch(`${API_BASE}/config/raw`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!res.ok) throw new Error("Failed to save raw config");
  return res.json();
}

export async function fetchRepos(): Promise<RepoStatus[]> {
  const res = await fetch(`${API_BASE}/repos`);
  if (!res.ok) throw new Error("Failed to fetch repos");
  return res.json();
}

export async function fetchAgents(): Promise<AgentProcess[]> {
  const res = await fetch(`${API_BASE}/agents`);
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
}

export async function fetchPorts(): Promise<ListeningPort[]> {
  const res = await fetch(`${API_BASE}/ports`);
  if (!res.ok) throw new Error("Failed to fetch ports");
  return res.json();
}

export async function fetchAgentOutput(
  pid: number,
  limit = 200
): Promise<string[]> {
  const res = await fetch(`${API_BASE}/agents/${pid}/output?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch output");
  const data = await res.json();
  return data.lines;
}

export async function sendAgentSignal(
  pid: number,
  signal: "interrupt" | "eof" | "suspend"
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/agents/${pid}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signal })
  });
  const data = await res.json();
  return data.success;
}

export async function killAgent(pid: number, force = false): Promise<boolean> {
  const res = await fetch(`${API_BASE}/agents/${pid}/kill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force })
  });
  const data = await res.json();
  return data.success;
}

export async function fetchSessions(limit = 100): Promise<SessionInfo[]> {
  const res = await fetch(`${API_BASE}/sessions?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionEvent[]> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  const data = await res.json();
  return data.events;
}

// Contrib/Sanitization API

export async function fetchPatterns(): Promise<PatternInfo[]> {
  const res = await fetch(`${API_BASE}/contrib/patterns`);
  if (!res.ok) throw new Error("Failed to fetch patterns");
  const data = await res.json();
  return data.patterns;
}

export async function sanitizeContent(
  content: string
): Promise<SanitizeResult> {
  const res = await fetch(`${API_BASE}/contrib/sanitize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!res.ok) throw new Error("Failed to sanitize content");
  return res.json();
}

export async function checkResidue(
  content: string
): Promise<ResidueCheckResult> {
  const res = await fetch(`${API_BASE}/contrib/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!res.ok) throw new Error("Failed to check residue");
  return res.json();
}

export async function fetchTranscripts(): Promise<TranscriptInfo[]> {
  const res = await fetch(`${API_BASE}/contrib/transcripts`);
  if (!res.ok) throw new Error("Failed to fetch transcripts");
  const data = await res.json();
  return data.transcripts;
}

// Local Logs API

export async function fetchLocalLogs(
  agents?: string[]
): Promise<LocalTranscript[]> {
  const params = agents ? `?agents=${agents.join(",")}` : "";
  const res = await fetch(`${API_BASE}/contrib/local-logs${params}`);
  if (!res.ok) throw new Error("Failed to fetch local logs");
  const data = await res.json();
  return data.transcripts;
}

export async function fetchLocalTranscript(
  transcriptId: string,
  format: "full" | "chat" = "chat"
): Promise<ParsedLocalTranscript> {
  const res = await fetch(
    `${API_BASE}/contrib/local-logs/${encodeURIComponent(transcriptId)}?format=${format}`
  );
  if (!res.ok) throw new Error("Failed to fetch transcript");
  return res.json();
}

export async function exportTranscript(
  sessionId: string
): Promise<ExportResult> {
  const res = await fetch(`${API_BASE}/contrib/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId })
  });
  if (!res.ok) throw new Error("Failed to export transcript");
  return res.json();
}

// Cost Estimation API

export async function fetchSessionCost(
  sessionId: string
): Promise<SessionCostEstimate> {
  const res = await fetch(`${API_BASE}/contrib/cost/${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch cost estimate");
  return res.json();
}

export async function fetchAggregateCost(days = 7): Promise<AggregateCost> {
  const res = await fetch(`${API_BASE}/contrib/cost/aggregate?days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch aggregate cost");
  return res.json();
}

// Sharing API

export async function createGist(
  sessionId: string,
  token: string,
  options?: { description?: string; public?: boolean }
): Promise<GistResult> {
  const res = await fetch(`${API_BASE}/share/gist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      token,
      description: options?.description,
      public: options?.public
    })
  });
  if (!res.ok) throw new Error("Failed to create gist");
  return res.json();
}

export async function exportBundle(
  correlationIds: string[],
  options?: {
    includeCost?: boolean;
    redactSecrets?: boolean;
    redactPii?: boolean;
    redactPaths?: boolean;
  }
): Promise<BundleExportResult> {
  const res = await fetch(`${API_BASE}/contrib/export/bundle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correlation_ids: correlationIds,
      include_cost: options?.includeCost ?? true,
      options: {
        redactSecrets: options?.redactSecrets ?? true,
        redactPii: options?.redactPii ?? true,
        redactPaths: options?.redactPaths ?? true
      }
    })
  });
  if (!res.ok) throw new Error("Failed to export bundle");
  return res.json();
}

// Field Schema API

export async function fetchFieldSchemas(
  source = "all"
): Promise<FieldSchemasResult> {
  const res = await fetch(`${API_BASE}/contrib/fields?source=${source}`);
  if (!res.ok) throw new Error("Failed to fetch field schemas");
  return res.json();
}

// Preparation API

export interface RedactionConfig {
  redactSecrets?: boolean;
  redactPii?: boolean;
  redactPaths?: boolean;
  maskCodeBlocks?: boolean;
  customRegex?: string[];
  enableHighEntropy?: boolean;
}

export async function prepareSessions(
  correlationIds: string[],
  redaction: RedactionConfig,
  selectedFields?: string[],
  contributor?: Partial<ContributorMeta>
): Promise<PreparationResult> {
  const res = await fetch(`${API_BASE}/contrib/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correlation_ids: correlationIds,
      redaction: {
        redactSecrets: redaction.redactSecrets ?? true,
        redactPii: redaction.redactPii ?? true,
        redactPaths: redaction.redactPaths ?? true,
        maskCodeBlocks: redaction.maskCodeBlocks ?? false,
        customRegex: redaction.customRegex ?? [],
        enableHighEntropy: redaction.enableHighEntropy ?? true
      },
      selected_fields: selectedFields,
      contributor: {
        contributor_id: contributor?.contributor_id ?? "anonymous",
        license: contributor?.license ?? "CC-BY-4.0",
        ai_preference: contributor?.ai_preference ?? "train-genai=deny",
        rights_statement:
          contributor?.rights_statement ??
          "I have the right to share this data.",
        rights_confirmed: contributor?.rights_confirmed ?? false,
        reviewed_confirmed: contributor?.reviewed_confirmed ?? false
      }
    })
  });
  if (!res.ok) throw new Error("Failed to prepare sessions");
  return res.json();
}

// HuggingFace API

export interface HFCLIAuthStatus {
  authenticated: boolean;
  username?: string;
  tokenMasked?: string;
  source?: "cli-cache" | "environment" | "saved";
  error?: string;
}

export async function checkHFCLIAuth(): Promise<HFCLIAuthStatus> {
  const res = await fetch(`${API_BASE}/share/huggingface/cli-auth`);
  if (!res.ok) throw new Error("Failed to check HF CLI auth");
  return res.json();
}

export async function useHFCLIToken(): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/share/huggingface/use-cli-token`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to get HF CLI token");
  return res.json();
}

// HuggingFace OAuth

export interface HFOAuthConfig {
  configured: boolean;
  clientId: string | null;
  redirectUri: string;
  scopes: string[];
  setupUrl: string;
}

export async function getHFOAuthConfig(): Promise<HFOAuthConfig> {
  const res = await fetch(`${API_BASE}/share/huggingface/oauth/config`);
  if (!res.ok) throw new Error("Failed to get HF OAuth config");
  return res.json();
}

export async function startHFOAuth(): Promise<{
  success: boolean;
  url?: string;
  state?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/share/huggingface/oauth/start`, {
    method: "POST"
  });
  if (!res.ok) {
    const data = await res.json();
    return { success: false, error: data.error || "Failed to start OAuth" };
  }
  return res.json();
}

export async function validateHuggingFaceToken(
  token: string
): Promise<HuggingFaceValidateResult> {
  const res = await fetch(`${API_BASE}/share/huggingface/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  if (!res.ok) throw new Error("Failed to validate HuggingFace token");
  return res.json();
}

export async function checkHuggingFaceRepo(
  token: string,
  repoId: string
): Promise<HuggingFaceRepoCheckResult> {
  const res = await fetch(`${API_BASE}/share/huggingface/check-repo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, repo_id: repoId })
  });
  if (!res.ok) throw new Error("Failed to check HuggingFace repo");
  return res.json();
}

export async function uploadToHuggingFace(
  correlationIds: string[],
  token: string,
  repoId: string,
  options?: {
    createPr?: boolean;
    contributorId?: string;
    license?: string;
    aiPreference?: string;
  }
): Promise<HuggingFaceUploadResult> {
  const res = await fetch(`${API_BASE}/share/huggingface`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correlation_ids: correlationIds,
      token,
      repo_id: repoId,
      create_pr: options?.createPr ?? true,
      contributor_id: options?.contributorId,
      license: options?.license,
      ai_preference: options?.aiPreference
    })
  });
  if (!res.ok) throw new Error("Failed to upload to HuggingFace");
  return res.json();
}

// Claude Code Settings API (~/.claude/settings.json)

export async function fetchClaudeSettings(): Promise<ClaudeSettingsResponse> {
  const res = await fetch(`${API_BASE}/claude/settings`);
  if (!res.ok) throw new Error("Failed to fetch Claude settings");
  return res.json();
}

export async function updateClaudeSettings(
  settings: Partial<ClaudeSettings>
): Promise<ClaudeSettingsUpdateResult> {
  const res = await fetch(`${API_BASE}/claude/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error("Failed to update Claude settings");
  return res.json();
}

export async function replaceClaudeSettings(
  raw: string
): Promise<ClaudeSettingsUpdateResult> {
  const res = await fetch(`${API_BASE}/claude/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw })
  });
  if (!res.ok) throw new Error("Failed to replace Claude settings");
  return res.json();
}

export async function fetchScopedClaudeSettings(
  scope: "user" | "project" | "local",
  projectPath?: string
): Promise<ClaudeSettingsResponse & { scope: string }> {
  const params = projectPath
    ? `?project_path=${encodeURIComponent(projectPath)}`
    : "";
  const res = await fetch(`${API_BASE}/claude/settings/${scope}${params}`);
  if (!res.ok) throw new Error(`Failed to fetch ${scope} Claude settings`);
  return res.json();
}

// MCP Configuration API

export async function fetchMcpConfig(
  projectPath?: string
): Promise<McpConfigResult> {
  const params = projectPath
    ? `?project_path=${encodeURIComponent(projectPath)}`
    : "";
  const res = await fetch(`${API_BASE}/claude/mcp${params}`);
  if (!res.ok) throw new Error("Failed to fetch MCP config");
  return res.json();
}

// Reference Data API

export async function fetchEnvVarsReference(): Promise<EnvVarsReferenceResult> {
  const res = await fetch(`${API_BASE}/claude/reference/env-vars`);
  if (!res.ok) throw new Error("Failed to fetch env vars reference");
  return res.json();
}

export async function fetchPermissionsReference(): Promise<PermissionsReferenceResult> {
  const res = await fetch(`${API_BASE}/claude/reference/permissions`);
  if (!res.ok) throw new Error("Failed to fetch permissions reference");
  return res.json();
}

// Sandbox API

export async function fetchSandboxStatus(): Promise<SandboxStatus> {
  const res = await fetch(`${API_BASE}/sandbox/status`);
  if (!res.ok) throw new Error("Failed to fetch sandbox status");
  return res.json();
}

export async function fetchSandboxPresets(): Promise<{
  presets: PermissionPreset[];
}> {
  const res = await fetch(`${API_BASE}/sandbox/presets`);
  if (!res.ok) throw new Error("Failed to fetch sandbox presets");
  return res.json();
}

export async function fetchSandboxPreset(
  id: string
): Promise<PermissionPreset> {
  const res = await fetch(`${API_BASE}/sandbox/presets/${id}`);
  if (!res.ok) throw new Error("Failed to fetch sandbox preset");
  return res.json();
}

export async function applySandboxPreset(
  id: string
): Promise<PresetApplyResult> {
  const res = await fetch(`${API_BASE}/sandbox/preset/${id}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) throw new Error("Failed to apply sandbox preset");
  return res.json();
}

export async function fetchSecurityLevels(): Promise<{
  levels: SecurityLevel[];
}> {
  const res = await fetch(`${API_BASE}/sandbox/levels`);
  if (!res.ok) throw new Error("Failed to fetch security levels");
  return res.json();
}

export async function fetchCommandCategories(): Promise<{
  categories: CommandCategory[];
}> {
  const res = await fetch(`${API_BASE}/sandbox/commands`);
  if (!res.ok) throw new Error("Failed to fetch command categories");
  return res.json();
}

export async function fetchSecurityOverview(): Promise<SecurityOverview> {
  const res = await fetch(`${API_BASE}/security/overview`);
  if (!res.ok) throw new Error("Failed to fetch security overview");
  return res.json();
}

// Documentation API

export interface DocInfo {
  id: string;
  filename: string;
  title: string;
}

export interface DocContent {
  id: string;
  title: string;
  content: string;
}

export async function fetchDocs(): Promise<{
  docs: DocInfo[];
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/docs`);
  if (!res.ok) throw new Error("Failed to fetch docs list");
  return res.json();
}

export async function fetchDoc(id: string): Promise<DocContent> {
  const res = await fetch(`${API_BASE}/docs/${id}`);
  if (!res.ok) throw new Error("Failed to fetch document");
  return res.json();
}

// Format Schemas (Data Dictionaries) API

export async function fetchFormatSchemas(): Promise<FormatSchemasResult> {
  const res = await fetch(`${API_BASE}/reference/format-schemas`);
  if (!res.ok) throw new Error("Failed to fetch format schemas");
  return res.json();
}

export async function fetchFormatSchema(agent: string): Promise<FormatSchema> {
  const res = await fetch(`${API_BASE}/reference/format-schemas/${agent}`);
  if (!res.ok) throw new Error("Failed to fetch format schema");
  return res.json();
}

// Contributor Settings API

export interface ContributorSettingsData {
  contributor_id: string;
  license: string;
  ai_preference: string;
  rights_statement: string;
  hf_token: string | null;
  hf_dataset?: string;
  updated_at: string;
}

export async function fetchContributorSettings(): Promise<ContributorSettingsData> {
  const res = await fetch(`${API_BASE}/contrib/settings`);
  if (!res.ok) throw new Error("Failed to fetch contributor settings");
  return res.json();
}

export async function saveContributorSettings(settings: {
  contributor_id?: string;
  license?: string;
  ai_preference?: string;
  rights_statement?: string;
  hf_token?: string;
  hf_dataset?: string;
}): Promise<ContributorSettingsData & { success: boolean }> {
  const res = await fetch(`${API_BASE}/contrib/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error("Failed to save contributor settings");
  return res.json();
}

// Redaction Profile API

export interface RedactionProfileData {
  id: string;
  name: string;
  description?: string;
  kept_fields: string[];
  redaction_config: {
    redact_secrets: boolean;
    redact_pii: boolean;
    redact_paths: boolean;
    enable_high_entropy: boolean;
    custom_patterns?: string[];
  };
  is_default?: boolean;
  is_builtin?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfilesData {
  profiles: RedactionProfileData[];
  active_profile_id: string;
}

export async function fetchProfiles(): Promise<ProfilesData> {
  const res = await fetch(`${API_BASE}/contrib/profiles`);
  if (!res.ok) throw new Error("Failed to fetch profiles");
  return res.json();
}

export async function saveProfile(profile: {
  name: string;
  description?: string;
  kept_fields: string[];
  redaction_config?: {
    redact_secrets?: boolean;
    redact_pii?: boolean;
    redact_paths?: boolean;
    enable_high_entropy?: boolean;
    custom_patterns?: string[];
  };
}): Promise<{ success: boolean; profile: RedactionProfileData }> {
  const res = await fetch(`${API_BASE}/contrib/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  });
  if (!res.ok) throw new Error("Failed to save profile");
  return res.json();
}

export async function deleteProfile(
  profileId: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/contrib/profiles/${profileId}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to delete profile");
  }
  return res.json();
}

export async function setActiveProfile(profileId: string): Promise<{
  success: boolean;
  active_profile_id: string;
  profile: RedactionProfileData;
}> {
  const res = await fetch(`${API_BASE}/contrib/profiles/active`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_id: profileId })
  });
  if (!res.ok) throw new Error("Failed to set active profile");
  return res.json();
}

// Contribution History API

export interface ContributionRecord {
  id: string;
  timestamp: string;
  session_count: number;
  total_chars: number;
  destination: string;
  bundle_id: string;
  status: "success" | "failed" | "pending";
  error?: string;
  session_ids?: string[];
}

export interface ContributionHistoryData {
  total_contributions: number;
  successful_contributions: number;
  total_sessions: number;
  total_chars: number;
  first_contribution?: string;
  last_contribution?: string;
  recent: ContributionRecord[];
}

export async function fetchContributionHistory(): Promise<ContributionHistoryData> {
  const res = await fetch(`${API_BASE}/contrib/history`);
  if (!res.ok) throw new Error("Failed to fetch contribution history");
  return res.json();
}

export async function recordContribution(record: {
  session_count: number;
  total_chars: number;
  destination: string;
  bundle_id: string;
  status: "success" | "failed" | "pending";
  error?: string;
  session_ids?: string[];
}): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/contrib/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  });
  if (!res.ok) throw new Error("Failed to record contribution");
  return res.json();
}

// Destinations API

export interface Destination {
  id: string;
  name: string;
  dataset?: string;
  url?: string;
  description: string;
  is_public: boolean;
  requires_token: boolean;
  has_token?: boolean;
}

export interface DestinationsData {
  default: string;
  destinations: Destination[];
}

export async function fetchDestinations(): Promise<DestinationsData> {
  const res = await fetch(`${API_BASE}/contrib/destinations`);
  if (!res.ok) throw new Error("Failed to fetch destinations");
  return res.json();
}

// Hook Enhancements API

export interface HookEnhancementsConfig {
  rules: {
    enabled: boolean;
    rules_file: string | null;
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
    commit_message_prefix: string | null;
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
    block_patterns: string[];
    warn_patterns: string[];
    min_length: number | null;
    max_length: number | null;
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
}

export async function fetchHookEnhancements(): Promise<HookEnhancementsConfig> {
  const res = await fetch(`${API_BASE}/hook-enhancements`);
  if (!res.ok) throw new Error("Failed to fetch hook enhancements config");
  return res.json();
}

export async function updateHookEnhancements(
  updates: Record<string, unknown>
): Promise<{ status: string; updates: string[] }> {
  const res = await fetch(`${API_BASE}/hook-enhancements`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error("Failed to update hook enhancements config");
  return res.json();
}

// Annotation & Heuristic Scoring APIs

import type {
  AgentMetadata,
  AgentMetadataInput,
  AgentRenameEvent,
  AnnotationStats,
  ConversationMetadata,
  ConversationMetadataInput,
  HeuristicScore,
  SessionAnnotation,
  SessionAnnotationData
} from "./types";

export async function fetchAllAnnotations(): Promise<
  Record<string, SessionAnnotation>
> {
  const res = await fetch(`${API_BASE}/annotations`);
  if (!res.ok) throw new Error("Failed to fetch annotations");
  return res.json();
}

export async function fetchAnnotation(
  sessionId: string
): Promise<SessionAnnotationData> {
  const res = await fetch(
    `${API_BASE}/annotations/${encodeURIComponent(sessionId)}`
  );
  if (!res.ok) throw new Error("Failed to fetch annotation");
  return res.json();
}

export async function setAnnotation(
  sessionId: string,
  feedback: "positive" | "negative" | null,
  notes?: string
): Promise<SessionAnnotation> {
  const res = await fetch(
    `${API_BASE}/annotations/${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback, notes })
    }
  );
  if (!res.ok) throw new Error("Failed to set annotation");
  return res.json();
}

export async function deleteAnnotation(
  sessionId: string
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/annotations/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE"
    }
  );
  if (!res.ok) throw new Error("Failed to delete annotation");
  return res.json();
}

export async function fetchAnnotationStats(): Promise<AnnotationStats> {
  const res = await fetch(`${API_BASE}/annotations/stats`);
  if (!res.ok) throw new Error("Failed to fetch annotation stats");
  return res.json();
}

export async function fetchBulkHeuristics(
  sessionIds?: string[]
): Promise<Record<string, HeuristicScore>> {
  const res = await fetch(`${API_BASE}/annotations/heuristics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids: sessionIds })
  });
  if (!res.ok) {
    if (res.status === 404 || res.status === 501) return {};
    throw new Error("Failed to fetch heuristics");
  }
  return res.json();
}

// Process Logs APIs (lightweight sessions data)

import type {
  ConversationsResult,
  ProcessLogFilesResult,
  ProcessLogPrepareResult,
  ProcessLogSummary
} from "./types";

export async function fetchProcessLogSummary(): Promise<ProcessLogSummary> {
  const res = await fetch(`${API_BASE}/contrib/process-logs/summary`);
  if (!res.ok) throw new Error("Failed to fetch process log summary");
  return res.json();
}

export async function fetchProcessLogFiles(): Promise<ProcessLogFilesResult> {
  const res = await fetch(`${API_BASE}/contrib/process-logs/files`);
  if (!res.ok) throw new Error("Failed to fetch process log files");
  return res.json();
}

export async function prepareProcessLogs(options: {
  start_date?: string;
  end_date?: string;
  include_snapshots?: boolean;
  include_events?: boolean;
  redact_paths?: boolean;
  redact_cmdline?: boolean;
}): Promise<ProcessLogPrepareResult> {
  const res = await fetch(`${API_BASE}/contrib/process-logs/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options)
  });
  if (!res.ok) throw new Error("Failed to prepare process logs");
  return res.json();
}

// Conversations APIs (linking hooks + transcripts)

export async function fetchConversations(options?: {
  limit?: number;
  agents?: string[];
  days?: number;
}): Promise<ConversationsResult> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.agents?.length) params.set("agents", options.agents.join(","));
  if (options?.days) params.set("days", String(options.days));

  const url = params.toString()
    ? `${API_BASE}/contrib/correlated?${params}`
    : `${API_BASE}/contrib/correlated`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

// Agent Metadata APIs (Renaming/Annotations)

export async function fetchAllAgentMetadata(): Promise<
  Record<string, AgentMetadata>
> {
  const res = await fetch(`${API_BASE}/agent-metadata`);
  if (!res.ok) throw new Error("Failed to fetch agent metadata");
  return res.json();
}

export async function fetchAgentMetadataById(
  agentId: string
): Promise<AgentMetadata | null> {
  const res = await fetch(
    `${API_BASE}/agent-metadata/${encodeURIComponent(agentId)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch agent metadata");
  return res.json();
}

export async function fetchAgentMetadataByPid(
  pid: number
): Promise<AgentMetadata | null> {
  const res = await fetch(`${API_BASE}/agents/${pid}/metadata`);
  if (!res.ok) throw new Error("Failed to fetch agent metadata");
  const data = await res.json();
  return data.agentId ? data : null;
}

export async function setAgentMetadata(
  label: string,
  exe: string,
  input: AgentMetadataInput
): Promise<AgentMetadata> {
  const res = await fetch(`${API_BASE}/agent-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, exe, ...input })
  });
  if (!res.ok) throw new Error("Failed to set agent metadata");
  return res.json();
}

export async function updateAgentMetadata(
  agentId: string,
  input: AgentMetadataInput
): Promise<AgentMetadata> {
  const res = await fetch(
    `${API_BASE}/agent-metadata/${encodeURIComponent(agentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  );
  if (!res.ok) throw new Error("Failed to update agent metadata");
  return res.json();
}

export async function setAgentMetadataByPid(
  pid: number,
  input: AgentMetadataInput
): Promise<AgentMetadata> {
  const res = await fetch(`${API_BASE}/agents/${pid}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error("Failed to set agent metadata");
  return res.json();
}

export async function deleteAgentMetadata(
  agentId: string
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/agent-metadata/${encodeURIComponent(agentId)}`,
    {
      method: "DELETE"
    }
  );
  if (!res.ok) throw new Error("Failed to delete agent metadata");
  return res.json();
}

export async function searchAgentMetadata(
  query: string
): Promise<AgentMetadata[]> {
  const res = await fetch(
    `${API_BASE}/agent-metadata/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error("Failed to search agent metadata");
  return res.json();
}

export async function fetchAgentRenameHistory(
  agentId?: string
): Promise<AgentRenameEvent[]> {
  const url = agentId
    ? `${API_BASE}/agent-metadata/${encodeURIComponent(agentId)}/history`
    : `${API_BASE}/agent-metadata/history`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch agent rename history");
  return res.json();
}

// =============================================================================
// Conversation Metadata API (Naming)
// =============================================================================

export async function fetchAllConversationMetadata(): Promise<
  Record<string, ConversationMetadata>
> {
  const res = await fetch(`${API_BASE}/conversation-metadata`);
  if (!res.ok) throw new Error("Failed to fetch conversation metadata");
  return res.json();
}

export async function fetchConversationMetadata(
  conversationId: string
): Promise<ConversationMetadata | null> {
  const res = await fetch(
    `${API_BASE}/conversation-metadata/${encodeURIComponent(conversationId)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch conversation metadata");
  return res.json();
}

export async function updateConversationMetadata(
  conversationId: string,
  input: ConversationMetadataInput
): Promise<ConversationMetadata> {
  const res = await fetch(
    `${API_BASE}/conversation-metadata/${encodeURIComponent(conversationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  );
  if (!res.ok) throw new Error("Failed to update conversation metadata");
  return res.json();
}

export async function deleteConversationMetadata(
  conversationId: string
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/conversation-metadata/${encodeURIComponent(conversationId)}`,
    {
      method: "DELETE"
    }
  );
  if (!res.ok) throw new Error("Failed to delete conversation metadata");
  return res.json();
}

// =============================================================================
// Enrichment API
// =============================================================================

export async function fetchEnrichments(): Promise<EnrichmentsListResult> {
  const res = await fetch(`${API_BASE}/enrichments`);
  if (!res.ok) throw new Error("Failed to fetch enrichments");
  return res.json();
}

export async function fetchSessionEnrichments(
  sessionId: string
): Promise<SessionEnrichments> {
  const res = await fetch(
    `${API_BASE}/enrichments/${encodeURIComponent(sessionId)}`
  );
  if (!res.ok) throw new Error("Failed to fetch session enrichments");
  return res.json();
}

export async function setSessionAnnotation(
  sessionId: string,
  feedback: FeedbackType,
  options?: {
    notes?: string;
    userTags?: string[];
    extraData?: Record<string, unknown>;
    rating?: number;
    taskDescription?: string;
    goalAchieved?: boolean;
    workflowStatus?: WorkflowStatus;
  }
): Promise<{
  success: boolean;
  session_ref: SessionEnrichments["session_ref"];
  manual_annotation: SessionEnrichments["manual_annotation"];
}> {
  const res = await fetch(
    `${API_BASE}/enrichments/${encodeURIComponent(sessionId)}/annotation`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback,
        notes: options?.notes,
        user_tags: options?.userTags,
        extra_data: options?.extraData,
        rating: options?.rating,
        task_description: options?.taskDescription,
        goal_achieved: options?.goalAchieved,
        workflow_status: options?.workflowStatus
      })
    }
  );
  if (!res.ok) throw new Error("Failed to set session annotation");
  return res.json();
}

export interface WorkflowStats {
  total: number;
  reviewed: number;
  ready_to_contribute: number;
  skipped: number;
  pending: number;
}

export async function fetchWorkflowStats(): Promise<WorkflowStats> {
  const res = await fetch(`${API_BASE}/enrichments/workflow-stats`);
  if (!res.ok) throw new Error("Failed to fetch workflow stats");
  return res.json();
}

export async function updateSessionTags(
  sessionId: string,
  tags: string[]
): Promise<{
  success: boolean;
  session_ref: SessionEnrichments["session_ref"];
  user_tags: string[];
}> {
  const res = await fetch(
    `${API_BASE}/enrichments/${encodeURIComponent(sessionId)}/tags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags })
    }
  );
  if (!res.ok) throw new Error("Failed to update session tags");
  return res.json();
}

export async function computeEnrichments(
  sessionIds?: string[],
  force?: boolean
): Promise<{
  computed: number;
  skipped: number;
  errors: Array<{ session_id: string; error: string }>;
}> {
  const res = await fetch(`${API_BASE}/enrichments/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids: sessionIds, force })
  });
  if (!res.ok) throw new Error("Failed to compute enrichments");
  return res.json();
}

export async function bulkFetchEnrichments(sessionIds: string[]): Promise<{
  enrichments: Record<string, SessionEnrichments | null>;
  found: number;
  missing: number;
}> {
  const res = await fetch(`${API_BASE}/enrichments/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids: sessionIds })
  });
  if (!res.ok) throw new Error("Failed to bulk fetch enrichments");
  return res.json();
}

export async function deleteSessionEnrichments(
  sessionId: string
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/enrichments/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE"
    }
  );
  if (!res.ok) throw new Error("Failed to delete session enrichments");
  return res.json();
}

export interface AnalyzeTranscriptResult {
  success: boolean;
  transcript_id: string;
  transcript_name: string;
  source: string;
  summary: {
    task_type?: string;
    quality_score?: number;
    quality_classification?: string;
    loops_detected?: boolean;
    tests_passed?: number;
    tests_failed?: number;
  };
}

export async function analyzeTranscript(
  transcriptId: string
): Promise<AnalyzeTranscriptResult> {
  const res = await fetch(`${API_BASE}/enrichments/analyze-transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript_id: transcriptId })
  });
  if (!res.ok) throw new Error("Failed to analyze transcript");
  return res.json();
}

export async function analyzeTranscriptsBulk(
  transcriptIds: string[],
  skipGitDiff = true
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    transcript_id: string;
    success: boolean;
    quality_score?: number;
    task_type?: string;
    error?: string;
  }>;
}> {
  const res = await fetch(`${API_BASE}/enrichments/analyze-transcripts-bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript_ids: transcriptIds,
      skip_git_diff: skipGitDiff
    })
  });
  if (!res.ok) throw new Error("Failed to analyze transcripts");
  return res.json();
}

// Privacy risk analysis
export interface PrivacyRiskAnalysis {
  transcript_id: string;
  risk_level: "low" | "medium" | "high";
  summary: {
    files_read: number;
    files_written: number;
    files_edited: number;
    domains_accessed: number;
    sensitive_files: number;
    total_messages: number;
  };
  files_read: string[];
  files_written: string[];
  files_edited: string[];
  domains_accessed: string[];
  sensitive_files: Array<{ path: string; reason: string }>;
  recommendations: string[];
}

export async function analyzePrivacyRisk(
  transcriptId: string
): Promise<PrivacyRiskAnalysis> {
  const res = await fetch(`${API_BASE}/enrichments/privacy-risk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript_id: transcriptId })
  });
  if (!res.ok) throw new Error("Failed to analyze privacy risk");
  return res.json();
}

// Transcript stats - aggregate view of all local transcripts
export interface TranscriptStats {
  _note: string;
  total_transcripts: number;
  processed_transcripts: number;
  total_size_bytes: number;
  total_size_mb: number;
  summary: {
    file_reads: number;
    file_writes: number;
    file_edits: number;
  };
  sensitive_files: Array<{
    path: string;
    count: number;
    sessions: string[];
    session_count: number;
    reason: string;
  }>;
  sensitive_file_count: number;
  top_files_read: Array<{ path: string; count: number }>;
  by_project: Array<{
    name: string;
    transcripts: number;
    sizeBytes: number;
    fileReads: number;
  }>;
}

export async function fetchTranscriptStats(): Promise<TranscriptStats> {
  const res = await fetch(`${API_BASE}/transcripts/stats`);
  if (!res.ok) throw new Error("Failed to fetch transcript stats");
  return res.json();
}

// =============================================================================
// Analytics API
// =============================================================================

export async function fetchAnalyticsDashboard(
  days?: number
): Promise<AnalyticsDashboard> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/analytics/dashboard${params}`);
  if (!res.ok) throw new Error("Failed to fetch analytics dashboard");
  return res.json();
}

export async function fetchSuccessTrend(
  days?: number
): Promise<SuccessTrendResult> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/analytics/success-trend${params}`);
  if (!res.ok) throw new Error("Failed to fetch success trend");
  return res.json();
}

export async function fetchCostByType(
  days?: number
): Promise<CostByTypeResult> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/analytics/cost-by-type${params}`);
  if (!res.ok) throw new Error("Failed to fetch cost by type");
  return res.json();
}

export async function fetchToolRetries(
  days?: number
): Promise<ToolRetriesResult> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/analytics/tool-retries${params}`);
  if (!res.ok) throw new Error("Failed to fetch tool retries");
  return res.json();
}

export async function fetchQualityDistribution(
  days?: number
): Promise<QualityDistributionResult> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(
    `${API_BASE}/analytics/quality-distribution${params}`
  );
  if (!res.ok) throw new Error("Failed to fetch quality distribution");
  return res.json();
}

export async function fetchQualityConfig(): Promise<QualityConfigResult> {
  const res = await fetch(`${API_BASE}/quality-config`);
  if (!res.ok) throw new Error("Failed to fetch quality config");
  return res.json();
}

export async function fetchLoopsAnalytics(
  days?: number
): Promise<LoopsAnalyticsResult> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/analytics/loops${params}`);
  if (!res.ok) throw new Error("Failed to fetch loops analytics");
  return res.json();
}

/**
 * Fetch all analytics data in a single request.
 * Combines dashboard, success_trend, cost_by_type, tool_retries,
 * quality_distribution, and loops into one response.
 */
export async function fetchAnalyticsCombined(
  days?: number
): Promise<AnalyticsCombinedResult> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/analytics/combined${params}`);
  if (!res.ok) throw new Error("Failed to fetch combined analytics");
  return res.json();
}

// =============================================================================
// Projects API
// =============================================================================

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  const data = await res.json();
  return data.projects;
}

export async function fetchProjectsConfigPath(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/projects/config-path`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.path ?? null;
  } catch {
    return null;
  }
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function createProject(
  project: Omit<Project, "id"> & { id: string }
): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to create project");
  }
  return res.json();
}

export async function updateProject(
  id: string,
  updates: Partial<Omit<Project, "id">>
): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to update project");
  }
  return res.json();
}

export async function deleteProject(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error("Failed to delete project");
  return res.json();
}

export interface InferProjectsResult {
  success: boolean;
  scanned_cwds: number;
  git_repos_found: number;
  new_projects: number;
  projects: Project[];
}

export async function inferProjects(): Promise<InferProjectsResult> {
  const res = await fetch(`${API_BASE}/projects/infer`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to infer projects");
  return res.json();
}

export async function fetchAnalyticsByProject(
  days?: number
): Promise<AnalyticsByProjectResult> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/analytics/by-project${params}`);
  if (!res.ok) throw new Error("Failed to fetch analytics by project");
  return res.json();
}

// Audit Log API

export async function fetchAuditLog(
  options: {
    limit?: number;
    offset?: number;
    category?: string;
    since?: string;
    until?: string;
    includeInferred?: boolean;
  } = {}
): Promise<AuditLogResult> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());
  if (options.category) params.set("category", options.category);
  if (options.since) params.set("since", options.since);
  if (options.until) params.set("until", options.until);
  if (options.includeInferred !== undefined) {
    params.set("include_inferred", options.includeInferred.toString());
  }

  const res = await fetch(`${API_BASE}/audit?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch audit log");
  return res.json();
}

export async function fetchAuditStats(): Promise<AuditStats> {
  const res = await fetch(`${API_BASE}/audit/stats`);
  if (!res.ok) throw new Error("Failed to fetch audit stats");
  return res.json();
}

export async function fetchAuditCategories(): Promise<AuditCategoriesResult> {
  const res = await fetch(`${API_BASE}/audit/categories`);
  if (!res.ok) throw new Error("Failed to fetch audit categories");
  return res.json();
}

export async function fetchAuditRecent(
  limit = 20
): Promise<{ events: AuditEntry[] }> {
  const res = await fetch(`${API_BASE}/audit/recent?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch recent audit events");
  return res.json();
}

export async function fetchAuditEntity(
  entityId: string,
  limit = 50
): Promise<{
  entity_id: string;
  events: AuditEntry[];
  total: number;
}> {
  const res = await fetch(
    `${API_BASE}/audit/entity/${encodeURIComponent(entityId)}?limit=${limit}`
  );
  if (!res.ok) throw new Error("Failed to fetch entity audit history");
  return res.json();
}

export async function fetchDataSources(): Promise<DataSourcesResult> {
  const res = await fetch(`${API_BASE}/audit/data-sources`);
  if (!res.ok) throw new Error("Failed to fetch data sources");
  return res.json();
}

export async function fetchAuditEdgeCases(): Promise<EdgeCasesResult> {
  const res = await fetch(`${API_BASE}/audit/edge-cases`);
  if (!res.ok) throw new Error("Failed to fetch edge cases");
  return res.json();
}

export async function fetchAuditCalculations(): Promise<AuditCalculationsResult> {
  const res = await fetch(`${API_BASE}/audit/calculations`);
  if (!res.ok) throw new Error("Failed to fetch audit calculations");
  return res.json();
}

// =============================================================================
// Hook Stats API (for enhanced analytics)
// =============================================================================

export async function fetchToolStats(): Promise<{ stats: ToolStats[] }> {
  const res = await fetch(`${API_BASE}/hooks/tools/stats`);
  if (!res.ok) throw new Error("Failed to fetch tool stats");
  return res.json();
}

export async function fetchDailyStats(
  days?: number
): Promise<{ days: number; stats: DailyStats[] }> {
  const params = days ? `?days=${days}` : "";
  const res = await fetch(`${API_BASE}/hooks/stats/daily${params}`);
  if (!res.ok) throw new Error("Failed to fetch daily stats");
  return res.json();
}

// =============================================================================
// Managed Sessions API (from `aw run`)
// =============================================================================

import type { ManagedSession } from "./types";

export async function fetchManagedSessions(options?: {
  active?: boolean;
  agent?: string;
  limit?: number;
}): Promise<ManagedSession[]> {
  const params = new URLSearchParams();
  if (options?.active !== undefined)
    params.set("active", String(options.active));
  if (options?.agent) params.set("agent", options.agent);
  if (options?.limit) params.set("limit", String(options.limit));

  const url = params.toString()
    ? `${API_BASE}/managed-sessions?${params}`
    : `${API_BASE}/managed-sessions`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch managed sessions");
  return res.json();
}

// =============================================================================
// Privacy Flags API
// =============================================================================

import type {
  PrivacyFlag,
  PrivacyFlagsResponse,
  PrivacyConcernType
} from "./types";

export async function fetchPrivacyFlags(
  sessionId?: string
): Promise<PrivacyFlagsResponse> {
  const params = sessionId
    ? `?session_id=${encodeURIComponent(sessionId)}`
    : "";
  const res = await fetch(`${API_BASE}/privacy-flags${params}`);
  if (!res.ok) throw new Error("Failed to fetch privacy flags");
  return res.json();
}

export async function createPrivacyFlag(data: {
  sessionId: string;
  messageId: string;
  concernType: PrivacyConcernType;
  notes: string;
  excludeFromExport?: boolean;
  redactFields?: string[];
}): Promise<PrivacyFlag> {
  const res = await fetch(`${API_BASE}/privacy-flags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: data.sessionId,
      message_id: data.messageId,
      concern_type: data.concernType,
      notes: data.notes,
      exclude_from_export: data.excludeFromExport,
      redact_fields: data.redactFields
    })
  });
  if (!res.ok) throw new Error("Failed to create privacy flag");
  return res.json();
}

export async function updatePrivacyFlag(
  flagId: string,
  updates: {
    concernType?: PrivacyConcernType;
    notes?: string;
    excludeFromExport?: boolean;
    redactFields?: string[];
  }
): Promise<PrivacyFlag> {
  const res = await fetch(`${API_BASE}/privacy-flags/${flagId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concern_type: updates.concernType,
      notes: updates.notes,
      exclude_from_export: updates.excludeFromExport,
      redact_fields: updates.redactFields
    })
  });
  if (!res.ok) throw new Error("Failed to update privacy flag");
  return res.json();
}

export async function resolvePrivacyFlag(
  flagId: string,
  notes?: string
): Promise<PrivacyFlag> {
  const res = await fetch(`${API_BASE}/privacy-flags/${flagId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes })
  });
  if (!res.ok) throw new Error("Failed to resolve privacy flag");
  return res.json();
}

export async function deletePrivacyFlag(flagId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/privacy-flags/${flagId}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error("Failed to delete privacy flag");
}
