import { useCallback, useEffect, useRef, useState } from "react";
import { useLoading } from "../context/LoadingContext";
import { fetchDailyStats, fetchToolStats } from "../api/client";
import type {
  AnalyticsByProjectResult,
  AnalyticsDashboard,
  CostByTypeItem,
  DailyStats,
  HookSession,
  LoopsAnalyticsResult,
  QualityDistributionBucket,
  SuccessTrendPoint,
  ToolRetriesResult,
  ToolStats,
  ToolUsage
} from "../api/types";
import {
  type ConversationFilter,
  useConversations
} from "../context/ConversationContext";
import { useData } from "../context/DataProvider";

interface SessionTokens {
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
}

// Refresh data if tab has been hidden for more than 5 minutes
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

interface AnalyticsPaneProps {
  onNavigateToConversations?: () => void;
  hookSessions?: HookSession[];
  recentToolUsages?: ToolUsage[];
  sessionTokens?: Record<string, SessionTokens>;
  isActive?: boolean;
  activatedAt?: number;
}

// Task type colors
const TASK_TYPE_COLORS: Record<string, string> = {
  feature: "bg-blue-500",
  bugfix: "bg-red-500",
  refactor: "bg-purple-500",
  test: "bg-green-500",
  docs: "bg-yellow-500",
  config: "bg-gray-500",
  exploration: "bg-cyan-500",
  unknown: "bg-slate-500"
};

// Pattern type colors for loops
const PATTERN_TYPE_COLORS: Record<string, string> = {
  tool_retry: "bg-orange-500",
  file_edit_loop: "bg-red-500",
  search_loop: "bg-yellow-500",
  permission_loop: "bg-purple-500",
  error_loop: "bg-pink-500"
};

const PATTERN_DESCRIPTIONS: Record<string, string> = {
  tool_retry: "Same tool called repeatedly with similar inputs",
  file_edit_loop: "Repeated edits to the same file without progress",
  search_loop: "Repeated searches without new results",
  permission_loop: "Repeated permission denials or blocked actions",
  error_loop: "Same error occurring repeatedly"
};

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(usd: number): string {
  if (usd >= 100) return `$${Math.round(usd)}`;
  if (usd >= 10) return `$${usd.toFixed(1)}`;
  return `$${usd.toFixed(2)}`;
}

function sumTokens(input?: number, output?: number): number {
  return (input ?? 0) + (output ?? 0);
}

function TokenCost({
  tokens,
  usd,
  suffix
}: {
  tokens: number;
  usd: number;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span>
        {formatNumber(tokens)} tok{suffix ? ` ${suffix}` : ""}
      </span>
      {usd > 0 && (
        <span className="text-[10px] text-gray-500">(~{formatCost(usd)})</span>
      )}
    </span>
  );
}

type LoadError = { name: string; message: string };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

// Question-based section component
function QuestionSection({
  question,
  description,
  children,
  defaultExpanded = true
}: {
  question: string;
  description?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-gray-800 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div>
          <span className="text-lg font-semibold text-white">{question}</span>
          {description && (
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
        <span className="text-gray-400 text-sm">
          {expanded ? "collapse" : "expand"}
        </span>
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// Hero metric - large prominent display
function HeroMetric({
  value,
  label,
  trend,
  subtext,
  color = "white",
  tooltip
}: {
  value: React.ReactNode;
  label: string;
  trend?: { value: number; direction: "up" | "down" | "flat" };
  subtext?: React.ReactNode;
  color?: "green" | "yellow" | "red" | "blue" | "purple" | "white";
  tooltip?: string;
}) {
  const colorClass = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
    white: "text-white"
  }[color];

  const trendIcon = trend
    ? { up: "^", down: "v", flat: "-" }[trend.direction]
    : null;
  const trendColor = trend
    ? { up: "text-green-400", down: "text-red-400", flat: "text-gray-400" }[
        trend.direction
      ]
    : "";

  return (
    <div className="text-center" title={tooltip}>
      <div className={`text-4xl font-bold ${colorClass}`}>
        {value}
        {trend && (
          <span className={`text-lg ml-2 ${trendColor}`}>
            {trendIcon}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <div className="text-sm text-gray-400 mt-1">
        {label}
        {tooltip && <span className="ml-1 text-gray-500">ⓘ</span>}
      </div>
      {subtext && <div className="text-xs text-gray-500">{subtext}</div>}
    </div>
  );
}

// Metric grid item
function MetricBox({
  label,
  value,
  subtext,
  color,
  onClick,
  tooltip
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  color?: "green" | "yellow" | "red" | "blue" | "purple";
  onClick?: () => void;
  tooltip?: string;
}) {
  const colorClass = color
    ? {
        green: "text-green-400",
        yellow: "text-yellow-400",
        red: "text-red-400",
        blue: "text-blue-400",
        purple: "text-purple-400"
      }[color]
    : "text-white";

  return (
    <div
      className={`bg-gray-700 rounded-lg p-3 text-center ${onClick ? "cursor-pointer hover:bg-gray-600" : ""}`}
      onClick={onClick}
      title={tooltip}
    >
      <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-gray-400">
        {label}
        {tooltip && <span className="ml-1 text-gray-500">ⓘ</span>}
      </div>
      {subtext && <div className="text-xs text-gray-500 mt-0.5">{subtext}</div>}
    </div>
  );
}

// Badge component
function Badge({
  label,
  color,
  count
}: {
  label: string;
  color: string;
  count?: number;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-white ${color}`}
    >
      {label}
      {count !== undefined && (
        <span className="bg-black/20 px-1 rounded">{count}</span>
      )}
    </span>
  );
}

// Drill-down link
function DrillDownLink({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-blue-400 hover:text-blue-300 underline"
    >
      {label} &rarr;
    </button>
  );
}

type QuestionTabId = "stats" | "figures" | "tables";

function QuestionTabs({
  stats,
  figures,
  tables,
  defaultTab = "stats"
}: {
  stats: React.ReactNode;
  figures: React.ReactNode;
  tables: React.ReactNode;
  defaultTab?: QuestionTabId;
}) {
  const [activeTab, setActiveTab] = useState<QuestionTabId>(defaultTab);
  const tabs: Array<{ id: QuestionTabId; label: string }> = [
    { id: "stats", label: "Key stats" },
    { id: "figures", label: "Key figures" },
    { id: "tables", label: "Table view" }
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 border-b border-gray-700 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              activeTab === tab.id
                ? "bg-blue-600/80 border-blue-400 text-white"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {activeTab === "stats" && stats}
        {activeTab === "figures" && figures}
        {activeTab === "tables" && tables}
      </div>
    </div>
  );
}

function TransparencyDetails({
  label,
  calculations,
  data
}: {
  label: string;
  calculations: string[];
  data: unknown;
}) {
  const serialized = JSON.stringify(data ?? null, null, 2);

  return (
    <details className="mt-3 text-xs text-gray-400">
      <summary className="cursor-pointer hover:text-gray-300">{label}</summary>
      <div className="mt-2 bg-gray-700/50 rounded p-3 space-y-3">
        {calculations.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
              How it is calculated
            </div>
            <ul className="space-y-1 list-disc list-inside text-gray-400">
              {calculations.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
            Raw data
          </div>
          <pre className="text-gray-300 bg-gray-800/70 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap">
            {serialized}
          </pre>
        </div>
      </div>
    </details>
  );
}

export function AnalyticsPane({
  onNavigateToConversations,
  hookSessions: _hookSessions = [],
  recentToolUsages: _recentToolUsages = [],
  sessionTokens: _sessionTokens = {},
  isActive = false,
  activatedAt = 0
}: AnalyticsPaneProps) {
  const { setFilter } = useConversations();
  const { getConfig, getAnalytics } = useData();
  const { setLoading: setGlobalLoading } = useLoading();
  const [loading, setLoading] = useState(true);
  const lastLoadedAt = useRef(0);
  const [transcriptDays, setTranscriptDays] = useState<number>(30);
  const [loadErrors, setLoadErrors] = useState<LoadError[]>([]);

  // Report loading state to global context
  useEffect(() => {
    setGlobalLoading("analytics", loading);
    return () => setGlobalLoading("analytics", false);
  }, [loading, setGlobalLoading]);

  // All data loaded upfront
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [successTrend, setSuccessTrend] = useState<SuccessTrendPoint[]>([]);
  const [costByType, setCostByType] = useState<CostByTypeItem[]>([]);
  const [qualityDist, setQualityDist] = useState<QualityDistributionBucket[]>(
    []
  );
  const [qualityPercentiles, setQualityPercentiles] = useState<{
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  } | null>(null);
  const [toolStats, setToolStats] = useState<ToolStats[]>([]);
  const [toolRetries, setToolRetries] = useState<ToolRetriesResult | null>(
    null
  );
  const [loopsAnalytics, setLoopsAnalytics] =
    useState<LoopsAnalyticsResult | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [projectAnalytics, setProjectAnalytics] =
    useState<AnalyticsByProjectResult | null>(null);

  // Load config for transcript days (cached via DataProvider)
  useEffect(() => {
    getConfig()
      .then((config) => {
        const days = config.conversations?.transcript_days ?? 30;
        setTranscriptDays(days);
      })
      .catch(console.error);
  }, [getConfig]);

  // Load ALL data upfront
  const loadAllData = useCallback(async () => {
    setLoading(true);
    setLoadErrors([]);
    try {
      // Use combined endpoint for most analytics data (cached via DataProvider)
      // Combined now includes by_project with token data from parsed transcripts
      const results = await Promise.allSettled([
        getAnalytics(transcriptDays), // Combined: dashboard, success_trend, cost_by_type, tool_retries, quality_distribution, loops, by_project
        fetchToolStats(), // Separate: from hook store
        fetchDailyStats(transcriptDays) // Separate: from hook store
      ]);
      const [combinedResult, toolStatsResult, dailyResult] = results;
      const errors: LoadError[] = [];

      // Process combined analytics
      if (combinedResult.status === "fulfilled") {
        const combined = combinedResult.value;
        setDashboard(combined.dashboard);
        setSuccessTrend(combined.success_trend ?? []);
        setCostByType(combined.cost_by_type ?? []);
        setQualityDist(combined.quality_distribution?.distribution ?? []);
        setQualityPercentiles(
          combined.quality_distribution?.percentiles ?? null
        );
        setToolRetries({
          days: combined.days,
          patterns: combined.tool_retries ?? []
        });
        setLoopsAnalytics({
          days: combined.days,
          ...combined.loops
        });
        // Use by_project from combined response (includes token data from parsed transcripts)
        if (combined.by_project) {
          setProjectAnalytics({
            days: combined.days,
            breakdown: combined.by_project.breakdown,
            unassigned: combined.by_project.unassigned
          });
        } else {
          setProjectAnalytics(null);
        }
      } else {
        setDashboard(null);
        setSuccessTrend([]);
        setCostByType([]);
        setQualityDist([]);
        setQualityPercentiles(null);
        setToolRetries(null);
        setLoopsAnalytics(null);
        setProjectAnalytics(null);
        errors.push({
          name: "combined-analytics",
          message: getErrorMessage(combinedResult.reason)
        });
      }

      if (toolStatsResult.status === "fulfilled") {
        setToolStats(toolStatsResult.value.stats ?? []);
      } else {
        setToolStats([]);
        errors.push({
          name: "tool-stats",
          message: getErrorMessage(toolStatsResult.reason)
        });
      }

      if (dailyResult.status === "fulfilled") {
        setDailyStats(dailyResult.value.stats ?? []);
      } else {
        setDailyStats([]);
        errors.push({
          name: "daily-stats",
          message: getErrorMessage(dailyResult.reason)
        });
      }

      if (errors.length > 0) {
        console.error("Analytics load errors:", errors);
      }
      setLoadErrors(errors);
    } catch (e) {
      console.error("Failed to load analytics:", e);
      setLoadErrors([{ name: "analytics", message: getErrorMessage(e) }]);
    } finally {
      setLoading(false);
      lastLoadedAt.current = Date.now();
    }
  }, [transcriptDays, getAnalytics]);

  // Initial load
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Auto-refresh when tab becomes active and data is stale
  useEffect(() => {
    if (
      isActive &&
      lastLoadedAt.current > 0 &&
      Date.now() - lastLoadedAt.current > STALE_THRESHOLD_MS
    ) {
      loadAllData();
    }
  }, [isActive, activatedAt, loadAllData]);

  // Navigate to conversations with filter
  function navigateWithFilter(filterData: ConversationFilter) {
    setFilter(filterData);
    if (onNavigateToConversations) {
      onNavigateToConversations();
    }
  }

  // Computed aggregates
  const toolAggregates = {
    totalCalls: toolStats.reduce((sum, t) => sum + t.total_calls, 0),
    totalSuccess: toolStats.reduce((sum, t) => sum + t.success_count, 0),
    totalFailures: toolStats.reduce((sum, t) => sum + t.failure_count, 0),
    overallSuccessRate:
      toolStats.length > 0
        ? (toolStats.reduce((sum, t) => sum + t.success_count, 0) /
            toolStats.reduce((sum, t) => sum + t.total_calls, 0)) *
          100
        : 0
  };

  const dailyAggregates = {
    totalSessions: dailyStats.reduce((sum, d) => sum + d.session_count, 0),
    totalToolCalls: dailyStats.reduce((sum, d) => sum + d.tool_calls, 0),
    avgSessionsPerDay:
      dailyStats.length > 0
        ? dailyStats.reduce((sum, d) => sum + d.session_count, 0) /
          dailyStats.length
        : 0
  };

  // Week-over-week calculations
  const weekStats = calculateWeekOverWeek(dailyStats);
  const totalTokens = dashboard
    ? sumTokens(
        dashboard.summary.total_input_tokens,
        dashboard.summary.total_output_tokens
      )
    : 0;
  const costPerDay = dashboard
    ? dashboard.summary.total_cost_usd / transcriptDays
    : 0;
  const tokensPerDay = dashboard ? totalTokens / transcriptDays : 0;
  const avgCostPerSession =
    dashboard && dashboard.summary.total_sessions > 0
      ? dashboard.summary.total_cost_usd / dashboard.summary.total_sessions
      : 0;
  const successRate = dashboard?.summary.success_rate ?? 0;
  const enrichmentCoverage =
    dashboard &&
    dashboard.enrichment_stats &&
    dashboard.summary.total_sessions > 0
      ? (dashboard.enrichment_stats.totalSessions /
          dashboard.summary.total_sessions) *
        100
      : null;
  const efficiencyPercent =
    dashboard && loopsAnalytics && dashboard.summary.total_sessions > 0
      ? Math.round(
          100 -
            (loopsAnalytics.sessions_with_loops /
              dashboard.summary.total_sessions) *
              100
        )
      : null;
  const topCostType = costByType[0];
  const projectBreakdown = projectAnalytics?.breakdown ?? [];
  const projectsBySessions = [...projectBreakdown].sort(
    (a, b) => b.session_count - a.session_count
  );
  const projectsByCost = [...projectBreakdown].sort(
    (a, b) => b.total_cost_usd - a.total_cost_usd
  );
  const unassignedProjects = projectAnalytics?.unassigned ?? {
    session_count: 0,
    total_cost_usd: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    success_count: 0,
    failure_count: 0
  };
  const projectTotals = projectBreakdown.reduce(
    (acc, project) => ({
      session_count: acc.session_count + project.session_count,
      total_cost_usd: acc.total_cost_usd + project.total_cost_usd,
      success_count: acc.success_count + project.success_count,
      failure_count: acc.failure_count + project.failure_count
    }),
    {
      session_count: 0,
      total_cost_usd: 0,
      success_count: 0,
      failure_count: 0
    }
  );
  const totalProjectSessions =
    projectTotals.session_count + unassignedProjects.session_count;
  const totalProjectSuccess =
    projectTotals.success_count + unassignedProjects.success_count;
  const overallProjectSuccessRate =
    totalProjectSessions > 0
      ? (totalProjectSuccess / totalProjectSessions) * 100
      : 0;
  const projectsWithSessions = projectBreakdown.filter(
    (project) => project.session_count > 0
  ).length;
  const topProjectBySessions = projectsBySessions[0] ?? null;
  const topProjectByCost = projectsByCost[0] ?? null;
  const maxCostByType = Math.max(
    0.01,
    ...costByType.map((item) => item.total_cost_usd)
  );
  const maxProjectCost = Math.max(
    0.01,
    ...projectBreakdown.map((project) => project.total_cost_usd)
  );
  const maxProjectSessions = Math.max(
    1,
    ...projectBreakdown.map((project) => project.session_count)
  );
  const maxToolCalls = Math.max(
    1,
    ...toolStats.map((tool) => tool.total_calls)
  );
  const loopPatternEntries = loopsAnalytics
    ? Object.entries(loopsAnalytics.by_pattern_type).sort((a, b) => b[1] - a[1])
    : [];
  const maxLoopPatternCount = Math.max(
    1,
    ...loopPatternEntries.map(([, count]) => count)
  );

  // Find extremes
  const sortedTools = [...toolStats].sort(
    (a, b) => b.total_calls - a.total_calls
  );
  const mostUsedTool = sortedTools[0];
  const failingTools = [...toolStats]
    .filter((t) => t.failure_count > 0)
    .sort((a, b) => b.failure_count - a.failure_count);
  const mostFailedTool = failingTools[0];

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center">
        <div className="text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-1">Analytics</h2>
        <p className="text-gray-400 text-sm">
          Research questions answered with data from{" "}
          {dashboard?.summary.total_sessions || 0} sessions over the last{" "}
          {transcriptDays} days.{" "}
          <button
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "9" });
              window.dispatchEvent(event);
            }}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Adjust time range
          </button>
        </p>
        {dashboard?.sources && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
            <span>
              Sources:{" "}
              <span className="text-green-400">
                {dashboard.sources.hook_sessions} hooks
              </span>
              {" + "}
              <span className="text-blue-400">
                {dashboard.sources.local_transcripts} transcripts
              </span>
            </span>
            <span className="text-gray-600">|</span>
            <span
              className="text-[10px] text-gray-600"
              title="Token/cost data comes from both hook sessions and parsed transcripts"
            >
              Tokens from both sources
            </span>
          </p>
        )}
      </div>
      <div className="bg-yellow-900/20 border border-yellow-800/60 rounded-lg p-3 text-xs text-yellow-200">
        <div className="font-semibold text-yellow-200">WIP analytics</div>
        <p className="text-yellow-100/80 mt-1">
          This page is still a placeholder. Longer term, analytics will be
          user-specific and many people will not run this inside Agentwatch.
        </p>
      </div>
      {loadErrors.length > 0 && (
        <details className="bg-yellow-900/20 border border-yellow-800/60 rounded-lg p-3 text-xs text-yellow-200">
          <summary className="cursor-pointer text-yellow-300">
            Some analytics data failed to load
          </summary>
          <div className="mt-2 space-y-1">
            {loadErrors.map((error, index) => (
              <div key={`${error.name}-${index}`}>
                <span className="font-mono">{error.name}</span>: {error.message}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ================================================================= */}
      {/* Q1: What's the big picture? */}
      {/* ================================================================= */}
      <QuestionSection
        question="What's the big picture?"
        description="High-level summary of your AI coding activity"
      >
        <QuestionTabs
          stats={
            dashboard ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <MetricBox
                    label="Total Sessions"
                    value={dashboard.summary.total_sessions}
                    subtext={
                      weekStats.sessionsThisWeek > 0
                        ? `${weekStats.sessionsThisWeek} this week`
                        : undefined
                    }
                  />
                  <MetricBox
                    label="Success Rate"
                    value={`${Math.round(dashboard.summary.success_rate)}%`}
                    subtext="Quality score >= 60"
                    color={
                      dashboard.summary.success_rate >= 70
                        ? "green"
                        : dashboard.summary.success_rate >= 50
                          ? "yellow"
                          : "red"
                    }
                  />
                  <MetricBox
                    label="Total Tokens"
                    value={
                      <TokenCost
                        tokens={totalTokens}
                        usd={dashboard.summary.total_cost_usd}
                      />
                    }
                    subtext={
                      <TokenCost
                        tokens={Math.round(tokensPerDay)}
                        usd={costPerDay}
                        suffix="per day avg"
                      />
                    }
                    color="blue"
                    tooltip="Estimated from token counts. May differ from actual billing."
                  />
                  <MetricBox
                    label="Avg Duration"
                    value={formatDuration(dashboard.summary.avg_duration_ms)}
                    subtext="Per session"
                  />
                </div>

                {dashboard.enrichment_stats && (
                  <div className="bg-gray-700/50 rounded p-3 text-sm">
                    <div className="text-gray-400 mb-2">
                      Enrichment Coverage
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
                      <div>
                        <div className="text-white font-medium">
                          {dashboard.enrichment_stats.totalSessions}
                        </div>
                        <div className="text-gray-500">Enriched</div>
                      </div>
                      <div>
                        <div className="text-white font-medium">
                          {dashboard.enrichment_stats.byType.qualityScore}
                        </div>
                        <div className="text-gray-500">Quality Scored</div>
                      </div>
                      <div>
                        <div className="text-white font-medium">
                          {dashboard.enrichment_stats.byType.autoTags}
                        </div>
                        <div className="text-gray-500">Auto-tagged</div>
                      </div>
                      <div>
                        <div className="text-white font-medium">
                          {dashboard.enrichment_stats.byType.loopDetection}
                        </div>
                        <div className="text-gray-500">Loop Analyzed</div>
                      </div>
                      <div>
                        <div className="text-white font-medium">
                          {dashboard.enrichment_stats.byType.diffSnapshot}
                        </div>
                        <div className="text-gray-500">Diff Captured</div>
                      </div>
                      <div>
                        <div className="text-white font-medium">
                          {dashboard.enrichment_stats.byType.manualAnnotation}
                        </div>
                        <div className="text-gray-500">Annotated</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No summary data available for this time range.
              </div>
            )
          }
          figures={
            dashboard ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-400 mb-2">Success rate</div>
                  <div className="h-3 bg-gray-700 rounded">
                    <div
                      className={`h-3 rounded ${
                        successRate >= 70
                          ? "bg-green-500"
                          : successRate >= 50
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(successRate, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {Math.round(successRate)}% of sessions scored as success
                  </div>
                </div>
                {enrichmentCoverage !== null && (
                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      Enrichment coverage
                    </div>
                    <div className="h-3 bg-gray-700 rounded">
                      <div
                        className="h-3 rounded bg-blue-500"
                        style={{
                          width: `${Math.min(enrichmentCoverage, 100)}%`
                        }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {Math.round(enrichmentCoverage)}% of sessions enriched
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No figures available for this time range.
              </div>
            )
          }
          tables={
            dashboard ? (
              <div className="space-y-4 text-xs">
                <table className="w-full">
                  <thead className="text-gray-500 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-1">Metric</th>
                      <th className="text-right py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    <tr>
                      <td className="py-1">Total sessions</td>
                      <td className="py-1 text-right">
                        {dashboard.summary.total_sessions}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1">Success rate</td>
                      <td className="py-1 text-right">
                        {Math.round(dashboard.summary.success_rate)}%
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1">Total tokens</td>
                      <td className="py-1 text-right">
                        <TokenCost
                          tokens={totalTokens}
                          usd={dashboard.summary.total_cost_usd}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1">Tokens per day</td>
                      <td className="py-1 text-right">
                        <TokenCost
                          tokens={Math.round(tokensPerDay)}
                          usd={costPerDay}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1">Avg duration</td>
                      <td className="py-1 text-right">
                        {formatDuration(dashboard.summary.avg_duration_ms)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {dashboard.enrichment_stats && (
                  <table className="w-full">
                    <thead className="text-gray-500 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-1">Enrichment</th>
                        <th className="text-right py-1">Count</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      <tr>
                        <td className="py-1">Enriched sessions</td>
                        <td className="py-1 text-right">
                          {dashboard.enrichment_stats.totalSessions}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">Quality scored</td>
                        <td className="py-1 text-right">
                          {dashboard.enrichment_stats.byType.qualityScore}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">Auto-tagged</td>
                        <td className="py-1 text-right">
                          {dashboard.enrichment_stats.byType.autoTags}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">Loop analyzed</td>
                        <td className="py-1 text-right">
                          {dashboard.enrichment_stats.byType.loopDetection}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">Diff captured</td>
                        <td className="py-1 text-right">
                          {dashboard.enrichment_stats.byType.diffSnapshot}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">Annotated</td>
                        <td className="py-1 text-right">
                          {dashboard.enrichment_stats.byType.manualAnnotation}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No table data available for this time range.
              </div>
            )
          }
        />
        <TransparencyDetails
          label="How the big-picture metrics are calculated"
          calculations={[
            "Total sessions comes from hook sessions plus local transcripts in the selected time range.",
            "Success rate is the percent of sessions with quality score >= 60 (failures are < 40).",
            "Avg duration is the average of (end - start) for hook sessions that have end times.",
            "Token usage per day is total_tokens / transcriptDays (USD shown as a rough estimate)."
          ]}
          data={{
            transcript_days: transcriptDays,
            dashboard,
            derived: {
              cost_per_day_usd: costPerDay,
              tokens_per_day: Math.round(tokensPerDay)
            }
          }}
        />
      </QuestionSection>

      {/* ================================================================= */}
      {/* Q2: Am I getting more value over time? */}
      {/* ================================================================= */}
      <QuestionSection
        question="Am I getting more value over time?"
        description="Track quality trends and week-over-week changes"
      >
        <QuestionTabs
          stats={
            qualityPercentiles ? (
              <>
                <div className="mb-4">
                  <HeroMetric
                    value={qualityPercentiles.p50}
                    label="Median Quality Score"
                    subtext={`p25: ${qualityPercentiles.p25} | p75: ${qualityPercentiles.p75} | p90: ${qualityPercentiles.p90}`}
                    color={
                      qualityPercentiles.p50 >= 70
                        ? "green"
                        : qualityPercentiles.p50 >= 50
                          ? "yellow"
                          : "red"
                    }
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricBox label="p25" value={qualityPercentiles.p25} />
                  <MetricBox label="p50" value={qualityPercentiles.p50} />
                  <MetricBox label="p75" value={qualityPercentiles.p75} />
                  <MetricBox label="p90" value={qualityPercentiles.p90} />
                </div>
              </>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No quality summary available for this time range.
              </div>
            )
          }
          figures={
            successTrend.length > 0 || qualityDist.length > 0 ? (
              <div className="space-y-4">
                {successTrend.length > 0 ? (
                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      Daily Success Rate
                    </div>
                    <div className="flex items-end gap-1 h-24">
                      {successTrend.map((point, i) => {
                        // Use point.total for all sessions (including unscored)
                        const scoredTotal =
                          point.success_count + point.failure_count;
                        const successPct =
                          scoredTotal > 0 ? point.success_count / scoredTotal : 0;
                        const maxCount = Math.max(
                          ...successTrend.map((p) => p.total),
                          1
                        );
                        const height = (point.total / maxCount) * 100;

                        return (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center cursor-pointer hover:opacity-80"
                            title={`${point.date}: ${point.total} sessions, ${point.success_count} success, ${point.failure_count} failed`}
                          >
                            <div
                              className="w-full bg-gray-600 rounded-t relative overflow-hidden"
                              style={{ height: `${Math.max(height, 4)}%` }}
                            >
                              <div
                                className="absolute bottom-0 w-full bg-green-500"
                                style={{ height: `${successPct * 100}%` }}
                              />
                            </div>
                            {i % 3 === 0 && (
                              <div className="text-xs text-gray-500 mt-1">
                                {point.date.slice(5)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded" />{" "}
                        Success
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-gray-600 rounded" />{" "}
                        Failed/Unknown
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-4">
                    No daily success trend data yet.
                  </div>
                )}

                {qualityDist.length > 0 ? (
                  <div className="bg-gray-700/50 rounded p-3">
                    <div className="text-sm text-gray-400 mb-2">
                      Quality Distribution
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {qualityDist.map((bucket, i) => (
                        <div
                          key={i}
                          className="text-center cursor-pointer hover:bg-gray-600/50 rounded p-2"
                          onClick={() =>
                            bucket.count > 0 &&
                            navigateWithFilter({ qualityRange: bucket.range })
                          }
                        >
                          <div
                            className={`text-lg font-bold ${getQualityColor(bucket.range)}`}
                          >
                            {bucket.count}
                          </div>
                          <div className="text-xs text-gray-500">
                            {bucket.range}
                          </div>
                          <div className="text-xs text-gray-600">
                            {bucket.percentage.toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                    <DrillDownLink
                      label="View all sessions by quality"
                      onClick={() => navigateWithFilter({})}
                    />
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-4">
                    No quality distribution data yet.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No figures available for this time range.
              </div>
            )
          }
          tables={
            successTrend.length > 0 || qualityDist.length > 0 ? (
              <div className="space-y-4 text-xs">
                {successTrend.length > 0 && (
                  <table className="w-full">
                    <thead className="text-gray-500 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-1">Date</th>
                        <th className="text-right py-1">Total</th>
                        <th className="text-right py-1">Success</th>
                        <th className="text-right py-1">Failed</th>
                        <th className="text-right py-1">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {successTrend.map((point) => (
                        <tr
                          key={point.date}
                          className="border-b border-gray-800"
                        >
                          <td className="py-1">{point.date}</td>
                          <td className="py-1 text-right">{point.total}</td>
                          <td className="py-1 text-right">
                            {point.success_count}
                          </td>
                          <td className="py-1 text-right">
                            {point.failure_count}
                          </td>
                          <td className="py-1 text-right">
                            {Math.round(point.rate)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {qualityDist.length > 0 && (
                  <table className="w-full">
                    <thead className="text-gray-500 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-1">Range</th>
                        <th className="text-right py-1">Count</th>
                        <th className="text-right py-1">Percent</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {qualityDist.map((bucket) => (
                        <tr key={bucket.range}>
                          <td className="py-1">{bucket.range}</td>
                          <td className="py-1 text-right">{bucket.count}</td>
                          <td className="py-1 text-right">
                            {bucket.percentage.toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No table data available for this time range.
              </div>
            )
          }
        />
        <TransparencyDetails
          label="How quality trends are calculated"
          calculations={[
            "Daily success bars show total sessions per day; green portion is success_count / total.",
            "Success is quality score >= 60; failure is quality score < 40.",
            "Quality distribution buckets are 0-25, 25-50, 50-75, 75-100.",
            "Percentiles are computed from all available quality scores."
          ]}
          data={{
            transcript_days: transcriptDays,
            success_trend: successTrend,
            quality_distribution: qualityDist,
            quality_percentiles: qualityPercentiles
          }}
        />
      </QuestionSection>

      {/* ================================================================= */}
      {/* Q3: Where are my tokens going? */}
      {/* ================================================================= */}
      <QuestionSection
        question="Where are my tokens going?"
        description="Token usage breakdown by task type and project"
      >
        <QuestionTabs
          stats={
            dashboard ? (
              <>
                <div className="mb-4">
                  <HeroMetric
                    value={
                      <TokenCost
                        tokens={totalTokens}
                        usd={dashboard.summary.total_cost_usd}
                      />
                    }
                    label="Total Tokens"
                    subtext={
                      <TokenCost
                        tokens={Math.round(tokensPerDay)}
                        usd={costPerDay}
                        suffix={`per day avg over ${transcriptDays} days`}
                      />
                    }
                    color="blue"
                    tooltip="Estimated from token counts. May differ from actual billing."
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricBox
                    label="Avg Tokens / Session"
                    value={
                      <TokenCost
                        tokens={
                          dashboard.summary.total_sessions > 0
                            ? Math.round(
                                totalTokens / dashboard.summary.total_sessions
                              )
                            : 0
                        }
                        usd={avgCostPerSession}
                      />
                    }
                  />
                  <MetricBox
                    label="Top Task Type"
                    value={topCostType?.task_type ?? "-"}
                    subtext={
                      topCostType ? (
                        <TokenCost
                          tokens={sumTokens(
                            topCostType.total_input_tokens,
                            topCostType.total_output_tokens
                          )}
                          usd={topCostType.total_cost_usd}
                        />
                      ) : (
                        "No task type data"
                      )
                    }
                  />
                  <MetricBox
                    label="Top Project"
                    value={topProjectByCost?.project_name ?? "-"}
                    subtext={
                      topProjectByCost ? (
                        <TokenCost
                          tokens={sumTokens(
                            topProjectByCost.total_input_tokens,
                            topProjectByCost.total_output_tokens
                          )}
                          usd={topProjectByCost.total_cost_usd}
                        />
                      ) : (
                        "No project data"
                      )
                    }
                  />
                  <MetricBox
                    label="Unassigned Tokens"
                    value={
                      <TokenCost
                        tokens={sumTokens(
                          unassignedProjects.total_input_tokens,
                          unassignedProjects.total_output_tokens
                        )}
                        usd={unassignedProjects.total_cost_usd}
                      />
                    }
                    subtext={`${unassignedProjects.session_count} sessions`}
                  />
                </div>
              </>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No token summary available for this time range.
              </div>
            )
          }
          figures={
            costByType.length > 0 || projectsByCost.length > 0 ? (
              <div className="space-y-4">
                {costByType.length > 0 ? (
                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      By Task Type{" "}
                      <span
                        className="text-[10px] text-gray-600 font-normal"
                        title="Task types are auto-inferred from tool usage patterns (e.g., running tests = 'test', editing .md files = 'docs')"
                      >
                        (auto-inferred)
                      </span>
                    </div>
                    <div className="space-y-2">
                      {costByType.map((item) => {
                        const barWidth =
                          (item.total_cost_usd / maxCostByType) * 100;
                        const colorClass =
                          TASK_TYPE_COLORS[item.task_type] || "bg-gray-500";

                        return (
                          <div
                            key={item.task_type}
                            className="flex items-center gap-3 cursor-pointer hover:bg-gray-700/50 rounded p-1 -m-1"
                            onClick={() =>
                              navigateWithFilter({ taskType: item.task_type })
                            }
                          >
                            <Badge label={item.task_type} color={colorClass} />
                            <div className="flex-1">
                              <div
                                className={`h-4 rounded ${colorClass}`}
                                style={{
                                  width: `${barWidth}%`,
                                  minWidth: "4px"
                                }}
                              />
                            </div>
                            <div className="w-32 text-right text-sm text-white">
                              <TokenCost
                                tokens={sumTokens(
                                  item.total_input_tokens,
                                  item.total_output_tokens
                                )}
                                usd={item.total_cost_usd}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-4">
                    No task type token data yet.
                  </div>
                )}
                {projectsByCost.length > 0 ? (
                  <div className="bg-gray-700/50 rounded p-3">
                    <div className="text-sm text-gray-400 mb-2">
                      Top Projects by Tokens
                    </div>
                    <div className="space-y-2">
                      {projectsByCost.slice(0, 5).map((project) => {
                        const barWidth =
                          (project.total_cost_usd / maxProjectCost) * 100;
                        return (
                          <div
                            key={project.project_id}
                            className="flex items-center gap-3"
                          >
                            <span className="text-xs text-gray-300 truncate w-28">
                              {project.project_name}
                            </span>
                            <div className="flex-1 bg-gray-800 rounded h-3">
                              <div
                                className="h-3 rounded bg-blue-500"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-24 text-right">
                              <TokenCost
                                tokens={sumTokens(
                                  project.total_input_tokens,
                                  project.total_output_tokens
                                )}
                                usd={project.total_cost_usd}
                              />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-4">
                    No project token data yet.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No figures available for this time range.
              </div>
            )
          }
          tables={
            costByType.length > 0 || projectsByCost.length > 0 ? (
              <div className="space-y-4 text-xs">
                {costByType.length > 0 && (
                  <table className="w-full">
                    <thead className="text-gray-500 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-1">Task Type</th>
                        <th className="text-right py-1">Sessions</th>
                        <th className="text-right py-1">Tokens</th>
                        <th className="text-right py-1">Avg Tokens</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {costByType.map((item) => (
                        <tr key={item.task_type}>
                          <td className="py-1">{item.task_type}</td>
                          <td className="py-1 text-right">
                            {item.session_count}
                          </td>
                          <td className="py-1 text-right">
                            <TokenCost
                              tokens={sumTokens(
                                item.total_input_tokens,
                                item.total_output_tokens
                              )}
                              usd={item.total_cost_usd}
                            />
                          </td>
                          <td className="py-1 text-right">
                            <TokenCost
                              tokens={Math.round(
                                sumTokens(
                                  item.total_input_tokens,
                                  item.total_output_tokens
                                ) / Math.max(item.session_count, 1)
                              )}
                              usd={item.avg_cost_usd}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {(projectsByCost.length > 0 ||
                  unassignedProjects.session_count > 0) && (
                  <table className="w-full">
                    <thead className="text-gray-500 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-1">Project</th>
                        <th className="text-right py-1">Sessions</th>
                        <th className="text-right py-1">Tokens</th>
                        <th className="text-right py-1">Success</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {projectsByCost.map((project) => (
                        <tr key={project.project_id}>
                          <td className="py-1">{project.project_name}</td>
                          <td className="py-1 text-right">
                            {project.session_count}
                          </td>
                          <td className="py-1 text-right">
                            <TokenCost
                              tokens={sumTokens(
                                project.total_input_tokens,
                                project.total_output_tokens
                              )}
                              usd={project.total_cost_usd}
                            />
                          </td>
                          <td className="py-1 text-right">
                            {project.success_count}
                          </td>
                        </tr>
                      ))}
                      {unassignedProjects.session_count > 0 && (
                        <tr className="text-gray-500">
                          <td className="py-1 italic">Unassigned</td>
                          <td className="py-1 text-right">
                            {unassignedProjects.session_count}
                          </td>
                          <td className="py-1 text-right">
                            <TokenCost
                              tokens={sumTokens(
                                unassignedProjects.total_input_tokens,
                                unassignedProjects.total_output_tokens
                              )}
                              usd={unassignedProjects.total_cost_usd}
                            />
                          </td>
                          <td className="py-1 text-right">
                            {unassignedProjects.success_count}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No table data available for this time range.
              </div>
            )
          }
        />
        <TransparencyDetails
          label="How token breakdowns are calculated"
          calculations={[
            "Total tokens are input + output tokens for hook sessions plus local transcripts in range (when usage is available).",
            "USD shown is a rough estimate derived from token counts.",
            "Token breakdown by task type uses autoTags.taskType from enrichments; avg_cost_usd = total_cost_usd / session_count.",
            "Bar width scales each task type by total tokens / max(total tokens).",
            "Project totals come from /analytics/by-project and include unassigned sessions."
          ]}
          data={{
            transcript_days: transcriptDays,
            total_cost_usd: dashboard?.summary.total_cost_usd ?? null,
            total_input_tokens: dashboard?.summary.total_input_tokens ?? null,
            total_output_tokens: dashboard?.summary.total_output_tokens ?? null,
            cost_by_type: costByType,
            project_analytics: projectAnalytics
          }}
        />
      </QuestionSection>

      {/* ================================================================= */}
      {/* Q4: Which tools are most/least effective? */}
      {/* ================================================================= */}
      <QuestionSection
        question="Which tools are most effective?"
        description="Tool usage patterns, success rates, and failures"
      >
        <QuestionTabs
          stats={
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricBox
                label="Total Tool Calls"
                value={formatNumber(toolAggregates.totalCalls)}
              />
              <MetricBox
                label="Success Rate"
                value={`${Math.round(toolAggregates.overallSuccessRate)}%`}
                color={
                  toolAggregates.overallSuccessRate >= 95
                    ? "green"
                    : toolAggregates.overallSuccessRate >= 85
                      ? "yellow"
                      : "red"
                }
              />
              <MetricBox
                label="Most Used"
                value={mostUsedTool?.tool_name || "-"}
                subtext={
                  mostUsedTool
                    ? `${formatNumber(mostUsedTool.total_calls)} calls`
                    : undefined
                }
              />
              <MetricBox
                label="Most Failures"
                value={mostFailedTool?.tool_name || "None"}
                subtext={
                  mostFailedTool
                    ? `${mostFailedTool.failure_count} failures`
                    : undefined
                }
                color={mostFailedTool ? "red" : undefined}
              />
            </div>
          }
          figures={
            sortedTools.length > 0 ? (
              <div>
                <div className="text-sm text-gray-400 mb-2">
                  Top Tools by Volume
                </div>
                <div className="space-y-2">
                  {sortedTools.slice(0, 8).map((tool) => {
                    const barWidth = (tool.total_calls / maxToolCalls) * 100;
                    const rateColor =
                      tool.success_rate >= 95
                        ? "bg-green-500"
                        : tool.success_rate >= 85
                          ? "bg-yellow-500"
                          : "bg-red-500";

                    return (
                      <div
                        key={tool.tool_name}
                        className="flex items-center gap-3"
                      >
                        <span className="text-xs text-gray-300 w-32 truncate font-mono">
                          {tool.tool_name}
                        </span>
                        <div className="flex-1 bg-gray-800 rounded h-3">
                          <div
                            className={`h-3 rounded ${rateColor}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-12 text-right">
                          {formatNumber(tool.total_calls)}
                        </span>
                        <span className="text-xs text-gray-500 w-10 text-right">
                          {Math.round(tool.success_rate)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No tool usage figures yet.
              </div>
            )
          }
          tables={
            toolStats.length > 0 || (toolRetries?.patterns?.length ?? 0) > 0 ? (
              <div className="space-y-4">
                {toolStats.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      Tool Breakdown (top 15)
                    </div>
                    <div className="text-xs">
                      <div className="grid grid-cols-12 gap-1 text-gray-500 pb-1 border-b border-gray-700">
                        <div className="col-span-3">Tool</div>
                        <div className="col-span-2 text-right">Calls</div>
                        <div className="col-span-2 text-right">Success</div>
                        <div className="col-span-2 text-right">Failed</div>
                        <div className="col-span-2 text-right">Avg Time</div>
                        <div className="col-span-1 text-right">Rate</div>
                      </div>
                      {sortedTools.slice(0, 15).map((tool) => {
                        const rateColor =
                          tool.success_rate >= 95
                            ? "text-green-400"
                            : tool.success_rate >= 85
                              ? "text-yellow-400"
                              : "text-red-400";

                        return (
                          <div
                            key={tool.tool_name}
                            className="grid grid-cols-12 gap-1 py-1 hover:bg-gray-700/30"
                          >
                            <div className="col-span-3 text-gray-200 font-mono truncate">
                              {tool.tool_name}
                            </div>
                            <div className="col-span-2 text-right text-gray-300">
                              {formatNumber(tool.total_calls)}
                            </div>
                            <div className="col-span-2 text-right text-green-400">
                              {formatNumber(tool.success_count)}
                            </div>
                            <div className="col-span-2 text-right text-red-400">
                              {tool.failure_count > 0
                                ? formatNumber(tool.failure_count)
                                : "-"}
                            </div>
                            <div className="col-span-2 text-right text-gray-400">
                              {formatDuration(tool.avg_duration_ms)}
                            </div>
                            <div
                              className={`col-span-1 text-right ${rateColor}`}
                            >
                              {Math.round(tool.success_rate)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {toolRetries?.patterns && toolRetries.patterns.length > 0 && (
                  <table className="w-full text-xs">
                    <thead className="text-gray-500 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-1">Tool</th>
                        <th className="text-right py-1">Failures</th>
                        <th className="text-right py-1">Rate</th>
                        <th className="text-right py-1">Common Errors</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {toolRetries.patterns.map((pattern) => (
                        <tr key={pattern.tool_name}>
                          <td className="py-1 font-mono">
                            {pattern.tool_name}
                          </td>
                          <td className="py-1 text-right">
                            {pattern.failures}
                          </td>
                          <td className="py-1 text-right">
                            {pattern.failure_rate}%
                          </td>
                          <td className="py-1 text-right text-gray-500">
                            {pattern.common_errors?.length
                              ? pattern.common_errors.slice(0, 2).join(", ")
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No table data available for this time range.
              </div>
            )
          }
        />
        <TransparencyDetails
          label="How tool effectiveness is calculated"
          calculations={[
            "Total tool calls is the sum of total_calls across tools.",
            "Overall success rate is sum(success_count) / sum(total_calls).",
            "Most used is the tool with max total_calls; most failures has max failure_count.",
            "Failure patterns come from /analytics/tool-retries (hook sessions only)."
          ]}
          data={{
            tool_stats: toolStats,
            tool_retries: toolRetries,
            aggregates: toolAggregates,
            most_used_tool: mostUsedTool ?? null,
            most_failed_tool: mostFailedTool ?? null
          }}
        />
      </QuestionSection>

      {/* ================================================================= */}
      {/* Q5: How efficient is my agent? */}
      {/* ================================================================= */}
      <QuestionSection
        question="How efficient is my agent?"
        description="Loop detection and wasted effort analysis"
      >
        <QuestionTabs
          stats={
            loopsAnalytics ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricBox
                  label="Sessions with Loops"
                  value={loopsAnalytics.sessions_with_loops}
                  color={
                    loopsAnalytics.sessions_with_loops > 5
                      ? "yellow"
                      : undefined
                  }
                />
                <MetricBox
                  label="Total Loops"
                  value={loopsAnalytics.total_loops}
                  color={loopsAnalytics.total_loops > 10 ? "red" : undefined}
                />
                <MetricBox
                  label="Total Retries"
                  value={loopsAnalytics.total_retries}
                />
                <MetricBox
                  label="Efficiency"
                  value={
                    efficiencyPercent !== null ? `${efficiencyPercent}%` : "-"
                  }
                  subtext="Sessions without loops"
                  color="green"
                />
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No loop analytics available for this time range.
              </div>
            )
          }
          figures={
            loopsAnalytics ? (
              loopPatternEntries.length > 0 ? (
                <div className="bg-gray-700/50 rounded p-3">
                  <div className="text-sm text-gray-400 mb-2">
                    Loop Patterns Detected
                  </div>
                  <div className="space-y-2">
                    {loopPatternEntries.map(([type, count]) => {
                      const barWidth = (count / maxLoopPatternCount) * 100;
                      const colorClass =
                        PATTERN_TYPE_COLORS[type] || "bg-gray-500";
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <span className="text-xs text-gray-300 w-32 truncate">
                            {type.replace(/_/g, " ")}
                          </span>
                          <div className="flex-1 bg-gray-800 rounded h-3">
                            <div
                              className={`h-3 rounded ${colorClass}`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-right">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-xs text-gray-500 mt-3 space-y-1">
                    {Object.entries(PATTERN_DESCRIPTIONS).map(
                      ([type, description]) => (
                        <p key={type}>
                          <strong>{type}:</strong> {description}
                        </p>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 text-center py-6">
                  No loop patterns detected yet.
                </div>
              )
            ) : (
              <div className="text-gray-500 text-center py-6">
                No figures available for this time range.
              </div>
            )
          }
          tables={
            loopsAnalytics ? (
              loopPatternEntries.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="text-gray-500 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-1">Pattern</th>
                      <th className="text-right py-1">Count</th>
                      <th className="text-right py-1">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    {loopPatternEntries.map(([type, count]) => (
                      <tr key={type}>
                        <td className="py-1">{type}</td>
                        <td className="py-1 text-right">{count}</td>
                        <td className="py-1 text-right text-gray-500">
                          {PATTERN_DESCRIPTIONS[type] ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-500 text-center py-6">
                  No table data available for this time range.
                </div>
              )
            ) : (
              <div className="text-gray-500 text-center py-6">
                No table data available for this time range.
              </div>
            )
          }
        />
        <TransparencyDetails
          label="How loop efficiency is calculated"
          calculations={[
            "Sessions with loops count sessions that include loopDetection patterns.",
            "Efficiency = 100 - (sessions_with_loops / total_sessions) * 100.",
            "Pattern counts are aggregated by loopDetection.patternType."
          ]}
          data={{
            transcript_days: transcriptDays,
            loops: loopsAnalytics,
            total_sessions: dashboard?.summary.total_sessions ?? null,
            derived: {
              efficiency_percent: efficiencyPercent
            }
          }}
        />
      </QuestionSection>

      {/* ================================================================= */}
      {/* Q6: How does my usage vary by day? */}
      {/* ================================================================= */}
      <QuestionSection
        question="How does my usage vary by day?"
        description="Daily activity patterns and trends"
      >
        <QuestionTabs
          stats={
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricBox
                label="Avg Sessions/Day"
                value={dailyAggregates.avgSessionsPerDay.toFixed(1)}
              />
              <MetricBox
                label="This Week"
                value={weekStats.sessionsThisWeek}
                subtext={
                  weekStats.weekOverWeekChange !== 0
                    ? `${weekStats.weekOverWeekChange > 0 ? "+" : ""}${weekStats.weekOverWeekChange} vs last week`
                    : undefined
                }
                color={
                  weekStats.weekOverWeekChange > 0
                    ? "green"
                    : weekStats.weekOverWeekChange < 0
                      ? "yellow"
                      : undefined
                }
              />
              <MetricBox
                label="Total Tool Calls"
                value={formatNumber(dailyAggregates.totalToolCalls)}
              />
              <MetricBox
                label="Active Days"
                value={dailyStats.filter((d) => d.session_count > 0).length}
                subtext={`of ${dailyStats.length} days`}
              />
            </div>
          }
          figures={
            dailyStats.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-400 mb-2">
                    Sessions per Day
                  </div>
                  <div className="flex items-end gap-1 h-20">
                    {dailyStats.map((day, i) => {
                      const maxSessions = Math.max(
                        ...dailyStats.map((d) => d.session_count),
                        1
                      );
                      const height = (day.session_count / maxSessions) * 100;

                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center"
                          title={`${day.date}: ${day.session_count} sessions, ${day.tool_calls} tool calls`}
                        >
                          <div
                            className="w-full bg-blue-500 rounded-t"
                            style={{
                              height: `${Math.max(height, day.session_count > 0 ? 4 : 0)}%`
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>
                      {dailyStats[dailyStats.length - 1]?.date.slice(5)}
                    </span>
                    <span>{dailyStats[0]?.date.slice(5)}</span>
                  </div>
                </div>
                <div className="bg-gray-700/50 rounded p-3">
                  <div className="text-sm text-gray-400 mb-2">
                    Tool Calls per Day
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {dailyStats.map((day, i) => {
                      const maxCalls = Math.max(
                        ...dailyStats.map((d) => d.tool_calls),
                        1
                      );
                      const height = (day.tool_calls / maxCalls) * 100;

                      return (
                        <div
                          key={i}
                          className="flex-1"
                          title={`${day.date}: ${day.tool_calls} tool calls`}
                        >
                          <div
                            className="w-full bg-purple-500 rounded-t"
                            style={{
                              height: `${Math.max(height, day.tool_calls > 0 ? 4 : 0)}%`
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No daily figures available for this time range.
              </div>
            )
          }
          tables={
            dailyStats.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-gray-700">
                  <tr>
                    <th className="text-left py-1">Date</th>
                    <th className="text-right py-1">Sessions</th>
                    <th className="text-right py-1">Tool Calls</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {dailyStats.map((day) => (
                    <tr key={day.date}>
                      <td className="py-1">{day.date}</td>
                      <td className="py-1 text-right">{day.session_count}</td>
                      <td className="py-1 text-right">{day.tool_calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-gray-500 text-center py-6">
                No table data available for this time range.
              </div>
            )
          }
        />
        <TransparencyDetails
          label="How daily usage metrics are calculated"
          calculations={[
            "Avg sessions/day = total session_count / number of days.",
            "Week-over-week change = sessionsThisWeek - sessionsLastWeek.",
            "Daily bar height scales by day.session_count / max(session_count).",
            "Tool calls chart scales by day.tool_calls / max(tool_calls)."
          ]}
          data={{
            transcript_days: transcriptDays,
            daily_stats: dailyStats,
            aggregates: dailyAggregates,
            week_stats: weekStats
          }}
        />
      </QuestionSection>

      {/* ================================================================= */}
      {/* Q7: How do my projects compare? */}
      {/* ================================================================= */}
      <QuestionSection
        question="How do my projects compare?"
        description="Activity and quality breakdown by project"
        defaultExpanded={
          projectAnalytics?.breakdown && projectAnalytics.breakdown.length > 0
        }
      >
        <QuestionTabs
          stats={
            projectAnalytics &&
            (projectAnalytics.breakdown.length > 0 ||
              projectAnalytics.unassigned.session_count > 0) ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricBox
                  label="Active Projects"
                  value={projectsWithSessions}
                  subtext={`of ${projectBreakdown.length} configured`}
                />
                <MetricBox
                  label="Total Sessions"
                  value={totalProjectSessions}
                  subtext={`Unassigned: ${unassignedProjects.session_count}`}
                />
                <MetricBox
                  label="Overall Success"
                  value={`${Math.round(overallProjectSuccessRate)}%`}
                  color={
                    overallProjectSuccessRate >= 70
                      ? "green"
                      : overallProjectSuccessRate >= 50
                        ? "yellow"
                        : "red"
                  }
                />
                <MetricBox
                  label="Top Project"
                  value={topProjectBySessions?.project_name ?? "-"}
                  subtext={
                    topProjectBySessions
                      ? `${topProjectBySessions.session_count} sessions`
                      : "No project data"
                  }
                />
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4">
                No projects configured. Define projects in Settings to group
                sessions by codebase.
              </div>
            )
          }
          figures={
            projectAnalytics &&
            (projectAnalytics.breakdown.length > 0 ||
              projectAnalytics.unassigned.session_count > 0) ? (
              <div className="space-y-3">
                <div className="text-sm text-gray-400 mb-2">
                  Sessions by Project
                </div>
                <div className="space-y-2">
                  {projectsBySessions.slice(0, 8).map((project) => {
                    const barWidth =
                      (project.session_count / maxProjectSessions) * 100;
                    return (
                      <div
                        key={project.project_id}
                        className="flex items-center gap-3"
                      >
                        <span className="text-xs text-gray-300 truncate w-32">
                          {project.project_name}
                        </span>
                        <div className="flex-1 bg-gray-800 rounded h-3">
                          <div
                            className="h-3 rounded bg-green-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-10 text-right">
                          {project.session_count}
                        </span>
                      </div>
                    );
                  })}
                  {unassignedProjects.session_count > 0 && (
                    <div className="flex items-center gap-3 text-gray-500">
                      <span className="text-xs truncate w-32 italic">
                        Unassigned
                      </span>
                      <div className="flex-1 bg-gray-800 rounded h-3">
                        <div
                          className="h-3 rounded bg-gray-500"
                          style={{
                            width: `${Math.min(
                              (unassignedProjects.session_count /
                                maxProjectSessions) *
                                100,
                              100
                            )}%`
                          }}
                        />
                      </div>
                      <span className="text-xs w-10 text-right">
                        {unassignedProjects.session_count}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4">
                No project figures available for this time range.
              </div>
            )
          }
          tables={
            projectAnalytics &&
            (projectAnalytics.breakdown.length > 0 ||
              projectAnalytics.unassigned.session_count > 0) ? (
              <div className="space-y-3">
                <div className="text-xs">
                  <div className="grid grid-cols-12 gap-2 text-gray-500 pb-1 border-b border-gray-700">
                    <div className="col-span-3">Project</div>
                    <div className="col-span-2 text-right">Sessions</div>
                    <div className="col-span-2 text-right">Tokens</div>
                    <div className="col-span-2 text-right">Success</div>
                    <div className="col-span-3 text-right">Rate</div>
                  </div>
                  {projectAnalytics.breakdown.map((project) => {
                    const successRate =
                      project.session_count > 0
                        ? (project.success_count / project.session_count) * 100
                        : 0;
                    const rateColor =
                      successRate >= 70
                        ? "text-green-400"
                        : successRate >= 50
                          ? "text-yellow-400"
                          : "text-red-400";

                    return (
                      <div
                        key={project.project_id}
                        className="grid grid-cols-12 gap-2 py-1 hover:bg-gray-700/30"
                      >
                        <div
                          className="col-span-3 text-gray-200 truncate"
                          title={project.project_name}
                        >
                          {project.project_name}
                        </div>
                        <div className="col-span-2 text-right text-gray-300">
                          {project.session_count}
                        </div>
                        <div className="col-span-2 text-right text-blue-400">
                          <TokenCost
                            tokens={sumTokens(
                              project.total_input_tokens,
                              project.total_output_tokens
                            )}
                            usd={project.total_cost_usd}
                          />
                        </div>
                        <div className="col-span-2 text-right text-green-400">
                          {project.success_count}
                        </div>
                        <div className={`col-span-3 text-right ${rateColor}`}>
                          {project.success_count > 0
                            ? `${Math.round(successRate)}%`
                            : "-"}
                        </div>
                      </div>
                    );
                  })}
                  {projectAnalytics.unassigned.session_count > 0 && (
                    <div className="grid grid-cols-12 gap-2 py-1 text-gray-500">
                      <div className="col-span-3 italic">Unassigned</div>
                      <div className="col-span-2 text-right">
                        {projectAnalytics.unassigned.session_count}
                      </div>
                      <div className="col-span-2 text-right">
                        <TokenCost
                          tokens={sumTokens(
                            projectAnalytics.unassigned.total_input_tokens,
                            projectAnalytics.unassigned.total_output_tokens
                          )}
                          usd={projectAnalytics.unassigned.total_cost_usd}
                        />
                      </div>
                      <div className="col-span-2 text-right">
                        {projectAnalytics.unassigned.success_count}
                      </div>
                      <div className="col-span-3 text-right">-</div>
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  Sessions are linked to projects by working directory.{" "}
                  <button
                    onClick={() => {
                      const event = new KeyboardEvent("keydown", { key: "9" });
                      window.dispatchEvent(event);
                    }}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Manage projects
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4">
                No projects configured. Define projects in Settings to group
                sessions by codebase.
              </div>
            )
          }
        />
        <TransparencyDetails
          label="How project comparisons are calculated"
          calculations={[
            "Sessions are mapped to projects by working directory.",
            "Success rate = success_count / session_count.",
            "Unassigned includes sessions that do not match a project path."
          ]}
          data={{
            transcript_days: transcriptDays,
            project_analytics: projectAnalytics
          }}
        />
      </QuestionSection>
    </div>
  );
}

// Helper functions
function getQualityColor(range: string): string {
  if (
    range.includes("75") ||
    range.includes("80") ||
    range.includes("90") ||
    range.includes("100")
  ) {
    return "text-green-400";
  }
  if (range.includes("50") || range.includes("60") || range.includes("70")) {
    return "text-yellow-400";
  }
  if (range.includes("25") || range.includes("40")) {
    return "text-orange-400";
  }
  return "text-red-400";
}

function calculateWeekOverWeek(dailyStats: DailyStats[]): {
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  weekOverWeekChange: number;
} {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  let sessionsThisWeek = 0;
  let sessionsLastWeek = 0;

  for (const day of dailyStats) {
    const date = new Date(day.date);
    if (date >= oneWeekAgo) {
      sessionsThisWeek += day.session_count;
    } else if (date >= twoWeeksAgo) {
      sessionsLastWeek += day.session_count;
    }
  }

  return {
    sessionsThisWeek,
    sessionsLastWeek,
    weekOverWeekChange: sessionsThisWeek - sessionsLastWeek
  };
}
