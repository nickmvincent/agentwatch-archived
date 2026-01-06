import { useEffect, useMemo, useState } from "react";
import type {
  ActivityEvent,
  CostStatus,
  DailyStats,
  HookEnhancementsConfig,
  HookSession,
  NotificationProvidersResult,
  NotificationsConfig,
  RulesListResult,
  ToolStats,
  ToolUsage
} from "../api/types";
import { useData } from "../context/DataProvider";
import { HOOK_DESCRIPTIONS, HookTypeInfo } from "./ui/InfoTooltip";

interface SessionTokens {
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
}

interface HooksPaneProps {
  hookSessions: HookSession[];
  recentToolUsages: ToolUsage[];
  activityEvents: ActivityEvent[];
  sessionTokens: Record<string, SessionTokens>;
}

interface ActivitySummary {
  sessions: number;
  toolCalls: number;
  failures: number;
  topTool: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

// Helper to format token counts
const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export function HooksPane({
  hookSessions,
  recentToolUsages,
  activityEvents,
  sessionTokens
}: HooksPaneProps) {
  const { getConfig } = useData();
  const [toolStats, setToolStats] = useState<ToolStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [showHistorical, setShowHistorical] = useState(false);
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);

  // Hook enhancements state
  const [showEnhancements, setShowEnhancements] = useState(false);
  const [enhancementsConfig, setEnhancementsConfig] =
    useState<HookEnhancementsConfig | null>(null);
  const [costStatus, setCostStatus] = useState<CostStatus | null>(null);
  const [rules, setRules] = useState<RulesListResult | null>(null);
  const [notificationProviders, setNotificationProviders] =
    useState<NotificationProvidersResult | null>(null);
  const [notificationsConfig, setNotificationsConfig] =
    useState<NotificationsConfig | null>(null);

  useEffect(() => {
    fetchToolStats();
    fetchDailyStats();
    fetchEnhancementsConfig();
    fetchNotificationsConfig();
  }, [getConfig]);

  // Auto-expand historical section if no live activity and stats exist
  useEffect(() => {
    if (
      !hasAutoExpanded &&
      hookSessions.length === 0 &&
      recentToolUsages.length === 0 &&
      toolStats.length > 0
    ) {
      setShowHistorical(true);
      setHasAutoExpanded(true);
    }
  }, [
    hookSessions.length,
    recentToolUsages.length,
    toolStats.length,
    hasAutoExpanded
  ]);

  // Calculate recent activity summary (last hour)
  const activitySummary = useMemo((): ActivitySummary => {
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

    const toolCounts: Record<string, number> = {};
    for (const u of recentUsages) {
      toolCounts[u.tool_name] = (toolCounts[u.tool_name] || 0) + 1;
    }
    const topTool =
      Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Sum up cost from recent sessions
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
      topTool,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd
    };
  }, [hookSessions, recentToolUsages]);

  const fetchToolStats = async () => {
    try {
      const res = await fetch("/api/hooks/tools/stats");
      if (res.ok) {
        const data = await res.json();
        // API returns { stats: [...] }, extract the array
        setToolStats(Array.isArray(data) ? data : (data.stats ?? []));
      }
    } catch {
      // Ignore
    }
  };

  const fetchDailyStats = async () => {
    try {
      const res = await fetch("/api/hooks/stats/daily?days=14");
      if (res.ok) {
        const data = await res.json();
        // API returns { days, stats: [...] }, extract the array
        setDailyStats(Array.isArray(data) ? data : (data.stats ?? []));
      }
    } catch {
      // Ignore
    }
  };

  const fetchEnhancementsConfig = async () => {
    try {
      const res = await fetch("/api/hook-enhancements");
      if (res.ok) {
        setEnhancementsConfig(await res.json());
        // Fetch additional data based on what's enabled
        fetchCostStatus();
        fetchRules();
        fetchNotificationProviders();
      }
    } catch {
      // Ignore
    }
  };

  const fetchCostStatus = async () => {
    try {
      const res = await fetch("/api/cost/status");
      if (res.ok) {
        setCostStatus(await res.json());
      }
    } catch {
      // Ignore
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch("/api/rules");
      if (res.ok) {
        setRules(await res.json());
      }
    } catch {
      // Ignore
    }
  };

  const fetchNotificationProviders = async () => {
    try {
      const res = await fetch("/api/notifications/providers");
      if (res.ok) {
        setNotificationProviders(await res.json());
      }
    } catch {
      // Ignore
    }
  };

  const fetchNotificationsConfig = async () => {
    try {
      const config = await getConfig();
      if (config.notifications) {
        setNotificationsConfig(config.notifications);
      }
    } catch {
      // Ignore
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

  // Build a map of session_id to session info for quick lookup
  const sessionMap = useMemo(() => {
    const map = new Map<string, HookSession>();
    for (const s of hookSessions) {
      map.set(s.session_id, s);
    }
    return map;
  }, [hookSessions]);

  const activeSessions = hookSessions.filter((s) => s.active);
  const recentInactiveSessions = hookSessions
    .filter((s) => {
      if (s.active) return false;
      const ts = s.start_time > 1e12 ? s.start_time : s.start_time * 1000;
      return ts > Date.now() - 60 * 60 * 1000; // Last hour
    })
    .slice(0, 10);

  return (
    <div className="space-y-4">
      {/* LIVE SESSION */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <h2 className="text-lg font-semibold text-white">Live Session</h2>
          <span className="text-xs text-gray-500">
            Real-time from watcher
          </span>
        </div>

        {/* Info banner */}
        <details className="mb-4 text-xs text-gray-400">
          <summary className="cursor-pointer hover:text-gray-300">
            ℹ️ About this data
          </summary>
          <div className="mt-2 p-3 bg-gray-700/50 rounded space-y-3">
            <div className="space-y-1">
              <p>
                <strong>Source:</strong> Claude Code hooks
              </p>
              <p>
                <strong>Requirements:</strong> Install agentwatch hooks via{" "}
                <code className="bg-gray-800 px-1 rounded">
                  aw hooks install
                </code>
              </p>
              <p>
                <strong>Persistent logs:</strong>{" "}
                <code className="bg-gray-800 px-1 rounded">
                  ~/.agentwatch/hooks/
                </code>
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-300 mb-2">Hook Types:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(HOOK_DESCRIPTIONS).map(([type, info]) => (
                  <div
                    key={type}
                    className="flex items-start gap-2 p-1.5 bg-gray-800/50 rounded"
                  >
                    <span className="text-blue-400 font-mono text-[11px] shrink-0 w-24">
                      {type}
                    </span>
                    <span className="text-gray-400 text-[11px]">
                      {info.summary}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <div className="mb-4 p-3 bg-green-900/20 border border-green-800 rounded">
            <div className="text-green-400 text-sm font-medium mb-2">
              {activeSessions.length} Active Session
              {activeSessions.length > 1 ? "s" : ""}
            </div>
            <div className="space-y-1">
              {activeSessions.map((s) => (
                <div
                  key={s.session_id}
                  className="text-xs text-gray-400 flex items-center gap-2"
                >
                  <span className="font-mono truncate max-w-[200px]">
                    {s.cwd.split("/").slice(-2).join("/")}
                  </span>
                  <span>·</span>
                  <span>{s.tool_count} tools</span>
                  {s.total_input_tokens !== undefined &&
                    s.total_input_tokens > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-cyan-400">
                          {formatTokens(s.total_input_tokens)}/
                          {formatTokens(s.total_output_tokens || 0)} tok
                          {s.estimated_cost_usd !== undefined &&
                            s.estimated_cost_usd > 0 && (
                              <span className="ml-1 text-[10px] text-gray-500">
                                (~${s.estimated_cost_usd.toFixed(3)})
                              </span>
                            )}
                        </span>
                      </>
                    )}
                  {s.awaiting_user && (
                    <span className="text-yellow-400">⏳ awaiting</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Sessions (inactive but from last hour) */}
        {activeSessions.length === 0 && recentInactiveSessions.length > 0 && (
          <div className="mb-4 p-3 bg-gray-700/30 border border-gray-600 rounded">
            <div className="text-gray-300 text-sm font-medium mb-2">
              Recent Sessions (last hour)
            </div>
            <div className="space-y-1">
              {recentInactiveSessions.map((s) => (
                <div
                  key={s.session_id}
                  className="text-xs text-gray-400 flex items-center gap-2"
                >
                  <span className="font-mono truncate max-w-[200px]">
                    {s.cwd.split("/").slice(-2).join("/")}
                  </span>
                  <span>·</span>
                  <span>{s.tool_count} tools</span>
                  {s.total_input_tokens !== undefined &&
                    s.total_input_tokens > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-cyan-400">
                          {formatTokens(s.total_input_tokens)}/
                          {formatTokens(s.total_output_tokens || 0)} tok
                          {s.estimated_cost_usd !== undefined &&
                            s.estimated_cost_usd > 0 && (
                              <span className="ml-1 text-[10px] text-gray-500">
                                (~${s.estimated_cost_usd.toFixed(3)})
                              </span>
                            )}
                        </span>
                      </>
                    )}
                  <span className="text-gray-500">·</span>
                  <span className="text-gray-500">
                    {formatTime(s.start_time)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No activity message */}
        {activeSessions.length === 0 &&
          recentInactiveSessions.length === 0 &&
          hookSessions.length === 0 && (
            <div className="mb-4 p-3 bg-gray-700/30 border border-gray-600 rounded text-center">
              <div className="text-gray-400 text-sm">
                No hook sessions detected
              </div>
              <div className="text-gray-500 text-xs mt-1">
                Start a Claude Code session to see live activity here
              </div>
            </div>
          )}

        {/* Activity Summary */}
        <div className="mb-2 p-2 bg-gray-700/30 rounded text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span>📊 Live activity summary</span>
          </div>
          <div className="mt-1 text-[10px] text-gray-500 space-y-0.5">
            <div>
              • Stats show <span className="text-gray-400">last hour only</span>{" "}
              — older data is in Historical Stats below
            </div>
            <div>
              • Shows up to{" "}
              <span className="text-gray-400">500 tool calls</span> — see
              ~/.agentwatch/hooks/ for complete logs
            </div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-5 gap-2 text-center">
          <div className="bg-gray-700/50 p-2 rounded">
            <div className="text-lg font-semibold text-white">
              {activitySummary.sessions}
            </div>
            <div className="text-xs text-gray-400">Sessions (1h)</div>
          </div>
          <div className="bg-gray-700/50 p-2 rounded">
            <div className="text-lg font-semibold text-white">
              {activitySummary.toolCalls}
            </div>
            <div className="text-xs text-gray-400">Tool Calls</div>
          </div>
          <div
            className={`p-2 rounded ${activitySummary.failures > 0 ? "bg-red-900/30" : "bg-gray-700/50"}`}
          >
            <div
              className={`text-lg font-semibold ${activitySummary.failures > 0 ? "text-red-400" : "text-white"}`}
            >
              {activitySummary.failures}
            </div>
            <div className="text-xs text-gray-400">Failures</div>
          </div>
          <div className="bg-gray-700/50 p-2 rounded">
            <div className="text-lg font-semibold text-green-400">
              {formatTokens(
                activitySummary.totalInputTokens +
                  activitySummary.totalOutputTokens
              )}{" "}
              tok{" "}
              {activitySummary.totalCostUsd > 0 && (
                <span className="text-[10px] text-gray-500">
                  (~${activitySummary.totalCostUsd.toFixed(2)})
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400">Tokens (1h)</div>
          </div>
          <div className="bg-gray-700/50 p-2 rounded">
            <div className="text-lg font-semibold text-blue-400 truncate">
              {activitySummary.topTool || "-"}
            </div>
            <div className="text-xs text-gray-400">Top Tool</div>
          </div>
        </div>

        {/* Token Usage */}
        <TokenSummary sessionTokens={sessionTokens} />

        {/* Activity Feed - Pure chronological timeline of all hooks */}
        <ActivityFeed
          events={activityEvents}
          formatTime={formatTime}
          recentToolUsages={recentToolUsages}
          sessionMap={sessionMap}
        />
      </div>

      {/* HISTORICAL STATS */}
      <div className="bg-gray-800 rounded-lg p-4">
        <button
          onClick={() => setShowHistorical(!showHistorical)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="text-gray-500">{showHistorical ? "▼" : "▶"}</span>
          <h2 className="text-lg font-semibold text-gray-400">
            Historical Stats
          </h2>
          <span className="text-xs text-gray-600">
            From persisted logs (~/.agentwatch/hooks/)
          </span>
        </button>

        {showHistorical && (
          <div className="mt-4 space-y-6">
            {/* Tool Stats */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                Tool Usage (All Time)
              </h3>
              <ToolStatsView
                toolStats={toolStats}
                formatDuration={formatDuration}
              />
            </div>

            {/* Daily Chart */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                Activity Chart (14 Days)
              </h3>
              <DailyStatsView dailyStats={dailyStats} />
            </div>
          </div>
        )}
      </div>

      {/* HOOK ENHANCEMENTS */}
      <div className="bg-gray-800 rounded-lg p-4">
        <button
          onClick={() => setShowEnhancements(!showEnhancements)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="text-gray-500">{showEnhancements ? "▼" : "▶"}</span>
          <h2 className="text-lg font-semibold text-purple-400">
            Hook Enhancements
          </h2>
          <span className="text-xs text-gray-600">
            Advanced hook features and controls
          </span>
        </button>

        {showEnhancements && (
          <div className="mt-4 space-y-4">
            {/* Configuration Overview */}
            {enhancementsConfig && (
              <HookEnhancementsOverview config={enhancementsConfig} />
            )}

            {/* Cost Status */}
            {costStatus && costStatus.enabled && (
              <CostStatusView costStatus={costStatus} />
            )}

            {/* Rules Overview */}
            {rules && rules.total > 0 && <RulesOverview rules={rules} />}

            {/* Notification Providers */}
            {notificationProviders && notificationProviders.available && (
              <NotificationProvidersView providers={notificationProviders} />
            )}

            {/* Hook Notifications Config */}
            {notificationsConfig && notificationsConfig.enable && (
              <HookNotificationsView config={notificationsConfig} />
            )}

            {/* No enhancements enabled message */}
            {enhancementsConfig &&
              !enhancementsConfig.rules.enabled &&
              !enhancementsConfig.cost_controls.enabled &&
              !enhancementsConfig.stop_blocking.enabled &&
              !enhancementsConfig.auto_permissions.enabled && (
                <div className="text-gray-500 text-sm text-center py-4">
                  <p>No hook enhancements are currently enabled.</p>
                  <p className="text-xs mt-1">
                    Configure in ~/.config/agentwatch/config.toml
                  </p>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

function TokenSummary({
  sessionTokens
}: { sessionTokens: Record<string, SessionTokens> }) {
  const totals = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let turns = 0;
    for (const session of Object.values(sessionTokens)) {
      inputTokens += session.inputTokens;
      outputTokens += session.outputTokens;
      turns += session.turnCount;
    }
    return { inputTokens, outputTokens, turns };
  }, [sessionTokens]);

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  if (totals.turns === 0) return null;

  return (
    <div className="mb-4 bg-gray-700/30 p-3 rounded">
      <h4 className="text-sm font-medium text-gray-300 mb-2">
        Token Usage (This Session)
      </h4>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-semibold text-blue-400">
            {formatTokens(totals.inputTokens)}
          </div>
          <div className="text-xs text-gray-400">Input</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-green-400">
            {formatTokens(totals.outputTokens)}
          </div>
          <div className="text-xs text-gray-400">Output</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{totals.turns}</div>
          <div className="text-xs text-gray-400">Turns</div>
        </div>
      </div>
    </div>
  );
}

const EVENT_CONFIG: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  // Session lifecycle
  session_start: {
    icon: "▶️",
    color: "border-green-600",
    label: "Session Start"
  },
  session_end: { icon: "⏹️", color: "border-red-500", label: "Session End" },
  // Tool usage
  tool_start: { icon: "⚙️", color: "border-cyan-500", label: "Tool Start" },
  tool_end: { icon: "✅", color: "border-cyan-600", label: "Tool End" },
  // User interaction
  prompt: { icon: "💬", color: "border-blue-500", label: "Prompt" },
  response: { icon: "🤖", color: "border-green-500", label: "Response" },
  permission: { icon: "🔐", color: "border-yellow-500", label: "Permission" },
  // Agent lifecycle
  subagent: { icon: "🔀", color: "border-purple-500", label: "Subagent" },
  compact: { icon: "📦", color: "border-gray-500", label: "Compact" },
  // Notifications
  notification: {
    icon: "🔔",
    color: "border-orange-500",
    label: "Notification"
  },
  notification_sent: {
    icon: "📤",
    color: "border-pink-500",
    label: "Desktop Notification"
  }
};

// Event type categories for filtering
const EVENT_CATEGORIES = {
  all: { label: "All", types: null },
  lifecycle: { label: "Sessions", types: ["session_start", "session_end"] },
  tools: { label: "Tools", types: ["tool_start", "tool_end"] },
  interaction: { label: "User", types: ["prompt", "response", "permission"] },
  agent: { label: "Agent", types: ["subagent", "compact"] },
  notifications: {
    label: "Notifications",
    types: ["notification", "notification_sent"]
  }
};

function ActivityFeed({
  events,
  formatTime,
  recentToolUsages,
  sessionMap: _sessionMap
}: {
  events: ActivityEvent[];
  formatTime: (ts: number) => string;
  recentToolUsages?: ToolUsage[];
  sessionMap?: Map<string, HookSession>;
}) {
  const [filter, setFilter] = useState<keyof typeof EVENT_CATEGORIES>("all");
  const [expanded, setExpanded] = useState(false);

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  // Create a lookup for tool usage details by tool_use_id
  const toolUsageMap = useMemo(() => {
    const map = new Map<string, ToolUsage>();
    if (recentToolUsages) {
      for (const usage of recentToolUsages) {
        map.set(usage.tool_use_id, usage);
      }
    }
    return map;
  }, [recentToolUsages]);

  // Get tool input summary for richer timeline display
  const getToolInputSummary = (
    toolName: string,
    input: Record<string, unknown>
  ): string | null => {
    switch (toolName) {
      case "Read":
        return input.file_path
          ? String(input.file_path).split("/").slice(-2).join("/")
          : null;
      case "Write":
      case "Edit":
        return input.file_path
          ? String(input.file_path).split("/").slice(-2).join("/")
          : null;
      case "Bash":
        if (input.command) {
          const cmd = String(input.command);
          return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
        }
        return null;
      case "Glob":
        return input.pattern ? String(input.pattern) : null;
      case "Grep":
        return input.pattern ? `/${input.pattern}/` : null;
      case "Task":
        return input.description ? String(input.description) : null;
      default:
        if (input.file_path)
          return String(input.file_path).split("/").slice(-2).join("/");
        if (input.path)
          return String(input.path).split("/").slice(-2).join("/");
        return null;
    }
  };

  // Helper to render tool start event info
  const renderToolStart = (event: ActivityEvent) => {
    const toolName = String(event.data.tool_name);
    const toolUseId = String(event.data.tool_use_id || "");
    const usage = toolUsageMap.get(toolUseId);
    const inputSummary = usage
      ? getToolInputSummary(toolName, usage.tool_input)
      : null;
    return (
      <>
        <span className="text-xs text-cyan-400">{toolName}</span>
        {inputSummary && (
          <span
            className="text-xs text-gray-500 font-mono truncate max-w-[200px]"
            title={inputSummary}
          >
            {inputSummary}
          </span>
        )}
      </>
    );
  };

  // Helper to render tool end event info
  const renderToolEnd = (event: ActivityEvent) => {
    const toolName = String(event.data.tool_name);
    const toolUseId = String(event.data.tool_use_id || "");
    const usage = toolUsageMap.get(toolUseId);
    const inputSummary = usage
      ? getToolInputSummary(toolName, usage.tool_input)
      : null;
    const durationMs = Number(event.data.duration_ms);
    const durationStr =
      event.data.duration_ms != null
        ? ` (${durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`})`
        : "";
    return (
      <>
        <span
          className={`text-xs ${event.data.success === false ? "text-red-400" : "text-cyan-400"}`}
        >
          {toolName}
          {durationStr}
          {event.data.success === false && " FAILED"}
        </span>
        {inputSummary && (
          <span
            className="text-xs text-gray-500 font-mono truncate max-w-[200px]"
            title={inputSummary}
          >
            {inputSummary}
          </span>
        )}
      </>
    );
  };

  const filteredEvents =
    filter === "all"
      ? events
      : events.filter((e) => EVENT_CATEGORIES[filter].types?.includes(e.type));

  // Count events by category
  const counts = {
    all: events.length,
    lifecycle: events.filter((e) =>
      EVENT_CATEGORIES.lifecycle.types?.includes(e.type)
    ).length,
    tools: events.filter((e) => EVENT_CATEGORIES.tools.types?.includes(e.type))
      .length,
    interaction: events.filter((e) =>
      EVENT_CATEGORIES.interaction.types?.includes(e.type)
    ).length,
    agent: events.filter((e) => EVENT_CATEGORIES.agent.types?.includes(e.type))
      .length,
    notifications: events.filter((e) =>
      EVENT_CATEGORIES.notifications.types?.includes(e.type)
    ).length
  };

  if (events.length === 0) {
    return (
      <div className="text-gray-500 text-sm text-center py-4">
        <p>Waiting for hook activity...</p>
        <p className="mt-1 text-xs">
          Session starts, tool calls, prompts, and responses will appear here
        </p>
      </div>
    );
  }

  const displayLimit = expanded ? 200 : 50;

  return (
    <div>
      {/* Header with title and filter */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-400">
          Hook Timeline ({filteredEvents.length})
        </div>
        <div className="flex items-center gap-1">
          {(
            Object.keys(EVENT_CATEGORIES) as Array<
              keyof typeof EVENT_CATEGORIES
            >
          ).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-2 py-0.5 text-xs rounded ${
                filter === key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-400 hover:text-gray-300"
              }`}
              title={`${EVENT_CATEGORIES[key].label} (${counts[key]})`}
            >
              {EVENT_CATEGORIES[key].label}
              {counts[key] > 0 && filter !== key && (
                <span className="ml-1 text-gray-500">{counts[key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Event list */}
      <div
        className={`space-y-1 overflow-y-auto ${expanded ? "max-h-96" : "max-h-64"}`}
      >
        {filteredEvents.slice(0, displayLimit).map((event) => {
          const config = EVENT_CONFIG[event.type] || {
            icon: "📌",
            color: "border-gray-500",
            label: event.type
          };

          return (
            <div
              key={event.id}
              className={`p-2 rounded text-sm bg-gray-700/30 border-l-2 ${config.color}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{config.icon}</span>
                  <span className="font-medium text-gray-300">
                    {config.label}
                  </span>
                  {/* Session lifecycle */}
                  {event.type === "session_start" &&
                    Boolean(event.data.cwd) && (
                      <span
                        className="text-xs text-gray-500 truncate max-w-[200px]"
                        title={String(event.data.cwd)}
                      >
                        {String(event.data.cwd).split("/").slice(-2).join("/")}
                      </span>
                    )}
                  {event.type === "session_end" && (
                    <span className="text-xs text-gray-500">
                      {String(event.data.tool_count)} tools
                    </span>
                  )}
                  {/* Tool usage - with input summary from detailed tool data */}
                  {event.type === "tool_start" && renderToolStart(event)}
                  {event.type === "tool_end" && renderToolEnd(event)}
                  {/* User interaction - token counts show input → output */}
                  {event.type === "response" &&
                    typeof event.data.input_tokens === "number" && (
                      <span
                        className="text-xs text-gray-500"
                        title={`Input tokens: ${event.data.input_tokens}, Output tokens: ${event.data.output_tokens}`}
                      >
                        {formatTokens(event.data.input_tokens)} →{" "}
                        {formatTokens(event.data.output_tokens as number)}{" "}
                        tokens
                      </span>
                    )}
                  {event.type === "subagent" &&
                    typeof event.data.input_tokens === "number" && (
                      <span
                        className="text-xs text-purple-400"
                        title={`Input tokens: ${event.data.input_tokens}, Output tokens: ${event.data.output_tokens}`}
                      >
                        {formatTokens(event.data.input_tokens)} →{" "}
                        {formatTokens(event.data.output_tokens as number)}{" "}
                        tokens
                      </span>
                    )}
                  {event.type === "prompt" && (
                    <span className="text-xs text-gray-500">
                      {String(event.data.prompt_length)} chars
                    </span>
                  )}
                  {event.type === "permission" && (
                    <span
                      className={`text-xs ${event.data.action === "allow" ? "text-green-400" : "text-red-400"}`}
                    >
                      {String(event.data.tool_name)}:{" "}
                      {String(event.data.action)}
                    </span>
                  )}
                  {/* Notification */}
                  {event.type === "notification" &&
                    Boolean(event.data.notification_type) && (
                      <span className="text-xs text-orange-400">
                        {String(event.data.notification_type)}
                      </span>
                    )}
                  {/* Desktop Notification Sent */}
                  {event.type === "notification_sent" && (
                    <span className="text-xs text-pink-400">
                      {String(event.data.title)}: {String(event.data.message)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {formatTime(event.timestamp)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand/collapse toggle */}
      {filteredEvents.length > 50 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full text-center text-xs text-gray-500 hover:text-gray-400"
        >
          {expanded
            ? "Show less"
            : `Show more (${filteredEvents.length - 50} more)`}
        </button>
      )}
    </div>
  );
}

function ToolStatsView({
  toolStats,
  formatDuration
}: {
  toolStats: ToolStats[];
  formatDuration: (ms: number | null) => string;
}) {
  if (toolStats.length === 0) {
    return (
      <div className="text-gray-500 text-sm text-center py-4">
        No tool data yet.
      </div>
    );
  }

  const sortedStats = [...toolStats].sort(
    (a, b) => b.total_calls - a.total_calls
  );
  const maxCalls = Math.max(...sortedStats.map((s) => s.total_calls), 1);

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {sortedStats.slice(0, 15).map((stat) => {
        const isWarning = stat.success_rate < 80;
        const isCritical = stat.success_rate < 50;

        return (
          <div key={stat.tool_name} className="bg-gray-700/30 p-2 rounded">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-300">{stat.tool_name}</span>
              <span className="text-xs text-gray-500">{stat.total_calls}</span>
            </div>
            <div className="h-1.5 bg-gray-600 rounded overflow-hidden">
              <div
                className={`h-full ${isCritical ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-blue-500"}`}
                style={{ width: `${(stat.total_calls / maxCalls) * 100}%` }}
              />
            </div>
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              <span
                className={
                  isCritical
                    ? "text-red-400"
                    : isWarning
                      ? "text-yellow-400"
                      : ""
                }
              >
                {stat.success_rate.toFixed(0)}%
              </span>
              <span>{formatDuration(stat.avg_duration_ms)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyStatsView({ dailyStats }: { dailyStats: DailyStats[] }) {
  if (dailyStats.length === 0) {
    return (
      <div className="text-gray-500 text-sm text-center py-4">
        No daily stats yet.
      </div>
    );
  }

  const maxCalls = Math.max(...dailyStats.map((s) => s.tool_calls), 1);
  const totalSessions = dailyStats.reduce((sum, s) => sum + s.session_count, 0);
  const totalCalls = dailyStats.reduce((sum, s) => sum + s.tool_calls, 0);

  return (
    <div>
      <div className="flex items-end gap-1 h-24 mb-2">
        {dailyStats
          .slice()
          .reverse()
          .map((stat) => (
            <div
              key={stat.date}
              className="flex-1 bg-blue-600 rounded-t hover:bg-blue-500 transition-colors cursor-pointer"
              style={{
                height: `${Math.max((stat.tool_calls / maxCalls) * 100, 4)}%`
              }}
              title={`${stat.date}: ${stat.tool_calls} calls, ${stat.session_count} sessions`}
            />
          ))}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mb-3">
        <span>{dailyStats[dailyStats.length - 1]?.date}</span>
        <span>{dailyStats[0]?.date}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-gray-700/30 p-2 rounded text-center">
          <div className="text-white font-semibold">{totalSessions}</div>
          <div className="text-xs text-gray-400">Sessions</div>
        </div>
        <div className="bg-gray-700/30 p-2 rounded text-center">
          <div className="text-white font-semibold">{totalCalls}</div>
          <div className="text-xs text-gray-400">Tool Calls</div>
        </div>
      </div>
    </div>
  );
}

// Hook Enhancements Components

function HookEnhancementsOverview({
  config
}: { config: HookEnhancementsConfig }) {
  // Main features - matches the Settings panel sections
  const features = [
    {
      key: "cost",
      label: "Token Controls",
      enabled: config.cost_controls.enabled,
      icon: "🧮"
    },
    {
      key: "rules",
      label: "Custom Rules",
      enabled: config.rules.enabled,
      icon: "📋"
    },
    {
      key: "stop",
      label: "Stop Blocking",
      enabled: config.stop_blocking.enabled,
      icon: "🛑"
    },
    {
      key: "auto_perm",
      label: "Auto Permissions",
      enabled: config.auto_permissions.enabled,
      icon: "✅"
    },
    {
      key: "llm",
      label: "LLM Evaluation",
      enabled: config.llm_evaluation.enabled,
      icon: "🤖"
    }
  ];

  // Additional features in config (not yet in Settings UI)
  const advancedFeatures = [
    config.prompt_validation.enabled,
    config.input_modification.enabled,
    config.context_injection.inject_git_context ||
      config.context_injection.inject_project_context
  ].filter(Boolean).length;

  const enabledCount = features.filter((f) => f.enabled).length;

  return (
    <div className="bg-gray-700/30 p-3 rounded">
      <h4 className="text-sm font-medium text-gray-300 mb-3">
        Features ({enabledCount}/{features.length} enabled)
        {advancedFeatures > 0 && (
          <span
            className="text-gray-500 ml-2"
            title="Additional: prompt_validation, input_modification, context_injection"
          >
            +{advancedFeatures} advanced
          </span>
        )}
      </h4>
      <div className="grid grid-cols-2 gap-2">
        {features.map((feature) => (
          <div
            key={feature.key}
            className={`flex items-center gap-2 p-2 rounded text-xs ${
              feature.enabled
                ? "bg-purple-900/30 text-purple-300"
                : "bg-gray-700/50 text-gray-500"
            }`}
          >
            <span>{feature.icon}</span>
            <span>{feature.label}</span>
            <span className="ml-auto">{feature.enabled ? "✓" : "○"}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Configure in Settings tab → Hook Enhancements
      </div>
    </div>
  );
}

function CostStatusView({ costStatus }: { costStatus: CostStatus }) {
  const formatCurrency = (usd: number) => {
    return `$${usd.toFixed(2)}`;
  };

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="bg-gray-700/30 p-3 rounded">
      <h4 className="text-sm font-medium text-gray-300 mb-3">
        🔢 Token Tracking
      </h4>

      <div className="grid grid-cols-2 gap-3">
        {/* Daily costs */}
        <div className="bg-gray-700/50 p-2 rounded">
          <div className="text-xs text-gray-400 mb-1">Today</div>
          {costStatus.daily ? (
            <>
              <div className="text-lg font-semibold text-green-400">
                {formatTokens(
                  costStatus.daily.input_tokens + costStatus.daily.output_tokens
                )}{" "}
                tok{" "}
                {costStatus.daily.cost_usd > 0 && (
                  <span className="text-[10px] text-gray-500">
                    (~{formatCurrency(costStatus.daily.cost_usd)})
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {formatTokens(costStatus.daily.input_tokens)} in /{" "}
                {formatTokens(costStatus.daily.output_tokens)} out
              </div>
              {costStatus.limits.daily_usd && (
                <div className="mt-1">
                  <div className="h-1 bg-gray-600 rounded overflow-hidden">
                    <div
                      className={`h-full ${
                        costStatus.daily.cost_usd /
                          costStatus.limits.daily_usd >
                        0.8
                          ? "bg-red-500"
                          : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min((costStatus.daily.cost_usd / costStatus.limits.daily_usd) * 100, 100)}%`
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    limit{" "}
                    <span className="text-[10px] text-gray-500">
                      (~{formatCurrency(costStatus.limits.daily_usd)})
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-500">No data</div>
          )}
        </div>

        {/* Monthly costs */}
        <div className="bg-gray-700/50 p-2 rounded">
          <div className="text-xs text-gray-400 mb-1">This Month</div>
          {costStatus.monthly ? (
            <>
              <div className="text-lg font-semibold text-blue-400">
                {formatTokens(
                  costStatus.monthly.input_tokens +
                    costStatus.monthly.output_tokens
                )}{" "}
                tok{" "}
                {costStatus.monthly.cost_usd > 0 && (
                  <span className="text-[10px] text-gray-500">
                    (~{formatCurrency(costStatus.monthly.cost_usd)})
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {costStatus.monthly.session_count} sessions
              </div>
              {costStatus.limits.monthly_usd && (
                <div className="mt-1">
                  <div className="h-1 bg-gray-600 rounded overflow-hidden">
                    <div
                      className={`h-full ${
                        costStatus.monthly.cost_usd /
                          costStatus.limits.monthly_usd >
                        0.8
                          ? "bg-red-500"
                          : "bg-blue-500"
                      }`}
                      style={{
                        width: `${Math.min((costStatus.monthly.cost_usd / costStatus.limits.monthly_usd) * 100, 100)}%`
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    limit{" "}
                    <span className="text-[10px] text-gray-500">
                      (~{formatCurrency(costStatus.limits.monthly_usd)})
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-500">No data</div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {costStatus.alerts.length > 0 && (
        <div className="mt-3 space-y-1">
          {costStatus.alerts.map((alert, i) => (
            <div
              key={i}
              className={`text-xs p-2 rounded ${
                alert.type === "exceeded"
                  ? "bg-red-900/30 text-red-400"
                  : "bg-yellow-900/30 text-yellow-400"
              }`}
            >
              {alert.type === "exceeded" ? "⚠️" : "⚡"} {alert.budget} budget:{" "}
              {alert.percentage.toFixed(0)}% used
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RulesOverview({ rules }: { rules: RulesListResult }) {
  const enabledRules = rules.rules.filter((r) => r.enabled);
  const hookTypesCovered = new Set(enabledRules.flatMap((r) => r.hook_types));

  return (
    <div className="bg-gray-700/30 p-3 rounded">
      <h4 className="text-sm font-medium text-gray-300 mb-3">
        📋 Rules ({enabledRules.length}/{rules.total} active)
      </h4>

      {/* Hook types covered */}
      {hookTypesCovered.size > 0 && (
        <div className="mb-2">
          <div className="text-xs text-gray-400 mb-1">Hooks with rules:</div>
          <div className="flex flex-wrap gap-1">
            {Array.from(hookTypesCovered).map((hookType) => (
              <HookTypeInfo key={hookType} hookType={hookType} asBadge />
            ))}
          </div>
        </div>
      )}

      {/* Rule list */}
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {rules.rules.slice(0, 10).map((rule) => (
          <div
            key={rule.id}
            className={`text-xs p-1.5 rounded flex items-center justify-between ${
              rule.enabled
                ? "bg-gray-700/50 text-gray-300"
                : "bg-gray-800/50 text-gray-500"
            }`}
          >
            <span className="truncate">{rule.name}</span>
            <span
              className={`text-xs ${
                rule.action === "allow"
                  ? "text-green-400"
                  : rule.action === "block"
                    ? "text-red-400"
                    : "text-yellow-400"
              }`}
            >
              {rule.action}
            </span>
          </div>
        ))}
        {rules.total > 10 && (
          <div className="text-xs text-gray-500 text-center pt-1">
            +{rules.total - 10} more rules
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationProvidersView({
  providers
}: { providers: NotificationProvidersResult }) {
  return (
    <div className="bg-gray-700/30 p-3 rounded">
      <h4 className="text-sm font-medium text-gray-300 mb-2">
        🔔 Notification Providers
      </h4>
      <div className="flex flex-wrap gap-2">
        {providers.providers.map((provider) => (
          <span
            key={provider}
            className="text-xs px-2 py-1 bg-gray-700/50 text-gray-300 rounded"
          >
            {provider}
          </span>
        ))}
      </div>
    </div>
  );
}

// Hook notification settings
const HOOK_NOTIFICATION_LABELS: Record<
  string,
  { label: string; icon: string; description: string }
> = {
  hook_session_start: {
    label: "Session Start",
    icon: "▶️",
    description: "When a Claude Code session starts"
  },
  hook_session_end: {
    label: "Session End",
    icon: "⏹️",
    description: "When a session ends"
  },
  hook_pre_tool_use: {
    label: "Tool Start",
    icon: "⚙️",
    description: "Before each tool is executed"
  },
  hook_post_tool_use: {
    label: "Tool End",
    icon: "✅",
    description: "After each tool completes"
  },
  hook_tool_failure: {
    label: "Tool Failure",
    icon: "❌",
    description: "When a tool fails"
  },
  hook_awaiting_input: {
    label: "Awaiting Input",
    icon: "⏳",
    description: "When Claude is waiting for user"
  },
  hook_user_prompt_submit: {
    label: "User Prompt",
    icon: "💬",
    description: "When user submits a prompt"
  },
  hook_permission_request: {
    label: "Permission",
    icon: "🔐",
    description: "Permission requests"
  },
  hook_stop: {
    label: "Response Complete",
    icon: "🤖",
    description: "When Claude finishes responding"
  },
  hook_subagent_stop: {
    label: "Subagent Complete",
    icon: "🔀",
    description: "When a subagent finishes"
  },
  hook_notification: {
    label: "Notifications",
    icon: "🔔",
    description: "In-app notification events"
  },
  hook_pre_compact: {
    label: "Compact",
    icon: "📦",
    description: "Before context compaction"
  },
  hook_long_running: {
    label: "Long Running",
    icon: "⏱️",
    description: "Long-running tool alerts"
  }
};

function HookNotificationsView({ config }: { config: NotificationsConfig }) {
  const enabledHooks = Object.entries(HOOK_NOTIFICATION_LABELS)
    .filter(([key]) => config[key as keyof NotificationsConfig] === true)
    .map(([key, info]) => ({ key, ...info }));

  const disabledHooks = Object.entries(HOOK_NOTIFICATION_LABELS)
    .filter(([key]) => config[key as keyof NotificationsConfig] !== true)
    .map(([key, info]) => ({ key, ...info }));

  return (
    <div className="bg-gray-700/30 p-3 rounded">
      <h4 className="text-sm font-medium text-gray-300 mb-3">
        📋 Hook Notifications ({enabledHooks.length} enabled)
      </h4>

      {/* Enabled hooks */}
      {enabledHooks.length > 0 && (
        <div className="space-y-1 mb-3">
          {enabledHooks.map((hook) => (
            <div key={hook.key} className="flex items-center gap-2 text-xs">
              <span className="text-green-400">●</span>
              <span>{hook.icon}</span>
              <span className="text-gray-300">{hook.label}</span>
              <span className="text-gray-600 text-[10px]">
                - {hook.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Disabled hooks (collapsible) */}
      {disabledHooks.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-400">
            {disabledHooks.length} hooks disabled
          </summary>
          <div className="mt-2 space-y-1 opacity-60">
            {disabledHooks.map((hook) => (
              <div key={hook.key} className="flex items-center gap-2">
                <span className="text-gray-600">○</span>
                <span>{hook.icon}</span>
                <span className="text-gray-500">{hook.label}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
