/**
 * Watcher App - Streamlined real-time monitoring dashboard.
 *
 * Tabs: Agents | Repos | Ports | Activity | Command | Settings
 */

import { useEffect, useState } from "react";
import { ActivityFeedPane } from "../../components/ActivityFeedPane";
import { AgentPane } from "../../components/AgentPane";
import { CommandCenterPane } from "../../components/CommandCenterPane";
import { PortsPane } from "../../components/PortsPane";
import { ProjectsPane } from "../../components/ProjectsPane";
import { WatcherSettingsPane } from "../../components/WatcherSettingsPane";
import { fetchProjects } from "../../api/client";
import type { AgentProcess, Project, RepoStatus } from "../../api/types";
import { DataProvider } from "../../context/DataProvider";
import { LoadingProvider } from "../../context/LoadingContext";
import { useWebSocket } from "../../hooks/useWebSocket";
import { WatcherHeader } from "./WatcherHeader";

type Tab = "agents" | "repos" | "ports" | "activity" | "command" | "settings";
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
    unifiedEvents,
    fetchUnifiedEvents,
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
          setActiveTab("activity");
          break;
        case "5":
          setActiveTab("command");
          break;
        case "6":
          setActiveTab("settings");
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
    { id: "activity", label: "Activity", count: unifiedEvents.length },
    { id: "command", label: "Command", count: managedSessions.length },
    { id: "settings", label: "Settings" }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <WatcherHeader
        connected={connected}
        repoCount={repos.length}
        agentCount={agents.length}
        sessionCount={hookSessions.filter((s) => s.active).length}
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
            showHookEnhancements={false}
          />
        )}
        {activeTab === "repos" && (
          <WatcherReposPane repos={repos} agents={agents} />
        )}
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
        {activeTab === "activity" && (
          <ActivityFeedPane
            unifiedEvents={unifiedEvents}
            onFetchMore={fetchUnifiedEvents}
          />
        )}
        {activeTab === "command" && (
          <CommandCenterPane managedSessions={managedSessions} />
        )}
        {activeTab === "settings" && <WatcherSettingsPane />}
      </main>
    </div>
  );
}

// Projects + repos pane for watcher
function WatcherReposPane({
  repos,
  agents
}: {
  repos: RepoStatus[];
  agents: AgentProcess[];
}) {
  const [showAll, setShowAll] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetchProjects()
      .then((data) => setProjects(data))
      .catch(() => setProjects([]));
  }, []);

  const normalizeProjectPath = (path: string) => {
    const trimmed = path.replace(/\/$/, "");
    if (trimmed.startsWith("~")) {
      return trimmed.slice(1);
    }
    return trimmed;
  };

  const projectPaths = new Set(
    projects.flatMap((project) => project.paths.map(normalizeProjectPath))
  );

  const agentRepoPaths = new Set(
    agents
      .map((agent) => agent.repo_path || agent.cwd || "")
      .filter(Boolean)
      .map((path) => path.replace(/\/$/, ""))
  );

  const isRepoRelevant = (repo: RepoStatus) => {
    if (agentRepoPaths.has(repo.path)) return true;
    for (const projectPath of projectPaths) {
      if (!projectPath) continue;
      if (
        repo.path === projectPath ||
        repo.path.endsWith(projectPath) ||
        repo.path.startsWith(projectPath + "/")
      ) {
        return true;
      }
    }
    return false;
  };

  const filteredRepos = showAll ? repos : repos.filter(isRepoRelevant);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-gray-800 rounded-lg border border-gray-700 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Repos & Projects</h2>
          <p className="text-xs text-gray-400">
            Showing {showAll ? "all scanned repos" : "active/project repos"}.
          </p>
        </div>
        <button
          onClick={() => setShowAll((prev) => !prev)}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
        >
          {showAll ? "Show relevant only" : "Show all"}
        </button>
      </div>
      <ProjectsPane
        repos={filteredRepos}
        enableAnalytics={false}
        componentId="watcher.repos.pane"
      />
    </div>
  );
}

export default function WatcherAppWrapper() {
  return (
    <LoadingProvider>
      <DataProvider>
        <WatcherApp />
      </DataProvider>
    </LoadingProvider>
  );
}
