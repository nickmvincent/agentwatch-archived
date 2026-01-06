import { useEffect, useState } from "react";
import {
  fetchAgentMetadataByPid,
  fetchAgentOutput,
  fetchSessionEnrichments,
  killAgent,
  sendAgentSignal,
  setAgentMetadataByPid
} from "../api/client";
import type {
  AgentMetadata,
  AgentProcess,
  Conversation,
  HookSession,
  SessionEnrichments,
  ToolUsage
} from "../api/types";
import { ConversationAnnotationPanel } from "./ConversationAnnotationPanel";
import { getProjectName } from "./ConversationCard";
import { useConversations } from "../context/ConversationContext";

interface AgentDetailModalProps {
  agent: AgentProcess;
  hookSession: HookSession | null;
  linkedConversation?: Conversation;
  recentToolUsages?: ToolUsage[];
  onClose: () => void;
  onMetadataUpdate?: (metadata: AgentMetadata) => void;
}

type Tab =
  | "overview"
  | "output"
  | "tools"
  | "timeline"
  | "conversation"
  | "settings";

export function AgentDetailModal({
  agent,
  hookSession,
  linkedConversation,
  recentToolUsages = [],
  onClose,
  onMetadataUpdate
}: AgentDetailModalProps) {
  const { getConversationName, updateConversationName } = useConversations();

  const [tab, setTab] = useState<Tab>(hookSession ? "overview" : "output");
  const [output, setOutput] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<ToolUsage[]>(recentToolUsages);
  const [loading, setLoading] = useState(false);

  // Agent metadata state
  const [metadata, setMetadata] = useState<AgentMetadata | null>(null);
  const [customName, setCustomName] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Conversation naming state
  const [editingConversationName, setEditingConversationName] = useState(false);
  const [conversationNameValue, setConversationNameValue] = useState("");

  // Conversation enrichments for annotation (if analyzer is available)
  const [sessionEnrichments, setSessionEnrichments] =
    useState<SessionEnrichments | null>(null);
  const [enrichmentsLoading, setEnrichmentsLoading] = useState(false);

  useEffect(() => {
    if (tab === "output" && agent.wrapper_state) {
      loadOutput();
    }
    if ((tab === "timeline" || tab === "tools") && hookSession) {
      loadTimeline();
    }
    if (tab === "settings") {
      loadMetadata();
    }
  }, [tab, agent.pid, hookSession?.session_id]);

  useEffect(() => {
    const loadEnrichments = async () => {
      if (tab !== "conversation" || !linkedConversation) return;
      const enrichmentId =
        linkedConversation.hook_session?.session_id ||
        linkedConversation.correlation_id;
      if (!enrichmentId) return;

      setEnrichmentsLoading(true);
      try {
        const enrichments = await fetchSessionEnrichments(enrichmentId);
        setSessionEnrichments(enrichments);
      } catch {
        setSessionEnrichments(null);
      } finally {
        setEnrichmentsLoading(false);
      }
    };

    loadEnrichments();
  }, [
    tab,
    linkedConversation?.correlation_id,
    linkedConversation?.hook_session?.session_id
  ]);

  // Load metadata on initial render for header display
  useEffect(() => {
    loadMetadata();
  }, [agent.pid]);

  const loadMetadata = async () => {
    try {
      const data = await fetchAgentMetadataByPid(agent.pid);
      setMetadata(data);
      if (data) {
        setCustomName(data.customName || "");
        setNotes(data.notes || "");
        setTagsInput(data.tags?.join(", ") || "");
        setColor(data.color || "");
      }
    } catch {
      // Metadata might not exist yet
    }
  };

  const saveMetadata = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const updated = await setAgentMetadataByPid(agent.pid, {
        customName: customName || null,
        notes: notes || null,
        tags: tags.length > 0 ? tags : null,
        color: color || null
      });
      setMetadata(updated);
      setSaveSuccess(true);
      onMetadataUpdate?.(updated);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save metadata:", err);
    }
    setSaving(false);
  };

  const loadOutput = async () => {
    setLoading(true);
    try {
      const lines = await fetchAgentOutput(agent.pid);
      setOutput(lines);
    } catch {
      setOutput(["Failed to load output"]);
    }
    setLoading(false);
  };

  const loadTimeline = async () => {
    if (!hookSession) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/hooks/sessions/${hookSession.session_id}/timeline`
      );
      if (res.ok) {
        setTimeline(await res.json());
      }
    } catch {
      // Ignore
    }
    setLoading(false);
  };

  const handleSignal = async (signal: "interrupt" | "eof" | "suspend") => {
    await sendAgentSignal(agent.pid, signal);
  };

  const handleKill = async (force: boolean) => {
    if (confirm(`${force ? "Force kill" : "Terminate"} agent ${agent.pid}?`)) {
      await killAgent(agent.pid, force);
      onClose();
    }
  };

  const formatTime = (ts: number) => {
    const ms = ts > 1e12 ? ts : ts * 1000;
    return new Date(ms).toLocaleTimeString();
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "-";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatUptime = (startTime: number | null) => {
    if (!startTime) return "-";
    const ms = Date.now() - startTime;
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  // Calculate tool stats from timeline
  const toolStats = timeline.reduce(
    (acc, t) => {
      if (!acc[t.tool_name]) {
        acc[t.tool_name] = { calls: 0, successes: 0, failures: 0, totalMs: 0 };
      }
      acc[t.tool_name].calls++;
      if (t.success === true) acc[t.tool_name].successes++;
      if (t.success === false) acc[t.tool_name].failures++;
      if (t.duration_ms) acc[t.tool_name].totalMs += t.duration_ms;
      return acc;
    },
    {} as Record<
      string,
      { calls: number; successes: number; failures: number; totalMs: number }
    >
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                agent.heuristic_state?.state === "WORKING"
                  ? "bg-green-400"
                  : agent.wrapper_state?.awaiting_user
                    ? "bg-yellow-400"
                    : "bg-gray-400"
              }`}
              style={
                metadata?.color
                  ? { backgroundColor: metadata.color }
                  : undefined
              }
            />
            <div>
              <h2 className="text-lg font-semibold text-white">
                {metadata?.customName || agent.label}
                {metadata?.customName && (
                  <span className="ml-2 text-sm text-gray-500">
                    ({agent.label})
                  </span>
                )}
                <span className="ml-2 text-sm text-gray-400 font-mono">
                  PID {agent.pid}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-400">{agent.cwd}</p>
                {metadata?.tags && metadata.tags.length > 0 && (
                  <div className="flex gap-1">
                    {metadata.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-4">
          <button
            onClick={() => setTab("overview")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "overview"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-300"
            }`}
          >
            Overview
          </button>
          {agent.wrapper_state && (
            <button
              onClick={() => setTab("output")}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === "output"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Output
            </button>
          )}
          {hookSession && (
            <>
              <button
                onClick={() => setTab("tools")}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === "tools"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-300"
                }`}
              >
                Tools ({hookSession.tool_count})
              </button>
              <button
                onClick={() => setTab("timeline")}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === "timeline"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-300"
                }`}
              >
                Timeline
              </button>
            </>
          )}
          {linkedConversation && (
            <button
              onClick={() => setTab("conversation")}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === "conversation"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Conversation
            </button>
          )}
          <button
            onClick={() => setTab("settings")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "settings"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-300"
            }`}
          >
            Settings
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {tab === "overview" && (
            <div className="grid grid-cols-2 gap-6">
              {/* Agent Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                  Agent Info
                </h3>
                <div className="bg-gray-750 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status</span>
                    <span
                      className={
                        agent.heuristic_state?.state === "WORKING"
                          ? "text-green-400"
                          : agent.wrapper_state?.awaiting_user
                            ? "text-yellow-400"
                            : agent.heuristic_state?.state === "STALLED"
                              ? "text-red-400"
                              : "text-gray-300"
                      }
                    >
                      {agent.wrapper_state?.awaiting_user
                        ? "Awaiting Input"
                        : agent.heuristic_state?.state ||
                          agent.wrapper_state?.state ||
                          "Unknown"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Uptime</span>
                    <span className="text-gray-300">
                      {formatUptime(agent.start_time)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">CPU</span>
                    <span className="text-gray-300">
                      {agent.cpu_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Memory</span>
                    <span className="text-gray-300">
                      {Math.round(agent.rss_kb / 1024)}MB
                    </span>
                  </div>
                  {agent.tty && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">TTY</span>
                      <span className="text-gray-300 font-mono text-sm">
                        {agent.tty}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Hook Session Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                  {hookSession ? "Hook Session" : "No Hook Session"}
                </h3>
                {hookSession ? (
                  <div className="bg-gray-750 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Session ID</span>
                      <span className="text-gray-300 font-mono text-sm">
                        {hookSession.session_id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Started</span>
                      <span className="text-gray-300">
                        {formatTime(hookSession.start_time)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Tool Calls</span>
                      <span className="text-gray-300">
                        {hookSession.tool_count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Permission</span>
                      <span className="text-gray-300">
                        {hookSession.permission_mode}
                      </span>
                    </div>
                    {hookSession.commit_count &&
                      hookSession.commit_count > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Commits</span>
                          <span className="text-green-400">
                            {hookSession.commit_count}
                          </span>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="bg-gray-750 rounded-lg p-4 text-gray-500 text-center">
                    <p>No hook data available</p>
                    <p className="text-xs mt-1">
                      Install hooks with: agentwatch hooks install
                    </p>
                  </div>
                )}
              </div>

              {/* Top Tools (if hook session) */}
              {hookSession &&
                Object.keys(hookSession.tools_used || {}).length > 0 && (
                  <div className="col-span-2 space-y-4">
                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                      Tools Used
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(hookSession.tools_used || {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([tool, count]) => (
                          <span
                            key={tool}
                            className="px-2 py-1 bg-gray-700 rounded text-sm"
                          >
                            <span className="text-gray-300">{tool}</span>
                            <span className="ml-1 text-gray-500">{count}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          {tab === "output" && (
            <div className="font-mono text-xs bg-black/30 rounded p-3 max-h-96 overflow-auto">
              {loading ? (
                <div className="text-gray-500">Loading...</div>
              ) : output.length === 0 ? (
                <div className="text-gray-500">No output available</div>
              ) : (
                output.map((line, i) => (
                  <div key={i} className="text-gray-300 whitespace-pre-wrap">
                    {line}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "tools" && hookSession && (
            <div className="space-y-4">
              {loading ? (
                <div className="text-gray-500">Loading...</div>
              ) : Object.keys(toolStats).length === 0 ? (
                <div className="text-gray-500">No tool usage recorded</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-400 text-left">
                    <tr>
                      <th className="pb-2">Tool</th>
                      <th className="pb-2">Calls</th>
                      <th className="pb-2">Success</th>
                      <th className="pb-2">Failed</th>
                      <th className="pb-2">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(toolStats)
                      .sort((a, b) => b[1].calls - a[1].calls)
                      .map(([tool, stats]) => (
                        <tr key={tool} className="border-t border-gray-700">
                          <td className="py-2 text-white font-medium">
                            {tool}
                          </td>
                          <td className="py-2 text-gray-300">{stats.calls}</td>
                          <td className="py-2 text-green-400">
                            {stats.successes}
                          </td>
                          <td className="py-2 text-red-400">
                            {stats.failures || "-"}
                          </td>
                          <td className="py-2 text-gray-400">
                            {stats.calls > 0
                              ? formatDuration(stats.totalMs / stats.calls)
                              : "-"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "timeline" && hookSession && (
            <div className="space-y-2">
              {loading ? (
                <div className="text-gray-500">Loading...</div>
              ) : timeline.length === 0 ? (
                <div className="text-gray-500">No timeline data</div>
              ) : (
                timeline.slice(0, 50).map((usage, i) => (
                  <div
                    key={usage.tool_use_id || i}
                    className="flex items-center gap-3 px-3 py-2 bg-gray-750 rounded"
                  >
                    <span className="text-gray-500 text-xs w-16">
                      {formatTime(usage.timestamp)}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        usage.success === true
                          ? "bg-green-400"
                          : usage.success === false
                            ? "bg-red-400"
                            : "bg-yellow-400"
                      }`}
                    />
                    <span className="text-white font-medium">
                      {usage.tool_name}
                    </span>
                    {usage.duration_ms && (
                      <span className="text-gray-500 text-xs">
                        {formatDuration(usage.duration_ms)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "conversation" && linkedConversation && (
            <div className="space-y-6">
              {/* Conversation Name */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                  Conversation Name
                </h3>
                {(() => {
                  const convId =
                    linkedConversation.correlation_id ||
                    linkedConversation.hook_session?.session_id ||
                    "";
                  const currentName = getConversationName(convId);
                  return editingConversationName ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={conversationNameValue}
                        onChange={(e) =>
                          setConversationNameValue(e.target.value)
                        }
                        placeholder={getProjectName(linkedConversation.cwd)}
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            updateConversationName(
                              convId,
                              conversationNameValue.trim() || null
                            );
                            setEditingConversationName(false);
                          } else if (e.key === "Escape") {
                            setEditingConversationName(false);
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          updateConversationName(
                            convId,
                            conversationNameValue.trim() || null
                          );
                          setEditingConversationName(false);
                        }}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingConversationName(false)}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          currentName ? "text-blue-400" : "text-gray-400"
                        }
                      >
                        {currentName ||
                          getProjectName(linkedConversation.cwd) ||
                          "Unnamed"}
                      </span>
                      <button
                        onClick={() => {
                          setConversationNameValue(currentName || "");
                          setEditingConversationName(true);
                        }}
                        className="text-gray-500 hover:text-white text-sm"
                        title="Edit name"
                      >
                        ✎
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Conversation Overview */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                  Linked Conversation
                </h3>
                <div className="bg-gray-750 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Match Type</span>
                    <span
                      className={`${
                        linkedConversation.match_type === "exact"
                          ? "text-green-400"
                          : linkedConversation.match_type === "confident"
                            ? "text-yellow-400"
                            : "text-orange-400"
                      }`}
                    >
                      {linkedConversation.match_type}
                      {linkedConversation.match_details?.score && (
                        <span className="text-gray-500 ml-1">
                          ({linkedConversation.match_details.score}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Project</span>
                    <span className="text-gray-300">
                      {getProjectName(linkedConversation.cwd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Agent</span>
                    <span className="text-gray-300">
                      {linkedConversation.agent}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Started</span>
                    <span className="text-gray-300">
                      {new Date(
                        linkedConversation.start_time > 1e12
                          ? linkedConversation.start_time
                          : linkedConversation.start_time * 1000
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Available Data */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                  Available Data
                </h3>
                <div className="space-y-2">
                  <div
                    className={`p-3 rounded-lg ${linkedConversation.hook_session ? "bg-green-900/20 border border-green-800/50" : "bg-gray-700/30"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${linkedConversation.hook_session ? "bg-green-400" : "bg-gray-500"}`}
                        />
                        <span className="text-sm text-white">Hook Session</span>
                      </div>
                      <span
                        className={`text-xs ${linkedConversation.hook_session ? "text-green-400" : "text-gray-500"}`}
                      >
                        {linkedConversation.hook_session
                          ? `${linkedConversation.hook_session.tool_count} tools`
                          : "Not captured"}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`p-3 rounded-lg ${linkedConversation.transcript ? "bg-blue-900/20 border border-blue-800/50" : "bg-gray-700/30"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${linkedConversation.transcript ? "bg-blue-400" : "bg-gray-500"}`}
                        />
                        <span className="text-sm text-white">Transcript</span>
                      </div>
                      <span
                        className={`text-xs ${linkedConversation.transcript ? "text-blue-400" : "text-gray-500"}`}
                      >
                        {linkedConversation.transcript
                          ? `${linkedConversation.transcript.message_count || "?"} messages, ${Math.round(linkedConversation.transcript.size_bytes / 1024)}KB`
                          : "Not found"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Annotation */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                  Annotation
                </h3>
                {enrichmentsLoading ? (
                  <div className="text-gray-500 text-sm">
                    Loading annotation data...
                  </div>
                ) : linkedConversation.hook_session?.session_id ||
                  linkedConversation.correlation_id ? (
                  <ConversationAnnotationPanel
                    sessionId={
                      linkedConversation.hook_session?.session_id ||
                      linkedConversation.correlation_id
                    }
                    manualAnnotation={
                      sessionEnrichments?.manual_annotation ?? null
                    }
                    conversationName={getConversationName(
                      linkedConversation.correlation_id ||
                        linkedConversation.hook_session?.session_id ||
                        ""
                    )}
                    conversationNamePlaceholder={getProjectName(
                      linkedConversation.cwd
                    )}
                    onConversationNameSave={(name) =>
                      updateConversationName(
                        linkedConversation.correlation_id ||
                          linkedConversation.hook_session?.session_id ||
                          "",
                        name
                      )
                    }
                    onAnnotationSaved={(manual) =>
                      setSessionEnrichments((prev) =>
                        prev
                          ? { ...prev, manual_annotation: manual ?? undefined }
                          : prev
                      )
                    }
                  />
                ) : (
                  <div className="text-gray-500 text-sm">
                    No session identifier available for annotations.
                  </div>
                )}
              </div>

              {/* View Full Details Button */}
              <div className="pt-4 border-t border-gray-700">
                <button
                  onClick={() => {
                    // Navigate to Conversations tab with this conversation selected
                    const event = new KeyboardEvent("keydown", { key: "5" });
                    window.dispatchEvent(event);
                    // Note: Full navigation would require passing state through context
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-sm"
                >
                  View in Conversations Tab
                </button>
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                  Agent Naming & Annotations
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Give this agent a custom name to identify it across sessions.
                  Names persist across daemon restarts.
                </p>

                <div className="space-y-4">
                  {/* Custom Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Custom Name
                    </label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder={`e.g., "Frontend Dev", "Backend API"`}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Agents are identified by their executable path, so the
                      same agent will keep this name.
                    </p>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Tags
                    </label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="e.g., frontend, react, high-priority"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Comma-separated tags for categorization
                    </p>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Status Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={color || "#6b7280"}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border border-gray-600"
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        placeholder="#6b7280"
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
                      />
                      {color && (
                        <button
                          onClick={() => setColor("")}
                          className="px-2 py-2 text-gray-400 hover:text-white"
                          title="Clear color"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about this agent..."
                      rows={3}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={saveMetadata}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded font-medium"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    {saveSuccess && (
                      <span className="text-green-400 text-sm">
                        Saved successfully!
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Agent Info (read-only) */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                  Agent Identifier
                </h3>
                <div className="bg-gray-750 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Label</span>
                    <span className="text-gray-300">{agent.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Executable</span>
                    <span
                      className="text-gray-300 font-mono text-xs truncate max-w-xs"
                      title={agent.exe}
                    >
                      {agent.exe}
                    </span>
                  </div>
                  {metadata?.agentId && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Agent ID</span>
                      <span className="text-gray-300 font-mono text-xs">
                        {metadata.agentId}
                      </span>
                    </div>
                  )}
                  {metadata?.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">First Named</span>
                      <span className="text-gray-300">
                        {new Date(metadata.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => handleSignal("interrupt")}
              className="px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-500 text-white rounded"
              title="Send Ctrl+C"
            >
              Interrupt
            </button>
            <button
              onClick={() => handleKill(false)}
              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded"
            >
              Terminate
            </button>
            <button
              onClick={() => handleKill(true)}
              className="px-3 py-1.5 text-sm bg-red-800 hover:bg-red-700 text-white rounded"
            >
              Force Kill
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
