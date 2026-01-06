import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ContributionHistoryData,
  type DestinationsData,
  type HFCLIAuthStatus,
  type HFOAuthConfig,
  type RedactionConfig,
  type RedactionProfileData,
  type TranscriptStats,
  setAnnotation as apiSetAnnotation,
  checkHFCLIAuth,
  // createGist, // Gist is temporarily disabled
  exportBundle,
  fetchAllAnnotations,
  fetchAnnotationStats,
  fetchBulkHeuristics,
  fetchContributionHistory,
  fetchContributorSettings,
  fetchDestinations,
  fetchEnrichments,
  fetchFieldSchemas,
  fetchLocalTranscript,
  fetchProfiles,
  fetchTranscriptStats,
  fetchProjects,
  getHFOAuthConfig,
  prepareSessions,
  recordContribution,
  saveContributorSettings,
  saveProfile,
  setActiveProfile as apiSetActiveProfile,
  setSessionAnnotation,
  startHFOAuth,
  uploadToHuggingFace,
  useHFCLIToken,
  validateHuggingFaceToken,
  fetchPrivacyFlags,
  deletePrivacyFlag
} from "../api/client";

// Helper to fetch and patch sharing config
const API_BASE = import.meta.env.DEV ? "http://localhost:8420" : "";

async function fetchSharingConfig(): Promise<RedactionConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (!res.ok) throw new Error("Config fetch failed");
    const config = await res.json();
    const rc = config.sharing?.redaction_config;
    if (rc) {
      return {
        redactSecrets: rc.redact_secrets ?? true,
        redactPii: rc.redact_pii ?? true,
        redactPaths: rc.redact_paths ?? true,
        maskCodeBlocks: false, // Not persisted to config (session-specific)
        enableHighEntropy: rc.enable_high_entropy ?? true
      };
    }
  } catch {
    // Fall through to defaults
  }
  return {
    redactSecrets: true,
    redactPii: true,
    redactPaths: true,
    maskCodeBlocks: false,
    enableHighEntropy: true
  };
}

async function patchSharingConfig(config: RedactionConfig): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sharing: {
          redaction_config: {
            redact_secrets: config.redactSecrets,
            redact_pii: config.redactPii,
            redact_paths: config.redactPaths,
            enable_high_entropy: config.enableHighEntropy
          }
        }
      })
    });
  } catch {
    // Silently fail
  }
}
import type {
  AnnotationStats,
  EnrichmentListItem,
  EnrichmentsListResult,
  FieldSchemasResult,
  GistResult,
  HeuristicScore,
  HuggingFaceUploadResult,
  ParsedLocalTranscript,
  PreparationResult,
  PrivacyFlag,
  Project,
  SessionAnnotation,
  ToolUsage
} from "../api/types";
import { useConversations } from "../context/ConversationContext";
import { ChatViewerModal } from "./ChatViewer";
import {
  ChatBubbleView,
  NiceStructuredView,
  RawTerminalDiffView,
  RedactionSummary
} from "./DiffView";
import { FieldTree, type RedactionProfile } from "./FieldTree";

// Built-in redaction profiles (also defined server-side)
// Order: Most permissive → Most restrictive
const BUILTIN_PROFILES: RedactionProfile[] = [
  {
    id: "full-content",
    name: "All (High Risk)",
    description:
      "Includes all fields including file contents Claude read. Only use if you've audited the transcript for sensitive data.",
    keptFields: ["*"]
  },
  {
    id: "moderate",
    name: "Moderate",
    description:
      "General audience default. Keeps tool usage patterns and token metrics, but strips all content.",
    keptFields: [
      "session",
      "session.session_id",
      "session.start_time",
      "session.end_time",
      "session.permission_mode",
      "session.source",
      "session.tool_count",
      "session.tools_used",
      "session.total_input_tokens",
      "session.total_output_tokens",
      "session.estimated_cost_usd",
      "tool_usages",
      "tool_usages[].tool_use_id",
      "tool_usages[].tool_name",
      "tool_usages[].timestamp",
      "tool_usages[].session_id",
      "tool_usages[].success",
      "tool_usages[].duration_ms",
      "messages",
      "messages[].uuid",
      "messages[].role",
      "messages[].timestamp",
      "messages[].parentUuid",
      "messages[].message.role",
      "messages[].message.model",
      "messages[].message.usage",
      "messages[].message.stop_reason",
      "type",
      "total_input_tokens",
      "total_output_tokens"
    ],
    isDefault: true
  },
  {
    id: "metadata-only",
    name: "Minimal (Safest)",
    description:
      "Only session-level statistics. No tool details, no messages, no file contents. Recommended for first-time contributors.",
    keptFields: [
      "session",
      "session.session_id",
      "session.start_time",
      "session.end_time",
      "session.tool_count",
      "session.tools_used",
      "session.total_input_tokens",
      "session.total_output_tokens",
      "session.estimated_cost_usd",
      "total_input_tokens",
      "total_output_tokens"
    ]
  }
];

// Source type display names for grouping
const SOURCE_TYPE_LABELS: Record<string, string> = {
  cc_hook: "Claude Code Hooks",
  cc_transcript: "Claude Code Transcript",
  codex_transcript: "Codex Transcript",
  gemini_transcript: "Gemini Transcript",
  opencode_transcript: "OpenCode Transcript",
  unknown: "Other"
};

// Privacy Flags Section - shows flags for selected sessions
function PrivacyFlagsSection({
  selectedSessionIds
}: {
  selectedSessionIds: string[];
}) {
  const [flags, setFlags] = useState<PrivacyFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Load flags for all selected sessions
  useEffect(() => {
    if (selectedSessionIds.length === 0) {
      setFlags([]);
      return;
    }

    setLoading(true);
    // Fetch flags for all sessions
    Promise.all(selectedSessionIds.map((id) => fetchPrivacyFlags(id)))
      .then((results) => {
        const allFlags = results.flatMap((r) => r.flags);
        setFlags(allFlags);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSessionIds]);

  const handleDelete = async (flagId: string) => {
    try {
      await deletePrivacyFlag(flagId);
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch (e) {
      console.error("Failed to delete flag:", e);
    }
  };

  const excludeCount = flags.filter((f) => f.excludeFromExport).length;
  const concernTypes = [...new Set(flags.map((f) => f.concernType))];

  if (selectedSessionIds.length === 0) {
    return null;
  }

  return (
    <div className="p-3 bg-gray-900/50 rounded">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="text-sm font-medium text-gray-300 flex items-center gap-2">
          🚩 Privacy Flags
          {flags.length > 0 && (
            <span className="px-1.5 py-0.5 bg-red-900/40 text-red-300 text-xs rounded">
              {flags.length}
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {loading ? (
            <div className="text-xs text-gray-500">Loading flags...</div>
          ) : flags.length === 0 ? (
            <div className="text-xs text-gray-500">
              No privacy flags. Use 🚩 in Chat view to flag sensitive content.
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="text-xs text-gray-400 flex flex-wrap gap-2">
                <span>{flags.length} flagged messages</span>
                {excludeCount > 0 && (
                  <span className="text-red-400">
                    ⊖ {excludeCount} to exclude
                  </span>
                )}
                {concernTypes.map((type) => (
                  <span
                    key={type}
                    className="px-1.5 py-0.5 bg-gray-700 rounded"
                  >
                    {type}
                  </span>
                ))}
              </div>

              {/* Flag list */}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {flags.map((flag) => (
                  <div
                    key={flag.id}
                    className="p-2 bg-gray-800/50 rounded text-xs flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span
                          className={`px-1 py-0.5 rounded text-white text-[10px] ${
                            flag.concernType === "pii"
                              ? "bg-red-600"
                              : flag.concernType === "secrets"
                                ? "bg-orange-600"
                                : flag.concernType === "proprietary"
                                  ? "bg-purple-600"
                                  : flag.concernType === "sensitive"
                                    ? "bg-yellow-600"
                                    : "bg-gray-600"
                          }`}
                        >
                          {flag.concernType}
                        </span>
                        {flag.excludeFromExport && (
                          <span className="text-red-400">⊖ exclude</span>
                        )}
                        <span className="text-gray-500 truncate">
                          {flag.sessionId.slice(0, 12)}...
                        </span>
                      </div>
                      {flag.notes && (
                        <p className="text-gray-400 mt-0.5 line-clamp-2">
                          {flag.notes}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(flag.id);
                      }}
                      className="text-gray-500 hover:text-red-400 flex-shrink-0"
                      title="Delete flag"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {excludeCount > 0 && (
                <div className="text-xs text-amber-400 bg-amber-900/20 p-2 rounded">
                  ⚠️ {excludeCount} message(s) marked for exclusion will be
                  omitted from export
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ContribPane({ onNavigateToTab }: ContribPaneProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Research Preview + Safety Warning Banner */}
      <div className="mb-4 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-amber-400 text-lg">&#x26A0;</span>
          <div>
            <div className="text-sm font-medium text-amber-300">
              Research Preview
            </div>
            <p className="text-xs text-amber-200/70 mt-0.5">
              This feature is in active development. Sharing formats and
              destinations may change.
            </p>
          </div>
        </div>
        <div className="text-xs text-amber-200/60 pl-6 border-l-2 border-amber-700/50 ml-2">
          <strong className="text-amber-300">
            Sharing transcripts carries risk.
          </strong>{" "}
          Coding agent transcripts may contain sensitive information including
          API keys, file paths, internal code, and personal data. Review your
          redaction settings and preview carefully before sharing.
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Share</h2>
        <p className="text-sm text-gray-400 mt-1">
          Select sessions, configure redaction, preview, and export.
        </p>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Redacting and stripping fields from chat transcripts can be
          challenging - start with a small test chat first. If you set up these
          rules now, you can re-use them in future. Sandboxing can make it
          easier to have "safe" transcripts.
        </p>
      </div>

      <MyDataSection />

      <UnifiedShareFlow onNavigateToTab={onNavigateToTab} />
    </div>
  );
}

// Unified session for both local and hook sources
interface UnifiedSession {
  id: string;
  source: "local" | "hooks";
  agent: string;
  name: string;
  projectDir: string | null;
  modifiedAt: number;
  messageCount: number | null; // For local transcripts
  toolCount: number | null; // For hook sessions
  sizeBytes: number | null;
  active?: boolean;
  path?: string;
  sessionId?: string; // Hook session ID
  transcriptId?: string; // Local transcript ID
  cwd?: string;
  hasTranscript?: boolean;
  hasHook?: boolean;
  hasManaged?: boolean;
  matchType?: string;
  enrichmentItem?: EnrichmentListItem | null;
}

interface ContribPaneProps {
  onNavigateToTab?: (tab: string) => void;
}

/**
 * My Data section - shows aggregate stats about user's transcripts
 * NOTE: This is a work-in-progress. A comprehensive "contribution flow"
 * document is needed to fully specify the data review/audit experience.
 */
function MyDataSection() {
  const [stats, setStats] = useState<TranscriptStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTranscriptStats();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 p-3 bg-gray-900/50 rounded border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-white">Pre-Share Transcript Scan</div>
        {loading && <span className="text-xs text-gray-400">Scanning...</span>}
      </div>

      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

      {/* Pre-scan explanation */}
      {!stats && !loading && (
        <div className="space-y-3">
          <div className="text-xs text-gray-400">
            Scan your local AI coding transcripts to see what data they contain
            before sharing.
          </div>

          <div className="p-2 bg-gray-800/50 rounded text-xs space-y-1.5">
            <div className="text-gray-300 font-medium">What this does:</div>
            <ul className="text-gray-400 space-y-1 ml-3 list-disc">
              <li>Reads transcripts locally (nothing leaves your computer)</li>
              <li>Counts files, tokens, and messages across sessions</li>
              <li>Detects sensitive files (.env, keys, credentials)</li>
            </ul>
          </div>

          <div className="p-2 bg-gray-800/50 rounded text-xs space-y-1.5">
            <div className="text-gray-300 font-medium">Scanned locations:</div>
            <div className="text-gray-400 font-mono space-y-0.5">
              <div>~/.claude/projects/*/</div>
              <div>~/.codex/sessions/</div>
              <div>~/.gemini/sessions/</div>
            </div>
          </div>

          <button
            onClick={loadStats}
            className="w-full text-xs px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
          >
            Scan Transcripts
          </button>
        </div>
      )}

      {stats && (
        <div className="space-y-3">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="p-2 bg-gray-800 rounded">
              <div className="text-gray-400">Transcripts</div>
              <div className="text-white font-medium">
                {stats.total_transcripts.toLocaleString()}
              </div>
            </div>
            <div className="p-2 bg-gray-800 rounded">
              <div className="text-gray-400">Total Size</div>
              <div className="text-white font-medium">
                {stats.total_size_mb} MB
              </div>
            </div>
            <div className="p-2 bg-gray-800 rounded">
              <div className="text-gray-400">File Reads</div>
              <div className="text-white font-medium">
                {stats.summary.file_reads.toLocaleString()}
              </div>
            </div>
            <div className="p-2 bg-gray-800 rounded">
              <div className="text-gray-400">Sensitive</div>
              <div
                className={`font-medium ${stats.sensitive_file_count > 0 ? "text-red-400" : "text-green-400"}`}
              >
                {stats.sensitive_file_count}
              </div>
            </div>
          </div>

          {/* Sensitive files warning */}
          {stats.sensitive_files.length > 0 && (
            <div className="p-2 bg-red-900/30 border border-red-700/50 rounded">
              <div className="text-xs text-red-400 font-medium mb-1">
                Sensitive Files in Transcripts
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.sensitive_files
                  .slice(0, expanded ? undefined : 5)
                  .map((sf, i) => (
                    <div key={i} className="text-xs flex justify-between">
                      <span className="text-red-300 font-mono truncate flex-1">
                        {sf.path}
                      </span>
                      <span className="text-red-400/70 ml-2 whitespace-nowrap">
                        {sf.count}x in {sf.session_count} session(s)
                      </span>
                    </div>
                  ))}
              </div>
              {stats.sensitive_files.length > 5 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-red-400 hover:text-red-300 mt-1"
                >
                  {expanded
                    ? "Show less"
                    : `Show all ${stats.sensitive_files.length}`}
                </button>
              )}
              <div className="text-xs text-red-400/60 mt-2 italic">
                These file contents are stored in your transcripts. Use "Minimal
                (Safest)" profile or exclude these sessions.
              </div>
            </div>
          )}

          {/* WIP note */}
          <div className="text-[10px] text-gray-500 italic">
            Work in progress. Processed {stats.processed_transcripts} of{" "}
            {stats.total_transcripts} transcripts. Comprehensive contribution
            flow documentation coming soon.
          </div>
        </div>
      )}
    </div>
  );
}

function UnifiedShareFlow({ onNavigateToTab }: ContribPaneProps) {
  // Use shared conversation context
  const {
    conversations,
    conversationStats,
    loading,
    error: contextError,
    transcriptDays,
    refreshConversations,
    setSelectedConversationId,
    setReturnTo
  } = useConversations();

  // Local error state for ContribPane-specific operations (export, upload, etc.)
  const [localError, setError] = useState<string | null>(null);
  const error = localError || contextError;

  // Selection state (persisted to localStorage)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("agentwatch-share-selectedIds");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  type SourceFilter = "all" | "has_transcript" | "has_hooks" | "matched_only";
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [projects, setProjects] = useState<Project[]>([]);
  // Search and advanced filters
  const [searchQuery, setSearchQuery] = useState("");
  const [annotatedOnly, setAnnotatedOnly] = useState(false);
  type WorkflowFilter =
    | "all"
    | "pending"
    | "reviewed"
    | "ready_to_contribute"
    | "skipped";
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("all");
  // Enrichments state for workflow status filtering
  const [enrichmentsList, setEnrichmentsList] =
    useState<EnrichmentsListResult | null>(null);
  type SortOption = "newest" | "oldest" | "smallest" | "largest";
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Chat viewer state
  const [selectedTranscript, setSelectedTranscript] =
    useState<ParsedLocalTranscript | null>(null);
  const [_loadingTranscript, setLoadingTranscript] = useState<string | null>(
    null
  );

  // Hook session viewer state
  const [selectedHookSession, setSelectedHookSession] = useState<{
    sessionId: string;
    timeline: ToolUsage[];
  } | null>(null);
  const [_loadingHookSession, setLoadingHookSession] = useState<string | null>(
    null
  );

  // Configuration state (redaction config loaded from config API)
  const redactionConfigLoaded = useRef(false);
  const [, setFieldSchemas] = useState<FieldSchemasResult | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [, setFieldsPresent] = useState<Set<string>>(new Set());
  const [redactionConfig, setRedactionConfig] = useState<RedactionConfig>({
    redactSecrets: true,
    redactPii: true,
    redactPaths: true,
    maskCodeBlocks: false,
    enableHighEntropy: true
  });

  // Load redaction config from API on mount, migrate localStorage if needed
  useEffect(() => {
    (async () => {
      const apiConfig = await fetchSharingConfig();

      // Migration: check if localStorage has values
      const localConfig = localStorage.getItem(
        "agentwatch-share-redactionConfig"
      );
      let config = apiConfig;

      if (localConfig) {
        try {
          const parsed = JSON.parse(localConfig);
          // If localStorage has custom values, migrate them to config
          config = {
            ...apiConfig,
            ...parsed,
            maskCodeBlocks: parsed.maskCodeBlocks ?? false // session-specific, keep but don't persist
          };
          // Save to config API (without maskCodeBlocks which is session-specific)
          await patchSharingConfig(config);
          // Clear localStorage after migration
          localStorage.removeItem("agentwatch-share-redactionConfig");
        } catch {
          /* ignore parse errors */
        }
      }

      setRedactionConfig(config);
      redactionConfigLoaded.current = true;
    })();
  }, []);

  // Map category names to config keys for toggle functionality
  const categoryToConfigKey: Record<string, keyof RedactionConfig> = {
    secrets: "redactSecrets",
    credentials: "redactSecrets",
    pii: "redactPii",
    network: "redactPii",
    paths: "redactPaths",
    high_entropy: "enableHighEntropy"
  };

  // Get list of currently enabled redaction categories
  const enabledCategories = useMemo(() => {
    const cats: string[] = [];
    if (redactionConfig.redactSecrets) cats.push("secrets", "credentials");
    if (redactionConfig.redactPii) cats.push("pii", "network");
    if (redactionConfig.redactPaths) cats.push("paths");
    if (redactionConfig.enableHighEntropy) cats.push("high_entropy");
    return cats;
  }, [redactionConfig]);

  // Toggle a redaction category on/off
  const handleToggleRedaction = useCallback((category: string) => {
    const configKey = categoryToConfigKey[category];
    if (configKey) {
      setRedactionConfig((prev) => ({
        ...prev,
        [configKey]: !prev[configKey]
      }));
    }
  }, []);

  // Contributor state (persisted to server)
  const [contributorId, setContributorId] = useState("");
  const [license, setLicense] = useState("CC-BY-4.0");
  const [aiPreference, setAiPreference] = useState("train-genai=ok");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Destinations state (for future use in destination selector)
  const [, setDestinations] = useState<DestinationsData | null>(null);

  // Contribution history
  const [contributionHistory, setContributionHistory] =
    useState<ContributionHistoryData | null>(null);

  // Live preview state
  const [livePreview, setLivePreview] = useState<PreparationResult | null>(
    null
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  // Delayed loading indicator to avoid flash for fast updates
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only show loading indicator after 300ms delay to avoid flash
  useEffect(() => {
    if (previewLoading) {
      loadingTimeoutRef.current = setTimeout(() => {
        setShowLoadingIndicator(true);
      }, 300);
    } else {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setShowLoadingIndicator(false);
    }
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [previewLoading]);
  const [previewSessionIndex, setPreviewSessionIndex] = useState(0);
  // Preview state for hooks vs chat data types
  type PreviewDataType = "hooks" | "chat";
  type PreviewViewFormat = "chat" | "structured" | "raw";
  const [previewDataType, setPreviewDataType] =
    useState<PreviewDataType>("hooks");
  const [previewViewFormat, setPreviewViewFormat] =
    useState<PreviewViewFormat>("chat");
  const [showOriginal, setShowOriginal] = useState(false);

  // Export state
  const [exportLoading, setExportLoading] = useState<
    "bundle" | "gist" | "huggingface" | null
  >(null);
  const [bundleDownloaded, setBundleDownloaded] = useState(false);
  // Gist is temporarily disabled - keeping state for future use
  const [_gistResult, _setGistResult] = useState<GistResult | null>(null);
  const [hfResult, setHfResult] = useState<HuggingFaceUploadResult | null>(
    null
  );

  // HuggingFace config (persisted to server)
  const [hfToken, setHfToken] = useState("");
  const [hfTokenSaved, setHfTokenSaved] = useState(false);
  const [hfRepoId, setHfRepoId] = useState("");
  const [hfCreatePr, setHfCreatePr] = useState(true);
  const [hfUsername, setHfUsername] = useState<string | null>(null);

  // HuggingFace CLI auth state
  const [hfCliAuth, setHfCliAuth] = useState<HFCLIAuthStatus | null>(null);
  const [hfCliChecking, setHfCliChecking] = useState(false);

  // HuggingFace OAuth state
  const [hfOAuthConfig, setHfOAuthConfig] = useState<HFOAuthConfig | null>(
    null
  );
  const [hfOAuthLoading, setHfOAuthLoading] = useState(false);

  // Preference wizard state
  const [showPreferenceWizard, setShowPreferenceWizard] = useState(false);

  // Gist config - temporarily disabled
  const [_gistToken, _setGistToken] = useState("");

  // UI state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["analytics", "sessions"])
  );

  // Annotations & heuristics state
  const [annotations, setAnnotations] = useState<
    Record<string, SessionAnnotation>
  >({});
  const [_annotationStats, setAnnotationStats] =
    useState<AnnotationStats | null>(null);
  const [heuristics, setHeuristics] = useState<Record<string, HeuristicScore>>(
    {}
  );
  const [annotationLoading, setAnnotationLoading] = useState<string | null>(
    null
  );

  // Redaction profile state (loaded from server)
  const [activeProfileId, setActiveProfileId] = useState<string>("moderate");
  const [userProfiles, setUserProfiles] = useState<RedactionProfile[]>([]);
  // Server profiles - used for loading active profile config
  const [, setServerProfiles] = useState<RedactionProfileData[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Persist selected IDs to localStorage
  useEffect(() => {
    localStorage.setItem(
      "agentwatch-share-selectedIds",
      JSON.stringify([...selectedIds])
    );
  }, [selectedIds]);

  // Persist redaction config to config API
  useEffect(() => {
    if (!redactionConfigLoaded.current) return; // Don't save until initial load complete
    patchSharingConfig(redactionConfig);
  }, [redactionConfig]);

  // Data is now loaded from ConversationContext

  // Apply profile fields
  const applyProfile = useCallback(
    (profileId: string) => {
      const allProfiles = [...BUILTIN_PROFILES, ...userProfiles];
      const profile = allProfiles.find((p) => p.id === profileId);
      if (!profile) return;

      setActiveProfileId(profileId);
      setUserModifiedFields(true);

      // Special case: "*" means select all discovered fields
      if (profile.keptFields.includes("*") && livePreview?.fields_by_source) {
        const allFields = new Set<string>();
        for (const fields of Object.values(livePreview.fields_by_source)) {
          for (const f of fields) allFields.add(f);
        }
        setSelectedFields(allFields);
      } else {
        // Apply the profile's kept fields
        // Also include any discovered fields that match the profile patterns
        const keptSet = new Set(profile.keptFields);

        if (livePreview?.fields_by_source) {
          // Start with profile fields
          const newSelected = new Set<string>();
          for (const fields of Object.values(livePreview.fields_by_source)) {
            for (const field of fields) {
              // Check if field is in profile or starts with a profile field
              if (keptSet.has(field)) {
                newSelected.add(field);
              } else {
                // Check prefix match (e.g., "session" matches "session.foo")
                for (const kept of profile.keptFields) {
                  const normalizedKept = kept.replace(/\[\]/g, "");
                  const normalizedField = field.replace(/\[\]/g, "");
                  if (
                    normalizedField === normalizedKept ||
                    normalizedField.startsWith(normalizedKept + ".")
                  ) {
                    newSelected.add(field);
                    break;
                  }
                }
              }
            }
          }
          setSelectedFields(newSelected);
        } else {
          setSelectedFields(keptSet);
        }
      }
    },
    [livePreview, userProfiles]
  );

  // Load annotations and heuristics on mount
  useEffect(() => {
    loadAnnotationsAndHeuristics();
  }, []);

  // Load projects for filtering
  useEffect(() => {
    fetchProjects()
      .then((data) => setProjects(data))
      .catch(() => setProjects([]));
  }, []);

  const loadAnnotationsAndHeuristics = async () => {
    try {
      const [annotationsData, statsData, enrichmentsData] = await Promise.all([
        fetchAllAnnotations(),
        fetchAnnotationStats(),
        fetchEnrichments()
      ]);
      setAnnotations(annotationsData);
      setAnnotationStats(statsData);
      setEnrichmentsList(enrichmentsData);
    } catch (e) {
      console.error("Failed to load annotations:", e);
    }

    try {
      const heuristicsData = await fetchBulkHeuristics();
      setHeuristics(heuristicsData);
    } catch (e) {
      console.warn("Failed to load heuristics:", e);
      setHeuristics({});
    }
  };

  const handleSetAnnotation = async (
    sessionId: string,
    feedback: "positive" | "negative" | null
  ) => {
    setAnnotationLoading(sessionId);
    try {
      const annotation = await apiSetAnnotation(sessionId, feedback);
      setAnnotations((prev) => ({ ...prev, [sessionId]: annotation }));
      // Refresh stats
      const stats = await fetchAnnotationStats();
      setAnnotationStats(stats);
    } catch (e) {
      console.error("Failed to set annotation:", e);
    } finally {
      setAnnotationLoading(null);
    }
  };

  // Load contributor settings, destinations, profiles, and history on mount
  useEffect(() => {
    // Load saved contributor settings
    fetchContributorSettings()
      .then((settings) => {
        setContributorId(settings.contributor_id || "");
        setLicense(settings.license || "CC-BY-4.0");
        setAiPreference(settings.ai_preference || "train-genai=ok");
        setHfRepoId(settings.hf_dataset || "");
        setHfTokenSaved(settings.hf_token === "***saved***");
        setSettingsLoaded(true);
      })
      .catch(console.error);

    // Load redaction profiles
    fetchProfiles()
      .then((data) => {
        setServerProfiles(data.profiles);
        setActiveProfileId(data.active_profile_id);
        // Convert server profiles to frontend format for user profiles
        const userDefined = data.profiles
          .filter((p) => !p.is_builtin)
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            keptFields: p.kept_fields,
            isDefault: p.is_default
          }));
        setUserProfiles(userDefined);
        // Apply active profile's redaction config
        const activeProfile = data.profiles.find(
          (p) => p.id === data.active_profile_id
        );
        if (activeProfile) {
          setRedactionConfig({
            redactSecrets: activeProfile.redaction_config.redact_secrets,
            redactPii: activeProfile.redaction_config.redact_pii,
            redactPaths: activeProfile.redaction_config.redact_paths,
            maskCodeBlocks: false,
            enableHighEntropy:
              activeProfile.redaction_config.enable_high_entropy
          });
        }
        setProfilesLoaded(true);
      })
      .catch(console.error);

    // Load destinations
    fetchDestinations().then(setDestinations).catch(console.error);

    // Load contribution history
    fetchContributionHistory()
      .then(setContributionHistory)
      .catch(console.error);

    // Check HuggingFace CLI auth status
    checkHFCLIAuth()
      .then((status) => {
        setHfCliAuth(status);
        if (status.authenticated && status.username) {
          setHfUsername(status.username);
          // hfUsername effect will handle setting contributorId
        }
      })
      .catch(console.error);

    // Check HuggingFace OAuth config
    getHFOAuthConfig().then(setHfOAuthConfig).catch(console.error);
  }, []);

  // Listen for OAuth success message from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "hf-oauth-success") {
        setHfUsername(event.data.username);
        setHfTokenSaved(true);
        // Default contributor ID to HF username when empty
        if (!contributorId && event.data.username) {
          setContributorId(event.data.username);
          saveSettingsDebounced({ contributor_id: event.data.username });
        }
        // Refresh settings to get the new token status
        fetchContributorSettings()
          .then((settings) => {
            setHfTokenSaved(settings.hf_token === "***saved***");
          })
          .catch(console.error);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [contributorId]);

  // Default contributor ID to HF username if available and contributor ID is empty
  useEffect(() => {
    if (!contributorId && hfUsername) {
      setContributorId(hfUsername);
      saveSettingsDebounced({ contributor_id: hfUsername });
    }
  }, [hfUsername, contributorId]);

  // Track if user has manually modified field selection
  const [userModifiedFields, setUserModifiedFields] = useState(false);

  // Load field schemas
  useEffect(() => {
    fetchFieldSchemas()
      .then((schemas) => {
        setFieldSchemas(schemas);
        // Only set default if user hasn't modified
        if (!userModifiedFields) {
          setSelectedFields(new Set(schemas.default_selected));
        }
      })
      .catch(console.error);
  }, [userModifiedFields]);

  // When we get new fields_by_source, apply the active profile
  // This ensures we use moderate defaults (not all fields) by default
  useEffect(() => {
    if (livePreview?.fields_by_source && !userModifiedFields) {
      // Find the active profile (default to moderate)
      const allProfiles = [...BUILTIN_PROFILES, ...userProfiles];
      const profile =
        allProfiles.find((p) => p.id === activeProfileId) ||
        BUILTIN_PROFILES[0];

      // Apply the profile's kept fields
      if (profile.keptFields.includes("*")) {
        // Full content: select all
        const allFields = new Set<string>();
        for (const fields of Object.values(livePreview.fields_by_source)) {
          for (const f of fields) allFields.add(f);
        }
        setSelectedFields(allFields);
      } else {
        // Filter to profile fields
        const keptSet = new Set(profile.keptFields);
        const newSelected = new Set<string>();

        for (const fields of Object.values(livePreview.fields_by_source)) {
          for (const field of fields) {
            // Check exact match or prefix match
            if (keptSet.has(field)) {
              newSelected.add(field);
            } else {
              for (const kept of profile.keptFields) {
                const normalizedKept = kept.replace(/\[\]/g, "");
                const normalizedField = field.replace(/\[\]/g, "");
                if (
                  normalizedField === normalizedKept ||
                  normalizedField.startsWith(normalizedKept + ".")
                ) {
                  newSelected.add(field);
                  break;
                }
              }
            }
          }
        }
        setSelectedFields(newSelected);
      }
    }
  }, [
    livePreview?.fields_by_source,
    userModifiedFields,
    activeProfileId,
    userProfiles
  ]);

  // Live preview: update when selection or config changes
  useEffect(() => {
    const correlationIds = Array.from(selectedIds);

    if (correlationIds.length === 0) {
      setLivePreview(null);
      return;
    }

    // Debounce the preview update
    const timeout = setTimeout(() => {
      updateLivePreview(correlationIds);
    }, 500);

    return () => clearTimeout(timeout);
  }, [
    selectedIds,
    redactionConfig,
    selectedFields,
    contributorId,
    license,
    aiPreference
  ]);

  const updateLivePreview = async (correlationIds: string[]) => {
    setPreviewLoading(true);
    try {
      // Pass undefined if selectedFields is empty so server uses defaults
      // This prevents stripping all fields before schemas load
      const fieldsToSend =
        selectedFields.size > 0 ? Array.from(selectedFields) : undefined;
      const result = await prepareSessions(
        correlationIds,
        redactionConfig,
        fieldsToSend,
        {
          contributor_id: contributorId || "anonymous",
          license,
          ai_preference: aiPreference,
          rights_confirmed: true,
          reviewed_confirmed: true
        }
      );
      setLivePreview(result);
      // Update fields present for filtering
      if (result.fields_present) {
        setFieldsPresent(new Set(result.fields_present));
      }
      // Reset to first session if current index is out of bounds
      if (previewSessionIndex >= result.sessions.length) {
        setPreviewSessionIndex(0);
      }
    } catch {
      // Don't show error for preview failures, just clear preview
      setLivePreview(null);
      setFieldsPresent(new Set());
    } finally {
      setPreviewLoading(false);
    }
  };

  // Use context's refresh function
  const refresh = refreshConversations;

  // Create enrichments map for quick lookup
  const enrichmentsMap = useMemo(() => {
    const map = new Map<string, EnrichmentListItem>();
    if (enrichmentsList) {
      for (const item of enrichmentsList.sessions) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [enrichmentsList]);

  // Convert conversations to unified format for display
  const allSessions = useMemo(() => {
    const sessions: UnifiedSession[] = conversations.map((conv) => {
      // Determine source based on what data is available
      const hasHook = !!conv.hook_session;
      const hasTranscript = !!conv.transcript;
      const hasManaged = !!conv.managed_session;
      const source: "local" | "hooks" = hasTranscript ? "local" : "hooks";

      // Find enrichment for this session
      const enrichmentItem =
        enrichmentsMap.get(conv.correlation_id) ||
        enrichmentsMap.get(`corr:${conv.hook_session?.session_id}`) ||
        enrichmentsMap.get(conv.hook_session?.session_id || "") ||
        null;

      return {
        id: conv.correlation_id,
        source,
        agent: conv.agent,
        name:
          conv.transcript?.name ||
          conv.cwd?.split("/").pop() ||
          conv.correlation_id.slice(0, 8),
        projectDir: conv.cwd || conv.transcript?.project_dir || "",
        modifiedAt: conv.start_time,
        messageCount: conv.transcript?.message_count ?? null,
        toolCount: conv.tool_count,
        sizeBytes: conv.transcript?.size_bytes ?? null,
        path: conv.transcript?.path,
        sessionId: conv.hook_session?.session_id,
        transcriptId: conv.transcript?.id,
        cwd: conv.cwd ?? undefined,
        // Source availability
        matchType: conv.match_type,
        hasHook,
        hasTranscript,
        hasManaged,
        enrichmentItem
      };
    });

    let filtered = sessions;

    // Apply source availability filters
    if (sourceFilter === "has_transcript") {
      filtered = filtered.filter((s) => s.hasTranscript);
    } else if (sourceFilter === "has_hooks") {
      filtered = filtered.filter((s) => s.hasHook);
    } else if (sourceFilter === "matched_only") {
      filtered = filtered.filter(
        (s) => s.matchType === "exact" || s.matchType === "confident"
      );
    }
    if (agentFilter !== "all") {
      filtered = filtered.filter((s) => s.agent === agentFilter);
    }

    // Project filter
    if (projectFilter !== "all") {
      const selectedProject = projects.find((p) => p.id === projectFilter);
      if (selectedProject) {
        filtered = filtered.filter((s) => {
          const cwd = s.projectDir || s.cwd || "";
          return selectedProject.paths.some(
            (path) => cwd === path || cwd.startsWith(path + "/")
          );
        });
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.projectDir?.toLowerCase().includes(query) ||
          s.id.toLowerCase().includes(query) ||
          s.sessionId?.toLowerCase().includes(query)
      );
    }

    // Annotated-only filter
    if (annotatedOnly) {
      filtered = filtered.filter(
        (s) => s.sessionId && annotations[s.sessionId]
      );
    }

    // Workflow status filter
    if (workflowFilter !== "all") {
      filtered = filtered.filter((s) => {
        const status = s.enrichmentItem?.workflow_status || "pending";
        return status === workflowFilter;
      });
    }

    // Sorting
    switch (sortBy) {
      case "oldest":
        filtered.sort((a, b) => a.modifiedAt - b.modifiedAt);
        break;
      case "smallest":
        filtered.sort(
          (a, b) =>
            (a.sizeBytes ?? Number.POSITIVE_INFINITY) -
            (b.sizeBytes ?? Number.POSITIVE_INFINITY)
        );
        break;
      case "largest":
        filtered.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
        break;
      case "newest":
      default:
        filtered.sort((a, b) => b.modifiedAt - a.modifiedAt);
        break;
    }
    return filtered;
  }, [
    conversations,
    enrichmentsMap,
    sourceFilter,
    agentFilter,
    projectFilter,
    projects,
    searchQuery,
    annotatedOnly,
    workflowFilter,
    sortBy,
    annotations
  ]);

  const allAgents = useMemo(() => {
    const agents = new Set(conversations.map((c) => c.agent));
    return ["all", ...Array.from(agents)];
  }, [conversations]);

  // Group sessions by date
  const groupedSessions = useMemo(() => {
    const formatDate = (ts: number) => {
      const date = new Date(ts);
      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    };
    return allSessions.reduce(
      (acc, session) => {
        const date = formatDate(session.modifiedAt);
        if (!acc[date]) acc[date] = [];
        acc[date].push(session);
        return acc;
      },
      {} as Record<string, UnifiedSession[]>
    );
  }, [allSessions]);

  // Compute insights from selected sessions (or all if none selected)
  const insights = useMemo(() => {
    const sessionsToAnalyze =
      selectedIds.size > 0
        ? allSessions.filter((s) => selectedIds.has(s.id))
        : allSessions;

    if (sessionsToAnalyze.length === 0) {
      return null;
    }

    // Basic counts
    const totalSessions = sessionsToAnalyze.length;
    const hookSessions = sessionsToAnalyze.filter(
      (s) => s.source === "hooks"
    ).length;
    const localSessions = sessionsToAnalyze.filter(
      (s) => s.source === "local"
    ).length;

    // Message/tool counts (separate)
    const totalMessages = sessionsToAnalyze.reduce(
      (sum, s) => sum + (s.messageCount || 0),
      0
    );
    const totalToolCalls = sessionsToAnalyze.reduce(
      (sum, s) => sum + (s.toolCount || 0),
      0
    );
    const avgMessagesPerSession =
      localSessions > 0 ? Math.round(totalMessages / localSessions) : 0;
    const avgToolsPerSession =
      hookSessions > 0 ? Math.round(totalToolCalls / hookSessions) : 0;

    // Size stats (local only)
    const localWithSize = sessionsToAnalyze.filter((s) => s.sizeBytes != null);
    const totalSizeBytes = localWithSize.reduce(
      (sum, s) => sum + (s.sizeBytes || 0),
      0
    );

    // Date range
    const timestamps = sessionsToAnalyze
      .map((s) => s.modifiedAt)
      .filter((t) => t > 0);
    const earliestDate = timestamps.length > 0 ? Math.min(...timestamps) : null;
    const latestDate = timestamps.length > 0 ? Math.max(...timestamps) : null;
    const dateRangeDays =
      earliestDate && latestDate
        ? Math.ceil((latestDate - earliestDate) / (1000 * 60 * 60 * 24)) + 1
        : 0;

    // Agent breakdown
    const agentCounts: Record<string, number> = {};
    for (const s of sessionsToAnalyze) {
      agentCounts[s.agent] = (agentCounts[s.agent] || 0) + 1;
    }

    // Project breakdown (top 5)
    const projectCounts: Record<string, number> = {};
    for (const s of sessionsToAnalyze) {
      const project = s.projectDir?.split("/").pop() || s.name || "unknown";
      projectCounts[project] = (projectCounts[project] || 0) + 1;
    }
    const topProjects = Object.entries(projectCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Active sessions
    const activeSessions = sessionsToAnalyze.filter((s) => s.active).length;

    return {
      totalSessions,
      hookSessions,
      localSessions,
      totalMessages,
      totalToolCalls,
      avgMessagesPerSession,
      avgToolsPerSession,
      totalSizeBytes,
      earliestDate,
      latestDate,
      dateRangeDays,
      agentCounts,
      topProjects,
      activeSessions,
      isFiltered: selectedIds.size > 0
    };
  }, [allSessions, selectedIds]);

  // Handlers
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const toggleSession = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(allSessions.map((s) => s.id)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const deselectContributed = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of prev) {
        const session = allSessions.find((s) => s.id === id);
        if (
          session?.enrichmentItem?.workflow_status === "ready_to_contribute"
        ) {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const toggleField = (path: string) => {
    setUserModifiedFields(true); // User is manually modifying fields
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Threat info for fields that have privacy implications
  const getFieldThreatInfo = (path: string): string | null => {
    const threats: Record<string, string> = {
      timestamp: "Reveals when you work (timezone, work hours)",
      sessionId: "Can link multiple contributions to same person",
      uuid: "Can link messages across contributions",
      parentUuid: "Can reconstruct conversation threading",
      "message.model": "Reveals which service tier you use",
      "message.usage": "Reveals conversation complexity and size",
      usage: "Reveals conversation complexity and size",
      version: "Client fingerprinting - can identify specific users",
      requestId: "API-level tracking identifier",
      cwd: "Reveals full local path, often includes username",
      sourcePathHint: "Reveals original file location",
      filePath: "Reveals project directory structure",
      toolUseResult: "May contain local paths and filenames",
      gitBranch: "Reveals project workflow details"
    };
    return threats[path] || null;
  };

  // Save settings to server with debounce
  const saveSettingsDebounced = useMemo(() => {
    let timeout: ReturnType<typeof setTimeout>;
    return (settings: Parameters<typeof saveContributorSettings>[0]) => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        setSettingsSaving(true);
        try {
          await saveContributorSettings(settings);
        } catch (e) {
          console.error("Failed to save settings:", e);
        } finally {
          setSettingsSaving(false);
        }
      }, 1000);
    };
  }, []);

  const handleContributorIdChange = (value: string) => {
    setContributorId(value);
    saveSettingsDebounced({ contributor_id: value });
  };

  const handleLicenseChange = (value: string) => {
    setLicense(value);
    saveSettingsDebounced({ license: value });
  };

  const handleAiPreferenceChange = (value: string) => {
    setAiPreference(value);
    saveSettingsDebounced({ ai_preference: value });
  };

  const handleHfRepoChange = (value: string) => {
    setHfRepoId(value);
    saveSettingsDebounced({ hf_dataset: value });
  };

  const handleHfTokenSave = async () => {
    if (!hfToken) return;
    setSettingsSaving(true);
    try {
      await saveContributorSettings({ hf_token: hfToken });
      setHfTokenSaved(true);
    } catch (e) {
      console.error("Failed to save HF token:", e);
    } finally {
      setSettingsSaving(false);
    }
  };

  // Use HF CLI token (from huggingface-cli login)
  const handleUseHfCliToken = async () => {
    setHfCliChecking(true);
    try {
      const result = await useHFCLIToken();
      if (result.success && result.token) {
        setHfToken(result.token);
        // Also validate to get username
        const validation = await validateHuggingFaceToken(result.token);
        if (validation.valid && validation.username) {
          setHfUsername(validation.username);
        }
      } else {
        setError(result.error || "Failed to get CLI token");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to use CLI token");
    } finally {
      setHfCliChecking(false);
    }
  };

  // Refresh HF CLI auth status
  const handleRefreshHfCliAuth = async () => {
    setHfCliChecking(true);
    try {
      const status = await checkHFCLIAuth();
      setHfCliAuth(status);
      if (status.authenticated && status.username) {
        setHfUsername(status.username);
      }
    } catch (e) {
      console.error("Failed to check HF CLI auth:", e);
    } finally {
      setHfCliChecking(false);
    }
  };

  // Start HuggingFace OAuth flow
  const handleHfOAuthLogin = async () => {
    setHfOAuthLoading(true);
    try {
      const result = await startHFOAuth();
      if (result.success && result.url) {
        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
          result.url,
          "hf-oauth",
          `width=${width},height=${height},left=${left},top=${top}`
        );

        // Poll for completion in case postMessage fails
        if (popup) {
          const pollInterval = setInterval(async () => {
            try {
              // Check if popup is closed
              if (popup.closed) {
                clearInterval(pollInterval);
                setHfOAuthLoading(false);
                // Refresh settings to see if login succeeded
                const settings = await fetchContributorSettings();
                if (settings.hf_token === "***saved***") {
                  setHfTokenSaved(true);
                  // Try to get username from settings or fetch it
                  if (settings.contributor_id) {
                    setHfUsername(settings.contributor_id);
                  }
                }
              }
            } catch {
              clearInterval(pollInterval);
              setHfOAuthLoading(false);
            }
          }, 500);

          // Clear interval after 5 minutes max
          setTimeout(
            () => {
              clearInterval(pollInterval);
              setHfOAuthLoading(false);
            },
            5 * 60 * 1000
          );
        }
      } else {
        setError(result.error || "Failed to start OAuth");
        setHfOAuthLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
      setHfOAuthLoading(false);
    }
  };

  // Re-login / disconnect from HuggingFace
  const handleHfDisconnect = async () => {
    setHfTokenSaved(false);
    setHfUsername(null);
    setHfToken("");
    // Clear saved token
    await saveContributorSettings({
      contributor_id: contributorId,
      license,
      ai_preference: aiPreference,
      hf_dataset: hfRepoId,
      hf_token: "" // Clear the token
    });
  };

  // Navigate to Conversations tab to view a conversation
  const navigateToConversation = (correlationId: string) => {
    setSelectedConversationId(correlationId);
    setReturnTo({ tab: "share" });
    if (onNavigateToTab) {
      onNavigateToTab("conversations");
    }
  };

  // View transcript (legacy - kept for modal viewing)
  // @ts-expect-error - Kept for modal viewing feature, currently unused
  const _viewSession = async (session: UnifiedSession) => {
    if (session.source === "local" && session.transcriptId) {
      setLoadingTranscript(session.id);
      try {
        const transcript = await fetchLocalTranscript(
          session.transcriptId,
          "chat"
        );
        setSelectedTranscript(transcript);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load transcript");
      } finally {
        setLoadingTranscript(null);
      }
    }
  };

  // View hook session timeline
  // @ts-expect-error - Kept for modal viewing feature, currently unused
  const _viewHookSession = async (sessionId: string) => {
    setLoadingHookSession(sessionId);
    try {
      const res = await fetch(`/api/hooks/sessions/${sessionId}/timeline`);
      if (res.ok) {
        const timeline = await res.json();
        setSelectedHookSession({ sessionId, timeline });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hook session");
    } finally {
      setLoadingHookSession(null);
    }
  };

  // Export handlers
  const handleDownloadBundle = async () => {
    if (!livePreview) {
      setError("Select sessions to enable export");
      return;
    }

    setExportLoading("bundle");
    try {
      const correlationIds = Array.from(selectedIds);

      const result = await exportBundle(correlationIds, {
        includeCost: true,
        ...redactionConfig
      });

      // Trigger download
      const blob = new Blob([result.content], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agentwatch-bundle-${result.bundle_id}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      setBundleDownloaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export bundle");
    } finally {
      setExportLoading(null);
    }
  };

  // Gist is temporarily disabled
  void _gistToken;
  void _setGistResult;
  void _gistResult;

  const handleValidateHfToken = async () => {
    if (!hfToken) return;
    const result = await validateHuggingFaceToken(hfToken);
    if (result.valid) {
      setHfUsername(result.username || null);
    } else {
      setError(result.error || "Invalid HuggingFace token");
      setHfUsername(null);
    }
  };

  const handleHuggingFaceUpload = async () => {
    if (!livePreview) {
      setError("Select sessions to enable export");
      return;
    }
    if ((!hfToken && !hfTokenSaved) || !hfRepoId) {
      setError("Please enter HuggingFace token and repository ID");
      return;
    }

    setExportLoading("huggingface");
    setHfResult(null);
    try {
      const correlationIds = Array.from(selectedIds);

      const result = await uploadToHuggingFace(
        correlationIds,
        hfToken,
        hfRepoId,
        {
          createPr: hfCreatePr,
          contributorId,
          license,
          aiPreference
        }
      );
      setHfResult(result);

      if (result.success) {
        // Record the contribution with session IDs
        const totalChars = livePreview.sessions.reduce(
          (sum, s) => sum + (s.approx_chars || 0),
          0
        );
        await recordContribution({
          session_count: livePreview.sessions.length,
          total_chars: totalChars,
          destination: `huggingface:${hfRepoId}`,
          bundle_id: result.bundle_id || "",
          status: "success",
          session_ids: correlationIds
        });

        // Update workflow status for all contributed sessions
        await Promise.all(
          correlationIds.map((id) =>
            setSessionAnnotation(id, null, {
              workflowStatus: "ready_to_contribute"
            }).catch((e) =>
              console.warn(`Failed to update workflow status for ${id}:`, e)
            )
          )
        );

        // Refresh enrichments to show updated workflow status
        fetchEnrichments().then(setEnrichmentsList).catch(console.error);

        // Refresh history
        fetchContributionHistory()
          .then(setContributionHistory)
          .catch(console.error);
      } else {
        setError(result.error || "Upload failed");
        // Record failed contribution
        await recordContribution({
          session_count: livePreview.sessions.length,
          total_chars: 0,
          destination: `huggingface:${hfRepoId}`,
          bundle_id: "",
          status: "failed",
          error: result.error
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload");
    } finally {
      setExportLoading(null);
    }
  };

  // Formatting helpers
  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const selectedCount = selectedIds.size;

  // Count how many selected sessions are already contributed
  const contributedSelectedCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      const session = allSessions.find((s) => s.id === id);
      if (session?.enrichmentItem?.workflow_status === "ready_to_contribute") {
        count++;
      }
    }
    return count;
  }, [selectedIds, allSessions]);

  // Helper functions to detect session data types
  const sessionHasHooks = (jsonData: unknown): boolean => {
    if (!jsonData || typeof jsonData !== "object") return false;
    const obj = jsonData as Record<string, unknown>;
    return Array.isArray(obj.tool_usages) && obj.tool_usages.length > 0;
  };

  const sessionHasTranscript = (jsonData: unknown): boolean => {
    if (!jsonData || typeof jsonData !== "object") return false;
    const obj = jsonData as Record<string, unknown>;
    return Array.isArray(obj.messages) && obj.messages.length > 0;
  };

  const getSessionDataTypes = (
    jsonData: unknown
  ): "hooks" | "chat" | "both" => {
    const hasHooks = sessionHasHooks(jsonData);
    const hasTranscript = sessionHasTranscript(jsonData);
    if (hasHooks && hasTranscript) return "both";
    if (hasHooks) return "hooks";
    if (hasTranscript) return "chat";
    return "hooks"; // Default fallback
  };

  // Get current preview session for diff view
  const currentSession = livePreview?.sessions[previewSessionIndex];

  // Determine what data types the current session has
  const currentSessionDataTypes = useMemo(() => {
    if (!currentSession?.raw_json) return "hooks";
    try {
      const data = JSON.parse(currentSession.raw_json);
      return getSessionDataTypes(data);
    } catch {
      return "hooks";
    }
  }, [currentSession?.raw_json]);

  // Check if current JSON is large enough to warrant a warning (> 50KB)
  const jsonSizeBytes =
    (currentSession?.raw_json_original?.length || 0) +
    (currentSession?.raw_json?.length || 0);
  const isLargeJson = jsonSizeBytes > 50 * 1024;

  return (
    <div className="space-y-4">
      {/* Settings reference note */}
      <div className="text-xs text-gray-500 flex items-center gap-2">
        <span>Data shown based on transcript days setting in</span>
        <button
          onClick={() => {
            const event = new KeyboardEvent("keydown", { key: "9" });
            window.dispatchEvent(event);
          }}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          Settings
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-300 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Conversations Summary with Data Types */}
      <div className="p-4 rounded-lg border-2 border-gray-700 bg-gray-900/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-white">Conversations</div>
            <div className="text-xs text-gray-400">
              Hook sessions + local transcripts from last {transcriptDays} days
            </div>
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-400 animate-pulse">
            Loading conversations...
          </div>
        ) : (
          conversationStats && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs space-y-3">
              {/* Stats row */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-white"></span>
                  <span className="font-medium text-white">
                    {conversationStats.total}
                  </span>
                  <span className="text-gray-400">total</span>
                </span>
                <span
                  className="flex items-center gap-1"
                  title="Sessions with both hook data and transcript matched - best for analysis"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="font-medium text-green-400">
                    {conversationStats.exact}
                  </span>
                  <span className="text-gray-400">matched</span>
                </span>
                <span
                  className="flex items-center gap-1"
                  title="Hook data only (no transcript found) - safer to share, no file contents"
                >
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <span className="font-medium text-yellow-400">
                    {conversationStats.hook_only}
                  </span>
                  <span className="text-gray-500">hook only</span>
                </span>
                <span
                  className="flex items-center gap-1"
                  title="Transcript only (no hook session) - may contain file contents, review carefully"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="font-medium text-blue-400">
                    {conversationStats.transcript_only}
                  </span>
                  <span className="text-gray-500">transcript only</span>
                </span>
              </div>

              {/* Data type legend */}
              <div className="text-[10px] text-gray-500 border-t border-gray-700/50 pt-2">
                <span className="text-green-400">Hooks</span> = tool usage only
                (safer) | <span className="text-blue-400">Transcripts</span> =
                full messages (may contain file contents) |{" "}
                <span className="text-purple-400">Managed</span> = started via
                &apos;aw run&apos;
              </div>
              <div className="text-[10px] text-gray-600">
                Sources: ~/.agentwatch/hooks/, ~/.claude/, ~/.codex/ |{" "}
                <a
                  href="https://github.com/nickmvincent/agentwatch/blob/main/docs/data-sources.md"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Docs
                </a>
              </div>
            </div>
          )
        )}
      </div>

      {/* Step 1: Select Sessions */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("sessions")}
          className="w-full px-4 py-3 bg-gray-700/50 flex items-center justify-between hover:bg-gray-700"
        >
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
              1
            </span>
            <span className="font-medium text-white">Select Sessions</span>
            {selectedCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                {selectedCount} selected
              </span>
            )}
          </div>
          <span className="text-gray-400">
            {expandedSections.has("sessions") ? "▼" : "▶"}
          </span>
        </button>

        {expandedSections.has("sessions") && (
          <div className="p-4 space-y-3">
            {/* Search */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search by name, project, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filters Row 1: Source + Agent */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {(
                    [
                      { value: "all", label: "All" },
                      { value: "has_transcript", label: "Has Transcript" },
                      { value: "has_hooks", label: "Has Hooks" },
                      { value: "matched_only", label: "Matched" }
                    ] as { value: SourceFilter; label: string }[]
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSourceFilter(value)}
                      className={`px-2 py-1 text-xs rounded ${
                        sourceFilter === value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <select
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
                >
                  {allAgents.map((a) => (
                    <option key={a} value={a}>
                      {a === "all" ? "All Agents" : a}
                    </option>
                  ))}
                </select>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="all">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  Select All
                </button>
                <button
                  onClick={selectNone}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  Clear
                </button>
                <button
                  onClick={refresh}
                  disabled={loading}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
                >
                  {loading ? "Loading..." : "Refresh"}
                </button>
              </div>
            </div>

            {/* Filters Row 2: Advanced filters + Sort */}
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={annotatedOnly}
                  onChange={(e) => setAnnotatedOnly(e.target.checked)}
                  className="rounded"
                />
                <span>Annotated only</span>
              </label>
              <div className="flex items-center gap-1.5 text-gray-400">
                <span>Workflow:</span>
                <select
                  value={workflowFilter}
                  onChange={(e) =>
                    setWorkflowFilter(e.target.value as WorkflowFilter)
                  }
                  className="px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="ready_to_contribute">Ready</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <span>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="smallest">Smallest first</option>
                  <option value="largest">Largest first</option>
                </select>
              </div>
              <span className="text-gray-500 ml-auto">
                {allSessions.length} sessions
                {searchQuery && ` matching "${searchQuery}"`}
              </span>
            </div>

            {/* Warning: Already contributed sessions selected */}
            {contributedSelectedCount > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-yellow-300 text-xs">
                <span>
                  {contributedSelectedCount} of {selectedCount} selected session
                  {contributedSelectedCount === 1 ? " was" : "s were"} already
                  contributed
                </span>
                <button
                  onClick={deselectContributed}
                  className="px-2 py-1 bg-yellow-800/50 hover:bg-yellow-700/50 rounded text-yellow-200"
                >
                  Deselect Contributed
                </button>
              </div>
            )}

            {/* Session List */}
            <div className="max-h-64 overflow-y-auto space-y-3">
              {loading && (
                <div className="text-center py-4 text-gray-500">
                  Loading sessions...
                </div>
              )}
              {!loading && allSessions.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  No sessions found
                </div>
              )}
              {!loading &&
                Object.entries(groupedSessions).map(([date, sessions]) => (
                  <div key={date}>
                    <div className="text-xs text-gray-500 mb-1">{date}</div>
                    <div className="space-y-1">
                      {sessions.map((session) => (
                        <div
                          key={session.id}
                          className={`p-2 rounded flex items-center gap-2 cursor-pointer transition-colors ${
                            selectedIds.has(session.id)
                              ? "bg-blue-900/40 border border-blue-600"
                              : "bg-gray-700/30 hover:bg-gray-700/50 border border-transparent"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(session.id)}
                            onChange={() => toggleSession(session.id)}
                            className="rounded"
                          />
                          <div
                            className="flex-1 min-w-0"
                            onClick={() => toggleSession(session.id)}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.5 text-xs rounded ${
                                  session.source === "local"
                                    ? "bg-gray-600"
                                    : "bg-green-900/50 text-green-300"
                                }`}
                                title={
                                  session.source === "local"
                                    ? "Local transcript: Full conversation with messages and tool outputs"
                                    : "Hook data: Tool calls captured in real-time (no message content)"
                                }
                              >
                                {session.source === "local"
                                  ? "Transcript"
                                  : "Hooks"}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 text-xs rounded ${
                                  session.agent === "claude"
                                    ? "bg-purple-900/50 text-purple-300"
                                    : session.agent === "codex"
                                      ? "bg-blue-900/50 text-blue-300"
                                      : session.agent === "gemini"
                                        ? "bg-yellow-900/50 text-yellow-300"
                                        : "bg-gray-600"
                                }`}
                              >
                                {session.agent}
                              </span>
                              {session.active && (
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                              )}
                              <span className="text-sm text-white truncate">
                                {session.name}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                            {session.source === "local" &&
                              session.messageCount != null && (
                                <span title="Transcript messages">
                                  {session.messageCount} msgs
                                </span>
                              )}
                            {session.source === "hooks" &&
                              session.toolCount != null && (
                                <span title="Tool calls captured via hooks">
                                  {session.toolCount} tools
                                </span>
                              )}
                            {session.sizeBytes && (
                              <span
                                title={
                                  session.source === "hooks"
                                    ? "Estimated size of tool data"
                                    : "Transcript file size"
                                }
                              >
                                {formatSize(session.sizeBytes)}
                              </span>
                            )}
                            <span>{formatTime(session.modifiedAt)}</span>
                            {/* Source availability badges */}
                            <div className="flex items-center gap-0.5">
                              {session.hasTranscript && (
                                <span
                                  className="w-2 h-2 rounded-full bg-blue-400"
                                  title="Has transcript"
                                />
                              )}
                              {session.hasHook && (
                                <span
                                  className="w-2 h-2 rounded-full bg-green-400"
                                  title="Has hook session"
                                />
                              )}
                              {session.hasManaged && (
                                <span
                                  className="w-2 h-2 rounded-full bg-purple-400"
                                  title="Has managed session"
                                />
                              )}
                              {session.enrichmentItem?.workflow_status ===
                                "ready_to_contribute" && (
                                <span
                                  className="text-[9px] px-1 py-0.5 rounded bg-green-700 text-green-200"
                                  title="Previously contributed"
                                >
                                  Contributed
                                </span>
                              )}
                            </div>
                            {/* View button - navigates to Conversations tab */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateToConversation(session.id);
                              }}
                              className="px-2 py-0.5 bg-gray-600 rounded hover:bg-gray-500 text-xs"
                              title="View in Conversations tab (your selection is saved)"
                            >
                              View
                            </button>
                            {/* Feedback buttons */}
                            {session.source === "hooks" &&
                              session.sessionId &&
                              (() => {
                                const sessionId = session.sessionId;
                                const annotation = annotations[sessionId];
                                const heuristic = heuristics[sessionId];
                                const isLoading =
                                  annotationLoading === sessionId;
                                return (
                                  <div
                                    className="flex items-center gap-1 ml-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Heuristic indicator */}
                                    {heuristic && (
                                      <span
                                        className={`text-[10px] px-1 py-0.5 rounded ${
                                          heuristic.classification ===
                                          "likely_success"
                                            ? "bg-green-900/50 text-green-400"
                                            : heuristic.classification ===
                                                "likely_failed"
                                              ? "bg-red-900/50 text-red-400"
                                              : "bg-gray-700 text-gray-400"
                                        }`}
                                        title={`Score: ${heuristic.score}/100\nSignals: ${Object.entries(
                                          heuristic.signals
                                        )
                                          .filter(([, v]) => v.value)
                                          .map(([k]) => k)
                                          .join(", ")}`}
                                      >
                                        {heuristic.score}
                                      </span>
                                    )}
                                    {/* Thumbs up/down */}
                                    <button
                                      onClick={() =>
                                        handleSetAnnotation(
                                          sessionId,
                                          annotation?.feedback === "positive"
                                            ? null
                                            : "positive"
                                        )
                                      }
                                      className={`px-1 py-0.5 rounded text-xs ${
                                        annotation?.feedback === "positive"
                                          ? "bg-green-600 text-white"
                                          : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                                      }`}
                                      disabled={isLoading}
                                      title="Mark as successful"
                                    >
                                      {isLoading ? "·" : "👍"}
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleSetAnnotation(
                                          sessionId,
                                          annotation?.feedback === "negative"
                                            ? null
                                            : "negative"
                                        )
                                      }
                                      className={`px-1 py-0.5 rounded text-xs ${
                                        annotation?.feedback === "negative"
                                          ? "bg-red-600 text-white"
                                          : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                                      }`}
                                      disabled={isLoading}
                                      title="Mark as failed"
                                    >
                                      {isLoading ? "·" : "👎"}
                                    </button>
                                  </div>
                                );
                              })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Selection Preview - Summary of what you're about to share */}
      <div className="border border-purple-800/50 rounded-lg overflow-hidden bg-purple-900/10">
        <button
          onClick={() => toggleSection("analytics")}
          className="w-full px-4 py-3 bg-purple-900/30 flex items-center justify-between hover:bg-purple-900/40"
        >
          <div className="flex items-center gap-3">
            <span className="font-medium text-white">Selection Preview</span>
            {insights && (
              <span className="text-xs text-gray-400">
                {insights.isFiltered
                  ? `${insights.totalSessions} selected`
                  : `${insights.totalSessions} total`}
              </span>
            )}
          </div>
          <span className="text-gray-400">
            {expandedSections.has("analytics") ? "▼" : "▶"}
          </span>
        </button>

        {expandedSections.has("analytics") && insights && (
          <div className="p-4 space-y-4">
            {/* Summary Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center">
                <div className="text-2xl font-bold text-white">
                  {insights.totalSessions}
                </div>
                <div className="text-xs text-gray-400">Sessions</div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {insights.totalMessages.toLocaleString()}
                </div>
                <div className="text-xs text-gray-400">Messages</div>
                {insights.avgMessagesPerSession > 0 && (
                  <div className="text-[10px] text-gray-500">
                    ~{insights.avgMessagesPerSession}/session
                  </div>
                )}
              </div>
              <div className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center">
                <div className="text-2xl font-bold text-green-400">
                  {insights.totalToolCalls.toLocaleString()}
                </div>
                <div className="text-xs text-gray-400">Tool Calls</div>
                {insights.avgToolsPerSession > 0 && (
                  <div className="text-[10px] text-gray-500">
                    ~{insights.avgToolsPerSession}/session
                  </div>
                )}
              </div>
              <div className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center">
                <div className="text-2xl font-bold text-white">
                  {insights.dateRangeDays}
                </div>
                <div className="text-xs text-gray-400">Days Span</div>
              </div>
              <div
                className="p-3 bg-gray-800/50 rounded border border-gray-700 text-center cursor-help"
                title="Quality score (0-100): Based on task completion, code quality, efficiency, and safety signals."
              >
                <div className="text-2xl font-bold text-gray-500">—</div>
                <div className="text-xs text-gray-400">
                  Avg Score
                  <span className="text-gray-600 ml-1">(?)</span>
                </div>
              </div>
            </div>

            {/* Source & Agent Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
                <div className="text-xs text-gray-400 mb-2">By Source</div>
                <div className="space-y-1">
                  {insights.hookSessions > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span className="text-gray-300">Hook Data</span>
                      </span>
                      <span className="text-white font-medium">
                        {insights.hookSessions}
                      </span>
                    </div>
                  )}
                  {insights.localSessions > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span className="text-gray-300">Local Transcripts</span>
                      </span>
                      <span className="text-white font-medium">
                        {insights.localSessions}
                      </span>
                    </div>
                  )}
                </div>
                {insights.totalSizeBytes > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-500">
                    Total size: {formatSize(insights.totalSizeBytes)}
                  </div>
                )}
              </div>

              <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
                <div className="text-xs text-gray-400 mb-2">By Agent</div>
                <div className="space-y-1">
                  {Object.entries(insights.agentCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([agent, count]) => (
                      <div
                        key={agent}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-300 capitalize">
                          {agent}
                        </span>
                        <span className="text-white font-medium">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Top Projects */}
            {insights.topProjects.length > 0 && (
              <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
                <div className="text-xs text-gray-400 mb-2">Top Projects</div>
                <div className="flex flex-wrap gap-2">
                  {insights.topProjects.map(([project, count]) => (
                    <span
                      key={project}
                      className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300"
                    >
                      {project} <span className="text-gray-500">({count})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Date Range */}
            {insights.earliestDate && insights.latestDate && (
              <div className="text-xs text-gray-500 text-center">
                {new Date(insights.earliestDate).toLocaleDateString()} —{" "}
                {new Date(insights.latestDate).toLocaleDateString()}
                {insights.activeSessions > 0 && (
                  <span className="ml-2 text-green-400">
                    ({insights.activeSessions} active now)
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {expandedSections.has("analytics") && !insights && (
          <div className="p-4 text-center text-gray-500 text-sm">
            No sessions available. Load sessions to see insights.
          </div>
        )}
      </div>

      {/* Step 2: Prepare & Preview - Side-by-side layout */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-700/50 flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
            2
          </span>
          <span className="font-medium text-white">Prepare & Preview</span>
          {showLoadingIndicator && (
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
              updating
            </span>
          )}
          {livePreview && !showLoadingIndicator && (
            <span
              className={`px-2 py-0.5 text-xs rounded ${
                livePreview.redaction_report.blocked
                  ? "bg-red-600"
                  : "bg-green-600"
              } text-white`}
            >
              {livePreview.redaction_report.blocked ? "Blocked" : "Ready"}
            </span>
          )}
        </div>

        <div className="p-4">
          {selectedCount === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">
              Select sessions above to configure redaction and preview changes
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {/* Left Column: Config Panel */}
              <div className="col-span-1 space-y-4">
                {/* Redaction Settings */}
                <div className="p-3 bg-gray-900/50 rounded">
                  <div className="text-sm font-medium text-gray-300 mb-2">
                    Redaction
                  </div>
                  <div className="space-y-2 text-xs">
                    {[
                      {
                        key: "redactSecrets",
                        label: "Secrets",
                        desc: "API keys, tokens"
                      },
                      {
                        key: "redactPii",
                        label: "PII",
                        desc: "emails, phones"
                      },
                      {
                        key: "redactPaths",
                        label: "Paths",
                        desc: "file paths"
                      },
                      {
                        key: "enableHighEntropy",
                        label: "High-entropy",
                        desc: "random strings"
                      }
                    ].map(({ key, label, desc }) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 text-gray-300 hover:text-white cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={
                            redactionConfig[
                              key as keyof RedactionConfig
                            ] as boolean
                          }
                          onChange={(e) =>
                            setRedactionConfig({
                              ...redactionConfig,
                              [key]: e.target.checked
                            })
                          }
                          className="rounded"
                        />
                        <span>{label}</span>
                        <span className="text-gray-500">({desc})</span>
                      </label>
                    ))}
                  </div>
                  {/* Custom patterns */}
                  <div className="mt-3 pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">
                      Custom patterns (regex or text)
                    </div>
                    <div className="flex gap-1 mb-2">
                      <input
                        type="text"
                        placeholder="Enter regex or text to redact..."
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            e.currentTarget.value.trim()
                          ) {
                            const newPattern = e.currentTarget.value.trim();
                            const newPatterns = [
                              ...(redactionConfig.customRegex || []),
                              newPattern
                            ];
                            setRedactionConfig({
                              ...redactionConfig,
                              customRegex: newPatterns
                            });
                            e.currentTarget.value = "";
                          }
                        }}
                        className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-xs placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = e.currentTarget
                            .previousElementSibling as HTMLInputElement;
                          if (input?.value.trim()) {
                            const newPattern = input.value.trim();
                            const newPatterns = [
                              ...(redactionConfig.customRegex || []),
                              newPattern
                            ];
                            setRedactionConfig({
                              ...redactionConfig,
                              customRegex: newPatterns
                            });
                            input.value = "";
                          }
                        }}
                        className="px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 text-xs"
                      >
                        Add
                      </button>
                    </div>
                    {redactionConfig.customRegex &&
                      redactionConfig.customRegex.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {redactionConfig.customRegex.map((pattern, idx) => (
                            <span
                              key={idx}
                              className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-900/50 text-orange-300 rounded text-xs group"
                            >
                              <code className="font-mono text-[10px] max-w-[100px] truncate">
                                {pattern}
                              </code>
                              <button
                                onClick={() => {
                                  const newPatterns =
                                    redactionConfig.customRegex?.filter(
                                      (_, i) => i !== idx
                                    );
                                  setRedactionConfig({
                                    ...redactionConfig,
                                    customRegex: newPatterns
                                  });
                                }}
                                className="text-orange-400 hover:text-orange-200 opacity-60 hover:opacity-100"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    <div className="text-[10px] text-gray-500 mt-1">
                      Examples: my-project-name, MyCompany,
                      \b192\.168\.\d+\.\d+\b
                    </div>
                  </div>
                </div>

                {/* Privacy Flags Section */}
                <PrivacyFlagsSection
                  selectedSessionIds={Array.from(selectedIds)}
                />

                {/* Profile Management Section */}
                <div className="p-3 bg-gray-900/50 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-300">
                      Redaction Profile
                    </div>
                    {profileSaving && (
                      <span className="text-xs text-blue-400 animate-pulse">
                        Saving...
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        // Load saved active profile from server
                        try {
                          const data = await fetchProfiles();
                          const activeProfile = data.profiles.find(
                            (p) => p.id === data.active_profile_id
                          );
                          if (activeProfile) {
                            setActiveProfileId(activeProfile.id);
                            setRedactionConfig({
                              redactSecrets:
                                activeProfile.redaction_config.redact_secrets,
                              redactPii:
                                activeProfile.redaction_config.redact_pii,
                              redactPaths:
                                activeProfile.redaction_config.redact_paths,
                              maskCodeBlocks: false,
                              enableHighEntropy:
                                activeProfile.redaction_config
                                  .enable_high_entropy
                            });
                            setSelectedFields(
                              new Set(activeProfile.kept_fields)
                            );
                            setUserModifiedFields(true);
                          }
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Failed to load profile"
                          );
                        }
                      }}
                      disabled={!profilesLoaded}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-xs flex items-center gap-1.5"
                    >
                      <span>↓</span>
                      Load Saved
                    </button>
                    <button
                      onClick={async () => {
                        // Save current settings as the active profile
                        if (!activeProfileId) return;
                        setProfileSaving(true);
                        try {
                          await apiSetActiveProfile(activeProfileId);
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Failed to set active profile"
                          );
                        } finally {
                          setProfileSaving(false);
                        }
                      }}
                      disabled={!activeProfileId || profileSaving}
                      className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs flex items-center gap-1.5"
                    >
                      <span>✓</span>
                      Set as Default
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-2">
                    Save your current redaction settings to re-use them
                    automatically next time.
                  </div>
                </div>

                {/* Hierarchical Field Selection with profiles */}
                <FieldTree
                  fieldsBySource={livePreview?.fields_by_source}
                  selectedFields={selectedFields}
                  onToggleField={toggleField}
                  onSelectAll={() => {
                    // Select all discovered fields
                    setUserModifiedFields(true);
                    setActiveProfileId("full-content");
                    if (livePreview?.fields_by_source) {
                      const allFields = new Set<string>();
                      for (const fields of Object.values(
                        livePreview.fields_by_source
                      )) {
                        for (const f of fields) allFields.add(f);
                      }
                      setSelectedFields(allFields);
                    }
                  }}
                  onSelectNone={() => {
                    // Only keep essential fields
                    setUserModifiedFields(true);
                    setActiveProfileId("");
                    const essentialPaths = [
                      "type",
                      "role",
                      "content",
                      "text",
                      "message.role",
                      "message.content"
                    ];
                    setSelectedFields(new Set(essentialPaths));
                  }}
                  getFieldThreatInfo={getFieldThreatInfo}
                  profiles={[...BUILTIN_PROFILES, ...userProfiles]}
                  activeProfileId={activeProfileId}
                  onSelectProfile={applyProfile}
                  onSaveAsProfile={async () => {
                    const name = prompt("Profile name:");
                    if (!name) return;
                    setProfileSaving(true);
                    try {
                      const result = await saveProfile({
                        name,
                        kept_fields: Array.from(selectedFields),
                        redaction_config: {
                          redact_secrets: redactionConfig.redactSecrets,
                          redact_pii: redactionConfig.redactPii,
                          redact_paths: redactionConfig.redactPaths,
                          enable_high_entropy: redactionConfig.enableHighEntropy
                        }
                      });
                      const newProfile: RedactionProfile = {
                        id: result.profile.id,
                        name: result.profile.name,
                        description: result.profile.description,
                        keptFields: result.profile.kept_fields
                      };
                      setUserProfiles((prev) => [...prev, newProfile]);
                      setActiveProfileId(result.profile.id);
                      // Set this as the active profile on server
                      await apiSetActiveProfile(result.profile.id);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Failed to save profile"
                      );
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                />

                {/* Stats Summary */}
                {livePreview && (
                  <div className="p-3 bg-gray-900/50 rounded">
                    <div className="text-sm font-medium text-gray-300 mb-2">
                      Stats
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="p-2 bg-gray-800 rounded">
                        <div className="text-lg font-bold text-white">
                          {livePreview.stats.totalSessions}
                        </div>
                        <div className="text-gray-400">Sessions</div>
                      </div>
                      <div className="p-2 bg-gray-800 rounded">
                        <div className="text-lg font-bold text-blue-400">
                          {livePreview.stats.totalRedactions}
                        </div>
                        <div className="text-gray-400">Redactions</div>
                      </div>
                      <div className="p-2 bg-gray-800 rounded">
                        <div className="text-lg font-bold text-purple-400">
                          {livePreview.stats.totalFieldsStripped}
                        </div>
                        <div className="text-gray-400">Stripped</div>
                      </div>
                      <div
                        className="p-2 bg-gray-800 rounded cursor-help"
                        title="Quality score (0-100): Based on task completion, code quality, efficiency, and safety signals from the session."
                      >
                        <div
                          className={`text-lg font-bold ${
                            livePreview.stats.averageScore >= 80
                              ? "text-green-400"
                              : livePreview.stats.averageScore >= 50
                                ? "text-yellow-400"
                                : "text-red-400"
                          }`}
                        >
                          {livePreview.stats.averageScore.toFixed(0)}
                        </div>
                        <div className="text-gray-400 text-xs">
                          Score
                          <span className="text-gray-600 ml-1">(?)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Preview Panel */}
              <div className="col-span-2 space-y-3">
                {livePreview ? (
                  <>
                    {/* View mode tabs + Session navigator */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {/* Data Type Selector - only show if session has both hooks AND transcript */}
                          {currentSessionDataTypes === "both" && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => setPreviewDataType("hooks")}
                                className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                                  previewDataType === "hooks"
                                    ? "bg-green-600 text-white"
                                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                                }`}
                                title="View hook data (tool usages)"
                              >
                                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                                <span>Hooks</span>
                              </button>
                              <button
                                onClick={() => setPreviewDataType("chat")}
                                className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                                  previewDataType === "chat"
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                                }`}
                                title="View chat transcript"
                              >
                                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                <span>Chat</span>
                              </button>
                            </div>
                          )}

                          {/* View Format Tabs */}
                          <div className="flex rounded-lg overflow-hidden border border-gray-700">
                            <button
                              onClick={() => setPreviewViewFormat("chat")}
                              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${
                                previewViewFormat === "chat"
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                              }`}
                              title="Conversation view - shows messages as chat bubbles"
                            >
                              <span>💬</span>
                              <span>Chat</span>
                            </button>
                            <button
                              onClick={() => setPreviewViewFormat("structured")}
                              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 border-l border-gray-700 ${
                                previewViewFormat === "structured"
                                  ? "bg-purple-600 text-white"
                                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                              }`}
                              title="Structured view - shows data as organized cards"
                            >
                              <span>📋</span>
                              <span>Structured</span>
                            </button>
                            <button
                              onClick={() => setPreviewViewFormat("raw")}
                              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 border-l border-gray-700 ${
                                previewViewFormat === "raw"
                                  ? "bg-gray-600 text-white"
                                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                              }`}
                              title="Raw JSON diff - for technical users"
                            >
                              <span>🖥️</span>
                              <span>Raw</span>
                              {isLargeJson && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-yellow-400"
                                  title="Large file"
                                />
                              )}
                            </button>
                          </div>

                          {/* Original/Redacted Toggle Switch */}
                          {previewViewFormat !== "raw" && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">
                                Redacted
                              </span>
                              <button
                                onClick={() => setShowOriginal(!showOriginal)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  showOriginal ? "bg-yellow-600" : "bg-gray-600"
                                }`}
                                title={
                                  showOriginal
                                    ? "Showing original (before redaction)"
                                    : "Showing redacted"
                                }
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    showOriginal
                                      ? "translate-x-6"
                                      : "translate-x-1"
                                  }`}
                                />
                              </button>
                              <span className="text-xs text-gray-400">
                                Original
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setPreviewSessionIndex(
                                Math.max(0, previewSessionIndex - 1)
                              )
                            }
                            disabled={previewSessionIndex === 0}
                            className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
                          >
                            &larr;
                          </button>
                          <span className="text-xs text-gray-400">
                            {previewSessionIndex + 1} /{" "}
                            {livePreview.sessions.length}
                          </span>
                          <button
                            onClick={() =>
                              setPreviewSessionIndex(
                                Math.min(
                                  livePreview.sessions.length - 1,
                                  previewSessionIndex + 1
                                )
                              )
                            }
                            disabled={
                              previewSessionIndex >=
                              livePreview.sessions.length - 1
                            }
                            className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
                          >
                            &rarr;
                          </button>
                          {currentSession && (
                            <span
                              className={`ml-2 px-1.5 py-0.5 text-xs rounded ${
                                currentSession.score >= 80
                                  ? "bg-green-900/50 text-green-400"
                                  : currentSession.score >= 50
                                    ? "bg-yellow-900/50 text-yellow-400"
                                    : "bg-red-900/50 text-red-400"
                              }`}
                              title="Quality score (0-100): Based on task completion, code quality, efficiency, and safety signals"
                            >
                              Score: {currentSession.score}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* View description */}
                      <div className="text-[10px] text-gray-500">
                        {previewViewFormat === "chat" &&
                          `💬 Conversation view - ${currentSessionDataTypes === "both" ? (previewDataType === "hooks" ? "hook tool usages" : "chat transcript") : "messages"} with redactions highlighted`}
                        {previewViewFormat === "structured" &&
                          `📋 Structured data - ${currentSessionDataTypes === "both" ? (previewDataType === "hooks" ? "hook fields" : "transcript fields") : "all fields"}`}
                        {previewViewFormat === "raw" &&
                          "🖥️ Raw JSON diff - full technical diff (may be slow for large files)"}
                      </div>
                    </div>

                    {/* View Content */}
                    <div className="bg-gray-900 rounded border border-gray-700 p-3">
                      {currentSession ? (
                        // Determine effective data type for display
                        (() => {
                          // If session only has one type, use that; otherwise use selected type
                          const effectiveDataType =
                            currentSessionDataTypes === "both"
                              ? previewDataType
                              : currentSessionDataTypes;

                          // Chat View - conversation bubbles
                          if (previewViewFormat === "chat") {
                            return (
                              <ChatBubbleView
                                originalJson={
                                  currentSession.raw_json_original || "{}"
                                }
                                redactedJson={currentSession.raw_json || "{}"}
                                redactionInfoMap={
                                  livePreview.redaction_info_map
                                }
                                onToggleRedaction={handleToggleRedaction}
                                enabledCategories={enabledCategories}
                                showOriginal={showOriginal}
                                dataType={effectiveDataType}
                              />
                            );
                          }

                          // Structured View - organized cards
                          if (previewViewFormat === "structured") {
                            return (
                              <NiceStructuredView
                                originalJson={
                                  currentSession.raw_json_original || "{}"
                                }
                                redactedJson={currentSession.raw_json || "{}"}
                                redactionInfoMap={
                                  livePreview.redaction_info_map
                                }
                                onToggleRedaction={handleToggleRedaction}
                                enabledCategories={enabledCategories}
                                showOriginal={showOriginal}
                                dataType={effectiveDataType}
                              />
                            );
                          }

                          // Raw View - terminal-style diff (respects data type filter)
                          if (previewViewFormat === "raw") {
                            // Filter JSON to show only the selected data type
                            const filterJsonByType = (
                              jsonStr: string,
                              dataType: "hooks" | "chat"
                            ): string => {
                              try {
                                const data = JSON.parse(jsonStr);
                                if (dataType === "hooks") {
                                  // Extract hooks-related data
                                  return JSON.stringify(
                                    {
                                      session: data.session,
                                      tool_usages: data.tool_usages
                                    },
                                    null,
                                    2
                                  );
                                } else {
                                  // Extract transcript-related data
                                  return JSON.stringify(
                                    {
                                      type: data.type,
                                      messages: data.messages,
                                      total_input_tokens:
                                        data.total_input_tokens,
                                      total_output_tokens:
                                        data.total_output_tokens
                                    },
                                    null,
                                    2
                                  );
                                }
                              } catch {
                                return jsonStr;
                              }
                            };

                            // Only filter if session has both types
                            const originalFiltered =
                              currentSessionDataTypes === "both"
                                ? filterJsonByType(
                                    currentSession.raw_json_original || "{}",
                                    effectiveDataType
                                  )
                                : currentSession.raw_json_original || "{}";
                            const redactedFiltered =
                              currentSessionDataTypes === "both"
                                ? filterJsonByType(
                                    currentSession.raw_json || "{}",
                                    effectiveDataType
                                  )
                                : currentSession.raw_json || "{}";

                            return (
                              <RawTerminalDiffView
                                originalJson={originalFiltered}
                                redactedJson={redactedFiltered}
                                redactionInfoMap={
                                  livePreview.redaction_info_map
                                }
                              />
                            );
                          }

                          return null;
                        })()
                      ) : (
                        <div className="text-gray-500 text-sm text-center py-8">
                          No preview available
                        </div>
                      )}
                    </div>

                    {/* Redaction Summary - shows total counts by type for entire Conversation */}
                    <RedactionSummary
                      countsByCategory={
                        livePreview.redaction_report.counts_by_category
                      }
                      strippedFields={livePreview.stripped_fields}
                      totalRedactions={
                        livePreview.redaction_report.total_redactions
                      }
                    />

                    {/* Session quick tabs - one conversation = 1 object */}
                    {livePreview.sessions.length > 1 && (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 font-medium">
                          Conversations ({livePreview.sessions.length})
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {livePreview.sessions.map((session, idx) => {
                            // Determine what data types this session has
                            const jsonData = JSON.parse(
                              session.raw_json || "{}"
                            );
                            const hasHooks = sessionHasHooks(jsonData);
                            const hasTranscript =
                              sessionHasTranscript(jsonData);

                            return (
                              <button
                                key={session.session_id}
                                onClick={() => setPreviewSessionIndex(idx)}
                                className={`px-2 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                                  idx === previewSessionIndex
                                    ? "bg-blue-600 text-white ring-2 ring-blue-400"
                                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                                }`}
                                title={`Conversation ${idx + 1}${hasHooks ? " (hooks)" : ""}${hasTranscript ? " (transcript)" : ""}`}
                              >
                                <span>{idx + 1}</span>
                                {/* Data type indicators */}
                                <span className="flex gap-0.5">
                                  {hasHooks && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-green-400"
                                      title="Has hooks data"
                                    />
                                  )}
                                  {hasTranscript && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                      title="Has transcript data"
                                    />
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Field Summary - organized by source type */}
                    {(livePreview.stripped_fields.length > 0 ||
                      livePreview.fields_by_source) && (
                      <details className="bg-gray-800/50 border border-gray-700 rounded">
                        <summary className="p-2 cursor-pointer text-xs text-gray-400 hover:text-gray-300">
                          Field Summary:{" "}
                          {livePreview.fields_present?.length || 0} discovered,{" "}
                          {livePreview.stripped_fields.length} stripped
                        </summary>
                        <div className="p-2 pt-0 space-y-2">
                          {/* Fields grouped by source type */}
                          {livePreview.fields_by_source &&
                            Object.entries(livePreview.fields_by_source).map(
                              ([source, fields]) => {
                                const kept = fields.filter(
                                  (f) =>
                                    !livePreview.stripped_fields.includes(f)
                                );
                                const stripped = fields.filter((f) =>
                                  livePreview.stripped_fields.includes(f)
                                );
                                const sourceLabel =
                                  SOURCE_TYPE_LABELS[source] || source;

                                return (
                                  <div
                                    key={source}
                                    className="p-2 bg-gray-900/50 rounded"
                                  >
                                    <div className="text-xs text-gray-300 mb-1 flex items-center gap-2">
                                      <span
                                        className={`w-2 h-2 rounded-full ${
                                          source.includes("hook")
                                            ? "bg-green-500"
                                            : source.includes("cc_")
                                              ? "bg-purple-500"
                                              : source.includes("codex")
                                                ? "bg-blue-500"
                                                : "bg-gray-500"
                                        }`}
                                      />
                                      {sourceLabel}
                                      <span className="text-gray-500">
                                        ({kept.length}/{fields.length} kept)
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {kept.slice(0, 5).map((field, i) => (
                                        <span
                                          key={`kept-${i}`}
                                          className="px-1 py-0.5 text-[10px] bg-green-900/30 text-green-300 rounded font-mono"
                                        >
                                          {field.length > 18
                                            ? field.slice(0, 15) + "..."
                                            : field}
                                        </span>
                                      ))}
                                      {kept.length > 5 && (
                                        <span className="text-[10px] text-green-500">
                                          +{kept.length - 5}
                                        </span>
                                      )}
                                      {stripped.slice(0, 3).map((field, i) => (
                                        <span
                                          key={`stripped-${i}`}
                                          className="px-1 py-0.5 text-[10px] bg-purple-900/50 text-purple-300 rounded font-mono line-through"
                                        >
                                          {field.length > 12
                                            ? field.slice(0, 9) + "..."
                                            : field}
                                        </span>
                                      ))}
                                      {stripped.length > 3 && (
                                        <span className="text-[10px] text-purple-400">
                                          +{stripped.length - 3} stripped
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              }
                            )}
                          {/* Fallback if no fields_by_source yet */}
                          {!livePreview.fields_by_source &&
                            livePreview.stripped_fields.length > 0 && (
                              <div className="text-xs text-gray-400">
                                {livePreview.stripped_fields.length} fields will
                                be stripped
                              </div>
                            )}
                          <div className="text-[10px] text-gray-500 mt-1">
                            Click fields in the left panel to toggle. Stripped
                            fields are removed from exports.
                          </div>
                        </div>
                      </details>
                    )}

                    {/* Warnings */}
                    {livePreview.redaction_report.residue_warnings.length >
                      0 && (
                      <div className="p-2 bg-yellow-900/30 border border-yellow-700 rounded">
                        <div className="text-xs text-yellow-400 font-medium mb-1">
                          Warnings (
                          {livePreview.redaction_report.residue_warnings.length}
                          )
                        </div>
                        <div className="text-xs text-yellow-300 space-y-0.5 max-h-20 overflow-y-auto">
                          {livePreview.redaction_report.residue_warnings.map(
                            (w, i) => (
                              <div key={i}>{w}</div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-gray-900 rounded border border-gray-700 p-8 text-center text-gray-500">
                    {previewLoading
                      ? "Loading preview..."
                      : "Preparing preview..."}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Contributor & Export */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection("export")}
          className="w-full px-4 py-3 bg-gray-700/50 flex items-center justify-between hover:bg-gray-700"
        >
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
              3
            </span>
            <span className="font-medium text-white">Contributor & Export</span>
          </div>
          <span className="text-gray-400">
            {expandedSections.has("export") ? "▼" : "▶"}
          </span>
        </button>

        {expandedSections.has("export") && (
          <div className="p-4 space-y-4">
            {/* Contributor Info */}
            <div className="p-3 bg-gray-700/30 rounded space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-white">
                  Contributor & Preferences
                </div>
                {settingsSaving && (
                  <span className="text-xs text-blue-400">Saving...</span>
                )}
                {settingsLoaded && !settingsSaving && (
                  <span className="text-xs text-green-400">Saved</span>
                )}
              </div>

              {/* Basic Info Row */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Contributor ID (optional)"
                  value={contributorId}
                  onChange={(e) => handleContributorIdChange(e.target.value)}
                  className="px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-xs"
                />
                <select
                  value={license}
                  onChange={(e) => handleLicenseChange(e.target.value)}
                  className="px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-xs"
                >
                  <option value="CC-BY-4.0">CC-BY-4.0 (Attribution)</option>
                  <option value="CC-BY-SA-4.0">
                    CC-BY-SA-4.0 (ShareAlike)
                  </option>
                  <option value="CC0-1.0">CC0 (Public Domain)</option>
                </select>
              </div>

              {/* AI Preference Signal - Enhanced */}
              <div className="p-2 bg-gray-900/50 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-300">
                      AI Training Preference
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-purple-900/50 text-purple-300 rounded">
                      Evolving Standard
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setShowPreferenceWizard(!showPreferenceWizard)
                    }
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {showPreferenceWizard ? "Simple" : "Customize"}
                  </button>
                </div>

                {!showPreferenceWizard ? (
                  /* Simple preset selector */
                  <div className="space-y-1">
                    {/* Warning if custom settings exist */}
                    {aiPreference.includes(";") &&
                      ![
                        "train-genai=ok",
                        "train-genai=conditional;conditions=public-models-only,open-weights-only",
                        "train-genai=conditional;conditions=research-only;commercial=no",
                        "train-genai=no;purposes=evaluation,benchmarking",
                        "train-genai=no"
                      ].includes(aiPreference) && (
                        <div className="text-[9px] text-yellow-500 bg-yellow-900/20 px-2 py-1 rounded">
                          Custom settings detected. Selecting a preset will
                          replace them.
                        </div>
                      )}
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        {
                          value: "train-genai=ok",
                          label: "Permissive",
                          desc: "All AI uses OK",
                          color: "green"
                        },
                        {
                          value:
                            "train-genai=conditional;conditions=public-models-only,open-weights-only",
                          label: "Open Only",
                          desc: "Open models only",
                          color: "blue"
                        },
                        {
                          value:
                            "train-genai=conditional;conditions=research-only;commercial=no",
                          label: "Research",
                          desc: "Non-commercial",
                          color: "purple"
                        },
                        {
                          value:
                            "train-genai=no;purposes=evaluation,benchmarking",
                          label: "Eval Only",
                          desc: "No training",
                          color: "yellow"
                        },
                        {
                          value: "train-genai=no",
                          label: "No AI",
                          desc: "No AI use",
                          color: "red"
                        }
                      ].map((preset) => (
                        <button
                          key={preset.value}
                          onClick={() => handleAiPreferenceChange(preset.value)}
                          title={`${preset.label}: ${preset.desc}. Click to apply this preset.`}
                          className={`p-1.5 rounded text-center transition-colors ${
                            aiPreference === preset.value ||
                            aiPreference.startsWith(preset.value.split(";")[0])
                              ? `bg-${preset.color}-600/30 border border-${preset.color}-500 text-${preset.color}-300`
                              : "bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          <div className="text-[10px] font-medium">
                            {preset.label}
                          </div>
                          <div className="text-[9px] opacity-70">
                            {preset.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Advanced preference wizard */
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">
                          Base Permission
                        </label>
                        <select
                          value={
                            aiPreference.includes("train-genai=no")
                              ? "no"
                              : aiPreference.includes("conditional")
                                ? "conditional"
                                : "ok"
                          }
                          onChange={(e) => {
                            const base = e.target.value;
                            if (base === "ok")
                              handleAiPreferenceChange("train-genai=ok");
                            else if (base === "no")
                              handleAiPreferenceChange("train-genai=no");
                            else
                              handleAiPreferenceChange(
                                "train-genai=conditional"
                              );
                          }}
                          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-xs"
                        >
                          <option value="ok">Allow Training</option>
                          <option value="conditional">Conditional</option>
                          <option value="no">No Training</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">
                          Commercial Use
                        </label>
                        <select
                          value={
                            aiPreference.includes("commercial=no")
                              ? "no"
                              : "yes"
                          }
                          onChange={(e) => {
                            const current = aiPreference.replace(
                              /;?commercial=\w+/,
                              ""
                            );
                            handleAiPreferenceChange(
                              e.target.value === "no"
                                ? `${current};commercial=no`
                                : current
                            );
                          }}
                          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-xs"
                        >
                          <option value="yes">Allowed</option>
                          <option value="no">Non-commercial only</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">
                          Attribution
                        </label>
                        <select
                          value={
                            aiPreference.includes("attribution=required")
                              ? "required"
                              : "optional"
                          }
                          onChange={(e) => {
                            const current = aiPreference.replace(
                              /;?attribution=\w+/,
                              ""
                            );
                            handleAiPreferenceChange(
                              e.target.value === "required"
                                ? `${current};attribution=required`
                                : current
                            );
                          }}
                          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-xs"
                        >
                          <option value="optional">
                            Optional (per license)
                          </option>
                          <option value="required">Required</option>
                        </select>
                      </div>
                    </div>

                    {/* Conditions (when conditional) */}
                    {aiPreference.includes("conditional") && (
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">
                          Conditions (select all that apply)
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {[
                            {
                              id: "public-models-only",
                              label: "Public models only"
                            },
                            { id: "open-weights-only", label: "Open weights" },
                            { id: "research-only", label: "Research only" },
                            {
                              id: "evaluation-ok",
                              label: "Eval OK even if no train"
                            },
                            {
                              id: "no-synthetic-data",
                              label: "No synthetic data"
                            }
                          ].map((cond) => (
                            <label
                              key={cond.id}
                              className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-gray-300 cursor-pointer hover:bg-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={aiPreference.includes(cond.id)}
                                onChange={(e) => {
                                  let conditions = (
                                    aiPreference.match(
                                      /conditions=([^;]+)/
                                    )?.[1] || ""
                                  )
                                    .split(",")
                                    .filter(Boolean);
                                  if (e.target.checked) {
                                    conditions.push(cond.id);
                                  } else {
                                    conditions = conditions.filter(
                                      (c) => c !== cond.id
                                    );
                                  }
                                  const base = aiPreference.replace(
                                    /;?conditions=[^;]+/,
                                    ""
                                  );
                                  handleAiPreferenceChange(
                                    conditions.length
                                      ? `${base};conditions=${conditions.join(",")}`
                                      : base
                                  );
                                }}
                                className="w-3 h-3 rounded"
                              />
                              {cond.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Raw signal display */}
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-gray-500">Signal:</span>
                      <code className="flex-1 px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 font-mono truncate">
                        {aiPreference}
                      </code>
                    </div>
                  </div>
                )}

                {/* Evolving standard note */}
                <div className="text-[10px] text-gray-500 flex items-start gap-1">
                  <span className="text-purple-400">*</span>
                  <span>
                    AI Preference Signals are an evolving standard. These
                    preferences are embedded in your contributions but
                    enforcement depends on downstream consumers respecting them.
                    <a
                      href="https://datalicenses.org"
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-400 hover:underline ml-1"
                    >
                      Learn more at datalicenses.org
                    </a>
                  </span>
                </div>
              </div>
            </div>

            {/* Contribution History */}
            {contributionHistory &&
              contributionHistory.total_contributions > 0 && (
                <div className="p-3 bg-blue-900/20 border border-blue-800 rounded">
                  <div className="text-sm font-medium text-blue-300 mb-2">
                    Your Contributions
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div>
                      <div className="text-xl font-bold text-white">
                        {contributionHistory.successful_contributions}
                      </div>
                      <div className="text-xs text-gray-400">Uploads</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-green-400">
                        {contributionHistory.total_sessions}
                      </div>
                      <div className="text-xs text-gray-400">Sessions</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-purple-400">
                        {(contributionHistory.total_chars / 1000).toFixed(0)}k
                      </div>
                      <div className="text-xs text-gray-400">Characters</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-300">
                        {contributionHistory.first_contribution && (
                          <>
                            Since{" "}
                            {new Date(
                              contributionHistory.first_contribution
                            ).toLocaleDateString()}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {!livePreview && (
              <div className="text-sm text-gray-500 text-center py-4">
                Select sessions to enable export options
              </div>
            )}

            {livePreview && (
              <>
                {/* Download */}
                <div className="p-3 bg-gray-700/30 rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">
                        Download Bundle
                      </div>
                      <div className="text-xs text-gray-400">
                        Save as JSONL file locally
                      </div>
                    </div>
                    <button
                      onClick={handleDownloadBundle}
                      disabled={exportLoading === "bundle"}
                      className="px-4 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      {exportLoading === "bundle" ? "Exporting..." : "Download"}
                    </button>
                  </div>
                  {bundleDownloaded && (
                    <div className="text-xs text-green-400">
                      Bundle downloaded to your Downloads folder
                    </div>
                  )}
                </div>

                {/* HuggingFace */}
                <div className="p-3 bg-gray-700/30 rounded space-y-2">
                  <div className="text-sm font-medium text-white">
                    Upload to Hugging Face
                  </div>

                  {/* Destination Info */}
                  <div className="p-2 bg-yellow-900/20 border border-yellow-800 rounded text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-yellow-400">!</span>
                      <div>
                        <div className="text-yellow-300 font-medium">
                          Public Dataset
                        </div>
                        <div className="text-yellow-200/70">
                          Your data will be uploaded to{" "}
                          {hfRepoId ? (
                            <a
                              href={`https://huggingface.co/datasets/${hfRepoId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-yellow-300 underline hover:text-yellow-100"
                            >
                              huggingface.co/datasets/{hfRepoId}
                            </a>
                          ) : (
                            <span className="text-gray-400">
                              (enter repo below)
                            </span>
                          )}
                        </div>
                        <div className="text-yellow-200/50 mt-1">
                          This dataset is publicly accessible. Ensure your data
                          has been reviewed.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Auth Status & Re-login */}
                  {(hfTokenSaved || hfUsername) && (
                    <div className="p-2 rounded text-xs flex items-center justify-between bg-green-900/20 border border-green-800">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400"></span>
                        <span className="text-green-300">
                          {hfUsername
                            ? `Logged in as ${hfUsername}`
                            : "Token saved"}
                        </span>
                      </div>
                      <button
                        onClick={handleHfDisconnect}
                        className="text-xs text-gray-400 hover:text-white"
                      >
                        Disconnect
                      </button>
                    </div>
                  )}

                  {/* HF CLI Auth Status (when not already authenticated) */}
                  {!hfTokenSaved && !hfToken && hfCliAuth && (
                    <div
                      className={`p-2 rounded text-xs flex items-center justify-between ${
                        hfCliAuth.authenticated
                          ? "bg-green-900/20 border border-green-800"
                          : "bg-gray-800 border border-gray-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {hfCliAuth.authenticated ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-green-400"></span>
                            <span className="text-green-300">
                              CLI: {hfCliAuth.username}
                              {hfCliAuth.source === "environment" && " (env)"}
                              {hfCliAuth.source === "cli-cache" && " (cached)"}
                            </span>
                            {hfCliAuth.tokenMasked && (
                              <span className="text-gray-500 font-mono">
                                {hfCliAuth.tokenMasked}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                            <span className="text-gray-400">
                              Not authenticated via CLI
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {hfCliAuth.authenticated && (
                          <button
                            onClick={handleUseHfCliToken}
                            disabled={hfCliChecking}
                            className="px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {hfCliChecking ? "..." : "Use CLI Token"}
                          </button>
                        )}
                        <button
                          onClick={handleRefreshHfCliAuth}
                          disabled={hfCliChecking}
                          className="text-gray-400 hover:text-white"
                          title="Refresh CLI auth status"
                        >
                          ↻
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Login options when not authenticated */}
                  {!hfTokenSaved && !hfToken && !hfCliAuth?.authenticated && (
                    <div className="space-y-2">
                      {/* OAuth Login Button */}
                      {hfOAuthConfig?.configured ? (
                        <button
                          onClick={handleHfOAuthLogin}
                          disabled={hfOAuthLoading}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded font-medium"
                        >
                          <span className="text-xl">🤗</span>
                          {hfOAuthLoading
                            ? "Connecting..."
                            : "Log in with Hugging Face"}
                        </button>
                      ) : (
                        <div className="text-[10px] text-gray-500 bg-gray-800/50 p-2 rounded">
                          <div className="font-medium text-gray-400 mb-1">
                            OAuth not configured
                          </div>
                          <div className="text-gray-500">
                            Set{" "}
                            <code className="bg-gray-900 px-1 rounded">
                              HF_OAUTH_CLIENT_ID
                            </code>{" "}
                            env var to enable.{" "}
                            <a
                              href="https://huggingface.co/settings/applications"
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:underline"
                            >
                              Create app
                            </a>
                          </div>
                        </div>
                      )}

                      {/* CLI auth alternative */}
                      <div className="text-[10px] text-gray-500 bg-gray-800/50 p-2 rounded">
                        <div className="font-medium text-gray-400 mb-1">
                          Or authenticate via CLI:
                        </div>
                        <code className="block bg-gray-900 px-2 py-1 rounded font-mono">
                          pip install huggingface_hub && huggingface-cli login
                        </code>
                        <div className="mt-1 text-gray-500">
                          Or paste a token manually below. Get one at{" "}
                          <a
                            href="https://huggingface.co/settings/tokens"
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:underline"
                          >
                            huggingface.co/settings/tokens
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        type="password"
                        placeholder={
                          hfTokenSaved
                            ? "Token saved (enter new to update)"
                            : hfToken
                              ? "Token entered"
                              : "HF Token (or use CLI above)"
                        }
                        value={hfToken}
                        onChange={(e) => setHfToken(e.target.value)}
                        onBlur={() => {
                          handleValidateHfToken();
                          handleHfTokenSave();
                        }}
                        className={`w-full px-2 py-1.5 bg-gray-900 border rounded text-white text-xs ${
                          (hfTokenSaved && !hfToken) || hfToken
                            ? "border-green-600"
                            : "border-gray-600"
                        }`}
                      />
                      {hfTokenSaved && !hfToken && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400 text-xs">
                          Saved
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="user/repo-name"
                      value={hfRepoId}
                      onChange={(e) => handleHfRepoChange(e.target.value)}
                      className="px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-white text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={hfCreatePr}
                        onChange={(e) => setHfCreatePr(e.target.checked)}
                        className="rounded"
                      />
                      Create PR (recommended)
                    </label>
                    {hfUsername && (
                      <span className="text-xs text-green-400">
                        Logged in as {hfUsername}
                      </span>
                    )}
                    <button
                      onClick={handleHuggingFaceUpload}
                      disabled={
                        exportLoading === "huggingface" ||
                        (!hfToken && !hfTokenSaved) ||
                        !hfRepoId
                      }
                      className="px-4 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 text-sm"
                    >
                      {exportLoading === "huggingface"
                        ? "Uploading..."
                        : "Upload to HF"}
                    </button>
                  </div>
                  {hfResult?.success && (
                    <div className="p-2 bg-green-900/30 border border-green-700 rounded space-y-1">
                      <div className="text-xs text-green-400 font-medium">
                        Upload successful!
                      </div>
                      <a
                        href={hfResult.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-green-300 hover:underline block"
                      >
                        {hfResult.pr_number
                          ? `View PR #${hfResult.pr_number}`
                          : "View contribution"}
                        : {hfResult.url}
                      </a>
                      {hfResult.was_fallback && (
                        <div className="text-xs text-yellow-400">
                          Note:{" "}
                          {hfCreatePr
                            ? "PR creation failed, fell back to direct commit."
                            : "Direct commit failed, fell back to PR."}{" "}
                          Check that your OAuth has the correct scopes
                          (write-repos, write-discussions).
                        </div>
                      )}
                    </div>
                  )}
                  {hfResult?.error && (
                    <div className="p-2 bg-red-900/30 border border-red-700 rounded">
                      <div className="text-xs text-red-400 font-medium">
                        Upload failed
                      </div>
                      <div className="text-xs text-red-300">
                        {hfResult.error}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Common issues: Check dataset exists, you have write
                        access, and OAuth has correct scopes (write-repos,
                        write-discussions).
                      </div>
                    </div>
                  )}
                </div>

                {/* Gist - temporarily disabled */}
                <div className="p-3 bg-gray-700/30 rounded space-y-2 opacity-60">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-gray-400">
                      GitHub Gist
                    </div>
                    <span className="px-1.5 py-0.5 text-[10px] bg-yellow-900/50 text-yellow-300 rounded">
                      Temporarily Unavailable
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Single session export to GitHub Gist. Currently disabled
                    while we resolve authentication issues.{" "}
                    <a
                      href="https://github.com/nickmvincent/agentwatch/issues"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Track progress
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Chat Viewer Modal */}
      {selectedTranscript && (
        <ChatViewerModal
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
        />
      )}

      {/* Hook Session Timeline Modal */}
      {selectedHookSession && (
        <HookSessionModal
          sessionId={selectedHookSession.sessionId}
          timeline={selectedHookSession.timeline}
          onClose={() => setSelectedHookSession(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Hook Session Modal Component
// ============================================================================

interface HookSessionModalProps {
  sessionId: string;
  timeline: ToolUsage[];
  onClose: () => void;
}

function HookSessionModal({
  sessionId,
  timeline,
  onClose
}: HookSessionModalProps) {
  const formatTime = (ts: number) => {
    const ms = ts > 1e12 ? ts : ts * 1000;
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "-";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Group by tool name for summary
  const toolSummary = timeline.reduce(
    (acc, t) => {
      acc[t.tool_name] = (acc[t.tool_name] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const successCount = timeline.filter((t) => t.success !== false).length;
  const failCount = timeline.filter((t) => t.success === false).length;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Hook Session Timeline
            </h3>
            <div className="text-xs text-gray-400 mt-1">
              Session: {sessionId.slice(0, 12)}... | {timeline.length} tool
              calls |
              <span className="text-green-400 ml-1">
                {successCount} success
              </span>
              {failCount > 0 && (
                <span className="text-red-400 ml-1">{failCount} failed</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tool Summary */}
        <div className="p-3 border-b border-gray-700 bg-gray-900/50">
          <div className="text-xs text-gray-500 mb-1">Tools used:</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(toolSummary)
              .sort((a, b) => b[1] - a[1])
              .map(([tool, count]) => (
                <span
                  key={tool}
                  className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300"
                >
                  {tool} <span className="text-gray-500">×{count}</span>
                </span>
              ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {timeline.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No tool calls recorded
            </div>
          ) : (
            timeline.map((usage, idx) => (
              <div
                key={usage.tool_use_id || idx}
                className={`p-3 rounded border-l-2 ${
                  usage.success === false
                    ? "bg-red-900/20 border-red-500"
                    : "bg-gray-700/30 border-gray-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {usage.tool_name}
                    </span>
                    {usage.success === false && (
                      <span className="px-1.5 py-0.5 bg-red-900/50 text-red-400 text-xs rounded">
                        failed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {usage.duration_ms != null && (
                      <span className="text-gray-400">
                        {formatDuration(usage.duration_ms)}
                      </span>
                    )}
                    <span>{formatTime(usage.timestamp)}</span>
                  </div>
                </div>
                {usage.error && (
                  <div className="mt-1 text-xs text-red-400 truncate">
                    {usage.error}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
