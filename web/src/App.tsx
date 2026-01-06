import { useCallback, useEffect, useRef, useState } from "react";
import { AgentPane } from "./components/AgentPane";
import { AnalyticsPane } from "./components/AnalyticsPane";
import { CommandCenterPane } from "./components/CommandCenterPane";
import { ContribPane } from "./components/ContribPane";
import { ConversationsPane } from "./components/ConversationsPane";
import { DocumentationPane } from "./components/DocumentationPane";
import { Header } from "./components/Header";
import { PortsPane } from "./components/PortsPane";
import { ProjectsPane } from "./components/ProjectsPane";
import { SettingsPane } from "./components/SettingsPane";
import { ConversationProvider } from "./context/ConversationContext";
import { DataProvider } from "./context/DataProvider";
import { LoadingProvider, useLoading } from "./context/LoadingContext";
import { useWebSocket } from "./hooks/useWebSocket";

type Tab =
  | "agents"
  | "ports"
  | "projects"
  | "conversations"
  | "analytics"
  | "contrib"
  | "command"
  | "docs"
  | "settings";
type HideableTab = "ports";

// Helper to fetch and patch config
const API_BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/\/api$/, "")
  : "";

async function fetchUiConfig(): Promise<{
  hiddenTabs: string[];
  hiddenPorts: number[];
}> {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (!res.ok) throw new Error("Config fetch failed");
    const config = await res.json();
    return {
      hiddenTabs: config.ui?.hidden_tabs || [],
      hiddenPorts: config.ui?.hidden_ports || []
    };
  } catch {
    return { hiddenTabs: [], hiddenPorts: [] };
  }
}

async function patchUiConfig(
  hiddenTabs: string[],
  hiddenPorts: number[]
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ui: { hidden_tabs: hiddenTabs, hidden_ports: hiddenPorts }
      })
    });
  } catch {
    // Silently fail - localStorage migration handled separately
  }
}

function App() {
  // Track if config has been loaded from API
  const configLoaded = useRef(false);

  // Hidden tabs state (loads from config API, ports hidden by default)
  const [hiddenTabs, setHiddenTabs] = useState<Set<HideableTab>>(
    new Set(["ports"])
  );
  // Hidden ports state (loads from config API)
  const [hiddenPorts, setHiddenPorts] = useState<Set<number>>(new Set());

  // Load config from API on mount, migrate localStorage if needed
  useEffect(() => {
    (async () => {
      const config = await fetchUiConfig();

      // Migration: check if localStorage has values that config doesn't
      const localTabs = localStorage.getItem("agentwatch-hidden-tabs");
      const localPorts = localStorage.getItem("agentwatch-hidden-ports");

      let tabs = config.hiddenTabs;
      let ports = config.hiddenPorts;

      // Migrate localStorage -> config if config is empty but localStorage has data
      if (tabs.length === 0 && localTabs) {
        try {
          tabs = JSON.parse(localTabs);
        } catch {
          /* ignore */
        }
      }
      if (ports.length === 0 && localPorts) {
        try {
          ports = JSON.parse(localPorts);
        } catch {
          /* ignore */
        }
      }

      // If we migrated, save to config and clear localStorage
      if ((localTabs && tabs.length > 0) || (localPorts && ports.length > 0)) {
        await patchUiConfig(tabs, ports);
        localStorage.removeItem("agentwatch-hidden-tabs");
        localStorage.removeItem("agentwatch-hidden-ports");
      }

      setHiddenTabs(new Set(tabs as HideableTab[]));
      setHiddenPorts(new Set(ports));
      configLoaded.current = true;
    })();
  }, []);

  // Persist hidden tabs to config API
  useEffect(() => {
    if (!configLoaded.current) return; // Don't save until initial load complete
    patchUiConfig([...hiddenTabs], [...hiddenPorts]);
  }, [hiddenTabs, hiddenPorts]);

  const toggleTabVisibility = useCallback((tab: HideableTab) => {
    setHiddenTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      return next;
    });
  }, []);

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
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Track tabs that have been visited (for lazy loading)
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set(["agents"]));

  // Track when each tab was last activated (for stale refresh)
  const [tabActivatedAt, setTabActivatedAt] = useState<Record<Tab, number>>({
    agents: Date.now(),
    projects: 0,
    conversations: 0,
    analytics: 0,
    ports: 0,
    contrib: 0,
    command: 0,
    docs: 0,
    settings: 0
  });

  // Mark tab as visited and update activation time
  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      return new Set([...prev, activeTab]);
    });
    setTabActivatedAt((prev) => ({
      ...prev,
      [activeTab]: Date.now()
    }));
  }, [activeTab]);

  const toggleHidePort = useCallback((port: number) => {
    setHiddenPorts((prev) => {
      const next = new Set(prev);
      if (next.has(port)) next.delete(port);
      else next.add(port);
      return next;
    });
  }, []);

  const bulkHidePorts = useCallback((portsToHide: number[]) => {
    setHiddenPorts((prev) => {
      const next = new Set(prev);
      for (const p of portsToHide) next.add(p);
      return next;
    });
  }, []);

  const clearHiddenPorts = useCallback(() => {
    setHiddenPorts(new Set());
  }, []);

  // Show temporary message
  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2000);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "?":
          setShowHelp((prev) => !prev);
          break;
        case "p":
          setPaused(!paused);
          showMessage(paused ? "Resumed" : "Paused");
          break;
        case "r":
          refresh();
          showMessage("Refreshing...");
          break;
        case "1":
          setActiveTab("agents");
          break;
        case "2":
          setActiveTab("projects");
          break;
        case "3":
          setActiveTab("conversations");
          break;
        case "4":
          setActiveTab("analytics");
          break;
        case "5":
          setActiveTab("contrib");
          break;
        case "6":
          setActiveTab("command");
          break;
        case "7":
          setActiveTab("docs");
          break;
        case "8":
          setActiveTab("settings");
          break;
        case "Escape":
          setShowHelp(false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paused, setPaused, refresh, showMessage]);

  const dirtyRepos = repos.filter((r) => r.dirty).length;
  const visiblePortsCount = ports.filter(
    (p) => !hiddenPorts.has(p.port)
  ).length;

  // If active tab is hidden, switch to agents
  useEffect(() => {
    if (hiddenTabs.has(activeTab as HideableTab)) {
      setActiveTab("agents");
    }
  }, [hiddenTabs, activeTab]);

  return (
    <LoadingProvider>
      <DataProvider>
        <ConversationProvider>
          <AppInner
            connected={connected}
            repos={repos}
            agents={agents}
            ports={ports}
            hiddenTabs={hiddenTabs}
            hiddenPorts={hiddenPorts}
            toggleHidePort={toggleHidePort}
            bulkHidePorts={bulkHidePorts}
            clearHiddenPorts={clearHiddenPorts}
            toggleTabVisibility={toggleTabVisibility}
            hookSessions={hookSessions}
            managedSessions={managedSessions}
            recentToolUsages={recentToolUsages}
            activityEvents={activityEvents}
            sessionTokens={sessionTokens}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            visitedTabs={visitedTabs}
            tabActivatedAt={tabActivatedAt}
            visiblePortsCount={visiblePortsCount}
            dirtyRepos={dirtyRepos}
            paused={paused}
            setPaused={setPaused}
            refresh={refresh}
            message={message}
            showMessage={showMessage}
            showHelp={showHelp}
            setShowHelp={setShowHelp}
          />
        </ConversationProvider>
      </DataProvider>
    </LoadingProvider>
  );
}

// Inner component that can use LoadingContext
function AppInner({
  connected,
  repos,
  agents,
  ports,
  hiddenTabs,
  hiddenPorts,
  toggleHidePort,
  bulkHidePorts,
  clearHiddenPorts,
  toggleTabVisibility,
  hookSessions,
  managedSessions,
  recentToolUsages,
  activityEvents,
  sessionTokens,
  activeTab,
  setActiveTab,
  visitedTabs,
  tabActivatedAt,
  visiblePortsCount,
  dirtyRepos,
  paused,
  setPaused,
  refresh,
  message,
  showMessage,
  showHelp,
  setShowHelp
}: {
  connected: boolean;
  repos: import("./api/types").RepoStatus[];
  agents: import("./api/types").AgentProcess[];
  ports: import("./api/types").ListeningPort[];
  hiddenTabs: Set<"ports">;
  hiddenPorts: Set<number>;
  toggleHidePort: (port: number) => void;
  bulkHidePorts: (ports: number[]) => void;
  clearHiddenPorts: () => void;
  toggleTabVisibility: (tab: "ports") => void;
  hookSessions: import("./api/types").HookSession[];
  managedSessions: import("./api/types").ManagedSession[];
  recentToolUsages: import("./api/types").ToolUsage[];
  activityEvents: import("./api/types").ActivityEvent[];
  sessionTokens: Record<
    string,
    { inputTokens: number; outputTokens: number; turnCount: number }
  >;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  visitedTabs: Set<Tab>;
  tabActivatedAt: Record<Tab, number>;
  visiblePortsCount: number;
  dirtyRepos: number;
  paused: boolean;
  setPaused: (p: boolean) => void;
  refresh: () => void;
  message: string | null;
  showMessage: (m: string) => void;
  showHelp: boolean;
  setShowHelp: (s: boolean) => void;
}) {
  const { loadingTabs } = useLoading();

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Header
        connected={connected}
        repoCount={repos.length}
        agentCount={agents.length}
        loadingTabs={loadingTabs}
      />

      {/* Tab Navigation with Controls */}
      <div className="container mx-auto px-4 pt-4">
        <div className="flex items-center justify-between border-b border-gray-700">
          <div
            className="flex gap-1 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {/* Group 1: Monitoring */}
            <button
              onClick={() => setActiveTab("agents")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === "agents"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Agents
              {agents.length > 0 && (
                <span
                  className="px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full"
                  title={`${agents.length} running agent${agents.length !== 1 ? "s" : ""}`}
                >
                  {agents.length}
                </span>
              )}
            </button>
            {!hiddenTabs.has("ports") && (
              <button
                onClick={() => setActiveTab("ports")}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === "ports"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-300"
                }`}
              >
                Ports
                {visiblePortsCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full"
                    title="Open ports from development servers"
                  >
                    {visiblePortsCount}
                  </span>
                )}
              </button>
            )}

            {/* Separator */}
            <div className="w-px bg-gray-600 mx-2 my-1 shrink-0" />

            {/* Group 2: Analysis & Contribution */}
            <button
              onClick={() => setActiveTab("projects")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === "projects"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Projects
              {dirtyRepos > 0 && (
                <span
                  className="px-1.5 py-0.5 text-xs bg-yellow-600 text-white rounded-full"
                  title="Repositories with uncommitted changes"
                >
                  {dirtyRepos} dirty
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("conversations")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "conversations"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Conversations
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "analytics"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab("contrib")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "contrib"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Share
            </button>
            <button
              onClick={() => setActiveTab("command")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "command"
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Command
            </button>

            {/* Separator */}
            <div className="w-px bg-gray-600 mx-2 my-1 shrink-0" />

            {/* Group 3: Reference & Settings */}
            <button
              onClick={() => setActiveTab("docs")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "docs"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Docs
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "settings"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              Settings
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 pb-2">
            {message && (
              <span className="text-xs text-yellow-400 animate-pulse">
                {message}
              </span>
            )}
            <button
              onClick={() => {
                refresh();
                showMessage("Refreshing...");
              }}
              className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
              title="Refresh (r)"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            <button
              onClick={() => {
                setPaused(!paused);
                showMessage(paused ? "Resumed" : "Paused");
              }}
              className={`p-1.5 rounded ${
                paused
                  ? "bg-yellow-600 hover:bg-yellow-500 text-white"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              }`}
              title="Pause/Resume (p)"
            >
              {paused ? (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-xs font-bold"
              title="Keyboard shortcuts (?)"
            >
              ?
            </button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6">
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

        {/* Heavy panes: lazy load on first visit, keep mounted to preserve state */}
        {visitedTabs.has("projects") && (
          <div className={activeTab === "projects" ? "" : "hidden"}>
            <ProjectsPane
              repos={repos}
              isActive={activeTab === "projects"}
              activatedAt={tabActivatedAt.projects}
            />
          </div>
        )}

        {visitedTabs.has("conversations") && (
          <div className={activeTab === "conversations" ? "" : "hidden"}>
            <ConversationsPane
              onNavigateToTab={(tab) => setActiveTab(tab as Tab)}
              isActive={activeTab === "conversations"}
              activatedAt={tabActivatedAt.conversations}
            />
          </div>
        )}

        {visitedTabs.has("analytics") && (
          <div className={activeTab === "analytics" ? "" : "hidden"}>
            <AnalyticsPane
              onNavigateToConversations={() => setActiveTab("conversations")}
              isActive={activeTab === "analytics"}
              activatedAt={tabActivatedAt.analytics}
              hookSessions={hookSessions}
              recentToolUsages={recentToolUsages}
              sessionTokens={sessionTokens}
            />
          </div>
        )}

        {activeTab === "ports" && (
          <PortsPane
            ports={ports}
            hiddenPorts={hiddenPorts}
            onToggleHide={toggleHidePort}
            onBulkHide={bulkHidePorts}
            onClearHidden={clearHiddenPorts}
          />
        )}

        {activeTab === "contrib" && (
          <ContribPane onNavigateToTab={(tab) => setActiveTab(tab as Tab)} />
        )}

        {activeTab === "command" && (
          <CommandCenterPane managedSessions={managedSessions} />
        )}

        {activeTab === "docs" && <DocumentationPane />}

        {activeTab === "settings" && (
          <SettingsPane
            hiddenTabs={hiddenTabs}
            onToggleTabVisibility={toggleTabVisibility}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-6 mt-8 border-t border-gray-800">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>Agentwatch - Monitor & share AI coding agent activity</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/nickmvincent/agentwatch/blob/main/docs/data-sources.md"
              target="_blank"
              rel="noreferrer"
              className="hover:text-gray-300"
            >
              Data & Privacy
            </a>
            <a
              href="https://github.com/nickmvincent/agentwatch"
              target="_blank"
              rel="noreferrer"
              className="hover:text-gray-300"
            >
              GitHub
            </a>
            <a
              href="https://github.com/nickmvincent/agentwatch/issues"
              target="_blank"
              rel="noreferrer"
              className="hover:text-gray-300"
            >
              Report Issue
            </a>
          </div>
        </div>
      </footer>

      {/* Help Modal */}
      {showHelp && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-cyan-400 mb-4">
              Keyboard Shortcuts
            </h2>
            <div className="space-y-2 text-sm">
              <div className="text-gray-400 font-medium mt-2">Navigation</div>
              <div className="flex justify-between">
                <span className="text-yellow-400">1-8</span>
                <span className="text-gray-300">Switch tabs</span>
              </div>

              <div className="text-gray-400 font-medium mt-4">Actions</div>
              <div className="flex justify-between">
                <span className="text-yellow-400">r</span>
                <span className="text-gray-300">Refresh data</span>
              </div>
              <div className="flex justify-between">
                <span className="text-yellow-400">p</span>
                <span className="text-gray-300">Pause/resume updates</span>
              </div>
              <div className="flex justify-between">
                <span className="text-yellow-400">?</span>
                <span className="text-gray-300">Toggle this help</span>
              </div>
              <div className="flex justify-between">
                <span className="text-yellow-400">Esc</span>
                <span className="text-gray-300">Close dialogs</span>
              </div>
            </div>
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowHelp(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
