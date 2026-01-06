import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeTranscript,
  computeEnrichments,
  fetchEnrichments,
  fetchLocalTranscript,
  fetchProjects,
  fetchSessionEnrichments,
  setSessionAnnotation,
  updateSessionTags
} from "../api/client";
import type {
  AutoTag,
  EnrichmentListItem,
  EnrichmentsListResult,
  FeedbackType,
  LoopPattern,
  ParsedLocalTranscript,
  Project,
  SessionEnrichments,
  ToolUsage
} from "../api/types";
import { useConversations } from "../context/ConversationContext";
import { ChatViewer } from "./ChatViewer";
import { EnrichmentTooltip } from "./ui/InfoTooltip";
import { WorkflowProgressWidget } from "./WorkflowProgressWidget";

type ViewMode =
  | "overview"
  | "chat"
  | "transcript-source"
  | "aw-log"
  | "timeline";
type SortField = "time" | "quality";
type SortDirection = "asc" | "desc";

// Helper to format timestamps
function formatTime(ts: number): string {
  const date = new Date(ts > 1e12 ? ts : ts * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
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

// Extract project name from path (last 2 components or just last)
function getProjectName(path: string | null | undefined): string {
  if (!path) return "Unknown Project";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "Unknown Project";
  // Return last 2 parts if available (e.g., "org/repo" or "Documents/project")
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1];
}

// Get data source label from match type
function getDataSourceLabel(
  matchType: string | undefined,
  hasManaged?: boolean
): { label: string; color: string } {
  // Managed sessions get a special indicator
  if (hasManaged) {
    return { label: "Managed", color: "text-purple-400" };
  }
  switch (matchType) {
    case "exact":
      return { label: "Full", color: "text-green-400" };
    case "confident":
      return { label: "Linked", color: "text-yellow-400" };
    case "uncertain":
      return { label: "Linked", color: "text-orange-400" };
    case "unmatched":
      return { label: "Partial", color: "text-gray-500" };
    default:
      return { label: "", color: "text-gray-500" };
  }
}

interface ConversationsPaneProps {
  onNavigateToTab?: (tab: string) => void;
  isActive?: boolean;
  activatedAt?: number;
}

export function ConversationsPane({
  onNavigateToTab,
  isActive: _isActive,
  activatedAt: _activatedAt
}: ConversationsPaneProps) {
  // Use shared context for conversations and names
  const {
    conversations: contextConversations,
    conversationNames: contextNames,
    loading: contextLoading,
    updateConversationName,
    filter: contextFilter,
    setFilter: setContextFilter,
    returnTo,
    setReturnTo,
    selectedConversationId: contextSelectedId,
    setSelectedConversationId: setContextSelectedId
  } = useConversations();

  // Local state for enrichments list (more detailed than context)
  const [enrichmentsList, setEnrichmentsList] =
    useState<EnrichmentsListResult | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [selectedEnrichments, setSelectedEnrichments] =
    useState<SessionEnrichments | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [bulkComputing, setBulkComputing] = useState(false);
  const [bulkComputeResult, setBulkComputeResult] = useState<{
    computed: number;
    skipped: number;
    errors: number;
  } | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  // View mode state (for detail panel)
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [parsedTranscript, setParsedTranscript] =
    useState<ParsedLocalTranscript | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [sourceJson, setSourceJson] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [timeline, setTimeline] = useState<ToolUsage[]>([]);
  const [_timelineLoading, setTimelineLoading] = useState(false);

  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMatchType, setFilterMatchType] = useState<string>("all");
  const [filterFeedback, setFilterFeedback] = useState<string>("all");
  const [filterTaskType, setFilterTaskType] = useState<string>("all");
  const [filterQualityRange, setFilterQualityRange] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterHasHooks, setFilterHasHooks] = useState<string>("all");
  const [filterManaged, setFilterManaged] = useState<string>("all");
  const [filterHasQuality, setFilterHasQuality] = useState<string>("all");
  const [filterWorkflowStatus, setFilterWorkflowStatus] =
    useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [projects, setProjects] = useState<Project[]>([]);
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const advancedFilterCount =
    (filterAgent !== "all" ? 1 : 0) +
    (filterHasHooks !== "all" ? 1 : 0) +
    (filterManaged !== "all" ? 1 : 0) +
    (filterHasQuality !== "all" ? 1 : 0) +
    (filterWorkflowStatus !== "all" ? 1 : 0);

  // Apply context filter when it changes (from analytics click-through)
  useEffect(() => {
    if (contextFilter) {
      if (contextFilter.taskType) setFilterTaskType(contextFilter.taskType);
      if (contextFilter.qualityRange)
        setFilterQualityRange(contextFilter.qualityRange);
      if (contextFilter.matchType) setFilterMatchType(contextFilter.matchType);
      if (contextFilter.feedback) setFilterFeedback(contextFilter.feedback);
      // Clear the context filter after applying
      setContextFilter(null);
    }
  }, [contextFilter, setContextFilter]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);

  // Annotation editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [editingTags, setEditingTags] = useState(false);
  const [tagsValue, setTagsValue] = useState("");

  // Conversation naming
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Use context data
  const conversations = contextConversations;
  const conversationNames = contextNames;
  const loading = contextLoading;

  // Load enrichments list on mount (more detailed than context enrichments)
  useEffect(() => {
    loadEnrichments();
  }, []);

  // Load projects for filtering
  useEffect(() => {
    fetchProjects()
      .then((data) => setProjects(data))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionDetail(selectedSessionId);
    }
  }, [selectedSessionId]);

  // Handle incoming navigation from Share panel or other tabs
  useEffect(() => {
    if (contextSelectedId && contextSelectedId !== selectedSessionId) {
      setSelectedSessionId(contextSelectedId);
      // Clear context selection after applying
      setContextSelectedId(null);
    }
  }, [contextSelectedId, selectedSessionId, setContextSelectedId]);

  // Reset view mode and loaded data when session changes
  useEffect(() => {
    setViewMode("overview");
    setParsedTranscript(null);
    setSourceJson(null);
    setTimeline([]);
  }, [selectedSessionId]);

  // Load transcript when switching to chat view
  useEffect(() => {
    if (viewMode === "chat" && selectedSessionId) {
      const conv = conversations.find(
        (s) =>
          s.correlation_id === selectedSessionId ||
          s.hook_session?.session_id === selectedSessionId
      );
      if (conv?.transcript?.id) {
        loadTranscript(conv.transcript.id);
      }
    }
  }, [viewMode, selectedSessionId, conversations]);

  // Load source JSON when switching to transcript-source view
  useEffect(() => {
    if (
      viewMode === "transcript-source" &&
      selectedSessionId &&
      !sourceJson &&
      !sourceLoading
    ) {
      const conv = conversations.find(
        (s) =>
          s.correlation_id === selectedSessionId ||
          s.hook_session?.session_id === selectedSessionId
      );
      if (conv?.transcript?.id) {
        setSourceLoading(true);
        fetch(
          `/api/contrib/local-logs/${encodeURIComponent(conv.transcript.id)}/raw`
        )
          .then((res) => {
            if (!res.ok) throw new Error("Failed to fetch");
            return res.text();
          })
          .then((text) => setSourceJson(text))
          .catch(() => setSourceJson("// Failed to load source file"))
          .finally(() => setSourceLoading(false));
      }
    }
  }, [viewMode, selectedSessionId, conversations, sourceJson, sourceLoading]);

  // Load timeline when switching to timeline view (for merged view)
  useEffect(() => {
    if (viewMode === "timeline" && selectedSessionId) {
      const conv = conversations.find(
        (s) =>
          s.correlation_id === selectedSessionId ||
          s.hook_session?.session_id === selectedSessionId
      );
      if (conv?.hook_session?.session_id) {
        loadTimeline(conv.hook_session.session_id);
      }
      // Also load transcript for merged timeline
      if (conv?.transcript?.id && !parsedTranscript) {
        loadTranscript(conv.transcript.id);
      }
    }
  }, [viewMode, selectedSessionId, conversations, parsedTranscript]);

  async function loadTranscript(transcriptId: string) {
    if (parsedTranscript?.id === transcriptId) return; // Already loaded
    setTranscriptLoading(true);
    try {
      const transcript = await fetchLocalTranscript(transcriptId, "chat");
      setParsedTranscript(transcript);
    } catch (e) {
      console.error("Failed to load transcript:", e);
      setParsedTranscript(null);
    } finally {
      setTranscriptLoading(false);
    }
  }

  async function loadTimeline(sessionId: string) {
    if (timeline.length > 0) return; // Already loaded for this session
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/hooks/sessions/${sessionId}/timeline`);
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (e) {
      console.error("Failed to load timeline:", e);
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  // Handle back button navigation
  function handleBackClick() {
    if (returnTo && onNavigateToTab) {
      onNavigateToTab(returnTo.tab);
      setReturnTo(null);
    }
  }

  async function loadEnrichments() {
    try {
      const enrichmentsResult = await fetchEnrichments();
      setEnrichmentsList(enrichmentsResult);
    } catch (e) {
      console.error("Failed to load enrichments:", e);
    }
  }

  // Helper to get the enrichment ID for a session (uses hook_session.session_id)
  function getEnrichmentId(sessionId: string): string {
    const session = conversations.find(
      (s) =>
        s.correlation_id === sessionId ||
        s.hook_session?.session_id === sessionId
    );
    return session?.hook_session?.session_id || sessionId;
  }

  async function loadSessionDetail(sessionId: string) {
    setDetailLoading(true);
    try {
      const enrichmentId = getEnrichmentId(sessionId);
      const enrichments = await fetchSessionEnrichments(enrichmentId);
      setSelectedEnrichments(enrichments);
      setNotesValue(enrichments.manual_annotation?.notes || "");
      setTagsValue(enrichments.manual_annotation?.userTags?.join(", ") || "");
    } catch {
      setSelectedEnrichments(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleFeedbackClick(
    sessionId: string,
    feedback: FeedbackType
  ) {
    try {
      const enrichmentId = getEnrichmentId(sessionId);
      await setSessionAnnotation(enrichmentId, feedback);
      // Reload enrichments
      const enrichmentsResult = await fetchEnrichments();
      setEnrichmentsList(enrichmentsResult);
      if (selectedSessionId === sessionId) {
        await loadSessionDetail(sessionId);
      }
    } catch (e) {
      console.error("Failed to set feedback:", e);
    }
  }

  async function handleSaveNotes() {
    if (!selectedSessionId || !selectedEnrichments) return;
    try {
      // Note: We need to keep existing feedback when saving notes
      const currentFeedback = selectedEnrichments.manual_annotation?.feedback;
      const enrichmentId = getEnrichmentId(selectedSessionId);
      if (currentFeedback) {
        await setSessionAnnotation(enrichmentId, currentFeedback);
      }
      await loadSessionDetail(selectedSessionId);
      setEditingNotes(false);
    } catch (e) {
      console.error("Failed to save notes:", e);
    }
  }

  async function handleSaveTags() {
    if (!selectedSessionId) return;
    const tags = tagsValue
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      const enrichmentId = getEnrichmentId(selectedSessionId);
      await updateSessionTags(enrichmentId, tags);
      await loadSessionDetail(selectedSessionId);
      setEditingTags(false);
    } catch (e) {
      console.error("Failed to save tags:", e);
    }
  }

  async function handleSaveName(conversationId: string) {
    const trimmed = nameValue.trim();
    try {
      await updateConversationName(conversationId, trimmed || null);
      setEditingNameId(null);
      setNameValue("");
    } catch (e) {
      console.error("Failed to save name:", e);
    }
  }

  function startEditingName(conversationId: string, currentName: string) {
    setEditingNameId(conversationId);
    setNameValue(currentName);
    // Focus the input after React renders it
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  async function handleAnalyzeSession() {
    if (!selectedSessionId) return;
    const session = conversations.find(
      (s) =>
        s.correlation_id === selectedSessionId ||
        s.hook_session?.session_id === selectedSessionId
    );

    const transcriptId = session?.transcript?.id;
    const hookSessionId = session?.hook_session?.session_id;

    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      // Prefer hook session analysis (richer data), fall back to transcript
      if (hookSessionId) {
        await computeEnrichments([hookSessionId], true);
        const result = await fetchSessionEnrichments(hookSessionId);
        setSelectedEnrichments(result);
      } else if (transcriptId) {
        await analyzeTranscript(transcriptId);
        const result = await fetchSessionEnrichments(
          `transcript:${transcriptId}`
        );
        setSelectedEnrichments(result);
      } else {
        setAnalyzeError("No data source available for analysis");
        return;
      }
      // Reload the enrichments list
      const enrichmentsResult = await fetchEnrichments();
      setEnrichmentsList(enrichmentsResult);
    } catch (e) {
      console.error("Failed to analyze session:", e);
      setAnalyzeError(e instanceof Error ? e.message : "Failed to analyze");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleBulkComputeQuality() {
    setBulkComputing(true);
    setBulkComputeResult(null);
    setShowBulkConfirm(false);

    try {
      // Get all hook session IDs that don't have quality scores
      const hookSessionIds = displaySessions
        .filter(
          (s) =>
            s.session.hook_session &&
            s.enrichmentItem?.quality_score === undefined
        )
        .map((s) => s.session.hook_session!.session_id);

      let computed = 0;
      let skipped = 0;
      let errors = 0;

      // Compute enrichments for hook sessions
      if (hookSessionIds.length > 0) {
        const result = await computeEnrichments(hookSessionIds, true);
        computed += result.computed;
        skipped += result.skipped;
        errors += result.errors.length;
      }

      // For transcript-only sessions, analyze them individually
      const transcriptOnlySessions = displaySessions.filter(
        (s) =>
          !s.session.hook_session &&
          s.session.transcript?.id &&
          s.enrichmentItem?.quality_score === undefined
      );

      for (const { session } of transcriptOnlySessions) {
        try {
          await analyzeTranscript(session.transcript!.id);
          computed++;
        } catch {
          errors++;
        }
      }

      setBulkComputeResult({ computed, skipped, errors });

      // Reload enrichments list
      const enrichmentsResult = await fetchEnrichments();
      setEnrichmentsList(enrichmentsResult);
    } catch (e) {
      console.error("Bulk compute failed:", e);
      setBulkComputeResult({ computed: 0, skipped: 0, errors: 1 });
    } finally {
      setBulkComputing(false);
    }
  }

  // Create a map of enrichments by session ID for quick lookup
  const enrichmentsMap = useMemo(() => {
    const map = new Map<string, EnrichmentListItem>();
    if (enrichmentsList) {
      for (const item of enrichmentsList.sessions) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [enrichmentsList]);

  // Extract unique agents for filter dropdown
  const uniqueAgents = useMemo(() => {
    const agents = new Set<string>();
    for (const conv of conversations) {
      if (conv.agent) agents.add(conv.agent);
    }
    return Array.from(agents).sort();
  }, [conversations]);

  // Combine sessions with enrichments for display
  const displaySessions = useMemo(() => {
    // Merge correlated sessions with enrichments
    let sessions = conversations.map((session) => ({
      session,
      enrichmentItem:
        enrichmentsMap.get(session.correlation_id) ||
        enrichmentsMap.get(`corr:${session.hook_session?.session_id}`) ||
        enrichmentsMap.get(session.hook_session?.session_id || "") ||
        null
    }));

    // Apply filters
    if (filterMatchType !== "all") {
      sessions = sessions.filter(
        (s) => s.session.match_type === filterMatchType
      );
    }

    if (filterFeedback !== "all") {
      sessions = sessions.filter((s) => {
        const feedback = s.enrichmentItem?.feedback;
        if (filterFeedback === "positive") return feedback === "positive";
        if (filterFeedback === "negative") return feedback === "negative";
        if (filterFeedback === "unlabeled") return !feedback;
        return true;
      });
    }

    // Task type filter (from analytics click-through)
    if (filterTaskType !== "all") {
      sessions = sessions.filter(
        (s) => s.enrichmentItem?.task_type === filterTaskType
      );
    }

    // Quality range filter (from analytics click-through)
    if (filterQualityRange !== "all") {
      sessions = sessions.filter((s) => {
        const quality = s.enrichmentItem?.quality_score;
        if (quality === undefined) return false;
        // Parse range like "0-20", "20-40", etc.
        const match = filterQualityRange.match(/(\d+)-(\d+)/);
        if (match) {
          const min = Number.parseInt(match[1], 10);
          const max = Number.parseInt(match[2], 10);
          return quality >= min && quality < max;
        }
        return false;
      });
    }

    // Agent filter
    if (filterAgent !== "all") {
      sessions = sessions.filter((s) => s.session.agent === filterAgent);
    }

    // Has hooks filter
    if (filterHasHooks === "has") {
      sessions = sessions.filter((s) => s.session.hook_session !== null);
    } else if (filterHasHooks === "none") {
      sessions = sessions.filter((s) => s.session.hook_session === null);
    }

    // Managed session filter
    if (filterManaged === "managed") {
      sessions = sessions.filter((s) => s.session.managed_session !== null);
    } else if (filterManaged === "unmanaged") {
      sessions = sessions.filter((s) => s.session.managed_session === null);
    }

    // Has quality score filter
    if (filterHasQuality === "has") {
      sessions = sessions.filter(
        (s) => s.enrichmentItem?.quality_score !== undefined
      );
    } else if (filterHasQuality === "none") {
      sessions = sessions.filter(
        (s) => s.enrichmentItem?.quality_score === undefined
      );
    }

    // Workflow status filter
    if (filterWorkflowStatus !== "all") {
      sessions = sessions.filter((s) => {
        const status = s.enrichmentItem?.workflow_status || "pending";
        return status === filterWorkflowStatus;
      });
    }

    // Project filter
    if (filterProject !== "all") {
      const selectedProject = projects.find((p) => p.id === filterProject);
      if (selectedProject) {
        sessions = sessions.filter((s) => {
          const cwd = s.session.cwd || "";
          return selectedProject.paths.some(
            (path) => cwd === path || cwd.startsWith(path + "/")
          );
        });
      }
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      sessions = sessions.filter((s) => {
        const sessionId =
          s.session.correlation_id || s.session.hook_session?.session_id || "";
        const customName = conversationNames[sessionId]?.customName;
        return (
          customName?.toLowerCase().includes(query) ||
          s.session.cwd?.toLowerCase().includes(query) ||
          s.session.agent?.toLowerCase().includes(query) ||
          s.enrichmentItem?.task_type?.toLowerCase().includes(query)
        );
      });
    }

    // Apply sorting
    sessions.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "time":
          cmp = a.session.start_time - b.session.start_time;
          break;
        case "quality":
          cmp =
            (a.enrichmentItem?.quality_score || 0) -
            (b.enrichmentItem?.quality_score || 0);
          break;
      }
      return sortDirection === "desc" ? -cmp : cmp;
    });

    return sessions;
  }, [
    conversations,
    enrichmentsMap,
    conversationNames,
    filterMatchType,
    filterFeedback,
    filterTaskType,
    filterQualityRange,
    filterAgent,
    filterHasHooks,
    filterManaged,
    filterHasQuality,
    filterWorkflowStatus,
    filterProject,
    projects,
    searchQuery,
    sortField,
    sortDirection
  ]);

  // Count sessions without quality scores (for bulk compute button)
  const sessionsWithoutQuality = useMemo(() => {
    return displaySessions.filter(
      (s) =>
        s.enrichmentItem?.quality_score === undefined &&
        (s.session.hook_session || s.session.transcript?.id)
    ).length;
  }, [displaySessions]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    filterMatchType,
    filterFeedback,
    filterTaskType,
    filterQualityRange,
    filterAgent,
    filterHasHooks,
    filterManaged,
    filterHasQuality,
    filterWorkflowStatus,
    filterProject,
    searchQuery,
    sortField,
    sortDirection
  ]);

  // Paginated sessions
  const totalPages = Math.ceil(displaySessions.length / pageSize);
  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displaySessions.slice(start, start + pageSize);
  }, [displaySessions, currentPage, pageSize]);

  // Find selected session data
  const selectedSession = displaySessions.find(
    (s) =>
      s.session.correlation_id === selectedSessionId ||
      s.session.hook_session?.session_id === selectedSessionId
  );

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-gray-400">Loading Conversations...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Data sources info */}
      <div className="text-xs text-gray-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Data shown based on transcript days setting in</span>
          <button
            onClick={() => {
              // Navigate to settings tab
              const event = new KeyboardEvent("keydown", { key: "9" });
              window.dispatchEvent(event);
            }}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Settings
          </button>
        </div>
        <div className="flex items-center gap-3 text-gray-600">
          <span title="Hook sessions and tool usage data">
            <code className="bg-gray-700/50 px-1 rounded">
              ~/.agentwatch/hooks/
            </code>
          </span>
          <span title="Claude Code transcripts">
            <code className="bg-gray-700/50 px-1 rounded">~/.claude/</code>
          </span>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-240px)]">
        {/* Left Panel - Session List */}
        <div className="w-80 shrink-0 bg-gray-800 rounded-lg flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-2">
              Conversations
            </h2>

            <div className="space-y-2">
              {/* Search + Advanced */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((open) => !open)}
                  aria-expanded={showAdvancedFilters}
                  aria-controls="conversations-advanced-filters"
                  className="flex items-center gap-1 px-2 py-2 bg-gray-700 border border-gray-600 rounded text-xs text-white hover:bg-gray-600 shrink-0"
                >
                  <span>
                    Advanced
                    {advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
                  </span>
                  <svg
                    className={`w-3 h-3 transition-transform ${
                      showAdvancedFilters ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-2 overflow-hidden">
                <select
                  value={filterMatchType}
                  onChange={(e) => setFilterMatchType(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white truncate"
                  title="Data completeness: Full = hooks + transcript matched. Linked = matched by path/time. Partial = only one source."
                >
                  <option value="all">All sources</option>
                  <option value="exact">Full (hooks + transcript)</option>
                  <option value="confident">Linked</option>
                  <option value="uncertain">Linked (uncertain)</option>
                  <option value="unmatched">Partial</option>
                </select>
                <select
                  value={filterFeedback}
                  onChange={(e) => setFilterFeedback(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white truncate"
                  title="Your manual rating of sessions (thumbs up/down)"
                >
                  <option value="all">Feedback</option>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                  <option value="unlabeled">Unlabeled</option>
                </select>
              </div>

              {/* Project filter - main section */}
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white truncate"
                title="Filter by project"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {showAdvancedFilters && (
                <div id="conversations-advanced-filters" className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={filterAgent}
                      onChange={(e) => setFilterAgent(e.target.value)}
                      className="min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white truncate"
                      title="Filter by AI agent type (Claude Code, Codex, etc.)"
                    >
                      <option value="all">All agents</option>
                      {uniqueAgents.map((agent) => (
                        <option key={agent} value={agent}>
                          {agent}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterHasHooks}
                      onChange={(e) => setFilterHasHooks(e.target.value)}
                      className="min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white truncate"
                      title="Hooks = agentwatch event tracking. Sessions with hooks have tool-level data."
                    >
                      <option value="all">Any hooks</option>
                      <option value="has">Has hooks</option>
                      <option value="none">No hooks</option>
                    </select>
                    <select
                      value={filterManaged}
                      onChange={(e) => setFilterManaged(e.target.value)}
                      className="min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white truncate"
                      title="Managed = started via 'aw run' with extra metadata. Unmanaged = normal sessions."
                    >
                      <option value="all">All types</option>
                      <option value="managed">Managed</option>
                      <option value="unmanaged">Unmanaged</option>
                    </select>
                    <select
                      value={filterHasQuality}
                      onChange={(e) => setFilterHasQuality(e.target.value)}
                      className="min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white truncate"
                      title="Quality scores are computed from session data (tool success, completion, safety)"
                    >
                      <option value="all">Quality score</option>
                      <option value="has">Has score</option>
                      <option value="none">No score</option>
                    </select>
                    <select
                      value={filterWorkflowStatus}
                      onChange={(e) => setFilterWorkflowStatus(e.target.value)}
                      className="min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white truncate"
                      title="Contribution workflow status: Pending → Reviewed → Ready to contribute"
                    >
                      <option value="all">Review status</option>
                      <option value="pending">Pending</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="ready_to_contribute">Ready</option>
                      <option value="skipped">Skipped</option>
                    </select>
                    {sessionsWithoutQuality > 0 && (
                      <button
                        onClick={() => setShowBulkConfirm(true)}
                        disabled={bulkComputing}
                        className="col-span-2 px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-xs rounded"
                        title={`Compute quality scores for ${sessionsWithoutQuality} sessions`}
                      >
                        {bulkComputing
                          ? "Computing..."
                          : `Compute All (${sessionsWithoutQuality})`}
                      </button>
                    )}
                  </div>

                  {/* Bulk Compute Confirmation */}
                  {showBulkConfirm && (
                    <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded">
                      <div className="text-sm text-yellow-300 mb-2">
                        Compute quality scores for {sessionsWithoutQuality}{" "}
                        sessions?
                      </div>
                      <div className="text-xs text-yellow-400/70 mb-3">
                        This may take a while for many sessions.
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleBulkComputeQuality}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded"
                        >
                          Yes, compute all
                        </button>
                        <button
                          onClick={() => setShowBulkConfirm(false)}
                          className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Bulk Compute Result */}
                  {bulkComputeResult && (
                    <div className="p-2 bg-green-900/30 border border-green-700 rounded text-xs">
                      <div className="text-green-300">
                        Computed: {bulkComputeResult.computed}, Skipped:{" "}
                        {bulkComputeResult.skipped}
                        {bulkComputeResult.errors > 0 && (
                          <span className="text-red-400">
                            , Errors: {bulkComputeResult.errors}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setBulkComputeResult(null)}
                        className="text-gray-400 hover:text-white mt-1"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Workflow Progress Widget */}
                  <WorkflowProgressWidget
                    onFilterClick={(status) => {
                      setFilterWorkflowStatus(status);
                    }}
                  />
                </div>
              )}

              {/* Task type filter (from analytics) */}
              {filterTaskType !== "all" && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-900/30 border border-blue-700 rounded text-xs">
                  <span className="text-blue-300">Task: {filterTaskType}</span>
                  <button
                    onClick={() => setFilterTaskType("all")}
                    className="text-blue-400 hover:text-blue-200"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Quality range filter (from analytics) */}
              {filterQualityRange !== "all" && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-purple-900/30 border border-purple-700 rounded text-xs">
                  <span className="text-purple-300">
                    Quality: {filterQualityRange}
                  </span>
                  <button
                    onClick={() => setFilterQualityRange("all")}
                    className="text-purple-400 hover:text-purple-200"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Sort */}
              <div className="flex gap-2">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                >
                  <option value="time">Sort by time</option>
                  <option value="quality">Sort by quality</option>
                </select>
                <button
                  onClick={() =>
                    setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
                  }
                  className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white hover:bg-gray-600"
                >
                  {sortDirection === "desc" ? "Newest" : "Oldest"}
                </button>
              </div>
            </div>
          </div>

          {/* Session List */}
          <div className="flex-1 overflow-y-auto p-2">
            {displaySessions.length === 0 ? (
              <div className="text-gray-500 text-sm p-2">
                No sessions found matching filters.
              </div>
            ) : (
              <div className="space-y-2">
                {paginatedSessions.map(({ session, enrichmentItem }) => {
                  const sessionId =
                    session.correlation_id ||
                    session.hook_session?.session_id ||
                    "";
                  const isSelected = selectedSessionId === sessionId;
                  const feedback = enrichmentItem?.feedback;
                  const quality = enrichmentItem?.quality_score;
                  const taskType = enrichmentItem?.task_type;
                  const projectName = getProjectName(session.cwd);
                  const hasManaged = !!session.managed_session;
                  const dataSource = getDataSourceLabel(
                    session.match_type,
                    hasManaged
                  );
                  const toolCount =
                    session.tool_count || session.hook_session?.tool_count || 0;
                  const customName = conversationNames[sessionId]?.customName;
                  // Use managed session prompt as default name (truncated)
                  const managedPrompt = session.managed_session?.prompt;
                  const promptName =
                    managedPrompt && managedPrompt.length > 60
                      ? `${managedPrompt.slice(0, 60)}...`
                      : managedPrompt;
                  const displayName = customName || promptName || projectName;
                  const nameSource: "custom" | "prompt" | "project" = customName
                    ? "custom"
                    : promptName
                      ? "prompt"
                      : "project";
                  const isEditingThis = editingNameId === sessionId;

                  return (
                    <div
                      key={sessionId}
                      onClick={() => setSelectedSessionId(sessionId)}
                      className={`group p-3 rounded cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-600"
                          : "bg-gray-700 hover:bg-gray-600"
                      }`}
                    >
                      {/* Conversation name row */}
                      <div className="flex items-center justify-between mb-1 gap-2">
                        {isEditingThis ? (
                          <div
                            className="flex-1 flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              ref={nameInputRef}
                              type="text"
                              value={nameValue}
                              onChange={(e) => setNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleSaveName(sessionId);
                                if (e.key === "Escape") {
                                  setEditingNameId(null);
                                  setNameValue("");
                                }
                              }}
                              placeholder={projectName}
                              className="flex-1 px-1.5 py-0.5 bg-gray-800 border border-gray-500 rounded text-sm text-white min-w-0"
                            />
                            <button
                              onClick={() => handleSaveName(sessionId)}
                              className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-400"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingNameId(null);
                                setNameValue("");
                              }}
                              className="px-1.5 py-0.5 bg-gray-600 text-white rounded text-xs hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <span
                                className={`text-sm font-medium truncate ${
                                  nameSource === "custom"
                                    ? "text-blue-300"
                                    : nameSource === "prompt"
                                      ? "text-purple-300"
                                      : "text-white"
                                }`}
                                title={
                                  customName
                                    ? `Custom: ${customName} (${session.cwd || ""})`
                                    : managedPrompt
                                      ? `Prompt: ${managedPrompt}`
                                      : session.cwd || ""
                                }
                              >
                                {displayName}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingName(sessionId, customName || "");
                                }}
                                className="p-0.5 text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100 shrink-0"
                                title="Rename conversation"
                              >
                                <svg
                                  className="w-3 h-3"
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
                            <span className="text-xs text-gray-400 shrink-0">
                              {formatTime(session.start_time)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Agent and data source row */}
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                        {customName && (
                          <>
                            <span
                              className="truncate max-w-[100px]"
                              title={session.cwd || ""}
                            >
                              {projectName}
                            </span>
                            <span className="text-gray-600">•</span>
                          </>
                        )}
                        <span>{session.agent || "agent"}</span>
                        {dataSource.label && (
                          <>
                            <span className="text-gray-600">•</span>
                            <span className={dataSource.color}>
                              {dataSource.label}
                            </span>
                          </>
                        )}
                        {toolCount > 0 && (
                          <>
                            <span className="text-gray-600">•</span>
                            <span>{toolCount} tools</span>
                          </>
                        )}
                      </div>

                      {/* Badges and thumbs row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {session.managed_session && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                session.managed_session.status === "running"
                                  ? "bg-green-600 text-white"
                                  : session.managed_session.status ===
                                      "completed"
                                    ? "bg-gray-600 text-green-300"
                                    : "bg-red-600 text-white"
                              }`}
                            >
                              {session.managed_session.status === "running"
                                ? "running"
                                : session.managed_session.status === "completed"
                                  ? `exit ${session.managed_session.exit_code}`
                                  : `failed (${session.managed_session.exit_code})`}
                            </span>
                          )}
                          {taskType && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs text-white ${getTaskTypeColor(taskType)}`}
                            >
                              {taskType}
                            </span>
                          )}
                          {quality !== undefined && (
                            <span
                              className={`text-xs font-medium ${getQualityColor(quality)}`}
                            >
                              {quality}%
                            </span>
                          )}
                        </div>

                        {/* Quick thumbs buttons */}
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              handleFeedbackClick(sessionId, "positive")
                            }
                            className={`p-1 rounded text-sm ${
                              feedback === "positive"
                                ? "bg-green-600 text-white"
                                : "text-gray-400 hover:text-green-400"
                            }`}
                            title="Mark as positive"
                          >
                            +
                          </button>
                          <button
                            onClick={() =>
                              handleFeedbackClick(sessionId, "negative")
                            }
                            className={`p-1 rounded text-sm ${
                              feedback === "negative"
                                ? "bg-red-600 text-white"
                                : "text-gray-400 hover:text-red-400"
                            }`}
                            title="Mark as negative"
                          >
                            -
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination footer */}
          <div className="p-3 border-t border-gray-700 text-xs text-gray-400 flex items-center justify-between">
            <span>
              {displaySessions.length} conversations
              {enrichmentsList && (
                <span className="ml-1">
                  ({enrichmentsList.stats.annotated.positive}+ /{" "}
                  {enrichmentsList.stats.annotated.negative}-)
                </span>
              )}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-0.5 bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
                >
                  ‹
                </button>
                <span className="px-2">
                  {currentPage}/{totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="px-2 py-0.5 bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Detail View */}
        <div className="flex-1 bg-gray-800 rounded-lg overflow-hidden flex flex-col">
          {!selectedSessionId ? (
            <div className="p-6 text-gray-500">
              Select a session from the list to view details.
            </div>
          ) : detailLoading ? (
            <div className="p-6 text-gray-400">Loading...</div>
          ) : (
            <>
              {/* Header with back button and view mode toggle */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-3">
                  {returnTo && (
                    <button
                      onClick={handleBackClick}
                      className="flex items-center gap-1 px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                    >
                      ← Back to{" "}
                      {returnTo.tab === "share" ? "Share" : returnTo.tab}
                    </button>
                  )}
                  <h3 className="text-lg font-semibold text-white">
                    {conversationNames[selectedSessionId]?.customName ||
                      getProjectName(selectedSession?.session.cwd)}
                  </h3>
                </div>
                {/* View mode toggle - single consolidated selector */}
                <div className="flex items-center gap-1 bg-gray-900 rounded p-1">
                  <button
                    onClick={() => setViewMode("overview")}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      viewMode === "overview"
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-700"
                    }`}
                    title="Conversation overview and quality scores"
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setViewMode("chat")}
                    disabled={!selectedSession?.session.transcript}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      viewMode === "chat"
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-700"
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                    title={
                      !selectedSession?.session.transcript
                        ? "No transcript file found"
                        : "Formatted chat view"
                    }
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setViewMode("transcript-source")}
                    disabled={!selectedSession?.session.transcript}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      viewMode === "transcript-source"
                        ? "bg-purple-600 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-700"
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                    title={
                      !selectedSession?.session.transcript
                        ? "No transcript file found"
                        : "Original Claude transcript JSONL file"
                    }
                  >
                    Transcript Source
                  </button>
                  <button
                    onClick={() => setViewMode("aw-log")}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      viewMode === "aw-log"
                        ? "bg-green-600 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-700"
                    }`}
                    title="Agentwatch session data (merged from hooks + transcripts)"
                  >
                    AW Log
                  </button>
                  <button
                    onClick={() => setViewMode("timeline")}
                    disabled={
                      !selectedSession?.session.hook_session &&
                      !selectedSession?.session.transcript
                    }
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      viewMode === "timeline"
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-700"
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                    title="Merged timeline from hooks and transcript data"
                  >
                    Timeline
                  </button>
                </div>
              </div>

              {/* View content */}
              <div className="flex-1 overflow-y-auto">
                {/* Chat View - formatted conversation */}
                {viewMode === "chat" && (
                  <div className="h-full">
                    {transcriptLoading ? (
                      <div className="p-6 text-gray-400">
                        Loading transcript...
                      </div>
                    ) : parsedTranscript ? (
                      <ChatViewer transcript={parsedTranscript} />
                    ) : (
                      <div className="p-6 text-gray-500">
                        No transcript available
                      </div>
                    )}
                  </div>
                )}

                {/* Transcript Source View - original JSONL file */}
                {viewMode === "transcript-source" && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-gray-400">
                        Original Claude transcript file:{" "}
                        <code className="text-purple-400">
                          {selectedSession?.session.transcript?.path ||
                            "Unknown"}
                        </code>
                      </div>
                      <button
                        onClick={() => {
                          if (sourceJson) {
                            navigator.clipboard.writeText(sourceJson);
                          }
                        }}
                        disabled={!sourceJson || sourceLoading}
                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-50"
                      >
                        Copy Source
                      </button>
                    </div>
                    {sourceLoading ? (
                      <div className="text-center py-8 text-gray-500">
                        Loading source file...
                      </div>
                    ) : sourceJson ? (
                      <pre className="p-4 bg-gray-900 rounded overflow-auto text-xs font-mono text-purple-400 max-h-[calc(100vh-320px)] whitespace-pre-wrap">
                        {sourceJson}
                      </pre>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No source file available
                      </div>
                    )}
                  </div>
                )}

                {/* AW Log View - Agentwatch session data */}
                {viewMode === "aw-log" && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-gray-400">
                        Agentwatch merged session data (hooks + transcript
                        metadata)
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            JSON.stringify(selectedSession?.session, null, 2)
                          );
                        }}
                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre className="p-4 bg-gray-900 rounded overflow-auto text-xs font-mono text-green-400 max-h-[calc(100vh-320px)]">
                      {JSON.stringify(selectedSession?.session, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Timeline View - merged hooks + transcript */}
                {viewMode === "timeline" && (
                  <div className="p-4">
                    <FullTimelineView
                      hooksTimeline={timeline}
                      transcript={parsedTranscript}
                      transcriptLoading={transcriptLoading}
                      onLoadTranscript={() => {
                        const conv = conversations.find(
                          (s) =>
                            s.correlation_id === selectedSessionId ||
                            s.hook_session?.session_id === selectedSessionId
                        );
                        if (conv?.transcript?.id) {
                          loadTranscript(conv.transcript.id);
                        }
                      }}
                      hasTranscript={!!selectedSession?.session.transcript}
                      hasHooks={!!selectedSession?.session.hook_session}
                    />
                  </div>
                )}

                {/* Overview View (existing detail view) */}
                {viewMode === "overview" && (
                  <div className="p-6 space-y-6">
                    {/* Overview Section */}
                    <section>
                      <h3 className="text-lg font-semibold text-white mb-3">
                        Overview
                      </h3>
                      {/* Conversation Name */}
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-400 text-sm">Name:</span>
                          {editingNameId === selectedSessionId ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                ref={nameInputRef}
                                type="text"
                                value={nameValue}
                                onChange={(e) => setNameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleSaveName(selectedSessionId);
                                  if (e.key === "Escape") {
                                    setEditingNameId(null);
                                    setNameValue("");
                                  }
                                }}
                                placeholder={getProjectName(
                                  selectedSession?.session.cwd
                                )}
                                className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                              />
                              <button
                                onClick={() =>
                                  handleSaveName(selectedSessionId)
                                }
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-500"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingNameId(null);
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
                                className={`text-sm ${conversationNames[selectedSessionId]?.customName ? "text-blue-300 font-medium" : "text-gray-500 italic"}`}
                              >
                                {conversationNames[selectedSessionId]
                                  ?.customName || "No custom name"}
                              </span>
                              <button
                                onClick={() =>
                                  startEditingName(
                                    selectedSessionId,
                                    conversationNames[selectedSessionId]
                                      ?.customName || ""
                                  )
                                }
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
                            {selectedSession?.session.agent || "Unknown"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Start:</span>
                          <span className="ml-2 text-white">
                            {new Date(
                              selectedSession?.session.start_time || 0
                            ).toLocaleString()}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-400">Directory:</span>
                          <span className="ml-2 text-white font-mono text-xs">
                            {selectedSession?.session.cwd || "N/A"}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Data Components Section */}
                    <section>
                      <h3 className="text-lg font-semibold text-white mb-3">
                        Available Data
                      </h3>
                      <div className="space-y-3">
                        {/* Hook Session */}
                        <div
                          className={`p-3 rounded-lg ${selectedSession?.session.hook_session ? "bg-green-900/20 border border-green-800/50" : "bg-gray-700/30 border border-gray-600/30"}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${selectedSession?.session.hook_session ? "bg-green-400" : "bg-gray-500"}`}
                              />
                              <span className="text-sm font-medium text-white">
                                Hook Session
                              </span>
                              {selectedSession?.session.hook_session && (
                                <span className="text-xs text-gray-400">
                                  (real-time tool tracking)
                                </span>
                              )}
                            </div>
                            {selectedSession?.session.hook_session ? (
                              <span className="text-xs text-green-400">
                                Available
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">
                                Not captured
                              </span>
                            )}
                          </div>
                          {selectedSession?.session.hook_session && (
                            <div className="mt-2 text-xs text-gray-400 space-y-1">
                              <div>
                                Tools used:{" "}
                                <span className="text-white">
                                  {
                                    selectedSession.session.hook_session
                                      .tool_count
                                  }
                                </span>
                              </div>
                              {Object.keys(
                                selectedSession.session.hook_session
                                  .tools_used || {}
                              ).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {Object.entries(
                                    selectedSession.session.hook_session
                                      .tools_used
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
                                  {Object.keys(
                                    selectedSession.session.hook_session
                                      .tools_used
                                  ).length > 6 && (
                                    <span className="text-gray-500">
                                      +
                                      {Object.keys(
                                        selectedSession.session.hook_session
                                          .tools_used
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
                          className={`p-3 rounded-lg ${selectedSession?.session.transcript ? "bg-blue-900/20 border border-blue-800/50" : "bg-gray-700/30 border border-gray-600/30"}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${selectedSession?.session.transcript ? "bg-blue-400" : "bg-gray-500"}`}
                              />
                              <span className="text-sm font-medium text-white">
                                Transcript
                              </span>
                              {selectedSession?.session.transcript && (
                                <span className="text-xs text-gray-400">
                                  (conversation history)
                                </span>
                              )}
                            </div>
                            {selectedSession?.session.transcript ? (
                              <span className="text-xs text-blue-400">
                                Available
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">
                                Not found
                              </span>
                            )}
                          </div>
                          {selectedSession?.session.transcript && (
                            <div className="mt-2 text-xs text-gray-400 space-y-1">
                              {selectedSession.session.transcript
                                .message_count !== null && (
                                <div>
                                  Messages:{" "}
                                  <span className="text-white">
                                    {
                                      selectedSession.session.transcript
                                        .message_count
                                    }
                                  </span>
                                </div>
                              )}
                              <div>
                                Size:{" "}
                                <span className="text-white">
                                  {Math.round(
                                    selectedSession.session.transcript
                                      .size_bytes / 1024
                                  )}
                                  KB
                                </span>
                              </div>
                              {selectedSession.session.transcript
                                .project_dir && (
                                <div className="truncate">
                                  Project:{" "}
                                  <span className="text-white font-mono">
                                    {getProjectName(
                                      selectedSession.session.transcript
                                        .project_dir
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Managed Session */}
                        <div
                          className={`p-3 rounded-lg ${selectedSession?.session.managed_session ? "bg-purple-900/20 border border-purple-800/50" : "bg-gray-700/30 border border-gray-600/30"}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${selectedSession?.session.managed_session ? "bg-purple-400" : "bg-gray-500"}`}
                              />
                              <span className="text-sm font-medium text-white">
                                Managed Session
                              </span>
                              {selectedSession?.session.managed_session && (
                                <span className="text-xs text-gray-400">
                                  (aw run)
                                </span>
                              )}
                            </div>
                            {selectedSession?.session.managed_session ? (
                              <span
                                className={`text-xs ${
                                  selectedSession.session.managed_session
                                    .status === "running"
                                    ? "text-green-400"
                                    : selectedSession.session.managed_session
                                          .status === "completed"
                                      ? "text-purple-400"
                                      : "text-red-400"
                                }`}
                              >
                                {selectedSession.session.managed_session.status}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">
                                Not managed
                              </span>
                            )}
                          </div>
                          {selectedSession?.session.managed_session && (
                            <div className="mt-2 text-xs space-y-2">
                              <div className="text-gray-400">
                                <div className="mb-1">Prompt:</div>
                                <pre className="p-2 bg-gray-800 rounded text-white overflow-auto max-h-24 whitespace-pre-wrap">
                                  {
                                    selectedSession.session.managed_session
                                      .prompt
                                  }
                                </pre>
                              </div>
                              <div className="flex gap-4 text-gray-400">
                                <span>
                                  Status:{" "}
                                  <span
                                    className={`${
                                      selectedSession.session.managed_session
                                        .status === "running"
                                        ? "text-green-400"
                                        : selectedSession.session
                                              .managed_session.status ===
                                            "completed"
                                          ? "text-white"
                                          : "text-red-400"
                                    }`}
                                  >
                                    {
                                      selectedSession.session.managed_session
                                        .status
                                    }
                                  </span>
                                </span>
                                {selectedSession.session.managed_session
                                  .exit_code !== null && (
                                  <span>
                                    Exit:{" "}
                                    <span className="text-white">
                                      {
                                        selectedSession.session.managed_session
                                          .exit_code
                                      }
                                    </span>
                                  </span>
                                )}
                                <span>
                                  Duration:{" "}
                                  <span className="text-white">
                                    {Math.round(
                                      selectedSession.session.managed_session
                                        .duration_ms / 1000
                                    )}
                                    s
                                  </span>
                                </span>
                              </div>
                              {selectedSession.session.managed_session.pid && (
                                <div className="text-gray-400">
                                  PID:{" "}
                                  <span className="text-white font-mono">
                                    {
                                      selectedSession.session.managed_session
                                        .pid
                                    }
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Match explanation */}
                      {selectedSession?.session.match_type &&
                        selectedSession.session.match_type !== "unmatched" && (
                          <div className="mt-3 p-2 bg-gray-700/50 rounded text-xs text-gray-400">
                            <span className="text-gray-500">Correlation:</span>{" "}
                            {selectedSession.session.match_type === "exact" &&
                              "Hook session and transcript matched by ID"}
                            {selectedSession.session.match_type ===
                              "confident" && "Matched by directory and timing"}
                            {selectedSession.session.match_type ===
                              "uncertain" && "Possible match based on timing"}
                            {selectedSession.session.match_details && (
                              <span className="ml-2 text-gray-500">
                                (score:{" "}
                                {selectedSession.session.match_details.score})
                              </span>
                            )}
                          </div>
                        )}
                    </section>

                    {/* Analyze Section - shown for any session without quality score */}
                    {(selectedSession?.session.transcript?.id ||
                      selectedSession?.session.hook_session) &&
                      !selectedEnrichments?.quality_score && (
                        <section className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
                          <h3 className="text-md font-semibold text-white mb-2">
                            Compute Quality Analytics
                          </h3>
                          <p className="text-sm text-gray-400 mb-3">
                            This session hasn't been analyzed yet. Click below
                            to compute quality scores, task type, and other
                            analytics.
                          </p>
                          {analyzeError && (
                            <div className="mb-3 p-2 bg-red-900/30 border border-red-700 rounded text-sm text-red-400">
                              {analyzeError}
                            </div>
                          )}
                          <button
                            onClick={handleAnalyzeSession}
                            disabled={analyzing}
                            className={`px-4 py-2 rounded text-sm font-medium ${
                              analyzing
                                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                                : "bg-blue-600 text-white hover:bg-blue-500"
                            }`}
                          >
                            {analyzing ? "Analyzing..." : "Compute Quality"}
                          </button>
                        </section>
                      )}

                    {/* Auto Tags Section */}
                    {selectedEnrichments?.auto_tags && (
                      <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                          Auto Tags
                          <EnrichmentTooltip field="auto_tags" />
                        </h3>
                        <div className="mb-2">
                          <span className="text-gray-400 text-sm flex items-center gap-1">
                            Task Type:
                            <EnrichmentTooltip field="task_type" />
                          </span>
                          <span
                            className={`ml-2 px-2 py-1 rounded text-sm text-white ${getTaskTypeColor(selectedEnrichments.auto_tags.taskType)}`}
                          >
                            {selectedEnrichments.auto_tags.taskType}
                          </span>
                        </div>
                        {selectedEnrichments.auto_tags.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {selectedEnrichments.auto_tags.tags.map(
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
                    {selectedEnrichments?.quality_score && (
                      <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                          Quality Score
                          <EnrichmentTooltip field="quality_score" />
                        </h3>
                        <div className="mb-3">
                          <span
                            className={`text-3xl font-bold ${getQualityColor(selectedEnrichments.quality_score.overall)}`}
                          >
                            {selectedEnrichments.quality_score.overall}%
                          </span>
                          <span className="ml-2 text-gray-400 text-sm">
                            {selectedEnrichments.quality_score.classification}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-400 inline-flex items-center gap-1">
                              Completion
                              <EnrichmentTooltip field="completion_score" />:
                            </span>
                            <span className="ml-2 text-white">
                              {
                                selectedEnrichments.quality_score.dimensions
                                  .completion
                              }
                              %
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 inline-flex items-center gap-1">
                              Code Quality
                              <EnrichmentTooltip field="code_quality_score" />:
                            </span>
                            <span className="ml-2 text-white">
                              {
                                selectedEnrichments.quality_score.dimensions
                                  .codeQuality
                              }
                              %
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 inline-flex items-center gap-1">
                              Efficiency
                              <EnrichmentTooltip field="efficiency_score" />:
                            </span>
                            <span className="ml-2 text-white">
                              {
                                selectedEnrichments.quality_score.dimensions
                                  .efficiency
                              }
                              %
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 inline-flex items-center gap-1">
                              Safety
                              <EnrichmentTooltip field="safety_score" />:
                            </span>
                            <span className="ml-2 text-white">
                              {
                                selectedEnrichments.quality_score.dimensions
                                  .safety
                              }
                              %
                            </span>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Outcome Signals Section */}
                    {selectedEnrichments?.outcome_signals && (
                      <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                          Outcome Signals
                          <span
                            className="w-3.5 h-3.5 rounded-full bg-gray-600 text-gray-300 text-[9px] flex items-center justify-center cursor-help"
                            title="Objective results extracted from tool outputs: exit codes, test results, lint errors, build status"
                          >
                            ?
                          </span>
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-400 inline-flex items-center gap-1">
                              Exit Codes
                              <EnrichmentTooltip field="exit_code" />:
                            </span>
                            <span className="ml-2 text-white">
                              {
                                selectedEnrichments.outcome_signals.exitCodes
                                  .successCount
                              }{" "}
                              ok /{" "}
                              {
                                selectedEnrichments.outcome_signals.exitCodes
                                  .failureCount
                              }{" "}
                              fail
                            </span>
                          </div>
                          {selectedEnrichments.outcome_signals.testResults && (
                            <div>
                              <span className="text-gray-400 inline-flex items-center gap-1">
                                Tests
                                <EnrichmentTooltip field="test_results" />:
                              </span>
                              <span className="ml-2 text-green-400">
                                {
                                  selectedEnrichments.outcome_signals
                                    .testResults.passed
                                }{" "}
                                passed
                              </span>
                              {selectedEnrichments.outcome_signals.testResults
                                .failed > 0 && (
                                <span className="ml-1 text-red-400">
                                  {
                                    selectedEnrichments.outcome_signals
                                      .testResults.failed
                                  }{" "}
                                  failed
                                </span>
                              )}
                            </div>
                          )}
                          {selectedEnrichments.outcome_signals.lintResults && (
                            <div>
                              <span className="text-gray-400 inline-flex items-center gap-1">
                                Lint
                                <EnrichmentTooltip field="lint_results" />:
                              </span>
                              <span className="ml-2 text-white">
                                {
                                  selectedEnrichments.outcome_signals
                                    .lintResults.errors
                                }{" "}
                                errors /{" "}
                                {
                                  selectedEnrichments.outcome_signals
                                    .lintResults.warnings
                                }{" "}
                                warnings
                              </span>
                            </div>
                          )}
                          {selectedEnrichments.outcome_signals.buildStatus && (
                            <div>
                              <span className="text-gray-400">Build:</span>
                              <span
                                className={`ml-2 ${selectedEnrichments.outcome_signals.buildStatus.success ? "text-green-400" : "text-red-400"}`}
                              >
                                {selectedEnrichments.outcome_signals.buildStatus
                                  .success
                                  ? "Success"
                                  : "Failed"}
                              </span>
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {/* Loop Detection Section */}
                    {selectedEnrichments?.loop_detection?.loopsDetected &&
                      selectedEnrichments.loop_detection.patterns.length >
                        0 && (
                        <section className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
                          <h3 className="text-lg font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                            Loop Detection
                            <EnrichmentTooltip field="loop_detected" />
                            <span className="text-sm font-normal text-yellow-500">
                              ({selectedEnrichments.loop_detection.totalRetries}{" "}
                              retries)
                            </span>
                          </h3>
                          <div className="space-y-2">
                            {selectedEnrichments.loop_detection.patterns.map(
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
                    {selectedEnrichments?.diff_snapshot && (
                      <section>
                        <h3 className="text-lg font-semibold text-white mb-3">
                          Git Changes
                        </h3>
                        <div className="text-sm space-y-2">
                          <div className="flex gap-4">
                            <span className="text-green-400">
                              +
                              {
                                selectedEnrichments.diff_snapshot.summary
                                  .linesAdded
                              }
                            </span>
                            <span className="text-red-400">
                              -
                              {
                                selectedEnrichments.diff_snapshot.summary
                                  .linesRemoved
                              }
                            </span>
                            <span className="text-gray-400">
                              {
                                selectedEnrichments.diff_snapshot.summary
                                  .filesChanged
                              }{" "}
                              files
                            </span>
                          </div>
                          {selectedEnrichments.diff_snapshot.summary
                            .commitsCreated > 0 && (
                            <div className="text-gray-400">
                              {
                                selectedEnrichments.diff_snapshot.summary
                                  .commitsCreated
                              }{" "}
                              commit(s)
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {/* Manual Annotation Section */}
                    <section className="border-t border-gray-700 pt-6">
                      <h3 className="text-lg font-semibold text-white mb-3">
                        Your Annotation
                      </h3>

                      {/* Feedback buttons */}
                      <div className="flex gap-3 mb-4">
                        <button
                          onClick={() =>
                            handleFeedbackClick(selectedSessionId, "positive")
                          }
                          className={`px-4 py-2 rounded flex items-center gap-2 ${
                            selectedEnrichments?.manual_annotation?.feedback ===
                            "positive"
                              ? "bg-green-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          <span>Positive</span>
                        </button>
                        <button
                          onClick={() =>
                            handleFeedbackClick(selectedSessionId, "negative")
                          }
                          className={`px-4 py-2 rounded flex items-center gap-2 ${
                            selectedEnrichments?.manual_annotation?.feedback ===
                            "negative"
                              ? "bg-red-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          <span>Negative</span>
                        </button>
                        <button
                          onClick={() =>
                            handleFeedbackClick(selectedSessionId, null)
                          }
                          className={`px-4 py-2 rounded flex items-center gap-2 ${
                            selectedEnrichments?.manual_annotation?.feedback ===
                            null
                              ? "bg-gray-500 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          <span>Clear</span>
                        </button>
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
                            {selectedEnrichments?.manual_annotation?.userTags?.map(
                              (tag: string, i: number) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 bg-blue-600/30 border border-blue-500 rounded text-xs text-blue-300"
                                >
                                  {tag}
                                </span>
                              )
                            ) || (
                              <span className="text-gray-500 text-sm">
                                No tags
                              </span>
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
                            {selectedEnrichments?.manual_annotation?.notes || (
                              <span className="text-gray-500">No notes</span>
                            )}
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Full Timeline view - merges hooks and transcript data
function FullTimelineView({
  hooksTimeline,
  transcript,
  transcriptLoading,
  onLoadTranscript,
  hasTranscript,
  hasHooks
}: {
  hooksTimeline: ToolUsage[];
  transcript: ParsedLocalTranscript | null;
  transcriptLoading: boolean;
  onLoadTranscript: () => void;
  hasTranscript: boolean;
  hasHooks: boolean;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Merge timeline entries from both sources
  const mergedTimeline = useMemo(() => {
    interface TimelineEntry {
      id: string;
      timestamp: number;
      source: "hooks" | "transcript" | "both";
      type: "tool" | "message" | "tool_result";
      toolName?: string;
      role?: string;
      content?: string;
      hooksData?: ToolUsage;
      transcriptData?: { content: string; meta?: Record<string, unknown> };
      durationMs?: number;
      success?: boolean;
      error?: string;
    }

    const entries: TimelineEntry[] = [];

    // Add hooks timeline entries
    for (const usage of hooksTimeline) {
      const ts =
        usage.timestamp > 1e12 ? usage.timestamp : usage.timestamp * 1000;
      entries.push({
        id: `hooks-${usage.tool_use_id || entries.length}`,
        timestamp: ts,
        source: "hooks",
        type: "tool",
        toolName: usage.tool_name,
        hooksData: usage,
        durationMs: usage.duration_ms ?? undefined,
        success: usage.success ?? undefined,
        error: usage.error ?? undefined
      });
    }

    // Add transcript entries if loaded
    if (transcript?.messages) {
      for (const msg of transcript.messages) {
        // Skip sidechain messages
        if (msg.isSidechain) continue;
        // Skip empty messages
        if (!msg.content.trim()) continue;

        const ts = new Date(msg.timestamp).getTime();
        const entry: TimelineEntry = {
          id: `transcript-${ts}-${entries.length}`,
          timestamp: ts,
          source: "transcript",
          type:
            msg.role === "tool" || msg.role === "tool_result"
              ? msg.role
              : "message",
          role: msg.role,
          content: msg.content,
          transcriptData: { content: msg.content, meta: msg.meta }
        };

        // Try to match with hooks data for tool calls
        if (msg.role === "tool") {
          const toolMatch = msg.content.match(/\[Tool: (\w+)\]/);
          if (toolMatch) {
            entry.toolName = toolMatch[1];
          }
        }

        entries.push(entry);
      }
    }

    // Sort by timestamp
    entries.sort((a, b) => a.timestamp - b.timestamp);

    return entries;
  }, [hooksTimeline, transcript]);

  const formatTimeTs = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const formatDuration = (ms: number | undefined) => {
    if (ms === undefined) return "";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getEntryStyles = (entry: (typeof mergedTimeline)[0]) => {
    if (entry.type === "tool") {
      return {
        border:
          entry.success === false ? "border-red-500" : "border-yellow-600",
        bg: entry.success === false ? "bg-red-900/20" : "bg-yellow-900/20",
        icon: "🔧"
      };
    }
    if (entry.type === "tool_result") {
      return { border: "border-green-600", bg: "bg-green-900/20", icon: "📤" };
    }
    if (entry.role === "user") {
      return { border: "border-blue-600", bg: "bg-blue-900/20", icon: "👤" };
    }
    if (entry.role === "assistant") {
      return {
        border: "border-purple-600",
        bg: "bg-purple-900/20",
        icon: "🤖"
      };
    }
    return { border: "border-gray-600", bg: "bg-gray-700/30", icon: "📝" };
  };

  // Show loading/load button if transcript not loaded yet
  if (!transcript && hasTranscript) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-400">
          Full timeline merges hooks data with transcript messages.
        </div>
        {transcriptLoading ? (
          <div className="text-gray-400">Loading transcript...</div>
        ) : (
          <button
            onClick={onLoadTranscript}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
          >
            Load Transcript to Build Full Timeline
          </button>
        )}
        {hasHooks && hooksTimeline.length > 0 && (
          <div className="text-xs text-gray-500 mt-2">
            Showing {hooksTimeline.length} tool calls from hooks data only
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>
          {mergedTimeline.length} events from{" "}
          {hasHooks && hasTranscript
            ? "hooks + transcript"
            : hasHooks
              ? "hooks only"
              : "transcript only"}
        </span>
        <span className="text-xs text-gray-500">Click entries to expand</span>
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        {mergedTimeline.map((entry) => {
          const isExpanded = expandedItems.has(entry.id);
          const styles = getEntryStyles(entry);
          const hasDetails = entry.hooksData || entry.content;

          return (
            <div
              key={entry.id}
              className={`rounded border-l-2 ${styles.border} ${styles.bg} ${
                hasDetails ? "cursor-pointer hover:opacity-80" : ""
              }`}
              onClick={() => hasDetails && toggleExpand(entry.id)}
            >
              <div className="p-2 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {hasDetails && (
                    <span className="text-gray-500 text-xs flex-shrink-0">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                  )}
                  <span className="flex-shrink-0">{styles.icon}</span>
                  <span className="text-sm text-white truncate">
                    {entry.toolName || entry.role || entry.type}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      entry.source === "hooks"
                        ? "bg-orange-900/30 text-orange-400"
                        : "bg-blue-900/30 text-blue-400"
                    }`}
                  >
                    {entry.source}
                  </span>
                  {entry.success === false && (
                    <span className="px-1.5 py-0.5 bg-red-900/50 text-red-400 text-xs rounded flex-shrink-0">
                      failed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
                  {entry.durationMs !== undefined && (
                    <span className="text-gray-400">
                      {formatDuration(entry.durationMs)}
                    </span>
                  )}
                  <span>{formatTimeTs(entry.timestamp)}</span>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-600/50">
                  {entry.hooksData?.tool_input && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">
                        Input (hooks):
                      </div>
                      <pre className="p-2 bg-gray-900/50 rounded text-xs font-mono text-gray-300 overflow-x-auto max-h-32 overflow-y-auto">
                        {JSON.stringify(entry.hooksData.tool_input, null, 2)}
                      </pre>
                    </div>
                  )}
                  {entry.hooksData?.tool_response && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Response (hooks):
                      </div>
                      <pre className="p-2 bg-gray-900/50 rounded text-xs font-mono text-gray-300 overflow-x-auto max-h-32 overflow-y-auto">
                        {(() => {
                          const str = JSON.stringify(
                            entry.hooksData.tool_response,
                            null,
                            2
                          );
                          return str.length > 1500
                            ? str.slice(0, 1500) + "..."
                            : str;
                        })()}
                      </pre>
                    </div>
                  )}
                  {entry.content && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Content (transcript):
                      </div>
                      <pre className="p-2 bg-gray-900/50 rounded text-xs font-mono text-gray-300 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {entry.content.slice(0, 1500)}
                        {entry.content.length > 1500 && "..."}
                      </pre>
                    </div>
                  )}
                  {entry.error && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Error:</div>
                      <pre className="p-2 bg-red-900/30 rounded text-xs font-mono text-red-300 overflow-x-auto">
                        {entry.error}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mergedTimeline.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No timeline data available
        </div>
      )}
    </div>
  );
}
