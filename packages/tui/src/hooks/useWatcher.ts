import { useCallback, useEffect, useState } from "react";
import type {
  AgentProcess,
  HookSession,
  ListeningPort,
  RepoStatus
} from "../types.js";

interface WatcherState {
  connected: boolean;
  agents: AgentProcess[];
  repos: RepoStatus[];
  hookSessions: HookSession[];
  ports: ListeningPort[];
  error: string | null;
  refresh: () => void;
}

export function useWatcher(
  watcherUrl: string,
  paused: boolean
): WatcherState {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<AgentProcess[]>([]);
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [hookSessions, setHookSessions] = useState<HookSession[]>([]);
  const [ports, setPorts] = useState<ListeningPort[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (paused) return;

    try {
      const [agentsRes, reposRes, hooksRes, portsRes] = await Promise.all([
        fetch(`${watcherUrl}/api/agents`),
        fetch(`${watcherUrl}/api/repos`),
        fetch(`${watcherUrl}/api/hooks/sessions?limit=50`),
        fetch(`${watcherUrl}/api/ports`)
      ]);

      if (!agentsRes.ok || !reposRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const agentsData = (await agentsRes.json()) as AgentProcess[];
      const reposData = (await reposRes.json()) as RepoStatus[];

      setAgents(agentsData);
      setRepos(reposData);

      if (hooksRes.ok) {
        const hooksData = (await hooksRes.json()) as HookSession[];
        setHookSessions(hooksData);
      }

      if (portsRes.ok) {
        const portsData = (await portsRes.json()) as ListeningPort[];
        setPorts(portsData);
      }

      setConnected(true);
      setError(null);
    } catch (e) {
      setConnected(false);
      setError(e instanceof Error ? e.message : "Connection failed");
    }
  }, [watcherUrl, paused]);

  // Initial fetch and polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // WebSocket for real-time updates
  useEffect(() => {
    if (paused) return;

    const wsUrl = watcherUrl.replace(/^http/, "ws") + "/ws";
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setConnected(true);
          setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === "agents_update") {
              setAgents(msg.agents);
            } else if (msg.type === "repos_update") {
              setRepos(msg.repos);
            } else if (msg.type === "ports_update") {
              setPorts(msg.ports);
            } else if (msg.type === "hook_session_start") {
              setHookSessions((prev) => {
                const filtered = prev.filter(
                  (s) => s.session_id !== msg.session.session_id
                );
                return [msg.session, ...filtered];
              });
            } else if (msg.type === "hook_session_end") {
              setHookSessions((prev) =>
                prev.map((s) =>
                  s.session_id === msg.session.session_id ? msg.session : s
                )
              );
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          setConnected(false);
          // Reconnect after 2 seconds
          reconnectTimeout = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        // WebSocket not available, fall back to polling
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      ws?.close();
    };
  }, [watcherUrl, paused]);

  return {
    connected,
    agents,
    repos,
    hookSessions,
    ports,
    error,
    refresh: fetchData
  };
}
