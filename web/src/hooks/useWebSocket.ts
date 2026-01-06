import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActivityEvent,
  AgentProcess,
  HookSession,
  ListeningPort,
  ManagedSession,
  RepoStatus,
  ToolUsage,
  WebSocketMessage
} from "../api/types";

interface SessionTokens {
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
}

type HideableTab = "hooks" | "repos" | "ports";

interface UseWebSocketResult {
  connected: boolean;
  paused: boolean;
  repos: RepoStatus[];
  agents: AgentProcess[];
  ports: ListeningPort[];
  hookSessions: HookSession[];
  managedSessions: ManagedSession[];
  recentToolUsages: ToolUsage[];
  activityEvents: ActivityEvent[];
  sessionTokens: Record<string, SessionTokens>;
  totalToolCalls: number;
  setPaused: (paused: boolean) => void;
  refresh: () => void;
}

export function useWebSocket(
  hiddenTabs: Set<HideableTab> = new Set()
): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [agents, setAgents] = useState<AgentProcess[]>([]);
  const [ports, setPorts] = useState<ListeningPort[]>([]);
  const [hookSessions, setHookSessions] = useState<HookSession[]>([]);
  const [managedSessions, setManagedSessions] = useState<ManagedSession[]>([]);
  const [recentToolUsages, setRecentToolUsages] = useState<ToolUsage[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [sessionTokens, setSessionTokens] = useState<
    Record<string, SessionTokens>
  >({});
  const [totalToolCalls, setTotalToolCalls] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const pausedRef = useRef(paused);
  const eventIdRef = useRef(0);
  const hiddenTabsRef = useRef(hiddenTabs);

  // Keep hiddenTabsRef in sync
  useEffect(() => {
    hiddenTabsRef.current = hiddenTabs;
  }, [hiddenTabs]);

  // Keep pausedRef in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Helper to add activity events
  const addActivityEvent = useCallback(
    (
      type: string,
      sessionId: string | undefined,
      data: Record<string, unknown>
    ) => {
      const event: ActivityEvent = {
        id: `${Date.now()}-${eventIdRef.current++}`,
        type,
        timestamp: Date.now(),
        session_id: sessionId,
        data
      };
      setActivityEvents((prev) => [event, ...prev].slice(0, 200)); // Keep last 200 events
    },
    []
  );

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Fetch initial data (respecting hidden tabs)
      if (!hiddenTabsRef.current.has("hooks")) {
        fetchInitialHookData();
      }
      if (!hiddenTabsRef.current.has("ports")) {
        fetchInitialPorts();
      }
      // Always fetch managed sessions (for aw run indicator on agents tab)
      fetchManagedSessions();
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 2 seconds
      reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        // Skip updates when paused (except pings)
        if (pausedRef.current && message.type !== "ping") {
          return;
        }

        switch (message.type) {
          case "repos_update":
            if (!hiddenTabsRef.current.has("repos")) {
              setRepos(message.repos);
            }
            break;
          case "agents_update":
            setAgents(message.agents);
            break;
          case "hook_session_start":
            if (!hiddenTabsRef.current.has("hooks")) {
              setHookSessions((prev) => {
                const filtered = prev.filter(
                  (s) => s.session_id !== message.session.session_id
                );
                return [message.session, ...filtered];
              });
              addActivityEvent("session_start", message.session.session_id, {
                cwd: message.session.cwd,
                source: message.session.source
              });
            }
            break;
          case "hook_session_end":
            if (!hiddenTabsRef.current.has("hooks")) {
              setHookSessions((prev) =>
                prev.map((s) =>
                  s.session_id === message.session.session_id
                    ? message.session
                    : s
                )
              );
              addActivityEvent("session_end", message.session.session_id, {
                tool_count: message.session.tool_count
              });
            }
            break;
          case "hook_pre_tool_use":
            if (!hiddenTabsRef.current.has("hooks")) {
              setRecentToolUsages((prev) => {
                const filtered = prev.filter(
                  (u) => u.tool_use_id !== message.usage.tool_use_id
                );
                return [message.usage, ...filtered].slice(0, 100);
              });
              addActivityEvent("tool_start", message.usage.session_id, {
                tool_name: message.usage.tool_name,
                tool_use_id: message.usage.tool_use_id
              });
            }
            break;
          case "hook_post_tool_use":
            if (!hiddenTabsRef.current.has("hooks")) {
              setRecentToolUsages((prev) => {
                const filtered = prev.filter(
                  (u) => u.tool_use_id !== message.usage.tool_use_id
                );
                return [message.usage, ...filtered].slice(0, 100);
              });
              // Also update the session's tool_count
              if (message.usage.session_id) {
                setHookSessions((prev) =>
                  prev.map((s) =>
                    s.session_id === message.usage.session_id
                      ? {
                          ...s,
                          tool_count: s.tool_count + 1,
                          last_activity: Date.now()
                        }
                      : s
                  )
                );
              }
              addActivityEvent("tool_end", message.usage.session_id, {
                tool_name: message.usage.tool_name,
                tool_use_id: message.usage.tool_use_id,
                success: message.usage.success,
                duration_ms: message.usage.duration_ms
              });
            }
            break;

          // New hook events - add to activity feed
          case "hook_notification":
            addActivityEvent("notification", message.session_id, {
              notification_type: message.notification_type
            });
            break;

          case "notification_sent":
            addActivityEvent("notification_sent", message.session_id, {
              notification_type: message.notification_type,
              title: message.title,
              message: message.message
            });
            break;

          case "hook_permission_request":
            addActivityEvent("permission", message.session_id, {
              tool_name: message.tool_name,
              action: message.action
            });
            break;

          case "hook_user_prompt_submit":
            addActivityEvent("prompt", message.session_id, {
              prompt_length: message.prompt_length
            });
            // Clear awaiting_user flag
            if (message.session_id) {
              setHookSessions((prev) =>
                prev.map((s) =>
                  s.session_id === message.session_id
                    ? { ...s, awaiting_user: false, last_activity: Date.now() }
                    : s
                )
              );
            }
            break;

          case "hook_stop":
            addActivityEvent("response", message.session_id, {
              stop_reason: message.stop_reason,
              input_tokens: message.input_tokens,
              output_tokens: message.output_tokens
            });
            // Track token usage per session
            if (
              message.session_id &&
              (message.input_tokens > 0 || message.output_tokens > 0)
            ) {
              setSessionTokens((prev) => {
                const existing = prev[message.session_id] || {
                  inputTokens: 0,
                  outputTokens: 0,
                  turnCount: 0
                };
                return {
                  ...prev,
                  [message.session_id]: {
                    inputTokens: existing.inputTokens + message.input_tokens,
                    outputTokens: existing.outputTokens + message.output_tokens,
                    turnCount: existing.turnCount + 1
                  }
                };
              });
            }
            break;

          case "hook_subagent_stop":
            addActivityEvent("subagent", message.session_id, {
              subagent_id: message.subagent_id,
              stop_reason: message.stop_reason,
              input_tokens: message.input_tokens,
              output_tokens: message.output_tokens
            });
            // Also track subagent tokens under parent session
            if (
              message.session_id &&
              (message.input_tokens > 0 || message.output_tokens > 0)
            ) {
              setSessionTokens((prev) => {
                const existing = prev[message.session_id] || {
                  inputTokens: 0,
                  outputTokens: 0,
                  turnCount: 0
                };
                return {
                  ...prev,
                  [message.session_id]: {
                    inputTokens: existing.inputTokens + message.input_tokens,
                    outputTokens: existing.outputTokens + message.output_tokens,
                    turnCount: existing.turnCount
                  }
                };
              });
            }
            break;

          case "hook_pre_compact":
            addActivityEvent("compact", message.session_id, {
              compact_type: message.compact_type
            });
            break;

          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };
  }, []);

  const fetchInitialHookData = async () => {
    if (hiddenTabsRef.current.has("hooks")) return;
    try {
      const [sessionsRes, usagesRes] = await Promise.all([
        fetch("/api/hooks/sessions?limit=50"),
        fetch("/api/hooks/tools/recent?limit=500")
      ]);
      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json();
        setHookSessions(sessions);
      }
      if (usagesRes.ok) {
        const usages = await usagesRes.json();
        setRecentToolUsages(usages);
      }
    } catch {
      // Ignore fetch errors
    }
  };

  // Calculate tool calls in last hour from recentToolUsages
  const calculateHourlyToolCalls = useCallback(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const count = recentToolUsages.filter((u) => {
      const ts = u.timestamp > 1e12 ? u.timestamp : u.timestamp * 1000;
      return ts > oneHourAgo;
    }).length;
    setTotalToolCalls(count);
  }, [recentToolUsages]);

  // Update hourly count when tool usages change
  useEffect(() => {
    calculateHourlyToolCalls();
  }, [calculateHourlyToolCalls]);

  const fetchInitialPorts = async () => {
    if (hiddenTabsRef.current.has("ports")) return;
    try {
      const res = await fetch("/api/ports");
      if (res.ok) {
        const portsData = await res.json();
        setPorts(portsData);
      }
    } catch {
      // Ignore fetch errors
    }
  };

  const fetchManagedSessions = async () => {
    try {
      // Fetch active managed sessions (from aw run)
      const res = await fetch("/api/managed-sessions?active=true&limit=50");
      if (res.ok) {
        const sessions = await res.json();
        setManagedSessions(sessions);
      }
    } catch {
      // Ignore fetch errors
    }
  };

  const refresh = useCallback(async () => {
    // Fetch all data immediately (respecting hidden tabs)
    try {
      // Always fetch agents (agents tab can't be hidden)
      const agentsRes = await fetch("/api/agents");
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        setAgents(agentsData);
      }

      // Fetch repos if not hidden
      if (!hiddenTabsRef.current.has("repos")) {
        const reposRes = await fetch("/api/repos");
        if (reposRes.ok) {
          const reposData = await reposRes.json();
          setRepos(reposData);
        }
      }

      // Fetch ports if not hidden
      if (!hiddenTabsRef.current.has("ports")) {
        const portsRes = await fetch("/api/ports");
        if (portsRes.ok) {
          const portsData = await portsRes.json();
          setPorts(portsData);
        }
      }

      // Fetch hooks data if not hidden
      if (!hiddenTabsRef.current.has("hooks")) {
        await fetchInitialHookData();
      }

      // Always fetch managed sessions (for aw run indicator on agents tab)
      await fetchManagedSessions();
    } catch {
      // Ignore fetch errors
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Poll managed sessions when there are active sessions (to detect when they end)
  useEffect(() => {
    const hasRunning = managedSessions.some((s) => s.status === "running");
    if (!hasRunning || paused) return;

    // Poll every 5 seconds while we have running sessions
    const interval = setInterval(() => {
      if (!pausedRef.current) {
        fetchManagedSessions();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [managedSessions, paused]);

  return {
    connected,
    paused,
    repos,
    agents,
    ports,
    hookSessions,
    managedSessions,
    recentToolUsages,
    activityEvents,
    sessionTokens,
    totalToolCalls,
    setPaused,
    refresh
  };
}
