/**
 * Watcher App - Streamlined real-time monitoring dashboard.
 *
 * Tabs: Agents | Repos | Ports | Timeline
 */

import { useEffect, useState } from "react";
import { AgentPane } from "../../components/AgentPane";
import { PortsPane } from "../../components/PortsPane";
import { Header } from "../../components/Header";
import { ConversationProvider } from "../../context/ConversationContext";
import { DataProvider } from "../../context/DataProvider";
import { LoadingProvider } from "../../context/LoadingContext";
import { useWebSocket } from "../../hooks/useWebSocket";

type Tab = "agents" | "repos" | "ports" | "timeline";
type HideableTab = "hooks" | "repos" | "ports";

function WatcherApp() {
  const [hiddenTabs] = useState<Set<HideableTab>>(new Set());
  const [hiddenPorts, setHiddenPorts] = useState<Set<number>>(new Set());

  const {
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
    setPaused,
    refresh
  } = useWebSocket(hiddenTabs);

  const [activeTab, setActiveTab] = useState<Tab>("agents");

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "1":
          setActiveTab("agents");
          break;
        case "2":
          setActiveTab("repos");
          break;
        case "3":
          setActiveTab("ports");
          break;
        case "4":
          setActiveTab("timeline");
          break;
        case "r":
          refresh();
          break;
        case " ":
          setPaused(!paused);
          e.preventDefault();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paused, setPaused, refresh]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "agents", label: "Agents", count: agents.length },
    { id: "repos", label: "Repos", count: repos.length },
    { id: "ports", label: "Ports", count: ports.length },
    { id: "timeline", label: "Timeline", count: activityEvents.length }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Header
        connected={connected}
        repoCount={repos.length}
        agentCount={agents.length}
      />

      <div className="border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-700">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "agents" && (
          <AgentPane
            agents={agents}
            hookSessions={hookSessions}
            managedSessions={managedSessions}
            recentToolUsages={recentToolUsages}
            activityEvents={activityEvents}
            sessionTokens={sessionTokens}
          />
        )}
        {activeTab === "repos" && <ReposPane repos={repos} />}
        {activeTab === "ports" && (
          <PortsPane
            ports={ports}
            hiddenPorts={hiddenPorts}
            onToggleHide={(port) => {
              setHiddenPorts((prev) => {
                const next = new Set(prev);
                if (next.has(port)) {
                  next.delete(port);
                } else {
                  next.add(port);
                }
                return next;
              });
            }}
          />
        )}
        {activeTab === "timeline" && <TimelinePane events={activityEvents} />}
      </main>
    </div>
  );
}

// Simple repos pane for watcher
function ReposPane({ repos }: { repos: any[] }) {
  if (repos.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No repositories with changes detected
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {repos.map((repo) => (
        <div key={repo.path} className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-100">{repo.path}</h3>
              <p className="text-sm text-gray-400">
                Branch: {repo.branch || "unknown"}
              </p>
            </div>
            <div className="flex space-x-4 text-sm">
              {repo.staged_count > 0 && (
                <span className="text-green-400">
                  +{repo.staged_count} staged
                </span>
              )}
              {repo.unstaged_count > 0 && (
                <span className="text-yellow-400">
                  {repo.unstaged_count} modified
                </span>
              )}
              {repo.untracked_count > 0 && (
                <span className="text-gray-400">
                  {repo.untracked_count} untracked
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Simple timeline pane for watcher
function TimelinePane({ events }: { events: any[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">No recent activity</div>
    );
  }

  return (
    <div className="space-y-2">
      {events.slice(0, 50).map((event, i) => (
        <div key={i} className="bg-gray-800 rounded px-4 py-2 text-sm">
          <span className="text-gray-500 mr-3">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
          <span className="text-gray-300">{event.type}</span>
          {event.details && (
            <span className="text-gray-500 ml-2">
              {JSON.stringify(event.details)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WatcherAppWrapper() {
  return (
    <LoadingProvider>
      <DataProvider>
        <ConversationProvider>
          <WatcherApp />
        </ConversationProvider>
      </DataProvider>
    </LoadingProvider>
  );
}
