import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAllAgentMetadata, fetchProjects } from "../api/client";
import type {
  AgentMetadata,
  AgentProcess,
  Conversation,
  HookSession,
  ManagedSession,
  Project,
  ToolUsage
} from "../api/types";
import { useConversationsOptional } from "../context/ConversationContext";
import { AgentDetailModal } from "./AgentDetailModal";
import { HookTimelineSection } from "./HookTimelineSection";
import { HookEnhancementsSection } from "./HookEnhancementsSection";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

interface SessionTokens {
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
}

interface AgentPaneProps {
  agents: AgentProcess[];
  hookSessions: HookSession[];
  managedSessions: ManagedSession[];
  recentToolUsages: ToolUsage[];
  sessionTokens: Record<string, SessionTokens>;
  showHookEnhancements?: boolean;
}

interface GroupedAgents {
  [label: string]: AgentProcess[];
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatTimeSince(ts: number): string {
  // Handle both seconds and milliseconds timestamps
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
}

function getState(agent: AgentProcess): { state: string; color: string } {
  const ws = agent.wrapper_state;
  const hs = agent.heuristic_state;

  // Prefer heuristic state for real-time status (based on CPU/activity)
  if (hs) {
    const state = hs.state?.toUpperCase();
    if (state === "WORKING" || state === "ACTIVE") {
      return { state: "ACTIVE", color: "text-green-400" };
    }
    if (state === "STALLED") {
      return { state: "STALLED", color: "text-red-400" };
    }
    if (state === "IDLE" || state === "WAITING") {
      return { state: "WAITING", color: "text-yellow-400" };
    }
  }

  // Use wrapper state as fallback
  if (ws) {
    if (ws.awaiting_user) {
      return { state: "WAITING", color: "text-yellow-400" };
    }
    const state = ws.state?.toUpperCase();
    if (state === "ACTIVE" || state === "WORKING") {
      return { state: "ACTIVE", color: "text-green-400" };
    }
    if (state === "DONE") {
      return { state: "DONE", color: "text-gray-400" };
    }
  }

  return { state: "?", color: "text-gray-400" };
}

// Find matching hook session for an agent by cwd
// Only matches Claude Code agents - other agents (Codex, etc.) don't use hooks
function findHookSession(
  agent: AgentProcess,
  sessions: HookSession[]
): HookSession | undefined {
  if (!agent.cwd) return undefined;
  // Only Claude Code agents use hooks - Codex and others don't
  if (agent.label !== "claude") return undefined;
  // First try to find an active session with matching cwd
  const active = sessions.find((s) => s.active && s.cwd === agent.cwd);
  if (active) return active;
  // Fall back to most recent session with matching cwd (even if ended)
  const matching = sessions
    .filter((s) => s.cwd === agent.cwd)
    .sort((a, b) => b.last_activity - a.last_activity);
  return matching[0];
}

// Find matching managed session for an agent by PID (from `aw run`)
function findManagedSession(
  agent: AgentProcess,
  sessions: ManagedSession[]
): ManagedSession | undefined {
  // Match by PID - managed sessions track the spawned process PID
  return sessions.find((s) => s.pid === agent.pid && s.status === "running");
}

interface ActivityInfo {
  timestamp: number | null;
  source: "hooks" | "managed" | "scan" | "unknown";
}

function getLastActivityInfo(
  agent: AgentProcess,
  hookSession: HookSession | undefined,
  managedSession: ManagedSession | undefined
): ActivityInfo {
  if (hookSession?.last_activity) {
    return { timestamp: hookSession.last_activity, source: "hooks" };
  }

  const wrapperTime = agent.wrapper_state?.last_output_time;
  if (wrapperTime) {
    return { timestamp: wrapperTime, source: "managed" };
  }

  const managedTime = managedSession?.ended_at ?? managedSession?.started_at;
  if (managedTime) {
    return { timestamp: managedTime, source: "managed" };
  }

  if (
    agent.heuristic_state &&
    typeof agent.heuristic_state.quiet_seconds === "number"
  ) {
    return {
      timestamp: Date.now() - agent.heuristic_state.quiet_seconds * 1000,
      source: "scan"
    };
  }

  if (agent.start_time) {
    return { timestamp: agent.start_time, source: "scan" };
  }

  return { timestamp: null, source: "unknown" };
}

type SortColumn =
  | "agent"
  | "pid"
  | "uptime"
  | "lastActivity"
  | "state"
  | "location"
  | "resources"
  | "session";
type SortDirection = "asc" | "desc";

// Generate stable agent ID for metadata lookup (matches backend)
function generateAgentId(label: string, exe: string): string {
  const input = `${label.toLowerCase()}:${exe}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const base = Math.abs(hash).toString(36);
  return `${label.toLowerCase()}-${base}`;
}

export function AgentPane({
  agents,
  hookSessions,
  managedSessions,
  recentToolUsages,
  sessionTokens,
  showHookEnhancements = true
}: AgentPaneProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [groupByLabel, setGroupByLabel] = useState(false);
  const [groupByProject, setGroupByProject] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [sortColumn, setSortColumn] = useState<SortColumn>("agent");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [agentMetadata, setAgentMetadata] = useState<
    Record<string, AgentMetadata>
  >({});
  const [projects, setProjects] = useState<Project[]>([]);

  // Get conversation context for linking
  const conversationCtx = useConversationsOptional();

  // Find linked conversation for an agent
  const getLinkedConversation = useCallback(
    (agent: AgentProcess): Conversation | undefined => {
      if (!conversationCtx || !agent.cwd) return undefined;
      return conversationCtx.getLinkedConversation(
        agent.cwd,
        agent.start_time ?? undefined
      );
    },
    [conversationCtx]
  );

  // Load all agent metadata on mount and periodically refresh
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const data = await fetchAllAgentMetadata();
        setAgentMetadata(data);
      } catch {
        // Metadata might not exist
      }
    };
    loadMetadata();
    // Refresh metadata every 30 seconds
    const interval = setInterval(loadMetadata, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load projects for grouping
  useEffect(() => {
    fetchProjects()
      .then((data) => setProjects(data))
      .catch(() => setProjects([]));
  }, []);

  // Resolve project for an agent based on cwd
  const resolveProjectForAgent = useCallback(
    (agent: AgentProcess): Project | null => {
      if (!agent.cwd) return null;
      for (const project of projects) {
        for (const path of project.paths) {
          const normalizedPath = path.replace(/\/$/, "");
          if (
            agent.cwd === normalizedPath ||
            agent.cwd.startsWith(normalizedPath + "/")
          ) {
            return project;
          }
        }
      }
      return null;
    },
    [projects]
  );

  // Get metadata for an agent
  const getAgentMetadata = useCallback(
    (agent: AgentProcess): AgentMetadata | null => {
      const agentId = generateAgentId(agent.label, agent.exe);
      return agentMetadata[agentId] || null;
    },
    [agentMetadata]
  );

  // Handle metadata updates from the detail modal
  const handleMetadataUpdate = useCallback((updatedMetadata: AgentMetadata) => {
    setAgentMetadata((prev) => ({
      ...prev,
      [updatedMetadata.agentId]: updatedMetadata
    }));
  }, []);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const selectedAgent = agents.find((a) => a.pid === selectedPid);

  // Filter agents (including custom names and tags)
  const filteredAgents = useMemo(() => {
    if (!filter) return agents;
    const lowerFilter = filter.toLowerCase();
    return agents.filter((a) => {
      const meta = getAgentMetadata(a);
      return (
        a.label.toLowerCase().includes(lowerFilter) ||
        a.cmdline.toLowerCase().includes(lowerFilter) ||
        a.cwd?.toLowerCase().includes(lowerFilter) ||
        meta?.customName?.toLowerCase().includes(lowerFilter) ||
        meta?.tags?.some((t) => t.toLowerCase().includes(lowerFilter))
      );
    });
  }, [agents, filter, getAgentMetadata]);

  // Sort agents
  const sortedAgents = useMemo(() => {
    const sorted = [...filteredAgents].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "agent":
          cmp = a.label.localeCompare(b.label);
          break;
        case "pid":
          cmp = a.pid - b.pid;
          break;
        case "uptime": {
          const aTime = a.start_time || 0;
          const bTime = b.start_time || 0;
          cmp = aTime - bTime;
          break;
        }
        case "lastActivity": {
          const aHook = findHookSession(a, hookSessions);
          const bHook = findHookSession(b, hookSessions);
          const aManaged = findManagedSession(a, managedSessions);
          const bManaged = findManagedSession(b, managedSessions);
          const aActivity = getLastActivityInfo(a, aHook, aManaged).timestamp;
          const bActivity = getLastActivityInfo(b, bHook, bManaged).timestamp;
          cmp = (aActivity ?? 0) - (bActivity ?? 0);
          break;
        }
        case "state": {
          const stateOrder = {
            ACTIVE: 0,
            WAITING: 1,
            STALLED: 2,
            DONE: 3,
            "?": 4
          };
          const aState = getState(a).state;
          const bState = getState(b).state;
          cmp =
            (stateOrder[aState as keyof typeof stateOrder] ?? 5) -
            (stateOrder[bState as keyof typeof stateOrder] ?? 5);
          break;
        }
        case "location": {
          const aLoc = a.cwd?.split("/").pop() || "";
          const bLoc = b.cwd?.split("/").pop() || "";
          cmp = aLoc.localeCompare(bLoc);
          break;
        }
        case "resources": {
          cmp = (a.cpu_pct || 0) - (b.cpu_pct || 0);
          break;
        }
        case "session": {
          const aSession = findHookSession(a, hookSessions);
          const bSession = findHookSession(b, hookSessions);
          cmp = (aSession?.tool_count || 0) - (bSession?.tool_count || 0);
          break;
        }
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [
    filteredAgents,
    sortColumn,
    sortDirection,
    hookSessions,
    managedSessions
  ]);

  // Group agents by label or project
  const groupedAgents = useMemo(() => {
    if (!groupByLabel && !groupByProject) return null;
    const groups: GroupedAgents = {};
    for (const agent of sortedAgents) {
      let groupKey: string;
      if (groupByProject) {
        const project = resolveProjectForAgent(agent);
        groupKey = project ? project.name : "(No Project)";
      } else {
        groupKey = agent.label || "unknown";
      }
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(agent);
    }
    return groups;
  }, [sortedAgents, groupByLabel, groupByProject, resolveProjectForAgent]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <SelfDocumentingSection
      componentId="watcher.agents.pane"
      visible={showSelfDocs}
      detailsClassName="px-4"
      contentClassName="pl-0"
    >
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-white">
                Agents
                {agents.length > 0 && (
                  <span className="ml-2 text-sm text-gray-400">
                    ({filteredAgents.length}
                    {filter ? `/${agents.length}` : ""} running)
                  </span>
                )}
              </h2>
              {/* Status legend */}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span
                  className="flex items-center gap-1"
                  title="Agent is actively working"
                >
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Active
                </span>
                <span
                  className="flex items-center gap-1"
                  title="Agent needs user input"
                >
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  Waiting
                </span>
                <span
                  className="flex items-center gap-1"
                  title="No activity detected"
                >
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  Stalled
                </span>
                <span
                  className="flex items-center gap-1"
                  title="Session completed"
                >
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  Done
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Filter agents..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-40"
              />
              <button
                onClick={() => {
                  setGroupByLabel(!groupByLabel);
                  if (!groupByLabel) setGroupByProject(false);
                }}
                className={`px-2 py-1 text-xs rounded ${
                  groupByLabel
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
                title="Group by agent type"
              >
                By Type
              </button>
              <button
                onClick={() => {
                  setGroupByProject(!groupByProject);
                  if (!groupByProject) setGroupByLabel(false);
                }}
                className={`px-2 py-1 text-xs rounded ${
                  groupByProject
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
                title="Group by project"
              >
                By Project
              </button>
            </div>
          </div>

          {/* Info banner */}
          <details className="mt-2 text-xs text-gray-400">
            <summary className="cursor-pointer hover:text-gray-300">
              ℹ️ About this data
            </summary>
            <div className="mt-2 p-3 bg-gray-700/50 rounded space-y-1">
              <p>
                <strong>Source:</strong> Process scanner using{" "}
                <code className="bg-gray-800 px-1 rounded">ps -axo</code> to
                enumerate processes (every few seconds)
              </p>
              <p>
                <strong>Detection:</strong> Regex/executable matchers against
                cmdline + executable path; cwd resolved via{" "}
                <code className="bg-gray-800 px-1 rounded">lsof</code> (cached)
              </p>
              <p>
                <strong>State detection:</strong> CPU activity heuristic (active
                threshold + stalled timeout) with hook/wrapper signals when
                available
              </p>
              <p>
                <strong>Persistent logs:</strong>{" "}
                <code className="bg-gray-800 px-1 rounded">
                  ~/.agentwatch/processes/
                </code>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText("~/.agentwatch/processes/")
                  }
                  className="ml-2 text-blue-400 hover:text-blue-300"
                  type="button"
                >
                  Copy path
                </button>
              </p>
              <p>
                <strong>Detected agents:</strong> Claude Code, Codex CLI, Gemini
                CLI, Cursor, OpenCode, and custom patterns
              </p>
            </div>
          </details>
        </div>
        <div className="overflow-auto max-h-96">
          {filteredAgents.length === 0 ? (
            <div className="px-4 py-8 text-gray-500 text-center">
              {agents.length === 0
                ? "No agents running"
                : "No agents match filter"}
            </div>
          ) : (groupByLabel || groupByProject) && groupedAgents ? (
            // Grouped view
            <div className="divide-y divide-gray-700">
              {Object.entries(groupedAgents).map(([label, groupAgents]) => (
                <div key={label}>
                  <button
                    onClick={() => toggleGroup(label)}
                    className="w-full px-4 py-2 flex items-center justify-between bg-gray-750 hover:bg-gray-700 text-left"
                  >
                    <span className="font-medium text-white">
                      {label}
                      <span className="ml-2 text-sm text-gray-400">
                        ({groupAgents.length})
                      </span>
                    </span>
                    <span className="text-gray-400">
                      {collapsedGroups.has(label) ? "▶" : "▼"}
                    </span>
                  </button>
                  {!collapsedGroups.has(label) && (
                    <table className="w-full text-sm">
                      <tbody>
                        {groupAgents.map((agent) => (
                          <AgentRow
                            key={agent.pid}
                            agent={agent}
                            hookSessions={hookSessions}
                            managedSession={findManagedSession(
                              agent,
                              managedSessions
                            )}
                            metadata={getAgentMetadata(agent)}
                            linkedConversation={getLinkedConversation(agent)}
                            project={resolveProjectForAgent(agent)}
                            onClick={() => setSelectedPid(agent.pid)}
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Flat view
            <table className="w-full text-sm">
              <thead className="bg-gray-750 text-gray-400">
                <tr>
                  <SortableHeader
                    column="agent"
                    label="Agent"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="pid"
                    label="PID"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="uptime"
                    label="Uptime"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="resources"
                    label="CPU/Mem"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="lastActivity"
                    label="Last Activity"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="state"
                    label="State"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="location"
                    label="Location"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="session"
                    label="Session"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((agent) => (
                  <AgentRow
                    key={agent.pid}
                    agent={agent}
                    hookSessions={hookSessions}
                    managedSession={findManagedSession(agent, managedSessions)}
                    metadata={getAgentMetadata(agent)}
                    linkedConversation={getLinkedConversation(agent)}
                    project={resolveProjectForAgent(agent)}
                    onClick={() => setSelectedPid(agent.pid)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Hook Sections - always show with empty state when no active sessions */}
      <div className="mt-6 space-y-4">
        {/* Hook Timeline Section */}
        <HookTimelineSection
          hookSessions={hookSessions}
          recentToolUsages={recentToolUsages}
          sessionTokens={sessionTokens}
        />

        {/* Hook Enhancements Section */}
        {showHookEnhancements && (
          <HookEnhancementsSection componentId="watcher.agents.hook-enhancements" />
        )}
      </div>

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          hookSession={findHookSession(selectedAgent, hookSessions) || null}
          linkedConversation={getLinkedConversation(selectedAgent)}
          recentToolUsages={recentToolUsages.filter(
            (t) =>
              t.session_id ===
              findHookSession(selectedAgent, hookSessions)?.session_id
          )}
          onClose={() => setSelectedPid(null)}
          onMetadataUpdate={handleMetadataUpdate}
        />
      )}
    </SelfDocumentingSection>
  );
}

interface SortableHeaderProps {
  column: SortColumn;
  label: string;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}

function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort
}: SortableHeaderProps) {
  const isActive = sortColumn === column;
  return (
    <th
      className="text-left px-4 py-2 cursor-pointer hover:bg-gray-700 select-none"
      onClick={() => onSort(column)}
    >
      <span className="flex items-center gap-1">
        {label}
        <span
          className={`text-xs ${isActive ? "text-blue-400" : "text-gray-600"}`}
        >
          {isActive ? (sortDirection === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </span>
    </th>
  );
}

interface AgentRowProps {
  agent: AgentProcess;
  hookSessions: HookSession[];
  managedSession: ManagedSession | undefined;
  metadata: AgentMetadata | null;
  linkedConversation?: Conversation;
  project?: Project | null;
  onClick: () => void;
}

function AgentRow({
  agent,
  hookSessions,
  managedSession,
  metadata,
  linkedConversation,
  project,
  onClick
}: AgentRowProps) {
  const { state, color } = getState(agent);
  const hookSession = findHookSession(agent, hookSessions);

  // Format cwd to show just project name
  const projectName = agent.cwd?.split("/").pop() || "-";
  const projectLabel =
    project?.name || linkedConversation?.project?.name || null;
  const runtimeLabel = agent.sandboxed
    ? agent.sandbox_type === "docker"
      ? "docker"
      : "sandbox"
    : "local";

  // Calculate uptime
  const uptime = agent.start_time
    ? formatDuration(
        Date.now() -
          (agent.start_time > 1e12 ? agent.start_time : agent.start_time * 1000)
      )
    : "-";

  const activityInfo = getLastActivityInfo(agent, hookSession, managedSession);
  const lastActivity = activityInfo.timestamp
    ? formatTimeSince(activityInfo.timestamp)
    : "-";
  const activityTimestampMs = activityInfo.timestamp
    ? activityInfo.timestamp > 1e12
      ? activityInfo.timestamp
      : activityInfo.timestamp * 1000
    : null;
  const activitySourceLabel =
    activityInfo.source === "hooks"
      ? "hooks"
      : activityInfo.source === "managed"
        ? "managed"
        : activityInfo.source === "scan"
          ? "scan"
          : "unknown";

  // Display name: custom name if set, otherwise agent label
  const displayName = metadata?.customName || agent.label;
  const hasCustomName = !!metadata?.customName;

  return (
    <tr
      className="border-t border-gray-700 hover:bg-gray-750 cursor-pointer"
      onClick={onClick}
    >
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              state === "ACTIVE"
                ? "bg-green-400"
                : state === "WAITING"
                  ? "bg-yellow-400"
                  : state === "STALLED"
                    ? "bg-red-400"
                    : "bg-gray-400"
            }`}
            style={
              metadata?.color ? { backgroundColor: metadata.color } : undefined
            }
            title={
              state === "ACTIVE"
                ? "Active - Agent is working"
                : state === "WAITING"
                  ? "Waiting - Agent needs user input"
                  : state === "STALLED"
                    ? "Stalled - No activity detected"
                    : state === "DONE"
                      ? "Done - Session completed"
                      : "Unknown state"
            }
          />
          <span className="text-white font-medium">{displayName}</span>
          {hasCustomName && (
            <span className="text-xs text-gray-500">({agent.label})</span>
          )}
          {metadata?.tags && metadata.tags.length > 0 && (
            <div className="flex gap-1">
              {metadata.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="px-1 py-0.5 text-[10px] bg-gray-700 text-gray-400 rounded"
                >
                  {tag}
                </span>
              ))}
              {metadata.tags.length > 2 && (
                <span className="text-[10px] text-gray-500">
                  +{metadata.tags.length - 2}
                </span>
              )}
            </div>
          )}
          {managedSession && (
            <span
              className="text-xs px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-400 font-medium"
              title={`Started via aw run: "${managedSession.prompt.slice(0, 50)}${managedSession.prompt.length > 50 ? "..." : ""}"`}
            >
              aw run
            </span>
          )}
          {agent.sandboxed && (
            <span
              className={`text-xs px-1 py-0.5 rounded ${
                agent.sandbox_type === "docker"
                  ? "bg-blue-900/50 text-blue-400"
                  : "bg-purple-900/50 text-purple-400"
              }`}
              title={`Running in ${agent.sandbox_type || "sandbox"}`}
            >
              {agent.sandbox_type === "docker" ? "🐳" : "🔒"}
            </span>
          )}
          {hookSession && (
            <span className="text-xs text-blue-400" title="Has hook session">
              ⚡
            </span>
          )}
          {linkedConversation && (
            <span
              className="text-xs text-cyan-400"
              title={`Linked conversation: ${linkedConversation.match_type} match`}
            >
              💬
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-gray-400 font-mono text-xs">{agent.pid}</td>
      <td
        className="px-4 py-2 text-gray-400 text-xs"
        title={
          agent.start_time
            ? new Date(
                agent.start_time > 1e12
                  ? agent.start_time
                  : agent.start_time * 1000
              ).toLocaleString()
            : ""
        }
      >
        {uptime}
      </td>
      <td
        className="px-4 py-2 text-xs"
        title={`CPU: ${agent.cpu_pct?.toFixed(1) || 0}% | Memory: ${agent.rss_kb ? Math.round(agent.rss_kb / 1024) : 0}MB`}
      >
        <span
          className={
            agent.cpu_pct > 50
              ? "text-green-400"
              : agent.cpu_pct > 10
                ? "text-yellow-400"
                : "text-gray-500"
          }
        >
          {agent.cpu_pct?.toFixed(0) || 0}%
        </span>
        <span className="text-gray-600 mx-1">/</span>
        <span className="text-gray-400">
          {agent.rss_kb
            ? agent.rss_kb > 1024 * 1024
              ? `${(agent.rss_kb / 1024 / 1024).toFixed(1)}G`
              : `${Math.round(agent.rss_kb / 1024)}M`
            : "-"}
        </span>
      </td>
      <td
        className="px-4 py-2 text-gray-400 text-xs"
        title={
          activityTimestampMs
            ? `Last ${activitySourceLabel} activity: ${new Date(activityTimestampMs).toLocaleString()}`
            : "No activity data available"
        }
      >
        {activityTimestampMs ? (
          <div className="flex flex-col">
            <span>{lastActivity}</span>
            <span className="text-[10px] text-gray-600">
              {activitySourceLabel}
            </span>
          </div>
        ) : (
          <span className="text-gray-600">-</span>
        )}
      </td>
      <td className="px-4 py-2">
        <span className={color}>{state}</span>
      </td>
      <td
        className="px-4 py-2 text-xs truncate max-w-48"
        title={`${agent.cwd || ""}${projectLabel ? `\nProject: ${projectLabel}` : ""}\nRuntime: ${runtimeLabel}`}
      >
        <div className="flex flex-col">
          <span className="text-gray-300 font-mono">{projectName}</span>
          {projectLabel && (
            <span
              className="text-cyan-500 text-[10px]"
              title={`Project: ${projectLabel}`}
            >
              {projectLabel}
            </span>
          )}
          <span className="text-gray-500 text-[10px]">{runtimeLabel}</span>
        </div>
      </td>
      <td className="px-4 py-2">
        {hookSession ? (
          <div className="flex items-center gap-2 text-xs">
            <span
              className="text-gray-400"
              title={`${hookSession.tool_count} tool calls`}
            >
              {hookSession.tool_count} tools
            </span>
            {hookSession.commit_count && hookSession.commit_count > 0 && (
              <span
                className="text-purple-400"
                title={`${hookSession.commit_count} commits`}
              >
                {hookSession.commit_count} commits
              </span>
            )}
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                hookSession.permission_mode === "auto"
                  ? "bg-green-900/50 text-green-400"
                  : hookSession.permission_mode === "ask"
                    ? "bg-yellow-900/50 text-yellow-400"
                    : "bg-gray-700 text-gray-400"
              }`}
              title={`Permission mode: ${hookSession.permission_mode}`}
            >
              {hookSession.permission_mode}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-600">-</span>
        )}
      </td>
    </tr>
  );
}
