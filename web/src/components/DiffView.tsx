import { type Diff, diff_match_patch } from "diff-match-patch";
import { useMemo, useState } from "react";
import type { RedactionInfo } from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

// =============================================================================
// REDACTION SUMMARY - Shows aggregated stats for the entire Conversation
// =============================================================================

interface RedactionSummaryProps {
  /** Redaction counts by category (secrets, pii, paths, etc.) */
  countsByCategory?: Record<string, number>;
  /** List of fields that were stripped */
  strippedFields?: string[];
  /** Total number of redactions */
  totalRedactions?: number;
  /** Compact mode - single line */
  compact?: boolean;
}

/**
 * Get display info for a redaction category.
 */
function getCategoryDisplay(category: string): {
  label: string;
  color: string;
  icon: string;
} {
  switch (category) {
    case "secrets":
    case "credentials":
      return { label: "Secrets", color: "bg-red-600 text-red-100", icon: "🔑" };
    case "pii":
      return {
        label: "PII",
        color: "bg-orange-600 text-orange-100",
        icon: "👤"
      };
    case "network":
      return {
        label: "Network",
        color: "bg-blue-600 text-blue-100",
        icon: "🌐"
      };
    case "paths":
      return {
        label: "Paths",
        color: "bg-yellow-600 text-yellow-100",
        icon: "📁"
      };
    case "high_entropy":
      return {
        label: "Entropy",
        color: "bg-pink-600 text-pink-100",
        icon: "🎲"
      };
    case "custom":
      return {
        label: "Custom",
        color: "bg-purple-600 text-purple-100",
        icon: "✏️"
      };
    default:
      return { label: category, color: "bg-gray-600 text-gray-100", icon: "•" };
  }
}

/**
 * Redaction Summary - displays aggregate counts by type.
 * Shows both content redactions (by category) and stripped fields.
 */
export function RedactionSummary({
  countsByCategory,
  strippedFields,
  totalRedactions,
  compact = false
}: RedactionSummaryProps) {
  const hasRedactions = totalRedactions && totalRedactions > 0;
  const hasStripped = strippedFields && strippedFields.length > 0;

  if (!hasRedactions && !hasStripped) {
    return null;
  }

  // Sort categories by count (descending)
  const sortedCategories = useMemo(() => {
    if (!countsByCategory) return [];
    return Object.entries(countsByCategory)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [countsByCategory]);

  if (compact) {
    // Compact single-line display
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
        {hasRedactions && (
          <span className="flex items-center gap-1">
            <span className="text-yellow-400">⚡</span>
            <span>
              {totalRedactions} redaction{totalRedactions !== 1 ? "s" : ""}
            </span>
            {sortedCategories.length > 0 && (
              <span className="text-gray-500">
                (
                {sortedCategories
                  .map(([cat, count]) => {
                    const { label } = getCategoryDisplay(cat);
                    return `${count} ${label.toLowerCase()}`;
                  })
                  .join(", ")}
                )
              </span>
            )}
          </span>
        )}
        {hasStripped && (
          <span className="flex items-center gap-1">
            <span className="text-purple-400">✂️</span>
            <span>
              {strippedFields.length} field
              {strippedFields.length !== 1 ? "s" : ""} stripped
            </span>
          </span>
        )}
      </div>
    );
  }

  // Full display with badges
  return (
    <div className="p-2 bg-gray-800/50 rounded border border-gray-700 space-y-2">
      <div className="text-xs text-gray-400 font-medium">Redaction Summary</div>

      {/* Content redactions by category */}
      {sortedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sortedCategories.map(([category, count]) => {
            const { label, color, icon } = getCategoryDisplay(category);
            return (
              <span
                key={category}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}
                title={`${count} ${label.toLowerCase()} redaction${count !== 1 ? "s" : ""}`}
              >
                <span>{icon}</span>
                <span>{label}</span>
                <span className="opacity-75">×{count}</span>
              </span>
            );
          })}
          {/* Total */}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-600 text-gray-200">
            Total: {totalRedactions}
          </span>
        </div>
      )}

      {/* Stripped fields */}
      {hasStripped && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-purple-400 font-medium">
            ✂️ {strippedFields.length} field
            {strippedFields.length !== 1 ? "s" : ""} stripped
          </span>
          <details className="inline">
            <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">
              show fields
            </summary>
            <div className="mt-1 flex flex-wrap gap-1">
              {strippedFields.slice(0, 10).map((field) => (
                <span
                  key={field}
                  className="px-1 py-0 text-[9px] bg-purple-900/50 text-purple-300 rounded font-mono"
                >
                  {field}
                </span>
              ))}
              {strippedFields.length > 10 && (
                <span className="text-[9px] text-gray-500">
                  +{strippedFields.length - 10} more
                </span>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CHAT BUBBLE VIEW - Conversational display for non-technical users
// =============================================================================

interface ChatBubbleViewProps {
  originalJson: string;
  redactedJson: string;
  redactionInfoMap?: Record<string, RedactionInfo>;
  onToggleRedaction?: (category: string) => void;
  enabledCategories?: string[];
  showOriginal?: boolean;
  /** Filter to show only hooks, only chat, or all (default: all) */
  dataType?: "hooks" | "chat" | "all";
}

interface ChatMessage {
  role: string;
  content: string;
  timestamp?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResponse?: unknown;
  success?: boolean;
}

/**
 * Extract only hook tool_usages as chat messages.
 */
function extractHookMessages(data: unknown): ChatMessage[] {
  if (!data || typeof data !== "object") return [];

  const messages: ChatMessage[] = [];
  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj.tool_usages)) {
    const usages = obj.tool_usages as Array<Record<string, unknown>>;
    for (const usage of usages) {
      messages.push({
        role: "tool",
        content: "",
        toolName: usage.tool_name as string,
        toolInput: usage.tool_input as Record<string, unknown>,
        toolResponse: usage.tool_response,
        success: usage.success as boolean | undefined,
        timestamp: usage.timestamp
          ? new Date(usage.timestamp as number).toLocaleTimeString()
          : undefined
      });
    }
  }

  return messages;
}

/**
 * Extract only transcript messages (not tool_usages).
 */
function extractTranscriptMessages(data: unknown): ChatMessage[] {
  if (!data || typeof data !== "object") return [];

  const messages: ChatMessage[] = [];
  const obj = data as Record<string, unknown>;

  // Handle array of messages (transcript format)
  const rawMessages = Array.isArray(data)
    ? data
    : Array.isArray(obj.messages)
      ? obj.messages
      : Array.isArray(obj.data)
        ? obj.data
        : null;

  if (rawMessages) {
    for (const msg of rawMessages) {
      if (typeof msg !== "object" || msg === null) continue;
      const m = msg as Record<string, unknown>;

      const role = String(m.role || m.type || "unknown");
      let content = "";

      // Handle nested message object
      const messageObj = m.message as Record<string, unknown> | undefined;
      if (messageObj) {
        content =
          typeof messageObj.content === "string" ? messageObj.content : "";
      } else if (typeof m.content === "string") {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        content = (m.content as Array<Record<string, unknown>>)
          .map(
            (c) => c.text || (c.type === "tool_use" ? `[Tool: ${c.name}]` : "")
          )
          .filter(Boolean)
          .join("\n");
      } else if (typeof m.text === "string") {
        content = m.text;
      }

      messages.push({
        role,
        content,
        timestamp: m.timestamp ? String(m.timestamp) : undefined
      });
    }
  }

  return messages;
}

/**
 * Extract messages from various transcript formats.
 * @param dataType - Filter to extract only hooks, only chat, or all (default)
 */
function extractMessages(
  data: unknown,
  dataType: "hooks" | "chat" | "all" = "all"
): ChatMessage[] {
  if (dataType === "hooks") {
    return extractHookMessages(data);
  }
  if (dataType === "chat") {
    return extractTranscriptMessages(data);
  }

  // "all" - return hooks if present, otherwise transcripts (original behavior)
  const hookMsgs = extractHookMessages(data);
  if (hookMsgs.length > 0) return hookMsgs;
  return extractTranscriptMessages(data);
}

/**
 * Highlight redaction placeholders in text.
 */
function HighlightedText({
  text,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories
}: {
  text: string;
  redactionInfoMap?: Record<string, RedactionInfo>;
  onToggleRedaction?: (category: string) => void;
  enabledCategories?: string[];
}) {
  const placeholderRegex = /<[A-Z_]+_\d+>/g;
  const parts: Array<{
    type: "text" | "placeholder";
    content: string;
    info?: RedactionInfo;
  }> = [];

  let lastIdx = 0;
  let match;
  while ((match = placeholderRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: "text", content: text.slice(lastIdx, match.index) });
    }
    parts.push({
      type: "placeholder",
      content: match[0],
      info: redactionInfoMap?.[match[0]]
    });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ type: "text", content: text.slice(lastIdx) });
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={i}>{part.content}</span>;
        }
        const info = part.info;
        const category = info?.category || "unknown";
        const isEnabled =
          !enabledCategories || enabledCategories.includes(category);

        return (
          <span key={i} className="inline-flex items-center gap-0.5 mx-0.5">
            <span
              className="bg-yellow-600/30 text-yellow-200 px-1 rounded font-mono text-xs"
              title={
                info ? `${info.category}: ${info.ruleName}` : "Redacted content"
              }
            >
              {part.content}
            </span>
            {info && onToggleRedaction && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRedaction(category);
                }}
                className={`text-[9px] px-1 py-0 rounded border ${
                  isEnabled
                    ? "bg-blue-600/50 border-blue-500 text-blue-200 hover:bg-blue-600"
                    : "bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600"
                }`}
                title={`Click to ${isEnabled ? "disable" : "enable"} ${category} redaction`}
              >
                {category}
              </button>
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * Chat bubble view - shows messages as conversation bubbles.
 * Designed for non-technical users who want to see what was said.
 */
export function ChatBubbleView({
  originalJson,
  redactedJson,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories,
  showOriginal = false,
  dataType = "all"
}: ChatBubbleViewProps) {
  const messages = useMemo(() => {
    try {
      const data = JSON.parse(showOriginal ? originalJson : redactedJson);
      return extractMessages(data, dataType);
    } catch {
      return [];
    }
  }, [originalJson, redactedJson, showOriginal, dataType]);

  if (messages.length === 0) {
    return (
      <div className="text-gray-500 text-sm text-center py-8">
        No messages to display
      </div>
    );
  }

  const getRoleStyles = (role: string) => {
    switch (role) {
      case "user":
        return "bg-blue-900/40 border-blue-700 ml-8";
      case "assistant":
        return "bg-green-900/30 border-green-700 mr-8";
      case "tool":
        return "bg-purple-900/30 border-purple-700 mx-4";
      case "system":
        return "bg-gray-800 border-gray-600 mx-4 text-sm";
      default:
        return "bg-gray-800 border-gray-700";
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "user":
        return "👤";
      case "assistant":
        return "🤖";
      case "tool":
        return "🔧";
      case "system":
        return "⚙️";
      default:
        return "💬";
    }
  };

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto p-2">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`p-3 rounded-lg border ${getRoleStyles(msg.role)}`}
        >
          <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
            <span>{getRoleIcon(msg.role)}</span>
            <span className="font-medium text-gray-300 capitalize">
              {msg.role}
            </span>
            {msg.timestamp && <span>• {msg.timestamp}</span>}
            {msg.toolName && (
              <span className="px-1.5 py-0.5 bg-purple-800/50 text-purple-200 rounded text-[10px]">
                {msg.toolName}
              </span>
            )}
            {msg.success !== undefined && (
              <span className={msg.success ? "text-green-400" : "text-red-400"}>
                {msg.success ? "✓" : "✗"}
              </span>
            )}
          </div>
          {msg.content && (
            <div className="text-sm text-gray-200 whitespace-pre-wrap">
              <HighlightedText
                text={msg.content}
                redactionInfoMap={redactionInfoMap}
                onToggleRedaction={onToggleRedaction}
                enabledCategories={enabledCategories}
              />
            </div>
          )}
          {msg.toolInput && Object.keys(msg.toolInput).length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                Tool Input
              </summary>
              <pre className="text-xs bg-gray-900/50 p-2 rounded mt-1 overflow-x-auto">
                <HighlightedText
                  text={JSON.stringify(msg.toolInput, null, 2)}
                  redactionInfoMap={redactionInfoMap}
                  onToggleRedaction={onToggleRedaction}
                  enabledCategories={enabledCategories}
                />
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// NICE STRUCTURED VIEW - User-friendly card-based display
// =============================================================================

interface NiceStructuredViewProps {
  originalJson: string;
  redactedJson: string;
  redactionInfoMap?: Record<string, RedactionInfo>;
  onToggleRedaction?: (category: string) => void;
  enabledCategories?: string[];
  showOriginal?: boolean;
  /** Filter to show only hooks, only chat, or all (default: all) */
  dataType?: "hooks" | "chat" | "all";
}

/**
 * Render a value in a user-friendly way (no raw JSON syntax).
 */
function NiceValue({
  value,
  depth = 0,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories
}: {
  value: unknown;
  depth?: number;
  redactionInfoMap?: Record<string, RedactionInfo>;
  onToggleRedaction?: (category: string) => void;
  enabledCategories?: string[];
}) {
  if (value === null || value === undefined) {
    return <span className="text-gray-500 italic">empty</span>;
  }

  if (typeof value === "string") {
    // Check for redaction placeholders
    if (/<[A-Z_]+_\d+>/.test(value)) {
      return (
        <span className="text-gray-200">
          <HighlightedText
            text={value}
            redactionInfoMap={redactionInfoMap}
            onToggleRedaction={onToggleRedaction}
            enabledCategories={enabledCategories}
          />
        </span>
      );
    }
    // Truncate long strings
    if (value.length > 200) {
      return (
        <span className="text-gray-200" title={value}>
          {value.slice(0, 200)}...
        </span>
      );
    }
    return <span className="text-gray-200">{value}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-blue-300">{value.toLocaleString()}</span>;
  }

  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-green-400" : "text-red-400"}>
        {value ? "Yes" : "No"}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-500 italic">empty list</span>;
    }
    if (depth > 2) {
      return <span className="text-gray-400">[{value.length} items]</span>;
    }
    return (
      <div className="pl-3 border-l border-gray-700 space-y-1">
        {value.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-gray-500 text-xs">{i + 1}.</span>
            <NiceValue
              value={item}
              depth={depth + 1}
              redactionInfoMap={redactionInfoMap}
              onToggleRedaction={onToggleRedaction}
              enabledCategories={enabledCategories}
            />
          </div>
        ))}
        {value.length > 5 && (
          <div className="text-gray-500 text-xs">
            ...and {value.length - 5} more
          </div>
        )}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-gray-500 italic">empty</span>;
    }
    if (depth > 2) {
      return (
        <span className="text-gray-400">{`{${entries.length} fields}`}</span>
      );
    }
    return (
      <div className="pl-3 border-l border-gray-700 space-y-1">
        {entries.slice(0, 8).map(([k, v]) => (
          <div key={k} className="flex items-start gap-2">
            <span className="text-purple-300 text-xs font-medium shrink-0">
              {k}:
            </span>
            <NiceValue
              value={v}
              depth={depth + 1}
              redactionInfoMap={redactionInfoMap}
              onToggleRedaction={onToggleRedaction}
              enabledCategories={enabledCategories}
            />
          </div>
        ))}
        {entries.length > 8 && (
          <div className="text-gray-500 text-xs">
            ...and {entries.length - 8} more fields
          </div>
        )}
      </div>
    );
  }

  return <span className="text-gray-400">{String(value)}</span>;
}

/**
 * Nice structured view - shows data as expandable cards without raw JSON.
 */
export function NiceStructuredView({
  originalJson,
  redactedJson,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories,
  showOriginal = false,
  dataType = "all"
}: NiceStructuredViewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["tool_usages", "messages"])
  );

  const data = useMemo(() => {
    try {
      const parsed = JSON.parse(showOriginal ? originalJson : redactedJson);
      if (!parsed || typeof parsed !== "object") return null;

      // Filter data based on dataType
      if (dataType === "hooks") {
        // Only show hooks-related fields
        const filtered: Record<string, unknown> = {};
        if (parsed.session) filtered.session = parsed.session;
        if (parsed.tool_usages) filtered.tool_usages = parsed.tool_usages;
        // Include other session-level metadata
        for (const key of [
          "total_input_tokens",
          "total_output_tokens",
          "estimated_cost_usd"
        ]) {
          if (key in parsed) filtered[key] = parsed[key];
        }
        return Object.keys(filtered).length > 0 ? filtered : parsed;
      }
      if (dataType === "chat") {
        // Only show transcript-related fields
        const filtered: Record<string, unknown> = {};
        if (parsed.messages) filtered.messages = parsed.messages;
        if (parsed.data && Array.isArray(parsed.data))
          filtered.data = parsed.data;
        // Include other transcript-level metadata
        for (const key of [
          "type",
          "total_input_tokens",
          "total_output_tokens",
          "estimated_cost_usd"
        ]) {
          if (key in parsed) filtered[key] = parsed[key];
        }
        return Object.keys(filtered).length > 0 ? filtered : parsed;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [originalJson, redactedJson, showOriginal, dataType]);

  if (!data) {
    return (
      <div className="text-gray-500 text-sm text-center py-8">
        Unable to parse data
      </div>
    );
  }

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Group entries by type for better organization
  const entries = Object.entries(data as Record<string, unknown>);
  const arrayFields = entries.filter(([, v]) => Array.isArray(v));
  const objectFields = entries.filter(
    ([, v]) => typeof v === "object" && v !== null && !Array.isArray(v)
  );
  const simpleFields = entries.filter(
    ([, v]) => typeof v !== "object" || v === null
  );

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto">
      {/* Simple fields summary */}
      {simpleFields.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {simpleFields.map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-gray-400 text-xs">{key}:</span>
                <NiceValue
                  value={value}
                  redactionInfoMap={redactionInfoMap}
                  onToggleRedaction={onToggleRedaction}
                  enabledCategories={enabledCategories}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Array fields as expandable sections */}
      {arrayFields.map(([key, value]) => {
        const arr = value as unknown[];
        const isExpanded = expandedSections.has(key);

        return (
          <div
            key={key}
            className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden"
          >
            <button
              onClick={() => toggleSection(key)}
              className="w-full p-3 flex items-center justify-between hover:bg-gray-700/30"
            >
              <div className="flex items-center gap-2">
                <span className="text-purple-300 font-medium">{key}</span>
                <span className="text-xs text-gray-500">
                  {arr.length} items
                </span>
              </div>
              <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>
            </button>
            {isExpanded && (
              <div className="p-3 pt-0 space-y-2">
                {arr.slice(0, 10).map((item, i) => (
                  <div key={i} className="bg-gray-900/50 rounded p-2 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-500 text-xs">#{i + 1}</span>
                    </div>
                    <NiceValue
                      value={item}
                      depth={0}
                      redactionInfoMap={redactionInfoMap}
                      onToggleRedaction={onToggleRedaction}
                      enabledCategories={enabledCategories}
                    />
                  </div>
                ))}
                {arr.length > 10 && (
                  <div className="text-center text-gray-500 text-xs py-2">
                    ...and {arr.length - 10} more items
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Object fields */}
      {objectFields.map(([key, value]) => {
        const isExpanded = expandedSections.has(key);

        return (
          <div
            key={key}
            className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden"
          >
            <button
              onClick={() => toggleSection(key)}
              className="w-full p-3 flex items-center justify-between hover:bg-gray-700/30"
            >
              <span className="text-purple-300 font-medium">{key}</span>
              <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>
            </button>
            {isExpanded && (
              <div className="p-3 pt-0">
                <NiceValue
                  value={value}
                  depth={0}
                  redactionInfoMap={redactionInfoMap}
                  onToggleRedaction={onToggleRedaction}
                  enabledCategories={enabledCategories}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// RAW TERMINAL DIFF VIEW - For technical users
// =============================================================================

interface RawTerminalDiffViewProps {
  originalJson: string;
  redactedJson: string;
  redactionInfoMap?: Record<string, RedactionInfo>;
  componentId?: string;
}

/**
 * Raw terminal-style diff view with performance warning.
 * For technical users who want to see the full JSON diff.
 */
export function RawTerminalDiffView({
  originalJson,
  redactedJson,
  redactionInfoMap,
  componentId = "analyzer.share.diff-view"
}: RawTerminalDiffViewProps) {
  const [confirmed, setConfirmed] = useState(false);
  const showSelfDocs = useSelfDocumentingVisible();
  const selfDocs = {
    title: "Raw JSON diff",
    componentId,
    calculations: [
      "diff-match-patch semantic diffing",
      "JSON stringify normalization for comparison"
    ],
    notes: ["Large diffs require confirmation to render."]
  };

  const sizeKb = ((originalJson.length + redactedJson.length) / 1024).toFixed(
    1
  );
  const isLarge = Number.parseFloat(sizeKb) > 50;

  const diff = useMemo(() => {
    if (!confirmed && isLarge) return null;

    try {
      const original = JSON.stringify(JSON.parse(originalJson), null, 2);
      const redacted = JSON.stringify(JSON.parse(redactedJson), null, 2);

      const dmpLocal = new diff_match_patch();
      const diffs = dmpLocal.diff_main(original, redacted);
      dmpLocal.diff_cleanupSemantic(diffs);

      return diffs;
    } catch {
      return null;
    }
  }, [originalJson, redactedJson, confirmed, isLarge]);

  if (!confirmed && isLarge) {
    return (
      <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h4 className="text-yellow-300 font-medium">
                Large Data Warning
              </h4>
              <p className="text-gray-300 text-sm mt-1">
                This diff contains approximately <strong>{sizeKb} KB</strong> of
                data. Rendering may be slow and could freeze your browser
                momentarily.
              </p>
            </div>
          </div>
          <div className="bg-gray-800/50 rounded p-3 text-xs text-gray-400 font-mono">
            <p className="mb-2">
              💡 For better performance, you can view this locally:
            </p>
            <code className="block bg-gray-900 p-2 rounded">
              # Save the JSON files and use a diff tool{"\n"}
              diff original.json redacted.json{"\n"}# Or use a GUI tool like VS
              Code's diff viewer
            </code>
          </div>
          <button
            onClick={() => setConfirmed(true)}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm"
          >
            Show Raw Diff Anyway
          </button>
        </div>
      </SelfDocumentingSection>
    );
  }

  if (!diff) {
    return (
      <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
        <div className="text-gray-500 text-sm text-center py-8">
          Unable to compute diff
        </div>
      </SelfDocumentingSection>
    );
  }

  // Extract placeholders for info display
  const placeholderRegex = /<[A-Z_]+_\d+>/g;

  return (
    <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
      <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800 px-3 py-2 flex items-center gap-2 text-xs text-gray-400 border-b border-gray-700">
          <span className="font-mono">$ diff original.json redacted.json</span>
          <span className="ml-auto">{sizeKb} KB</span>
        </div>
        <pre className="p-3 text-xs font-mono overflow-auto max-h-[500px] leading-relaxed">
          {diff.map((d, i) => {
            const [op, text] = d;

            // Check for placeholders in the text
            const hasPlaceholder = placeholderRegex.test(text);

            if (op === 0) {
              return (
                <span key={i} className="text-gray-400">
                  {text}
                </span>
              );
            } else if (op === -1) {
              return (
                <span
                  key={i}
                  className="bg-red-900/40 text-red-300"
                  title="Removed"
                >
                  {text}
                </span>
              );
            } else {
              // For added text, show redaction info
              if (hasPlaceholder && redactionInfoMap) {
                const parts: JSX.Element[] = [];
                let lastIdx = 0;
                let match;
                const regex = /<[A-Z_]+_\d+>/g;

                while ((match = regex.exec(text)) !== null) {
                  if (match.index > lastIdx) {
                    parts.push(
                      <span
                        key={`pre-${i}-${lastIdx}`}
                        className="bg-green-900/40 text-green-300"
                      >
                        {text.slice(lastIdx, match.index)}
                      </span>
                    );
                  }
                  const info = redactionInfoMap[match[0]];
                  parts.push(
                    <span
                      key={`match-${i}-${match.index}`}
                      className="bg-blue-900/60 text-blue-200 px-0.5 rounded"
                      title={
                        info ? `${info.category}: ${info.ruleName}` : "Redacted"
                      }
                    >
                      {match[0]}
                    </span>
                  );
                  lastIdx = match.index + match[0].length;
                }
                if (lastIdx < text.length) {
                  parts.push(
                    <span
                      key={`post-${i}`}
                      className="bg-green-900/40 text-green-300"
                    >
                      {text.slice(lastIdx)}
                    </span>
                  );
                }
                return <span key={i}>{parts}</span>;
              }

              return (
                <span
                  key={i}
                  className="bg-green-900/40 text-green-300"
                  title="Added"
                >
                  {text}
                </span>
              );
            }
          })}
        </pre>
      </div>
    </SelfDocumentingSection>
  );
}

// =============================================================================
// PAGINATED JSON VIEW
// =============================================================================

interface PaginatedJsonViewProps {
  /** Raw JSON string to display */
  jsonString: string;
  /** Page size for array pagination */
  pageSize?: number;
  /** Label for the array type (e.g., "messages", "tool_usages") */
  arrayLabel?: string;
}

/**
 * Detect the primary array field in a JSON object.
 * TODO: Extend this for other formats (codex, gemini, etc.)
 * Currently supports: messages, tool_usages, entries, items
 */
function detectPrimaryArray(
  obj: unknown
): { key: string; array: unknown[] } | null {
  if (typeof obj !== "object" || obj === null) return null;

  const record = obj as Record<string, unknown>;

  // Priority order of array fields to detect
  const arrayFields = [
    "messages",
    "tool_usages",
    "entries",
    "items",
    "data",
    "records"
  ];

  for (const field of arrayFields) {
    if (Array.isArray(record[field]) && record[field].length > 0) {
      return { key: field, array: record[field] };
    }
  }

  // Fallback: find the first array field
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value) && value.length > 0) {
      return { key, array: value };
    }
  }

  return null;
}

/**
 * Paginated JSON viewer for large arrays.
 * Shows metadata at top, then paginates through array items.
 */
export function PaginatedJsonView({
  jsonString,
  pageSize = 5,
  arrayLabel
}: PaginatedJsonViewProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const parsed = useMemo(() => {
    try {
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  }, [jsonString]);

  const primaryArray = useMemo(() => {
    if (!parsed) return null;
    return detectPrimaryArray(parsed);
  }, [parsed]);

  // If no parseable JSON or no primary array, show raw
  if (!parsed || !primaryArray) {
    return (
      <div className="font-mono text-xs whitespace-pre-wrap break-words text-gray-200">
        {jsonString}
      </div>
    );
  }

  const { key: arrayKey, array } = primaryArray;
  const totalItems = array.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIdx = currentPage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  const currentItems = array.slice(startIdx, endIdx);

  // Get non-array fields as metadata
  const metadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (k !== arrayKey) {
      metadata[k] = v;
    }
  }

  const toggleItem = (idx: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const label = arrayLabel || arrayKey;

  return (
    <div className="space-y-2 font-mono text-xs">
      {/* Metadata section */}
      {Object.keys(metadata).length > 0 && (
        <details className="bg-gray-800/50 rounded p-2">
          <summary className="cursor-pointer text-gray-400 text-[10px]">
            Metadata ({Object.keys(metadata).length} fields)
          </summary>
          <div className="mt-1 text-gray-300 whitespace-pre-wrap">
            {JSON.stringify(metadata, null, 2)}
          </div>
        </details>
      )}

      {/* Array pagination header */}
      <div className="flex items-center justify-between bg-gray-800 p-2 rounded">
        <span className="text-gray-300">
          {label} ({totalItems} total)
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="px-2 py-0.5 text-[10px] bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            &larr;
          </button>
          <span className="text-gray-400 text-[10px]">
            {startIdx + 1}-{endIdx} of {totalItems}
          </span>
          <button
            onClick={() =>
              setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
            }
            disabled={currentPage >= totalPages - 1}
            className="px-2 py-0.5 text-[10px] bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
          >
            &rarr;
          </button>
        </div>
      </div>

      {/* Array items */}
      <div className="space-y-1">
        {currentItems.map((item, i) => {
          const globalIdx = startIdx + i;
          const isExpanded = expandedItems.has(globalIdx);
          const preview = getItemPreview(item, arrayKey);

          return (
            <div
              key={globalIdx}
              className="bg-gray-800/30 border border-gray-700 rounded"
            >
              <button
                onClick={() => toggleItem(globalIdx)}
                className="w-full text-left p-2 flex items-center gap-2 hover:bg-gray-700/50"
              >
                <span className="text-gray-500 w-8">#{globalIdx}</span>
                <span
                  className={`flex-1 truncate ${isExpanded ? "text-blue-300" : "text-gray-300"}`}
                >
                  {preview}
                </span>
                <span className="text-gray-500 text-[10px]">
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>
              {isExpanded && (
                <div className="p-2 pt-0 border-t border-gray-700 whitespace-pre-wrap text-gray-200">
                  {JSON.stringify(item, null, 2)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick page jump */}
      {totalPages > 3 && (
        <div className="flex gap-1 flex-wrap pt-1">
          {Array.from({ length: Math.min(10, totalPages) }, (_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                i === currentPage
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              {i + 1}
            </button>
          ))}
          {totalPages > 10 && (
            <span className="text-gray-500 text-[10px]">...</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get a preview string for an array item based on common field patterns.
 * TODO: Extend for other transcript formats.
 */
function getItemPreview(item: unknown, _arrayKey: string): string {
  if (typeof item !== "object" || item === null) {
    return String(item).slice(0, 60);
  }

  const obj = item as Record<string, unknown>;

  // Message-style items (role + content)
  if ("role" in obj) {
    const role = String(obj.role || "");
    const content = String(obj.content || obj.text || "").slice(0, 40);
    return `[${role}] ${content}${content.length >= 40 ? "..." : ""}`;
  }

  // Tool usage items
  if ("tool_name" in obj) {
    return `Tool: ${obj.tool_name}`;
  }

  // Generic: show first string field
  for (const [, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.length > 0) {
      return v.slice(0, 50) + (v.length > 50 ? "..." : "");
    }
  }

  return `{${Object.keys(obj).slice(0, 3).join(", ")}...}`;
}

// =============================================================================
// PAGINATED JSON DIFF VIEW
// =============================================================================

interface PaginatedJsonDiffViewProps {
  /** Original JSON string */
  originalJson: string;
  /** Redacted JSON string */
  redactedJson: string;
  /** Page size for array pagination */
  pageSize?: number;
  /** Map of placeholder to redaction info */
  redactionInfoMap?: Record<string, RedactionInfo>;
  /** Callback when user clicks to toggle a redaction category on/off */
  onToggleRedaction?: (category: string) => void;
  /** List of currently enabled redaction categories */
  enabledCategories?: string[];
}

/**
 * Compute inline diff for a JSON string using word-level diffing.
 */
function computeInlineDiff(
  original: string,
  redacted: string
): { parts: Array<{ text: string; type: "unchanged" | "removed" | "added" }> } {
  const dmpLocal = new diff_match_patch();
  const diffs = dmpLocal.diff_main(original, redacted);
  dmpLocal.diff_cleanupSemantic(diffs);

  const parts: Array<{
    text: string;
    type: "unchanged" | "removed" | "added";
  }> = [];
  for (const [op, text] of diffs) {
    if (op === 0) {
      parts.push({ text, type: "unchanged" });
    } else if (op === -1) {
      parts.push({ text, type: "removed" });
    } else if (op === 1) {
      parts.push({ text, type: "added" });
    }
  }

  return { parts };
}

/**
 * Check if two items are equal.
 */
function areItemsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Paginated JSON diff viewer.
 * Shows diff within each array item, paginates through items.
 */
export function PaginatedJsonDiffView({
  originalJson,
  redactedJson,
  pageSize = 5,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories
}: PaginatedJsonDiffViewProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const parsed = useMemo(() => {
    try {
      const original = JSON.parse(originalJson);
      const redacted = JSON.parse(redactedJson);
      return { original, redacted };
    } catch {
      return null;
    }
  }, [originalJson, redactedJson]);

  if (!parsed) {
    return (
      <div className="p-3 bg-gray-900/50 rounded text-red-400 text-sm">
        Failed to parse JSON
      </div>
    );
  }

  const originalArray = detectPrimaryArray(parsed.original);
  const redactedArray = detectPrimaryArray(parsed.redacted);

  // If no array found, show simple diff
  if (!originalArray || !redactedArray) {
    const originalStr = JSON.stringify(parsed.original, null, 2);
    const redactedStr = JSON.stringify(parsed.redacted, null, 2);
    const { parts } = computeInlineDiff(originalStr, redactedStr);

    return (
      <div className="p-3 bg-gray-900/50 rounded max-h-[400px] overflow-auto">
        <pre className="text-xs font-mono whitespace-pre-wrap">
          {parts.map((part, i) => (
            <span
              key={i}
              className={
                part.type === "removed"
                  ? "bg-red-900/50 text-red-300 line-through"
                  : part.type === "added"
                    ? "bg-green-900/50 text-green-300"
                    : "text-gray-300"
              }
            >
              {part.text}
            </span>
          ))}
        </pre>
      </div>
    );
  }

  const { key: arrayKey, array: origItems } = originalArray;
  const redactedItems = redactedArray.array;

  const totalPages = Math.ceil(origItems.length / pageSize);
  const startIdx = currentPage * pageSize;
  const pageItems = origItems.slice(startIdx, startIdx + pageSize);

  const toggleItem = (idx: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Count changed items
  const changedCount = origItems.reduce<number>((count, item, i) => {
    return count + (areItemsEqual(item, redactedItems[i]) ? 0 : 1);
  }, 0);

  return (
    <div className="space-y-2 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between text-gray-400">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-300">{arrayKey}</span>
          <span className="text-[10px]">
            {origItems.length} items, {changedCount} changed
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="px-1.5 py-0.5 text-[10px] bg-gray-700 rounded disabled:opacity-50"
          >
            ←
          </button>
          <span className="text-[10px]">
            {currentPage + 1}/{totalPages}
          </span>
          <button
            onClick={() =>
              setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
            }
            disabled={currentPage >= totalPages - 1}
            className="px-1.5 py-0.5 text-[10px] bg-gray-700 rounded disabled:opacity-50"
          >
            →
          </button>
        </div>
      </div>

      {/* Items with diffs */}
      <div className="space-y-1.5">
        {pageItems.map((item, i) => {
          const globalIdx = startIdx + i;
          const isExpanded = expandedItems.has(globalIdx);
          const redactedItem = redactedItems[globalIdx];
          const hasChanges = !areItemsEqual(item, redactedItem);
          const preview = getItemPreview(item, arrayKey);

          // Compute diff for this item
          const originalStr = JSON.stringify(item, null, 2);
          const redactedStr = JSON.stringify(redactedItem, null, 2);

          return (
            <div
              key={globalIdx}
              className={`border rounded overflow-hidden ${
                hasChanges
                  ? "border-yellow-600/50 bg-yellow-900/10"
                  : "border-gray-700 bg-gray-800/30"
              }`}
            >
              <button
                onClick={() => toggleItem(globalIdx)}
                className="w-full text-left p-2 flex items-center gap-2 hover:bg-gray-700/50"
              >
                <span className="text-gray-500 w-8">#{globalIdx}</span>
                {hasChanges && (
                  <span className="px-1 py-0 text-[9px] bg-yellow-600 text-white rounded">
                    CHANGED
                  </span>
                )}
                <span
                  className={`flex-1 truncate ${isExpanded ? "text-blue-300" : "text-gray-300"}`}
                >
                  {preview}
                </span>
                <span className="text-gray-500 text-[10px]">
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>
              {isExpanded && (
                <div className="p-2 pt-0 border-t border-gray-700 overflow-x-auto">
                  {hasChanges ? (
                    <DiffItemView
                      original={originalStr}
                      redacted={redactedStr}
                      redactionInfoMap={redactionInfoMap}
                      onToggleRedaction={onToggleRedaction}
                      enabledCategories={enabledCategories}
                    />
                  ) : (
                    <pre className="text-gray-300 whitespace-pre-wrap">
                      {originalStr}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick page jump */}
      {totalPages > 3 && (
        <div className="flex gap-1 flex-wrap pt-1">
          {Array.from({ length: Math.min(10, totalPages) }, (_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                i === currentPage
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              {i + 1}
            </button>
          ))}
          {totalPages > 10 && (
            <span className="text-gray-500 text-[10px]">...</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline diff view for a single item.
 */
function DiffItemView({
  original,
  redacted,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories
}: {
  original: string;
  redacted: string;
  redactionInfoMap?: Record<string, RedactionInfo>;
  onToggleRedaction?: (category: string) => void;
  enabledCategories?: string[];
}) {
  const { parts } = computeInlineDiff(original, redacted);

  // Find redaction placeholders in added parts
  const placeholderRegex = /<[A-Z_]+_\d+>/g;

  return (
    <pre className="text-xs font-mono whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.type === "removed") {
          return (
            <span key={i} className="bg-red-900/50 text-red-300 line-through">
              {part.text}
            </span>
          );
        }
        if (part.type === "added") {
          // Check for redaction placeholders
          const matches = part.text.match(placeholderRegex);
          if (matches && redactionInfoMap) {
            // Render with tooltip info and toggle badges
            let lastIdx = 0;
            const segments: JSX.Element[] = [];
            for (const match of matches) {
              const matchIdx = part.text.indexOf(match, lastIdx);
              if (matchIdx > lastIdx) {
                segments.push(
                  <span
                    key={`pre-${i}-${lastIdx}`}
                    className="bg-green-900/50 text-green-300"
                  >
                    {part.text.slice(lastIdx, matchIdx)}
                  </span>
                );
              }
              const info = redactionInfoMap[match];
              const category = info?.category || "unknown";
              const isEnabled =
                !enabledCategories || enabledCategories.includes(category);
              segments.push(
                <span
                  key={`match-${i}-${matchIdx}`}
                  className="inline-flex items-center gap-0.5"
                >
                  <span
                    className="bg-blue-900/70 text-blue-200 px-0.5 rounded"
                    title={
                      info ? `${info.category}: ${info.ruleName}` : "Redacted"
                    }
                  >
                    {match}
                  </span>
                  {info && onToggleRedaction && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleRedaction(category);
                      }}
                      className={`text-[9px] px-1 py-0 rounded border ${
                        isEnabled
                          ? "bg-blue-600/50 border-blue-500 text-blue-200 hover:bg-blue-600"
                          : "bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600"
                      }`}
                      title={`Click to ${isEnabled ? "disable" : "enable"} ${category} redaction`}
                    >
                      {category}
                    </button>
                  )}
                </span>
              );
              lastIdx = matchIdx + match.length;
            }
            if (lastIdx < part.text.length) {
              segments.push(
                <span
                  key={`post-${i}`}
                  className="bg-green-900/50 text-green-300"
                >
                  {part.text.slice(lastIdx)}
                </span>
              );
            }
            return <span key={i}>{segments}</span>;
          }
          return (
            <span key={i} className="bg-green-900/50 text-green-300">
              {part.text}
            </span>
          );
        }
        return (
          <span key={i} className="text-gray-300">
            {part.text}
          </span>
        );
      })}
    </pre>
  );
}

interface DiffViewProps {
  original: string;
  redacted: string;
  mode: "full" | "changes";
  /** Map of placeholder to redaction info for showing which rule caught it */
  redactionInfoMap?: Record<string, RedactionInfo>;
  /** Callback when user clicks to toggle a redaction category on/off */
  onToggleRedaction?: (category: string) => void;
  /** List of currently enabled redaction categories */
  enabledCategories?: string[];
  componentId?: string;
}

const dmp = new diff_match_patch();

interface DiffChange {
  lineNumber: number;
  original: string;
  redacted: string;
  /** Redaction rule info if this was a redaction replacement */
  ruleInfo?: RedactionInfo;
}

/**
 * Extract placeholder pattern from redacted text.
 * Matches patterns like <API_KEY_1>, <EMAIL_2>, etc.
 */
function extractPlaceholder(text: string): string | null {
  const match = text.match(/<[A-Z_]+_\d+>/);
  return match ? match[0] : null;
}

/**
 * Get rule display name from redaction info.
 */
function getRuleDisplayName(info: RedactionInfo): string {
  if (info.category === "custom") {
    return info.ruleName || "Custom Pattern";
  }
  // Format rule name: secrets -> Secrets, api_keys -> API Keys, etc.
  return info.ruleName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Compute a diff between original and redacted text.
 * Returns an array of [operation, text] tuples where:
 * - operation = -1: deleted (from original)
 * - operation = 0: equal
 * - operation = 1: inserted (in redacted)
 */
function computeDiff(original: string, redacted: string): Diff[] {
  const diffs = dmp.diff_main(original, redacted);
  dmp.diff_cleanupSemantic(diffs);
  return diffs;
}

/**
 * Extract only the changes for "changes only" mode.
 * Groups consecutive deletions and insertions together.
 */
function extractChanges(
  original: string,
  redacted: string,
  redactionInfoMap?: Record<string, RedactionInfo>
): DiffChange[] {
  const diffs = computeDiff(original, redacted);
  const changes: DiffChange[] = [];

  // Track position in original text for line numbers
  let position = 0;

  // Count lines in text up to position
  const countLines = (text: string, upTo: number) => {
    let lines = 1;
    for (let i = 0; i < Math.min(upTo, text.length); i++) {
      if (text[i] === "\n") lines++;
    }
    return lines;
  };

  for (let i = 0; i < diffs.length; i++) {
    const [op, text] = diffs[i];

    if (op === 0) {
      // Equal - advance position
      position += text.length;
    } else if (op === -1) {
      // Deletion - look for following insertion
      const deletedText = text;
      let insertedText = "";
      let ruleInfo: RedactionInfo | undefined;

      // Check if next is an insertion
      if (i + 1 < diffs.length && diffs[i + 1][0] === 1) {
        insertedText = diffs[i + 1][1];
        i++; // Skip the insertion in main loop

        // Try to find rule info from placeholder
        if (redactionInfoMap) {
          const placeholder = extractPlaceholder(insertedText);
          if (placeholder) {
            ruleInfo = redactionInfoMap[placeholder];
          }
        }
      }

      changes.push({
        lineNumber: countLines(original, position),
        original: deletedText.trim(),
        redacted: insertedText.trim() || "[REMOVED]",
        ruleInfo
      });

      position += deletedText.length;
    } else if (op === 1) {
      // Pure insertion (no preceding deletion)
      let ruleInfo: RedactionInfo | undefined;
      if (redactionInfoMap) {
        const placeholder = extractPlaceholder(text);
        if (placeholder) {
          ruleInfo = redactionInfoMap[placeholder];
        }
      }

      changes.push({
        lineNumber: countLines(original, position),
        original: "",
        redacted: text.trim(),
        ruleInfo
      });
    }
  }

  return changes;
}

/**
 * Try to pretty-print JSON, return original string if not valid JSON.
 */
function tryPrettyPrint(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

/**
 * Full diff view - shows entire content with inline highlighting.
 */
function FullDiffView({
  original,
  redacted,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories
}: {
  original: string;
  redacted: string;
  redactionInfoMap?: Record<string, RedactionInfo>;
  onToggleRedaction?: (category: string) => void;
  enabledCategories?: string[];
}) {
  const diffs = useMemo(() => {
    const prettyOriginal = tryPrettyPrint(original);
    const prettyRedacted = tryPrettyPrint(redacted);
    return computeDiff(prettyOriginal, prettyRedacted);
  }, [original, redacted]);

  // Helper to render inserted text with optional toggle button
  const renderInsertedText = (text: string, key: number) => {
    const placeholder = extractPlaceholder(text);
    if (placeholder && redactionInfoMap?.[placeholder]) {
      const info = redactionInfoMap[placeholder];
      const category = info.category;
      const isEnabled =
        !enabledCategories || enabledCategories.includes(category);

      return (
        <span key={key} className="inline-flex items-center gap-0.5">
          <span
            className="bg-green-900/50 text-green-300"
            title={`Caught by: ${getRuleDisplayName(info)} (${category})`}
          >
            {text}
          </span>
          {onToggleRedaction && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleRedaction(category);
              }}
              className={`text-[9px] px-1 py-0 rounded border ${
                isEnabled
                  ? "bg-blue-600/50 border-blue-500 text-blue-200 hover:bg-blue-600"
                  : "bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600"
              }`}
              title={`Click to ${isEnabled ? "disable" : "enable"} ${category} redaction`}
            >
              {category}
            </button>
          )}
        </span>
      );
    }
    return (
      <span key={key} className="bg-green-900/50 text-green-300">
        {text}
      </span>
    );
  };

  return (
    <div className="font-mono text-sm whitespace-pre-wrap break-words text-gray-200">
      {diffs.map((diff, i) => {
        const [op, text] = diff;

        if (op === 0) {
          // Equal - normal text
          return <span key={i}>{text}</span>;
        } else if (op === -1) {
          // Deleted - red strikethrough (dark mode)
          return (
            <span
              key={i}
              className="bg-red-900/50 text-red-300 line-through decoration-red-400"
              title="Removed by redaction"
            >
              {text}
            </span>
          );
        } else {
          // Inserted - green highlight with optional toggle
          return renderInsertedText(text, i);
        }
      })}
    </div>
  );
}

/**
 * Changes only view - shows list of what changed.
 */
function ChangesOnlyView({
  original,
  redacted,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories
}: {
  original: string;
  redacted: string;
  redactionInfoMap?: Record<string, RedactionInfo>;
  onToggleRedaction?: (category: string) => void;
  enabledCategories?: string[];
}) {
  const changes = useMemo(
    () => extractChanges(original, redacted, redactionInfoMap),
    [original, redacted, redactionInfoMap]
  );

  if (changes.length === 0) {
    return (
      <div className="text-gray-400 italic text-sm">
        No redactions applied to this session.
      </div>
    );
  }

  // Get category color for badge
  const getCategoryColor = (category: string): string => {
    switch (category) {
      case "secrets":
      case "credentials":
        return "bg-red-700 text-red-100";
      case "pii":
      case "network":
        return "bg-orange-700 text-orange-100";
      case "paths":
        return "bg-yellow-700 text-yellow-100";
      case "custom":
        return "bg-purple-700 text-purple-100";
      case "high_entropy":
        return "bg-pink-700 text-pink-100";
      default:
        return "bg-gray-600 text-gray-200";
    }
  };

  return (
    <div className="space-y-2 font-mono text-sm">
      {changes.map((change, i) => {
        const category = change.ruleInfo?.category;
        const isEnabled =
          !category ||
          !enabledCategories ||
          enabledCategories.includes(category);

        return (
          <div
            key={i}
            className="flex items-start gap-2 p-2 bg-gray-800 rounded border border-gray-700"
          >
            <span className="text-gray-500 text-xs shrink-0 w-12">
              L{change.lineNumber}
            </span>
            <div className="flex-1 min-w-0">
              {change.original && (
                <span className="bg-red-900/50 text-red-300 line-through px-1 rounded mr-1">
                  {change.original.length > 50
                    ? change.original.slice(0, 47) + "..."
                    : change.original}
                </span>
              )}
              <span className="text-gray-500 mx-1">&rarr;</span>
              <span className="bg-green-900/50 text-green-300 px-1 rounded">
                {change.redacted.length > 50
                  ? change.redacted.slice(0, 47) + "..."
                  : change.redacted}
              </span>
              {/* Show which rule caught this redaction with toggle button */}
              {change.ruleInfo && (
                <span className="inline-flex items-center gap-1 ml-2">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded ${getCategoryColor(change.ruleInfo.category)}`}
                    title={`Caught by ${change.ruleInfo.ruleName} (${change.ruleInfo.category})`}
                  >
                    {getRuleDisplayName(change.ruleInfo)}
                  </span>
                  {onToggleRedaction && category && (
                    <button
                      onClick={() => onToggleRedaction(category)}
                      className={`text-[9px] px-1 py-0 rounded border ${
                        isEnabled
                          ? "bg-blue-600/50 border-blue-500 text-blue-200 hover:bg-blue-600"
                          : "bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600"
                      }`}
                      title={`Click to ${isEnabled ? "disable" : "enable"} ${category} redaction`}
                    >
                      {isEnabled ? "on" : "off"}
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
        {changes.length} redaction{changes.length !== 1 ? "s" : ""} applied
      </div>
    </div>
  );
}

/**
 * DiffView component - shows diff between original and redacted content.
 *
 * Modes:
 * - 'full': Shows entire content with inline diff highlighting
 * - 'changes': Shows only the changes in a compact list format
 */
export function DiffView({
  original,
  redacted,
  mode,
  redactionInfoMap,
  onToggleRedaction,
  enabledCategories,
  componentId = "analyzer.conversations.diff-view"
}: DiffViewProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const selfDocs = {
    title: "Diff viewer",
    componentId,
    calculations: [
      "diff-match-patch diffing for inline views",
      "Placeholder extraction for redaction summaries"
    ],
    notes: ["Supports full inline view or changes-only view."]
  };

  if (!original || !redacted) {
    return (
      <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
        <div className="text-gray-500 italic text-sm">
          Select a session to preview redactions
        </div>
      </SelfDocumentingSection>
    );
  }

  if (original === redacted) {
    return (
      <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
        <div className="text-gray-400 italic text-sm">
          No changes - content is identical before and after redaction.
        </div>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
      {mode === "full" ? (
        <FullDiffView
          original={original}
          redacted={redacted}
          redactionInfoMap={redactionInfoMap}
          onToggleRedaction={onToggleRedaction}
          enabledCategories={enabledCategories}
        />
      ) : (
        <ChangesOnlyView
          original={original}
          redacted={redacted}
          redactionInfoMap={redactionInfoMap}
          onToggleRedaction={onToggleRedaction}
          enabledCategories={enabledCategories}
        />
      )}
    </SelfDocumentingSection>
  );
}

export default DiffView;
