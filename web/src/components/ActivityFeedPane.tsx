/**
 * Activity Feed Pane - Unified real-time event stream.
 *
 * Shows all AgentWatch events from the EventBus:
 * - Agent processes (discovered, ended)
 * - Port changes (opened, closed)
 * - Hook sessions (start, end)
 * - Tool usage (completed, failed)
 * - Managed sessions (start, end)
 * - System events
 *
 * @module components/ActivityFeedPane
 */

import { useState, useMemo, useEffect } from "react";
import type { AgentWatchEvent, AuditCategory, AuditAction } from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  process: "bg-blue-500",
  port: "bg-cyan-500",
  hook_session: "bg-green-500",
  tool_usage: "bg-purple-500",
  managed_session: "bg-yellow-500",
  repo: "bg-orange-500",
  enrichment: "bg-pink-500",
  annotation: "bg-indigo-500",
  config: "bg-gray-500",
  watcher: "bg-emerald-500",
  analyzer: "bg-teal-500",
  system: "bg-slate-500"
};

// Category icons
const CATEGORY_ICONS: Record<string, string> = {
  process: "🤖",
  port: "🔌",
  hook_session: "🪝",
  tool_usage: "🛠",
  managed_session: "▶",
  repo: "📁",
  enrichment: "✨",
  annotation: "📝",
  config: "⚙",
  watcher: "👁",
  analyzer: "📊",
  system: "💻"
};

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  process: "Process",
  port: "Port",
  hook_session: "Hook Session",
  tool_usage: "Tool Usage",
  managed_session: "Managed Session",
  repo: "Repository",
  enrichment: "Enrichment",
  annotation: "Annotation",
  config: "Config",
  watcher: "Watcher",
  analyzer: "Analyzer",
  system: "System"
};

// Action icons
const ACTION_ICONS: Record<string, string> = {
  start: "▶",
  end: "■",
  discover: "🔍",
  create: "+",
  update: "↻",
  delete: "×"
};

interface ActivityFeedPaneProps {
  /** Unified events from EventBus */
  unifiedEvents: AgentWatchEvent[];
  /** Callback to fetch more events */
  onFetchMore?: () => Promise<void>;
  /** Compact mode for smaller display */
  compact?: boolean;
}

function formatRelativeTime(timestamp: string): string {
  const ts = new Date(timestamp).getTime();
  const now = Date.now();
  const diffMs = now - ts;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffSecs < 5) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(ts).toLocaleTimeString();
}

function EventItem({
  event,
  showDetails
}: {
  event: AgentWatchEvent;
  showDetails: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = CATEGORY_COLORS[event.category] || "bg-gray-500";
  const icon = CATEGORY_ICONS[event.category] || "•";
  const actionIcon = ACTION_ICONS[event.action] || "";
  const categoryLabel = CATEGORY_LABELS[event.category] || event.category;

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
          <span className="text-gray-200 font-medium">
            {actionIcon} {categoryLabel}
          </span>
          <span className="text-gray-600 text-xs">{event.action}</span>
          <span className="text-gray-500 text-xs">
            {formatRelativeTime(event.timestamp)}
          </span>
          {showDetails && event.entityId && (
            <span
              className="text-gray-600 text-xs font-mono truncate max-w-[120px]"
              title={event.entityId}
            >
              {event.entityId.slice(0, 12)}
              {event.entityId.length > 12 ? "..." : ""}
            </span>
          )}
        </div>
        <p className="text-gray-400 text-sm truncate">{event.description}</p>

        {/* Expanded details */}
        {expanded && event.details && Object.keys(event.details).length > 0 && (
          <div className="mt-2 p-2 bg-gray-800 rounded text-xs">
            <div className="text-gray-500 mb-1">
              Source: {event.source} | Entity: {event.entityId}
            </div>
            <pre className="text-gray-400 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityFeedPane({
  unifiedEvents,
  onFetchMore,
  compact = false
}: ActivityFeedPaneProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const [filterCategory, setFilterCategory] = useState<AuditCategory | "">("");
  const [filterAction, setFilterAction] = useState<AuditAction | "">("");
  const [showEntityIds, setShowEntityIds] = useState(false);
  const [limit, setLimit] = useState(50);

  // Fetch initial events on mount
  useEffect(() => {
    if (onFetchMore && unifiedEvents.length === 0) {
      onFetchMore();
    }
  }, [onFetchMore, unifiedEvents.length]);

  // Filter events
  const filteredEvents = useMemo(() => {
    let events = unifiedEvents;
    if (filterCategory) {
      events = events.filter((e) => e.category === filterCategory);
    }
    if (filterAction) {
      events = events.filter((e) => e.action === filterAction);
    }
    return events.slice(0, limit);
  }, [unifiedEvents, filterCategory, filterAction, limit]);

  // Count events by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of unifiedEvents) {
      counts[event.category] = (counts[event.category] || 0) + 1;
    }
    return counts;
  }, [unifiedEvents]);

  // Count events by action
  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of unifiedEvents) {
      counts[event.action] = (counts[event.action] || 0) + 1;
    }
    return counts;
  }, [unifiedEvents]);

  // Get unique categories and actions for filters
  const categories = Object.keys(categoryCounts).sort() as AuditCategory[];
  const actions = Object.keys(actionCounts).sort() as AuditAction[];

  if (compact) {
    // Compact mode - just show recent events in a small list
    return (
      <div className="space-y-1">
        {filteredEvents.slice(0, 10).map((event, idx) => (
          <EventItem
            key={event.id || `${event.timestamp}-${idx}`}
            event={event}
            showDetails={false}
          />
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
      componentId="watcher.activity.pane"
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
                Unified stream of all AgentWatch events
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Category filter */}
              <div className="flex items-center gap-2">
                <label className="text-gray-400 text-sm">Category:</label>
                <select
                  className="bg-gray-700 text-gray-200 rounded px-3 py-1.5 text-sm"
                  value={filterCategory}
                  onChange={(e) =>
                    setFilterCategory(e.target.value as AuditCategory | "")
                  }
                >
                  <option value="">All ({unifiedEvents.length})</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat] || cat} ({categoryCounts[cat]})
                    </option>
                  ))}
                </select>
              </div>
              {/* Action filter */}
              <div className="flex items-center gap-2">
                <label className="text-gray-400 text-sm">Action:</label>
                <select
                  className="bg-gray-700 text-gray-200 rounded px-3 py-1.5 text-sm"
                  value={filterAction}
                  onChange={(e) =>
                    setFilterAction(e.target.value as AuditAction | "")
                  }
                >
                  <option value="">All</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {action} ({actionCounts[action]})
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEntityIds}
                  onChange={(e) => setShowEntityIds(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600"
                />
                Show IDs
              </label>
            </div>
          </div>
        </div>

        {/* Category summary chips */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() =>
                setFilterCategory(filterCategory === cat ? "" : cat)
              }
              className={`px-2 py-1 rounded text-xs text-white transition-colors ${
                CATEGORY_COLORS[cat] || "bg-gray-500"
              } ${filterCategory === cat ? "ring-2 ring-white ring-opacity-50" : "opacity-70 hover:opacity-100"}`}
            >
              {CATEGORY_ICONS[cat]} {categoryCounts[cat]}
            </button>
          ))}
        </div>

        {/* Events list */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          {filteredEvents.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-8">
              {filterCategory || filterAction
                ? `No events matching filters`
                : "No activity yet. Events will appear as agents run."}
            </div>
          ) : (
            <div className="divide-y divide-gray-700/50">
              {filteredEvents.map((event, idx) => (
                <EventItem
                  key={event.id || `${event.timestamp}-${idx}`}
                  event={event}
                  showDetails={showEntityIds}
                />
              ))}
            </div>
          )}

          {/* Load more */}
          {unifiedEvents.length > limit && (
            <div className="p-3 border-t border-gray-700 text-center">
              <button
                className="px-4 py-1.5 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                onClick={() => setLimit(limit + 50)}
              >
                Load more ({unifiedEvents.length - limit} remaining)
              </button>
            </div>
          )}
        </div>

        {/* Stats footer */}
        <div className="text-xs text-gray-500 text-center">
          Showing {filteredEvents.length} of {unifiedEvents.length} events
          {unifiedEvents.length >= 500 && " (max 500 in memory)"}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
