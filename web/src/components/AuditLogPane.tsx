import { useEffect, useState } from "react";
import {
  fetchAuditCalculations,
  fetchAuditCategories,
  fetchAuditLog,
  fetchAuditEdgeCases,
  fetchDataSources
} from "../api/client";
import type {
  AuditCalculationsResult,
  AuditCategoriesResult,
  AuditEntry,
  AuditLogResult,
  DataSourceFileInfo,
  DataSourcesResult,
  EdgeCase,
  EdgeCasesResult
} from "../api/types";

// Category colors for the timeline
const CATEGORY_COLORS: Record<string, string> = {
  transcript: "bg-blue-500",
  hook_session: "bg-green-500",
  tool_usage: "bg-cyan-500",
  enrichment: "bg-purple-500",
  annotation: "bg-pink-500",
  conversation: "bg-yellow-500",
  agent: "bg-orange-500",
  managed_session: "bg-teal-500",
  process: "bg-indigo-500",
  config: "bg-gray-500",
  contributor: "bg-red-500",
  daemon: "bg-emerald-500",
  system: "bg-slate-500"
};

// Action icons
const ACTION_ICONS: Record<string, string> = {
  create: "+",
  read: "👁",
  update: "✏",
  delete: "✕",
  start: "▶",
  end: "■",
  discover: "🔍",
  rename: "📝",
  annotate: "💬",
  compute: "⚙",
  export: "📤",
  import: "📥"
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  );
}

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Data Source Card Component
function DataSourceCard({
  name,
  info
}: {
  name: string;
  info: DataSourceFileInfo;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-700 rounded-lg p-3 text-sm">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              info.exists ? "bg-green-400" : "bg-red-400"
            }`}
          />
          <span className="font-medium text-gray-200">{name}</span>
          {info.format && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-600 rounded">
              {info.format}
            </span>
          )}
        </div>
        <span className="text-gray-400">{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1 text-xs text-gray-400">
          {info.description && <p>{info.description}</p>}
          {info.path && (
            <p className="font-mono text-gray-500 break-all">{info.path}</p>
          )}
          {info.exists && (
            <div className="flex gap-4">
              {info.size !== undefined && (
                <span>Size: {formatBytes(info.size)}</span>
              )}
              {info.modified && (
                <span>Modified: {formatRelativeTime(info.modified)}</span>
              )}
            </div>
          )}
          {(info.snapshot_files !== undefined ||
            info.event_files !== undefined) && (
            <div className="flex gap-4">
              {info.snapshot_files !== undefined && (
                <span>Snapshots: {info.snapshot_files}</span>
              )}
              {info.event_files !== undefined && (
                <span>Events: {info.event_files}</span>
              )}
            </div>
          )}
          {info.file_count !== undefined && (
            <span>Files: {info.file_count}</span>
          )}
          {info.project_count !== undefined && (
            <span>Projects: {info.project_count}</span>
          )}
          {info.source_code && (
            <p className="font-mono text-blue-400">
              Source: {info.source_code}
            </p>
          )}
          {info.edge_cases && info.edge_cases.length > 0 && (
            <div className="mt-2 p-2 bg-yellow-900/30 rounded border border-yellow-700/50">
              <p className="font-medium text-yellow-400 mb-1">Edge Cases:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {info.edge_cases.map((ec, i) => (
                  <li key={i}>{ec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Edge Case Card Component
function EdgeCaseCard({ edgeCase }: { edgeCase: EdgeCase }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-700 rounded-lg p-3">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-medium text-gray-200">{edgeCase.title}</span>
        <span className="text-gray-400">{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-gray-400">{edgeCase.description}</p>
          <div className="space-y-1">
            {edgeCase.behavior.map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-gray-500">•</span>
                <span className="text-gray-300">{b}</span>
              </div>
            ))}
          </div>
          <p className="font-mono text-xs text-blue-400">
            Source: {edgeCase.source_code}
          </p>
        </div>
      )}
    </div>
  );
}

// Timeline Event Component
// Format description to be more readable
function formatEventDescription(event: AuditEntry): string {
  let desc = event.description;

  // Clean up "Process undefined:" to just show the agent name
  if (desc.includes("Process undefined:")) {
    desc = desc.replace("Process undefined:", "Agent:");
  }

  // Clean up generic process descriptions
  if (event.category === "process") {
    // Extract agent name from details if available
    const details = event.details as Record<string, unknown> | undefined;
    const agentLabel = details?.label as string | undefined;

    if (event.action === "end") {
      if (agentLabel) {
        return `${agentLabel.charAt(0).toUpperCase() + agentLabel.slice(1)} session ended`;
      }
      const agentMatch =
        desc.match(/Agent:\s*(\w+)/i) || desc.match(/:\s*(\w+)$/);
      if (agentMatch) {
        return `${agentMatch[1].charAt(0).toUpperCase() + agentMatch[1].slice(1)} session ended`;
      }
    }

    if (event.action === "start" || event.action === "discover") {
      if (agentLabel) {
        return `${agentLabel.charAt(0).toUpperCase() + agentLabel.slice(1)} session ${event.action === "start" ? "started" : "discovered"}`;
      }
    }
  }

  return desc;
}

function TimelineEvent({ event }: { event: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = CATEGORY_COLORS[event.category] || "bg-gray-500";
  const icon = ACTION_ICONS[event.action] || "•";
  const formattedDescription = formatEventDescription(event);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center text-white text-sm`}
        >
          {icon}
        </div>
        <div className="w-px flex-1 bg-gray-600" />
      </div>
      <div className="pb-4 flex-1">
        <div className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-gray-400">
              {formatRelativeTime(event.timestamp)}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-xs ${colorClass} text-white`}
            >
              {event.category}
            </span>
            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-600 text-gray-300">
              {event.action}
            </span>
            {event.source === "inferred" && (
              <span
                className="text-xs text-yellow-500 italic"
                title="Inferred from file timestamps"
              >
                inferred
              </span>
            )}
          </div>
          <p className="text-gray-200 mt-1">{formattedDescription}</p>
          {event.entity_id && (
            <p
              className="text-gray-500 text-xs font-mono mt-0.5 truncate"
              title={event.entity_id}
            >
              {event.entity_id}
            </p>
          )}
        </div>

        {expanded && event.details && (
          <div className="mt-2 p-2 bg-gray-700 rounded text-xs">
            <pre className="text-gray-400 overflow-x-auto">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditLogPane() {
  const [activeTab, setActiveTab] = useState<
    "timeline" | "sources" | "edge-cases" | "calculations"
  >("timeline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timeline state
  const [auditLog, setAuditLog] = useState<AuditLogResult | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [categories, setCategories] = useState<AuditCategoriesResult | null>(
    null
  );
  const [limit, setLimit] = useState(50);

  // Data sources state
  const [dataSources, setDataSources] = useState<DataSourcesResult | null>(
    null
  );

  // Edge cases state
  const [edgeCases, setEdgeCases] = useState<EdgeCasesResult | null>(null);

  // Calculations state
  const [calculations, setCalculations] =
    useState<AuditCalculationsResult | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab, categoryFilter, limit]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === "timeline") {
        const [log, cats] = await Promise.all([
          fetchAuditLog({
            limit,
            category: categoryFilter || undefined,
            includeInferred: true
          }),
          categories ? Promise.resolve(categories) : fetchAuditCategories()
        ]);
        setAuditLog(log);
        if (!categories) setCategories(cats);
      } else if (activeTab === "sources") {
        const sources = await fetchDataSources();
        setDataSources(sources);
      } else if (activeTab === "edge-cases") {
        const cases = await fetchAuditEdgeCases();
        setEdgeCases(cases);
      } else if (activeTab === "calculations") {
        const calcs = await fetchAuditCalculations();
        setCalculations(calcs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-2">Activity Log</h2>
        <p className="text-gray-400 text-sm">
          Complete transparency into how AgentWatch discovers, stores, and
          computes data. All data is file-based and stateless - this view is
          reconstructed from file timestamps and stored records.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "timeline"
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
          onClick={() => setActiveTab("timeline")}
        >
          Timeline
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "sources"
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
          onClick={() => setActiveTab("sources")}
        >
          Data Sources
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "calculations"
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
          onClick={() => setActiveTab("calculations")}
        >
          Calculations
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "edge-cases"
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
          onClick={() => setActiveTab("edge-cases")}
        >
          Edge Cases
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      )}

      {/* Timeline Tab */}
      {!loading && activeTab === "timeline" && auditLog && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-gray-800 rounded-lg p-4 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-gray-400 text-sm">Category:</label>
              <select
                className="bg-gray-700 text-gray-200 rounded px-3 py-1.5 text-sm"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All</option>
                {categories &&
                  Object.entries(categories.categories).map(([key, cat]) => (
                    <option key={key} value={key}>
                      {key} - {cat.description}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-gray-400 text-sm">Limit:</label>
              <select
                className="bg-gray-700 text-gray-200 rounded px-3 py-1.5 text-sm"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
            <div className="flex-1" />
            <div className="text-sm text-gray-500">
              Showing {auditLog.events.length} of {auditLog.stats.total_events}{" "}
              events
              {auditLog.sources.inferred > 0 && (
                <span className="text-yellow-500 ml-2">
                  ({auditLog.sources.inferred} inferred)
                </span>
              )}
            </div>
          </div>

          {/* Stats Summary */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-white">
                  {auditLog.stats.total_events}
                </div>
                <div className="text-gray-400 text-sm">Total Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {Object.keys(auditLog.stats.by_category || {}).length}
                </div>
                <div className="text-gray-400 text-sm">Categories</div>
              </div>
              <div>
                <div className="text-lg text-gray-300">
                  {auditLog.stats.oldest_event
                    ? formatRelativeTime(auditLog.stats.oldest_event)
                    : "N/A"}
                </div>
                <div className="text-gray-400 text-sm">Oldest Event</div>
              </div>
              <div>
                <div className="text-lg text-gray-300">
                  {auditLog.stats.newest_event
                    ? formatRelativeTime(auditLog.stats.newest_event)
                    : "N/A"}
                </div>
                <div className="text-gray-400 text-sm">Newest Event</div>
              </div>
            </div>

            {/* Category breakdown */}
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(auditLog.stats.by_category || {})
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <span
                    key={cat}
                    className={`px-2 py-1 rounded text-xs text-white ${
                      CATEGORY_COLORS[cat] || "bg-gray-500"
                    }`}
                  >
                    {cat}: {count}
                  </span>
                ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-gray-800 rounded-lg p-4">
            {auditLog.events.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                No events found. Events are inferred from data files and logged
                during daemon operation.
              </div>
            ) : (
              <div className="space-y-0">
                {auditLog.events.map((event, i) => (
                  <TimelineEvent
                    key={`${event.timestamp}-${i}`}
                    event={event}
                  />
                ))}
              </div>
            )}

            {auditLog.pagination.has_more && (
              <div className="mt-4 text-center">
                <button
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                  onClick={() => setLimit(limit + 50)}
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Sources Tab */}
      {!loading && activeTab === "sources" && dataSources && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-2">
              Data Directory
            </h3>
            <p className="font-mono text-gray-400 text-sm mb-4">
              {dataSources.data_dir}
            </p>
            <p className="text-gray-500 text-sm">
              Last checked: {new Date(dataSources.timestamp).toLocaleString()}
            </p>
          </div>

          {/* Hook Data */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">
              Hook Data (Real-time from Claude Code)
            </h3>
            <div className="space-y-2">
              {Object.entries(dataSources.sources.hooks).map(([key, info]) => (
                <DataSourceCard key={key} name={key} info={info} />
              ))}
            </div>
          </div>

          {/* Enrichments */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">
              Enrichments (Computed at Session End)
            </h3>
            <div className="space-y-2">
              {Object.entries(dataSources.sources.enrichments).map(
                ([key, info]) => (
                  <DataSourceCard key={key} name={key} info={info} />
                )
              )}
            </div>
          </div>

          {/* Local Transcripts */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">
              Local Transcripts (Discovered from Filesystem)
            </h3>
            <div className="space-y-2">
              {Object.entries(dataSources.sources.local_transcripts).map(
                ([key, info]) => (
                  <DataSourceCard key={key} name={key} info={info} />
                )
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">
              Metadata (User-Defined Names & Notes)
            </h3>
            <div className="space-y-2">
              {Object.entries(dataSources.sources.metadata).map(
                ([key, info]) => (
                  <DataSourceCard key={key} name={key} info={info} />
                )
              )}
            </div>
          </div>

          {/* Process & Logs */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">
              Process Logs & Session Logs
            </h3>
            <div className="space-y-2">
              {Object.entries(dataSources.sources.processes).map(
                ([key, info]) => (
                  <DataSourceCard
                    key={key}
                    name={`processes/${key}`}
                    info={info}
                  />
                )
              )}
              {Object.entries(dataSources.sources.logs).map(([key, info]) => (
                <DataSourceCard key={key} name={`logs/${key}`} info={info} />
              ))}
            </div>
          </div>

          {/* Config */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">
              Configuration
            </h3>
            <div className="space-y-2">
              {Object.entries(dataSources.sources.config).map(([key, info]) => (
                <DataSourceCard key={key} name={key} info={info} />
              ))}
            </div>
          </div>

          {/* Contributor */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">
              Contributor Settings
            </h3>
            <div className="space-y-2">
              {Object.entries(dataSources.sources.contributor).map(
                ([key, info]) => (
                  <DataSourceCard key={key} name={key} info={info} />
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calculations Tab */}
      {!loading && activeTab === "calculations" && calculations && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold text-white mb-2">
              Quality Score Logic
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              {calculations.quality_score.description}
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-700 rounded p-3">
                <h4 className="font-medium text-gray-200 mb-2">
                  Dimension Weights
                </h4>
                <div className="space-y-1 text-sm">
                  {Object.entries(
                    calculations.quality_score.dimension_weights
                  ).map(([dim, weight]) => (
                    <div key={dim} className="flex justify-between">
                      <span className="text-gray-400 capitalize">
                        {dim.replace(/([A-Z])/g, " $1")}
                      </span>
                      <span className="text-white font-mono">{weight}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-700 rounded p-3">
                <h4 className="font-medium text-gray-200 mb-2">
                  Signal Weights
                </h4>
                <div className="space-y-1 text-sm">
                  {Object.entries(
                    calculations.quality_score.signal_weights
                  ).map(([signal, weight]) => (
                    <div key={signal} className="flex justify-between">
                      <span className="text-gray-400 capitalize">
                        {signal.replace(/([A-Z])/g, " $1")}
                      </span>
                      <span className="text-white font-mono">{weight}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div className="bg-gray-700 rounded p-3">
                <h4 className="font-medium text-gray-200 mb-2">
                  Scoring Rules
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
                  {calculations.quality_score.scoring_rules.map((rule, i) => (
                    <li key={i}>{rule}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-gray-700 rounded p-3">
                <h4 className="font-medium text-red-300 mb-2">Penalties</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
                  {calculations.quality_score.penalties.map((rule, i) => (
                    <li key={i}>{rule}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold text-white mb-2">
              Cost Estimation Logic
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              {calculations.cost_estimation.description}
            </p>

            <div className="bg-gray-700 rounded p-3 mb-4">
              <h4 className="font-medium text-gray-200 mb-2">
                Pricing Table (USD per Million Tokens)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-gray-500 border-b border-gray-600">
                    <tr>
                      <th className="py-1">Model</th>
                      <th className="py-1 text-right">Input</th>
                      <th className="py-1 text-right">Output</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    {Object.entries(
                      calculations.cost_estimation.pricing_table
                    ).map(([model, pricing]) => (
                      <tr key={model} className="border-b border-gray-600/50">
                        <td className="py-1 font-mono">{model}</td>
                        <td className="py-1 text-right">
                          ${pricing.inputPerMillion}
                        </td>
                        <td className="py-1 text-right">
                          ${pricing.outputPerMillion}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-700 rounded p-3">
              <h4 className="font-medium text-gray-200 mb-2">Formulas</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-400 font-mono">
                {calculations.cost_estimation.formulas.map((formula, i) => (
                  <li key={i}>{formula}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-yellow-500/80 italic">
                {calculations.cost_estimation.disclaimer}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edge Cases Tab */}
      {!loading && activeTab === "edge-cases" && edgeCases && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-2">
              Known Edge Cases & Behaviors
            </h3>
            <p className="text-gray-400 text-sm">
              Understanding these edge cases helps debug unexpected behavior and
              explains how AgentWatch handles various scenarios.
            </p>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            {Object.entries(edgeCases.edge_cases).map(([id, edgeCase]) => (
              <EdgeCaseCard key={id} edgeCase={edgeCase} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
