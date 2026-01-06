import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ParsedLocalTranscript,
  PrivacyFlag,
  PrivacyConcernType
} from "../api/types";
import {
  createPrivacyFlag,
  deletePrivacyFlag,
  fetchPrivacyFlags,
  updatePrivacyFlag
} from "../api/client";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ChatViewerProps {
  transcript: ParsedLocalTranscript;
  onClose?: () => void;
  /** Session ID for privacy flags (defaults to transcript.id) */
  sessionId?: string;
}

const CONCERN_TYPES: {
  value: PrivacyConcernType;
  label: string;
  color: string;
}[] = [
  { value: "pii", label: "PII", color: "bg-red-600" },
  { value: "secrets", label: "Secrets", color: "bg-orange-600" },
  { value: "proprietary", label: "Proprietary", color: "bg-purple-600" },
  { value: "sensitive", label: "Sensitive", color: "bg-yellow-600" },
  { value: "other", label: "Other", color: "bg-gray-600" }
];

export function ChatViewer({
  transcript,
  onClose,
  sessionId
}: ChatViewerProps) {
  const [showSidechain, setShowSidechain] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(
    new Set()
  );

  // Privacy flags state
  const [flags, setFlags] = useState<PrivacyFlag[]>([]);
  const [flaggingMessageIdx, setFlaggingMessageIdx] = useState<number | null>(
    null
  );
  const [flagNotes, setFlagNotes] = useState("");
  const [flagConcernType, setFlagConcernType] =
    useState<PrivacyConcernType>("other");
  const [flagExclude, setFlagExclude] = useState(false);

  const effectiveSessionId = sessionId || transcript.id;

  // Load flags on mount
  useEffect(() => {
    fetchPrivacyFlags(effectiveSessionId)
      .then((res) => setFlags(res.flags))
      .catch(console.error);
  }, [effectiveSessionId]);

  // Create a map of messageId -> flag for quick lookup
  const flagsByMessage = useMemo(() => {
    const map = new Map<string, PrivacyFlag>();
    for (const flag of flags) {
      map.set(flag.messageId, flag);
    }
    return map;
  }, [flags]);

  const toggleExpand = (idx: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleCreateFlag = useCallback(
    async (messageIdx: number) => {
      const messageId = `msg-${messageIdx}`;
      try {
        const flag = await createPrivacyFlag({
          sessionId: effectiveSessionId,
          messageId,
          concernType: flagConcernType,
          notes: flagNotes,
          excludeFromExport: flagExclude
        });
        setFlags((prev) => [...prev, flag]);
        setFlaggingMessageIdx(null);
        setFlagNotes("");
        setFlagConcernType("other");
        setFlagExclude(false);
      } catch (e) {
        console.error("Failed to create flag:", e);
      }
    },
    [effectiveSessionId, flagConcernType, flagNotes, flagExclude]
  );

  const handleUpdateFlag = useCallback(
    async (
      flagId: string,
      updates: { notes?: string; excludeFromExport?: boolean }
    ) => {
      try {
        const updated = await updatePrivacyFlag(flagId, updates);
        setFlags((prev) => prev.map((f) => (f.id === flagId ? updated : f)));
      } catch (e) {
        console.error("Failed to update flag:", e);
      }
    },
    []
  );

  const handleDeleteFlag = useCallback(async (flagId: string) => {
    try {
      await deletePrivacyFlag(flagId);
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch (e) {
      console.error("Failed to delete flag:", e);
    }
  }, []);

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  };

  const formatTokens = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  const getRoleStyles = (role: string, isSidechain?: boolean) => {
    // Sidechain messages get muted colors
    if (isSidechain) {
      return {
        container: "bg-gray-800/40 border-gray-600/30 opacity-75",
        label: "text-gray-500",
        icon: "🔀"
      };
    }

    switch (role) {
      case "user":
        return {
          container: "bg-blue-900/30 border-blue-700/50",
          label: "text-blue-400",
          icon: "👤"
        };
      case "assistant":
        return {
          container: "bg-purple-900/30 border-purple-700/50",
          label: "text-purple-400",
          icon: "🤖"
        };
      case "tool":
        return {
          container: "bg-yellow-900/20 border-yellow-700/50",
          label: "text-yellow-400",
          icon: "🔧"
        };
      case "tool_result":
        return {
          container: "bg-green-900/20 border-green-700/50",
          label: "text-green-400",
          icon: "📤"
        };
      default:
        return {
          container: "bg-gray-700/30 border-gray-600/50",
          label: "text-gray-400",
          icon: "📝"
        };
    }
  };

  // Count sidechain messages
  const sidechainCount = useMemo(() => {
    return transcript.messages.filter((m) => m.isSidechain).length;
  }, [transcript.messages]);

  // Filter messages based on settings
  const displayMessages = useMemo(() => {
    return transcript.messages.filter((m) => {
      // Always filter out empty or local commands
      if (!m.content.trim() || m.content.startsWith("<local-command")) {
        return false;
      }
      // Filter out sidechain messages unless showing them
      if (m.isSidechain && !showSidechain) {
        return false;
      }
      return true;
    });
  }, [transcript.messages, showSidechain]);

  // Main chain message count (for display)
  const mainChainCount = transcript.messages.filter(
    (m) =>
      m.content.trim() &&
      !m.content.startsWith("<local-command") &&
      !m.isSidechain
  ).length;

  // Flag count for this session
  const flagCount = flags.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">
            {transcript.name}
          </h3>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
            <span className="px-2 py-0.5 bg-gray-700 rounded">
              {transcript.agent}
            </span>
            {transcript.project_dir && (
              <span className="truncate" title={transcript.project_dir}>
                {transcript.project_dir.split("/").slice(-2).join("/")}
              </span>
            )}
            <span>{mainChainCount} messages</span>
            <span>{formatTokens(transcript.total_input_tokens)} in</span>
            <span>{formatTokens(transcript.total_output_tokens)} out</span>
            <span className="text-[10px] text-gray-500">
              (~${transcript.estimated_cost_usd.toFixed(2)})
            </span>
            {flagCount > 0 && (
              <span className="px-2 py-0.5 bg-red-900/40 text-red-300 rounded flex items-center gap-1">
                🚩 {flagCount} flagged
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sidechainCount > 0 && (
            <button
              onClick={() => setShowSidechain(!showSidechain)}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                showSidechain
                  ? "bg-orange-600 text-white"
                  : "bg-gray-700 text-gray-300"
              }`}
              title={`${sidechainCount} sub-agent messages`}
            >
              🔀 {showSidechain ? "Hide" : "Show"} Sub-agents ({sidechainCount})
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Chat messages - formatted view */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {displayMessages.map((msg, idx) => {
          const styles = getRoleStyles(msg.role, msg.isSidechain);
          const isLong = msg.content.length > 500;
          const isExpanded = expandedMessages.has(idx) || !isLong;
          // Detect "Warmup" messages specifically
          const isWarmup = msg.isSidechain && msg.content.trim() === "Warmup";

          const messageId = `msg-${idx}`;
          const existingFlag = flagsByMessage.get(messageId);
          const isFlagging = flaggingMessageIdx === idx;

          // Collapse warmup messages by default
          if (isWarmup && !expandedMessages.has(idx)) {
            return (
              <div
                key={idx}
                onClick={() => toggleExpand(idx)}
                className="rounded-lg border p-2 bg-gray-800/30 border-gray-700/30 cursor-pointer hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>🔀</span>
                  <span>Sub-agent warmup</span>
                  {msg.agentId && (
                    <span className="px-1.5 py-0.5 bg-gray-700 rounded font-mono">
                      {msg.agentId}
                    </span>
                  )}
                  <span className="text-gray-600">
                    {formatTimestamp(msg.timestamp)}
                  </span>
                  <span className="ml-auto text-gray-600">Click to expand</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className={`rounded-lg border p-3 ${styles.container} ${
                existingFlag ? "ring-2 ring-red-500/50" : ""
              }`}
            >
              {/* Message header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base">{styles.icon}</span>
                  <span className={`text-sm font-medium ${styles.label}`}>
                    {msg.isSidechain
                      ? `Sub-agent${msg.agentId ? ` (${msg.agentId})` : ""}`
                      : msg.role === "user"
                        ? "You"
                        : msg.role === "assistant"
                          ? "Assistant"
                          : msg.role === "tool"
                            ? "Tool Call"
                            : msg.role === "tool_result"
                              ? "Result"
                              : "System"}
                  </span>
                  {/* Type indicators */}
                  {msg.hasThinking && (
                    <span
                      className="px-1.5 py-0.5 bg-pink-900/40 text-pink-300 text-xs rounded flex items-center gap-1"
                      title="Contains thinking/reasoning content"
                    >
                      💭 thinking
                    </span>
                  )}
                  {msg.toolName && (
                    <span
                      className="px-1.5 py-0.5 bg-yellow-900/40 text-yellow-300 text-xs rounded flex items-center gap-1 font-mono"
                      title="Tool call - click to compare with hooks data"
                    >
                      🔧 {msg.toolName}
                    </span>
                  )}
                  {msg.isSidechain && (
                    <span className="px-1.5 py-0.5 bg-orange-900/30 text-orange-400 text-xs rounded">
                      sidechain
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {/* Flag button */}
                  <button
                    onClick={() => {
                      if (existingFlag) {
                        // Show existing flag details
                        setFlaggingMessageIdx(idx);
                        setFlagNotes(existingFlag.notes);
                        setFlagConcernType(existingFlag.concernType);
                        setFlagExclude(existingFlag.excludeFromExport);
                      } else {
                        setFlaggingMessageIdx(idx);
                        setFlagNotes("");
                        setFlagConcernType("other");
                        setFlagExclude(false);
                      }
                    }}
                    className={`p-1 rounded transition-colors ${
                      existingFlag
                        ? "text-red-400 hover:bg-red-900/30"
                        : "text-gray-500 hover:text-red-400 hover:bg-gray-700"
                    }`}
                    title={
                      existingFlag ? "Edit flag" : "Flag for privacy concern"
                    }
                  >
                    🚩
                  </button>
                  {msg.meta?.model && (
                    <span className="px-1.5 py-0.5 bg-gray-700 rounded">
                      {msg.meta.model.split("-").slice(-2).join("-")}
                    </span>
                  )}
                  {msg.meta?.inputTokens && (
                    <span title="Input tokens">
                      {formatTokens(msg.meta.inputTokens)} in
                    </span>
                  )}
                  {msg.meta?.outputTokens && (
                    <span title="Output tokens">
                      {formatTokens(msg.meta.outputTokens)} out
                    </span>
                  )}
                  <span>{formatTimestamp(msg.timestamp)}</span>
                </div>
              </div>

              {/* Existing flag indicator */}
              {existingFlag && !isFlagging && (
                <div className="mb-2 p-2 bg-red-900/20 border border-red-700/30 rounded text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-white ${
                        CONCERN_TYPES.find(
                          (t) => t.value === existingFlag.concernType
                        )?.color || "bg-gray-600"
                      }`}
                    >
                      {existingFlag.concernType}
                    </span>
                    {existingFlag.excludeFromExport && (
                      <span className="text-red-400">
                        ⊖ Exclude from export
                      </span>
                    )}
                  </div>
                  {existingFlag.notes && (
                    <p className="mt-1 text-gray-300">{existingFlag.notes}</p>
                  )}
                </div>
              )}

              {/* Flag editing form */}
              {isFlagging && (
                <div className="mb-3 p-3 bg-gray-900/70 border border-gray-600 rounded space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400">Concern type:</span>
                    {CONCERN_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setFlagConcernType(t.value)}
                        className={`px-2 py-0.5 text-xs rounded ${
                          flagConcernType === t.value
                            ? `${t.color} text-white`
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={flagNotes}
                    onChange={(e) => setFlagNotes(e.target.value)}
                    placeholder="Notes about privacy concern..."
                    className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500 resize-none"
                    rows={2}
                  />
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={flagExclude}
                      onChange={(e) => setFlagExclude(e.target.checked)}
                      className="rounded bg-gray-700 border-gray-600"
                    />
                    Exclude this message from export
                  </label>
                  <div className="flex items-center gap-2">
                    {existingFlag ? (
                      <>
                        <button
                          onClick={() =>
                            handleUpdateFlag(existingFlag.id, {
                              notes: flagNotes,
                              excludeFromExport: flagExclude
                            })
                          }
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded"
                        >
                          Update
                        </button>
                        <button
                          onClick={() => handleDeleteFlag(existingFlag.id)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                        >
                          Remove Flag
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleCreateFlag(idx)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                      >
                        Add Flag
                      </button>
                    )}
                    <button
                      onClick={() => setFlaggingMessageIdx(null)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Message content - formatted markdown */}
              <div className="text-sm text-gray-200">
                <div
                  className={`prose prose-invert prose-sm max-w-none ${!isExpanded ? "max-h-32 overflow-hidden" : ""}`}
                >
                  <MarkdownRenderer
                    content={
                      isExpanded
                        ? msg.content
                        : msg.content.slice(0, 500) + "..."
                    }
                  />
                </div>
              </div>

              {/* Tool input section for tool_use messages */}
              {msg.toolInput && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-yellow-400 hover:text-yellow-300">
                    View tool input JSON
                  </summary>
                  <pre className="mt-1 p-2 bg-gray-900/70 rounded overflow-x-auto font-mono text-gray-300 max-h-40 overflow-y-auto">
                    {JSON.stringify(msg.toolInput, null, 2)}
                  </pre>
                </details>
              )}

              {/* Expand button for long messages */}
              {isLong && (
                <button
                  onClick={() => toggleExpand(idx)}
                  className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                >
                  {isExpanded
                    ? "Show less"
                    : `Show more (${Math.round(msg.content.length / 1000)}K chars)`}
                </button>
              )}
            </div>
          );
        })}

        {displayMessages.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {sidechainCount > 0 && !showSidechain
              ? `No main chain messages. ${sidechainCount} sub-agent messages hidden.`
              : "No messages to display"}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChatViewerModalProps {
  transcript: ParsedLocalTranscript;
  onClose: () => void;
  sessionId?: string;
}

export function ChatViewerModal({
  transcript,
  onClose,
  sessionId
}: ChatViewerModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <ChatViewer
          transcript={transcript}
          onClose={onClose}
          sessionId={sessionId}
        />
      </div>
    </div>
  );
}
