/**
 * Activity Feed Pane - Unified real-time event stream.
 *
 * Consolidates all watcher events into one live stream:
 * - Agent sessions start/end
 * - Tool executions
 * - Notifications
 * - Permission requests
 * - User prompts
 * - Agent responses
 *
 * @module components/ActivityFeedPane
 */

import { useState, useMemo } from "react";
import type { ActivityEvent } from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

// Event type colors
const EVENT_COLORS: Record<string, string> = {
  session_start: "bg-green-500",
  session_end: "bg-gray-500",
  tool_start: "bg-blue-500",
  tool_end: "bg-blue-600",
  notification: "bg-yellow-500",
  notification_sent: "bg-yellow-600",
  permission: "bg-orange-500",
  prompt: "bg-purple-500",
  response: "bg-cyan-500",
  subagent: "bg-indigo-500",
  compact: "bg-pink-500"
};

// Event type icons
const EVENT_ICONS: Record<string, string> = {
  session_start: "▶",
  session_end: "■",
  tool_start: "⚙",
  tool_end: "✓",
  notification: "🔔",
  notification_sent: "📢",
  permission: "🔐",
  prompt: "💬",
  response: "🤖",
  subagent: "🔀",
  compact: "📦"
};

// Event type labels
const EVENT_LABELS: Record<string, string> = {
  session_start: "Session Started",
  session_end: "Session Ended",
  tool_start: "Tool Started",
  tool_end: "Tool Completed",
  notification: "Notification",
  notification_sent: "Notification Sent",
  permission: "Permission Request",
  prompt: "User Prompt",
  response: "Agent Response",
  subagent: "Sub-agent Completed",
  compact: "Context Compacted"
};

interface ActivityFeedPaneProps {
  activityEvents: ActivityEvent[];
  compact?: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffSecs < 5) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(timestamp).toLocaleTimeString();
}

function formatEventDescription(event: ActivityEvent): string {
  const data = event.data;

  switch (event.type) {
    case "session_start":
      return `Started in ${data.cwd || "unknown directory"}`;
    case "session_end":
      return `Session ended (${data.tool_count || 0} tools used)`;
    case "tool_start":
      return `${data.tool_name || "Unknown tool"}`;
    case "tool_end": {
      const status = data.success ? "completed" : "failed";
      const duration = data.duration_ms ? ` (${data.duration_ms}ms)` : "";
      return `${data.tool_name || "Unknown tool"} ${status}${duration}`;
    }
    case "notification":
      return `Type: ${data.notification_type || "unknown"}`;
    case "notification_sent":
      return `${data.title || "Notification"}`;
    case "permission":
      return `${data.tool_name || "Tool"}: ${data.action || "unknown action"}`;
    case "prompt":
      return `${data.prompt_length || 0} characters`;
    case "response": {
      const inputTokens = Number(data.input_tokens) || 0;
      const outputTokens = Number(data.output_tokens) || 0;
      return `${data.stop_reason || "completed"} (${inputTokens + outputTokens} tokens)`;
    }
    case "subagent":
      return `${data.subagent_id || "Unknown"} - ${data.stop_reason || "completed"}`;
    case "compact":
      return `${data.compact_type || "standard"} compaction`;
    default:
      return JSON.stringify(data).slice(0, 50);
  }
}

function EventItem({
  event,
  showDetails
}: {
  event: ActivityEvent;
  showDetails: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = EVENT_COLORS[event.type] || "bg-gray-500";
  const icon = EVENT_ICONS[event.type] || "•";
  const label = EVENT_LABELS[event.type] || event.type;

  return (
    <div
      className={`flex gap-3 py-2 px-3 rounded-lg hover:bg-gray-700/50 transition-colors cursor-pointer ${
        expanded ? "bg-gray-700/30" : ""
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Icon */}
      <div
        className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center text-white text-sm flex-shrink-0`}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-200 font-medium">{label}</span>
          <span className="text-gray-500 text-xs">
            {formatRelativeTime(event.timestamp)}
          </span>
          {event.session_id && showDetails && (
            <span
              className="text-gray-600 text-xs font-mono truncate max-w-[120px]"
              title={event.session_id}
            >
              {event.session_id.slice(0, 8)}...
            </span>
          )}
        </div>
        <p className="text-gray-400 text-sm truncate">
          {formatEventDescription(event)}
        </p>

        {/* Expanded details */}
        {expanded && Object.keys(event.data).length > 0 && (
          <div className="mt-2 p-2 bg-gray-800 rounded text-xs">
            <pre className="text-gray-400 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityFeedPane({
  activityEvents,
  compact = false
}: ActivityFeedPaneProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const [filterType, setFilterType] = useState<string>("");
  const [showSessionIds, setShowSessionIds] = useState(false);
  const [limit, setLimit] = useState(50);

  // Filter events
  const filteredEvents = useMemo(() => {
    let events = activityEvents;
    if (filterType) {
      events = events.filter((e) => e.type === filterType);
    }
    return events.slice(0, limit);
  }, [activityEvents, filterType, limit]);

  // Count events by type
  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of activityEvents) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts;
  }, [activityEvents]);

  // Get unique event types for filter
  const eventTypes = Object.keys(eventCounts).sort();

  if (compact) {
    // Compact mode - just show recent events in a small list
    return (
      <div className="space-y-1">
        {filteredEvents.slice(0, 10).map((event) => (
          <EventItem key={event.id} event={event} showDetails={false} />
        ))}
        {filteredEvents.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-4">
            No activity yet
          </div>
        )}
      </div>
    );
  }

  return (
    <SelfDocumentingSection
      title="Activity Feed"
      reads={[
        {
          path: "WebSocket /ws",
          description: "Real-time events from watcher daemon"
        }
      ]}
      notes={[
        "Events are kept in memory (last 200 events)",
        "Events include sessions, tools, prompts, responses",
        "Click any event to see full details"
      ]}
      visible={showSelfDocs}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Activity Feed
              </h2>
              <p className="text-xs text-gray-400">
                Real-time stream of all watcher events
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-gray-400 text-sm">Filter:</label>
                <select
                  className="bg-gray-700 text-gray-200 rounded px-3 py-1.5 text-sm"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="">All ({activityEvents.length})</option>
                  {eventTypes.map((type) => (
                    <option key={type} value={type}>
                      {EVENT_LABELS[type] || type} ({eventCounts[type]})
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSessionIds}
                  onChange={(e) => setShowSessionIds(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600"
                />
                Show IDs
              </label>
            </div>
          </div>
        </div>

        {/* Event type summary */}
        <div className="flex flex-wrap gap-2">
          {eventTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? "" : type)}
              className={`px-2 py-1 rounded text-xs text-white transition-colors ${
                EVENT_COLORS[type] || "bg-gray-500"
              } ${filterType === type ? "ring-2 ring-white ring-opacity-50" : "opacity-70 hover:opacity-100"}`}
            >
              {EVENT_ICONS[type]} {eventCounts[type]}
            </button>
          ))}
        </div>

        {/* Events list */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          {filteredEvents.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-8">
              {filterType
                ? `No ${EVENT_LABELS[filterType] || filterType} events`
                : "No activity yet. Events will appear as agents run."}
            </div>
          ) : (
            <div className="divide-y divide-gray-700/50">
              {filteredEvents.map((event) => (
                <EventItem
                  key={event.id}
                  event={event}
                  showDetails={showSessionIds}
                />
              ))}
            </div>
          )}

          {/* Load more */}
          {activityEvents.length > limit && (
            <div className="p-3 border-t border-gray-700 text-center">
              <button
                className="px-4 py-1.5 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                onClick={() => setLimit(limit + 50)}
              >
                Load more ({activityEvents.length - limit} remaining)
              </button>
            </div>
          )}
        </div>

        {/* Stats footer */}
        <div className="text-xs text-gray-500 text-center">
          Showing {filteredEvents.length} of {activityEvents.length} events
          {activityEvents.length >= 200 && " (max 200 in memory)"}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
