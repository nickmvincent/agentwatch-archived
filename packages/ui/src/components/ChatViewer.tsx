/**
 * ChatViewer component for displaying transcript conversations.
 * Renders messages in a chat-like format with role-based styling.
 */

import { useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./SelfDocumentingSection";

/** A message in a chat transcript */
export interface ChatMessage {
  role: "user" | "assistant" | "tool" | "tool_result" | string;
  content: string;
  timestamp: string;
  meta?: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  };
}

/** Transcript data for the ChatViewer */
export interface ChatTranscript {
  name: string;
  agent: string;
  project_dir?: string | null;
  messages: ChatMessage[];
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
}

export interface ChatViewerProps {
  /** The transcript to display */
  transcript: ChatTranscript;
  /** Optional close handler */
  onClose?: () => void;
  componentId?: string;
}

export function ChatViewer({
  transcript,
  onClose,
  componentId = "static.share.chat-viewer"
}: ChatViewerProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(
    new Set()
  );
  const showSelfDocs = useSelfDocumentingVisible();

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

  const getRoleStyles = (role: string) => {
    switch (role) {
      case "user":
        return {
          container: "bg-blue-900/30 border-blue-700/50",
          label: "text-blue-400",
          icon: "U"
        };
      case "assistant":
        return {
          container: "bg-purple-900/30 border-purple-700/50",
          label: "text-purple-400",
          icon: "A"
        };
      case "tool":
        return {
          container: "bg-yellow-900/20 border-yellow-700/50",
          label: "text-yellow-400",
          icon: "T"
        };
      case "tool_result":
        return {
          container: "bg-green-900/20 border-green-700/50",
          label: "text-green-400",
          icon: "R"
        };
      default:
        return {
          container: "bg-gray-700/30 border-gray-600/50",
          label: "text-gray-400",
          icon: "S"
        };
    }
  };

  // Filter out empty or system messages for cleaner display
  const displayMessages = transcript.messages.filter(
    (m) => m.content.trim() && !m.content.startsWith("<local-command")
  );

  return (
    <SelfDocumentingSection
      title="Chat viewer"
      componentId={componentId}
      notes={["Renders transcripts with role-based styling."]}
      visible={showSelfDocs}
    >
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
              <span>{displayMessages.length} messages</span>
              <span>{formatTokens(transcript.total_input_tokens)} in</span>
              <span>{formatTokens(transcript.total_output_tokens)} out</span>
              <span className="text-[10px] text-gray-500">
                (~${transcript.estimated_cost_usd.toFixed(2)})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className={`px-2 py-1 text-xs rounded ${
                showRaw ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"
              }`}
            >
              {showRaw ? "Formatted" : "Raw"}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-white"
              >
                x
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {displayMessages.map((msg, idx) => {
            const styles = getRoleStyles(msg.role);
            const isLong = msg.content.length > 500;
            const isExpanded = expandedMessages.has(idx) || !isLong;

            return (
              <div
                key={idx}
                className={`rounded-lg border p-3 ${styles.container}`}
              >
                {/* Message header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 flex items-center justify-center text-xs font-bold bg-gray-700 rounded">
                      {styles.icon}
                    </span>
                    <span className={`text-sm font-medium ${styles.label}`}>
                      {msg.role === "user"
                        ? "You"
                        : msg.role === "assistant"
                          ? "Assistant"
                          : msg.role === "tool"
                            ? "Tool Call"
                            : msg.role === "tool_result"
                              ? "Result"
                              : "System"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
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

                {/* Message content */}
                <div className="text-sm text-gray-200">
                  {showRaw ? (
                    <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-900/50 p-2 rounded overflow-x-auto">
                      {isExpanded
                        ? msg.content
                        : msg.content.slice(0, 500) + "..."}
                    </pre>
                  ) : (
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
                  )}
                </div>

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
              No messages to display
            </div>
          )}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}

export interface ChatViewerModalProps {
  transcript: ChatTranscript;
  onClose: () => void;
  componentId?: string;
}

export function ChatViewerModal({
  transcript,
  onClose,
  componentId = "static.share.chat-viewer"
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
          componentId={componentId}
        />
      </div>
    </div>
  );
}
