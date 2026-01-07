import { useEffect, useState } from "react";
import {
  analyzeTranscript,
  analyzePrivacyRisk,
  fetchSessionEnrichments,
  setSessionAnnotation,
  updateSessionTags,
  type PrivacyRiskAnalysis
} from "../api/client";
import type {
  AutoTag,
  Conversation,
  FeedbackType,
  LoopPattern,
  SessionEnrichments,
  WorkflowStatus
} from "../api/types";
import { useConversations } from "../context/ConversationContext";
import { getProjectName } from "./ConversationCard";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

interface ConversationDetailModalProps {
  conversation: Conversation;
  onClose: () => void;
}

// Helper to format timestamps
function formatTime(ts: number): string {
  const date = new Date(ts > 1e12 ? ts : ts * 1000);
  return date.toLocaleString();
}

// Quality score color
function getQualityColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

// Task type badge color
function getTaskTypeColor(taskType: string): string {
  switch (taskType) {
    case "feature":
      return "bg-blue-600";
    case "bugfix":
      return "bg-red-600";
    case "refactor":
      return "bg-purple-600";
    case "test":
      return "bg-green-600";
    case "docs":
      return "bg-yellow-600";
    case "config":
      return "bg-gray-600";
    case "exploration":
      return "bg-cyan-600";
    default:
      return "bg-gray-500";
  }
}

export function ConversationDetailModal({
  conversation,
  onClose
}: ConversationDetailModalProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const { getConversationName, updateConversationName, setAnnotation } =
    useConversations();

  const [enrichments, setEnrichments] = useState<SessionEnrichments | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [privacyRisk, setPrivacyRisk] = useState<PrivacyRiskAnalysis | null>(
    null
  );
  const [loadingPrivacyRisk, setLoadingPrivacyRisk] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);

  // Editing states
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingTags, setEditingTags] = useState(false);
  const [tagsValue, setTagsValue] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  const conversationId =
    conversation.correlation_id || conversation.hook_session?.session_id || "";
  const enrichmentId = conversation.hook_session?.session_id || conversationId;
  const customName = getConversationName(conversationId);

  // Load enrichments
  useEffect(() => {
    async function loadEnrichments() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchSessionEnrichments(enrichmentId);
        setEnrichments(result);
        setNotesValue(result.manual_annotation?.notes || "");
        setTagsValue(result.manual_annotation?.userTags?.join(", ") || "");
      } catch (e) {
        console.error("Failed to load enrichments:", e);
        setError("Failed to load enrichment data");
      } finally {
        setLoading(false);
      }
    }
    loadEnrichments();
  }, [enrichmentId]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  async function handleFeedbackClick(feedback: FeedbackType) {
    try {
      await setAnnotation(conversationId, feedback);
      const result = await fetchSessionEnrichments(enrichmentId);
      setEnrichments(result);
    } catch (e) {
      console.error("Failed to set feedback:", e);
    }
  }

  async function handleWorkflowStatusClick(status: WorkflowStatus) {
    try {
      const currentFeedback = enrichments?.manual_annotation?.feedback ?? null;
      await setSessionAnnotation(enrichmentId, currentFeedback, {
        workflowStatus: status
      });
      const result = await fetchSessionEnrichments(enrichmentId);
      setEnrichments(result);
    } catch (e) {
      console.error("Failed to set workflow status:", e);
    }
  }

  async function handleSaveName() {
    try {
      await updateConversationName(conversationId, nameValue.trim() || null);
      setEditingName(false);
    } catch (e) {
      console.error("Failed to save name:", e);
    }
  }

  async function handleSaveTags() {
    const tags = tagsValue
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await updateSessionTags(enrichmentId, tags);
      const result = await fetchSessionEnrichments(enrichmentId);
      setEnrichments(result);
      setEditingTags(false);
    } catch (e) {
      console.error("Failed to save tags:", e);
    }
  }

  async function handleSaveNotes() {
    try {
      const currentFeedback = enrichments?.manual_annotation?.feedback;
      if (currentFeedback) {
        await setSessionAnnotation(enrichmentId, currentFeedback, {
          notes: notesValue
        });
      }
      const result = await fetchSessionEnrichments(enrichmentId);
      setEnrichments(result);
      setEditingNotes(false);
    } catch (e) {
      console.error("Failed to save notes:", e);
    }
  }

  async function handleAnalyzeTranscript() {
    const transcriptId = conversation.transcript?.id;
    if (!transcriptId) return;

    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      await analyzeTranscript(transcriptId);
      // Reload enrichments after analysis
      const result = await fetchSessionEnrichments(
        `transcript:${transcriptId}`
      );
      setEnrichments(result);
    } catch (e) {
      console.error("Failed to analyze transcript:", e);
      setAnalyzeError(e instanceof Error ? e.message : "Failed to analyze");
    } finally {
      setAnalyzing(false);
    }
  }

  // Check if this is a local transcript without enrichments
  const canAnalyze =
    conversation.transcript?.id &&
    !enrichments?.quality_score &&
    !conversation.hook_session;

  // Load privacy risk analysis when transcript is available
  useEffect(() => {
    async function loadPrivacyRisk() {
      const transcriptId = conversation.transcript?.id;
      if (!transcriptId) return;

      setLoadingPrivacyRisk(true);
      try {
        const result = await analyzePrivacyRisk(transcriptId);
        setPrivacyRisk(result);
      } catch (e) {
        console.error("Failed to analyze privacy risk:", e);
      } finally {
        setLoadingPrivacyRisk(false);
      }
    }
    loadPrivacyRisk();
  }, [conversation.transcript?.id]);

  return (
    <SelfDocumentingSection
      componentId="analyzer.conversations.detail-modal"
      visible={showSelfDocs}
    >
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <div
          className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Conversation Details
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg
                className="w-5 h-5"
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

          {loading ? (
            <div className="p-6 text-gray-400">Loading...</div>
          ) : error ? (
            <div className="p-6 text-red-400">{error}</div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Overview Section */}
              <section>
                <h3 className="text-md font-semibold text-white mb-3">
                  Overview
                </h3>

                {/* Conversation Name */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-400 text-sm">Name:</span>
                    {editingName ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={nameValue}
                          onChange={(e) => setNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveName();
                            if (e.key === "Escape") {
                              setEditingName(false);
                              setNameValue("");
                            }
                          }}
                          placeholder={getProjectName(conversation.cwd)}
                          className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveName}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-500"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingName(false);
                            setNameValue("");
                          }}
                          className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm ${customName ? "text-blue-300 font-medium" : "text-gray-500 italic"}`}
                        >
                          {customName || "No custom name"}
                        </span>
                        <button
                          onClick={() => {
                            setEditingName(true);
                            setNameValue(customName || "");
                          }}
                          className="p-1 text-gray-500 hover:text-gray-300"
                          title="Edit name"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Agent:</span>
                    <span className="ml-2 text-white">
                      {conversation.agent || "Unknown"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Start:</span>
                    <span className="ml-2 text-white">
                      {formatTime(conversation.start_time)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400">Directory:</span>
                    <span className="ml-2 text-white font-mono text-xs">
                      {conversation.cwd || "N/A"}
                    </span>
                  </div>
                  {conversation.project && (
                    <div className="col-span-2">
                      <span className="text-gray-400">Project:</span>
                      <span className="ml-2 text-blue-300">
                        {conversation.project.name}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Data Components Section */}
              <section>
                <h3 className="text-md font-semibold text-white mb-3">
                  Available Data
                </h3>
                <div className="space-y-3">
                  {/* Hook Session */}
                  <div
                    className={`p-3 rounded-lg ${conversation.hook_session ? "bg-green-900/20 border border-green-800/50" : "bg-gray-700/30 border border-gray-600/30"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${conversation.hook_session ? "bg-green-400" : "bg-gray-500"}`}
                        />
                        <span className="text-sm font-medium text-white">
                          Hook Session
                        </span>
                        {conversation.hook_session && (
                          <span className="text-xs text-gray-400">
                            (real-time tool tracking)
                          </span>
                        )}
                      </div>
                      {conversation.hook_session ? (
                        <span className="text-xs text-green-400">
                          Available
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          Not captured
                        </span>
                      )}
                    </div>
                    {conversation.hook_session && (
                      <div className="mt-2 text-xs text-gray-400 space-y-1">
                        <div>
                          Tools used:{" "}
                          <span className="text-white">
                            {conversation.hook_session.tool_count}
                          </span>
                        </div>
                        {Object.keys(conversation.hook_session.tools_used || {})
                          .length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(
                              conversation.hook_session.tools_used
                            )
                              .slice(0, 6)
                              .map(([tool, count]) => (
                                <span
                                  key={tool}
                                  className="px-1.5 py-0.5 bg-gray-700 rounded text-xs"
                                >
                                  {tool} ({count})
                                </span>
                              ))}
                            {Object.keys(conversation.hook_session.tools_used)
                              .length > 6 && (
                              <span className="text-gray-500">
                                +
                                {Object.keys(
                                  conversation.hook_session.tools_used
                                ).length - 6}{" "}
                                more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Transcript */}
                  <div
                    className={`p-3 rounded-lg ${conversation.transcript ? "bg-blue-900/20 border border-blue-800/50" : "bg-gray-700/30 border border-gray-600/30"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${conversation.transcript ? "bg-blue-400" : "bg-gray-500"}`}
                        />
                        <span className="text-sm font-medium text-white">
                          Transcript
                        </span>
                        {conversation.transcript && (
                          <span className="text-xs text-gray-400">
                            (conversation history)
                          </span>
                        )}
                      </div>
                      {conversation.transcript ? (
                        <span className="text-xs text-blue-400">Available</span>
                      ) : (
                        <span className="text-xs text-gray-500">Not found</span>
                      )}
                    </div>
                    {conversation.transcript && (
                      <div className="mt-2 text-xs text-gray-400 space-y-1">
                        {conversation.transcript.message_count !== null && (
                          <div>
                            Messages:{" "}
                            <span className="text-white">
                              {conversation.transcript.message_count}
                            </span>
                          </div>
                        )}
                        <div>
                          Size:{" "}
                          <span className="text-white">
                            {Math.round(
                              conversation.transcript.size_bytes / 1024
                            )}
                            KB
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Managed Session */}
                  <div
                    className={`p-3 rounded-lg ${conversation.managed_session ? "bg-purple-900/20 border border-purple-800/50" : "bg-gray-700/30 border border-gray-600/30"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${conversation.managed_session ? "bg-purple-400" : "bg-gray-500"}`}
                        />
                        <span className="text-sm font-medium text-white">
                          Managed Session
                        </span>
                        {conversation.managed_session && (
                          <span className="text-xs text-gray-400">
                            (aw run)
                          </span>
                        )}
                      </div>
                      {conversation.managed_session ? (
                        <span
                          className={`text-xs ${
                            conversation.managed_session.status === "running"
                              ? "text-green-400"
                              : conversation.managed_session.status ===
                                  "completed"
                                ? "text-purple-400"
                                : "text-red-400"
                          }`}
                        >
                          {conversation.managed_session.status}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          Not managed
                        </span>
                      )}
                    </div>
                    {conversation.managed_session && (
                      <div className="mt-2 text-xs space-y-2">
                        <div className="text-gray-400">
                          <div className="mb-1">Prompt:</div>
                          <pre className="p-2 bg-gray-800 rounded text-white overflow-auto max-h-24 whitespace-pre-wrap">
                            {conversation.managed_session.prompt}
                          </pre>
                        </div>
                        <div className="flex gap-4 text-gray-400">
                          <span>
                            Status:{" "}
                            <span
                              className={`${
                                conversation.managed_session.status ===
                                "running"
                                  ? "text-green-400"
                                  : conversation.managed_session.status ===
                                      "completed"
                                    ? "text-white"
                                    : "text-red-400"
                              }`}
                            >
                              {conversation.managed_session.status}
                            </span>
                          </span>
                          {conversation.managed_session.exit_code !== null && (
                            <span>
                              Exit:{" "}
                              <span className="text-white">
                                {conversation.managed_session.exit_code}
                              </span>
                            </span>
                          )}
                          <span>
                            Duration:{" "}
                            <span className="text-white">
                              {Math.round(
                                conversation.managed_session.duration_ms / 1000
                              )}
                              s
                            </span>
                          </span>
                        </div>
                        {conversation.managed_session.pid && (
                          <div className="text-gray-400">
                            PID:{" "}
                            <span className="text-white font-mono">
                              {conversation.managed_session.pid}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Match explanation */}
                {conversation.match_type &&
                  conversation.match_type !== "unmatched" && (
                    <div className="mt-3 p-2 bg-gray-700/50 rounded text-xs text-gray-400">
                      <span className="text-gray-500">Correlation:</span>{" "}
                      {conversation.match_type === "exact" &&
                        "Hook session and transcript matched by ID"}
                      {conversation.match_type === "confident" &&
                        "Matched by directory and timing"}
                      {conversation.match_type === "uncertain" &&
                        "Possible match based on timing"}
                      {conversation.match_details && (
                        <span className="ml-2 text-gray-500">
                          (score: {conversation.match_details.score})
                        </span>
                      )}
                    </div>
                  )}
              </section>

              {/* Analyze Section - shown for transcripts without enrichments */}
              {canAnalyze && (
                <section className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-white mb-2">
                    Compute Quality Analytics
                  </h3>
                  <p className="text-sm text-gray-400 mb-3">
                    This transcript hasn't been analyzed yet. Click below to
                    compute quality scores, task type, and other analytics.
                  </p>
                  {analyzeError && (
                    <div className="mb-3 p-2 bg-red-900/30 border border-red-700 rounded text-sm text-red-400">
                      {analyzeError}
                    </div>
                  )}
                  <button
                    onClick={handleAnalyzeTranscript}
                    disabled={analyzing}
                    className={`px-4 py-2 rounded text-sm font-medium ${
                      analyzing
                        ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-500"
                    }`}
                  >
                    {analyzing ? "Analyzing..." : "Analyze Transcript"}
                  </button>
                </section>
              )}

              {/* Privacy Risk Analysis - shown for transcripts */}
              {conversation.transcript && (
                <section>
                  <h3 className="text-md font-semibold text-white mb-3">
                    Privacy Risk Analysis
                    {privacyRisk && (
                      <span
                        className={`ml-2 px-2 py-0.5 text-xs rounded ${
                          privacyRisk.risk_level === "high"
                            ? "bg-red-600"
                            : privacyRisk.risk_level === "medium"
                              ? "bg-yellow-600"
                              : "bg-green-600"
                        }`}
                      >
                        {privacyRisk.risk_level}
                      </span>
                    )}
                  </h3>
                  {loadingPrivacyRisk ? (
                    <div className="text-gray-400 text-sm">Analyzing...</div>
                  ) : privacyRisk ? (
                    <div className="space-y-3">
                      {/* Summary stats */}
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="p-2 bg-gray-700/50 rounded">
                          <div className="text-gray-400 text-xs">
                            Files Read
                          </div>
                          <div className="text-white font-medium">
                            {privacyRisk.summary.files_read}
                          </div>
                        </div>
                        <div className="p-2 bg-gray-700/50 rounded">
                          <div className="text-gray-400 text-xs">
                            Files Written
                          </div>
                          <div className="text-white font-medium">
                            {privacyRisk.summary.files_written +
                              privacyRisk.summary.files_edited}
                          </div>
                        </div>
                        <div className="p-2 bg-gray-700/50 rounded">
                          <div className="text-gray-400 text-xs">Domains</div>
                          <div className="text-white font-medium">
                            {privacyRisk.summary.domains_accessed}
                          </div>
                        </div>
                      </div>

                      {/* Sensitive files warning */}
                      {privacyRisk.sensitive_files.length > 0 && (
                        <div className="p-3 bg-red-900/30 border border-red-700 rounded">
                          <div className="text-red-400 text-sm font-medium mb-2">
                            Sensitive Files Detected
                          </div>
                          <div className="space-y-1">
                            {privacyRisk.sensitive_files.map((sf, i) => (
                              <div key={i} className="text-xs">
                                <span className="text-red-300 font-mono">
                                  {sf.path}
                                </span>
                                <span className="text-red-400/70 ml-2">
                                  {sf.reason}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommendations */}
                      {privacyRisk.recommendations.length > 0 && (
                        <div className="text-xs text-yellow-400">
                          {privacyRisk.recommendations.map((rec, i) => (
                            <div key={i}>• {rec}</div>
                          ))}
                        </div>
                      )}

                      {/* Expandable file list */}
                      {privacyRisk.files_read.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowAllFiles(!showAllFiles)}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            {showAllFiles ? "Hide" : "Show"} all{" "}
                            {privacyRisk.files_read.length} files
                          </button>
                          {showAllFiles && (
                            <div className="mt-2 p-2 bg-gray-800 rounded max-h-40 overflow-y-auto">
                              {privacyRisk.files_read.map((path, i) => (
                                <div
                                  key={i}
                                  className="text-xs font-mono text-gray-300"
                                >
                                  {path}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Hook data note */}
                      {!conversation.hook_session && (
                        <div className="text-xs text-gray-500 italic">
                          Tip: Hook data (tool names/timing only) is safer to
                          share than full transcripts.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm">
                      Unable to analyze privacy risk
                    </div>
                  )}
                </section>
              )}

              {/* Auto Tags Section */}
              {enrichments?.auto_tags && (
                <section>
                  <h3 className="text-md font-semibold text-white mb-3">
                    Auto Tags
                  </h3>
                  <div className="mb-2">
                    <span className="text-gray-400 text-sm">Task Type:</span>
                    <span
                      className={`ml-2 px-2 py-1 rounded text-sm text-white ${getTaskTypeColor(enrichments.auto_tags.taskType)}`}
                    >
                      {enrichments.auto_tags.taskType}
                    </span>
                  </div>
                  {enrichments.auto_tags.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {enrichments.auto_tags.tags.map(
                        (tag: AutoTag, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300"
                            title={`Category: ${tag.category}, Confidence: ${Math.round(tag.confidence * 100)}%`}
                          >
                            {tag.name}
                          </span>
                        )
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Quality Score Section */}
              {enrichments?.quality_score && (
                <section>
                  <h3 className="text-md font-semibold text-white mb-3">
                    Quality Score
                  </h3>
                  <div className="mb-3">
                    <span
                      className={`text-3xl font-bold ${getQualityColor(enrichments.quality_score.overall)}`}
                    >
                      {enrichments.quality_score.overall}%
                    </span>
                    <span className="ml-2 text-gray-400 text-sm">
                      {enrichments.quality_score.classification}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">Completion:</span>
                      <span className="ml-2 text-white">
                        {enrichments.quality_score.dimensions.completion}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Code Quality:</span>
                      <span className="ml-2 text-white">
                        {enrichments.quality_score.dimensions.codeQuality}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Efficiency:</span>
                      <span className="ml-2 text-white">
                        {enrichments.quality_score.dimensions.efficiency}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Safety:</span>
                      <span className="ml-2 text-white">
                        {enrichments.quality_score.dimensions.safety}%
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Outcome Signals Section */}
              {enrichments?.outcome_signals && (
                <section>
                  <h3 className="text-md font-semibold text-white mb-3">
                    Outcome Signals
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">Exit Codes:</span>
                      <span className="ml-2 text-white">
                        {enrichments.outcome_signals.exitCodes.successCount} ok
                        / {enrichments.outcome_signals.exitCodes.failureCount}{" "}
                        fail
                      </span>
                    </div>
                    {enrichments.outcome_signals.testResults && (
                      <div>
                        <span className="text-gray-400">Tests:</span>
                        <span className="ml-2 text-green-400">
                          {enrichments.outcome_signals.testResults.passed}{" "}
                          passed
                        </span>
                        {enrichments.outcome_signals.testResults.failed > 0 && (
                          <span className="ml-1 text-red-400">
                            {enrichments.outcome_signals.testResults.failed}{" "}
                            failed
                          </span>
                        )}
                      </div>
                    )}
                    {enrichments.outcome_signals.lintResults && (
                      <div>
                        <span className="text-gray-400">Lint:</span>
                        <span className="ml-2 text-white">
                          {enrichments.outcome_signals.lintResults.errors}{" "}
                          errors /{" "}
                          {enrichments.outcome_signals.lintResults.warnings}{" "}
                          warnings
                        </span>
                      </div>
                    )}
                    {enrichments.outcome_signals.buildStatus && (
                      <div>
                        <span className="text-gray-400">Build:</span>
                        <span
                          className={`ml-2 ${enrichments.outcome_signals.buildStatus.success ? "text-green-400" : "text-red-400"}`}
                        >
                          {enrichments.outcome_signals.buildStatus.success
                            ? "Success"
                            : "Failed"}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Loop Detection Section */}
              {enrichments?.loop_detection?.loopsDetected &&
                enrichments.loop_detection.patterns.length > 0 && (
                  <section className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
                    <h3 className="text-md font-semibold text-yellow-400 mb-3">
                      Loop Detection
                      <span className="ml-2 text-sm font-normal text-yellow-500">
                        ({enrichments.loop_detection.totalRetries} retries)
                      </span>
                    </h3>
                    <div className="space-y-2">
                      {enrichments.loop_detection.patterns.map(
                        (pattern: LoopPattern, i: number) => (
                          <div key={i} className="text-sm">
                            <span className="text-yellow-300">
                              {pattern.patternType}
                            </span>
                            <span className="text-gray-400 ml-2">
                              {pattern.iterations} iterations
                            </span>
                            {pattern.resolution && (
                              <span
                                className={`ml-2 ${pattern.resolution === "success" ? "text-green-400" : "text-red-400"}`}
                              >
                                {pattern.resolution}
                              </span>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </section>
                )}

              {/* Git Diff Section */}
              {enrichments?.diff_snapshot && (
                <section>
                  <h3 className="text-md font-semibold text-white mb-3">
                    Git Changes
                  </h3>
                  <div className="text-sm space-y-2">
                    <div className="flex gap-4">
                      <span className="text-green-400">
                        +{enrichments.diff_snapshot.summary.linesAdded}
                      </span>
                      <span className="text-red-400">
                        -{enrichments.diff_snapshot.summary.linesRemoved}
                      </span>
                      <span className="text-gray-400">
                        {enrichments.diff_snapshot.summary.filesChanged} files
                      </span>
                    </div>
                    {enrichments.diff_snapshot.summary.commitsCreated > 0 && (
                      <div className="text-gray-400">
                        {enrichments.diff_snapshot.summary.commitsCreated}{" "}
                        commit(s)
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Manual Annotation Section */}
              <section className="border-t border-gray-700 pt-6">
                <h3 className="text-md font-semibold text-white mb-3">
                  Your Annotation
                </h3>

                {/* Feedback buttons */}
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={() => handleFeedbackClick("positive")}
                    className={`px-4 py-2 rounded flex items-center gap-2 ${
                      enrichments?.manual_annotation?.feedback === "positive"
                        ? "bg-green-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    Positive
                  </button>
                  <button
                    onClick={() => handleFeedbackClick("negative")}
                    className={`px-4 py-2 rounded flex items-center gap-2 ${
                      enrichments?.manual_annotation?.feedback === "negative"
                        ? "bg-red-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    Negative
                  </button>
                  <button
                    onClick={() => handleFeedbackClick(null)}
                    className={`px-4 py-2 rounded flex items-center gap-2 ${
                      !enrichments?.manual_annotation?.feedback
                        ? "bg-gray-500 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    Clear
                  </button>
                </div>

                {/* Workflow Status */}
                <div className="mb-4">
                  <div className="text-gray-400 text-sm mb-2">
                    Review Status:
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleWorkflowStatusClick("reviewed")}
                      className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${
                        enrichments?.manual_annotation?.workflowStatus ===
                        "reviewed"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      <span>&#10003;</span> Reviewed
                    </button>
                    <button
                      onClick={() =>
                        handleWorkflowStatusClick("ready_to_contribute")
                      }
                      className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${
                        enrichments?.manual_annotation?.workflowStatus ===
                        "ready_to_contribute"
                          ? "bg-green-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      <span>&#8593;</span> Ready to Contribute
                    </button>
                    <button
                      onClick={() => handleWorkflowStatusClick("skipped")}
                      className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${
                        enrichments?.manual_annotation?.workflowStatus ===
                        "skipped"
                          ? "bg-gray-500 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      <span>&#8594;</span> Skipped
                    </button>
                    {enrichments?.manual_annotation?.workflowStatus &&
                      enrichments.manual_annotation.workflowStatus !==
                        "pending" && (
                        <button
                          onClick={() => handleWorkflowStatusClick("pending")}
                          className="px-3 py-1.5 rounded text-sm text-gray-400 hover:bg-gray-700"
                        >
                          Clear
                        </button>
                      )}
                  </div>
                </div>

                {/* User tags */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Tags:</span>
                    <button
                      onClick={() => setEditingTags(!editingTags)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {editingTags ? "Cancel" : "Edit"}
                    </button>
                  </div>
                  {editingTags ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagsValue}
                        onChange={(e) => setTagsValue(e.target.value)}
                        placeholder="tag1, tag2, tag3"
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                      />
                      <button
                        onClick={handleSaveTags}
                        className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {enrichments?.manual_annotation?.userTags?.map(
                        (tag: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-blue-600/30 border border-blue-500 rounded text-xs text-blue-300"
                          >
                            {tag}
                          </span>
                        )
                      ) || (
                        <span className="text-gray-500 text-sm">No tags</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Notes:</span>
                    <button
                      onClick={() => setEditingNotes(!editingNotes)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {editingNotes ? "Cancel" : "Edit"}
                    </button>
                  </div>
                  {editingNotes ? (
                    <div>
                      <textarea
                        value={notesValue}
                        onChange={(e) => setNotesValue(e.target.value)}
                        placeholder="Add notes about this session..."
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white min-h-[100px]"
                      />
                      <button
                        onClick={handleSaveNotes}
                        className="mt-2 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
                      >
                        Save Notes
                      </button>
                    </div>
                  ) : (
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">
                      {enrichments?.manual_annotation?.notes || (
                        <span className="text-gray-500">No notes</span>
                      )}
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
