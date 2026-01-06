import { useMemo, useState } from "react";
import type { ActivityEvent, HookSession, ToolUsage } from "../api/types";

interface SessionTokens {
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
}

interface HookTimelineSectionProps {
  hookSessions: HookSession[];
  recentToolUsages: ToolUsage[];
  activityEvents: ActivityEvent[];
  sessionTokens: Record<string, SessionTokens>;
}

const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const formatTimeSince = (ts: number): string => {
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  const ms = Date.now() - tsMs;
  if (ms < 0) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

export function HookTimelineSection({
  hookSessions,
  recentToolUsages,
  activityEvents,
  sessionTokens: _sessionTokens
}: HookTimelineSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>("all");

  // Activity summary (last hour)
  const activitySummary = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentUsages = recentToolUsages.filter((u) => {
      const ts = u.timestamp > 1e12 ? u.timestamp : u.timestamp * 1000;
      return ts > oneHourAgo;
    });

    const recentSessions = hookSessions.filter((s) => {
      const ts = s.start_time > 1e12 ? s.start_time : s.start_time * 1000;
      return ts > oneHourAgo || s.active;
    });

    const failures = recentUsages.filter((u) => u.success === false).length;
    const totalCostUsd = recentSessions.reduce(
      (sum, s) => sum + (s.estimated_cost_usd || 0),
      0
    );
    const totalInputTokens = recentSessions.reduce(
      (sum, s) => sum + (s.total_input_tokens ?? 0),
      0
    );
    const totalOutputTokens = recentSessions.reduce(
      (sum, s) => sum + (s.total_output_tokens ?? 0),
      0
    );

    return {
      sessions: recentSessions.length,
      toolCalls: recentUsages.length,
      failures,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd
    };
  }, [hookSessions, recentToolUsages]);

  // Filter activity events
  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") return activityEvents.slice(0, 50);
    return activityEvents
      .filter((e) => e.type.includes(eventFilter))
      .slice(0, 50);
  }, [activityEvents, eventFilter]);

  // Recent tool calls (last 20)
  const recentTools = useMemo(() => {
    return [...recentToolUsages]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
  }, [recentToolUsages]);

  const activeSessions = hookSessions.filter((s) => s.active);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-750"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">Hook Timeline</h3>
          {activeSessions.length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-green-600 text-white rounded-full">
              {activeSessions.length} active
            </span>
          )}
          <span className="text-xs text-gray-400">
            {activitySummary.toolCalls} calls (1h) |{" "}
            {formatTokens(
              activitySummary.totalInputTokens +
                activitySummary.totalOutputTokens
            )}{" "}
            tokens | ${activitySummary.totalCostUsd.toFixed(2)}
          </span>
        </div>
        <span className="text-gray-400">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {/* Activity Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-750 rounded p-3">
              <div className="text-2xl font-bold text-white">
                {activitySummary.sessions}
              </div>
              <div className="text-xs text-gray-400">Sessions (1h)</div>
            </div>
            <div className="bg-gray-750 rounded p-3">
              <div className="text-2xl font-bold text-white">
                {activitySummary.toolCalls}
              </div>
              <div className="text-xs text-gray-400">Tool Calls (1h)</div>
            </div>
            <div className="bg-gray-750 rounded p-3">
              <div className="text-2xl font-bold text-white">
                {formatTokens(
                  activitySummary.totalInputTokens +
                    activitySummary.totalOutputTokens
                )}
              </div>
              <div className="text-xs text-gray-400">Tokens (1h)</div>
            </div>
            <div className="bg-gray-750 rounded p-3">
              <div className="text-2xl font-bold text-white">
                ${activitySummary.totalCostUsd.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400">Est. Cost (1h)</div>
            </div>
          </div>

          {/* Recent Tool Calls */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">
              Recent Tool Calls
            </h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {recentTools.length === 0 ? (
                <div className="text-xs text-gray-500 py-2">
                  No recent tool calls
                </div>
              ) : (
                recentTools.map((tool) => (
                  <div
                    key={tool.tool_use_id}
                    className="flex items-center justify-between text-xs bg-gray-750 rounded px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          tool.success === false
                            ? "bg-red-400"
                            : tool.success === true
                              ? "bg-green-400"
                              : "bg-gray-400"
                        }`}
                      />
                      <span className="font-mono text-cyan-400">
                        {tool.tool_name}
                      </span>
                      {tool.duration_ms && (
                        <span className="text-gray-500">
                          {tool.duration_ms}ms
                        </span>
                      )}
                    </div>
                    <span className="text-gray-500">
                      {formatTimeSince(tool.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity Events */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-300">
                Activity Feed
              </h4>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300"
              >
                <option value="all">All Events</option>
                <option value="session">Sessions</option>
                <option value="tool">Tools</option>
                <option value="notification">Notifications</option>
                <option value="permission">Permissions</option>
                <option value="user">User</option>
                <option value="agent">Agent</option>
              </select>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {filteredEvents.length === 0 ? (
                <div className="text-xs text-gray-500 py-2">
                  No recent activity
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between text-xs bg-gray-750 rounded px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          event.type.includes("session")
                            ? "bg-blue-900/50 text-blue-400"
                            : event.type.includes("tool")
                              ? "bg-cyan-900/50 text-cyan-400"
                              : event.type.includes("notification")
                                ? "bg-green-900/50 text-green-400"
                                : event.type.includes("permission")
                                  ? "bg-yellow-900/50 text-yellow-400"
                              : event.type.includes("user")
                                ? "bg-purple-900/50 text-purple-400"
                                : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {event.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-gray-300 truncate max-w-[200px]">
                        {String(
                          event.data?.message || event.data?.tool_name || ""
                        )}
                      </span>
                    </div>
                    <span className="text-gray-500">
                      {formatTimeSince(event.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
