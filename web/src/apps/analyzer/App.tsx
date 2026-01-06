/**
 * Analyzer App - Full analysis dashboard.
 *
 * Tabs: Conversations | Analytics | Projects | Share | Docs | Settings
 */

import { useEffect, useState } from "react";
import { AnalyticsPane } from "../../components/AnalyticsPane";
import { ContribPane } from "../../components/ContribPane";
import { ConversationsPane } from "../../components/ConversationsPane";
import { DocumentationPane } from "../../components/DocumentationPane";
import { Header } from "../../components/Header";
import { ProjectsPane } from "../../components/ProjectsPane";
import { SettingsPane } from "../../components/SettingsPane";
import { ConversationProvider } from "../../context/ConversationContext";
import { DataProvider } from "../../context/DataProvider";
import { LoadingProvider } from "../../context/LoadingContext";
import { AgentStatusWidget } from "./AgentStatusWidget";

type Tab =
  | "sessions"
  | "analytics"
  | "projects"
  | "share"
  | "docs"
  | "settings";

type HideableTab = "ports";

const API_BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/\/api$/, "")
  : "";
const WATCHER_URL = "http://localhost:8420";

function AnalyzerApp() {
  const [activeTab, setActiveTab] = useState<Tab>("sessions");
  const [watcherConnected, setWatcherConnected] = useState(false);
  const [hiddenTabs, setHiddenTabs] = useState<Set<HideableTab>>(new Set());

  // Check watcher connection
  useEffect(() => {
    const checkWatcher = async () => {
      try {
        const res = await fetch(`${WATCHER_URL}/api/status`);
        setWatcherConnected(res.ok);
      } catch {
        setWatcherConnected(false);
      }
    };

    checkWatcher();
    const interval = setInterval(checkWatcher, 30000);
    return () => clearInterval(interval);
  }, []);

  // Send heartbeat to analyzer server
  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        await fetch(`${API_BASE}/api/heartbeat`, { method: "POST" });
      } catch {
        // Ignore heartbeat failures
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(interval);
  }, []);

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
          setActiveTab("sessions");
          break;
        case "2":
          setActiveTab("analytics");
          break;
        case "3":
          setActiveTab("projects");
          break;
        case "4":
          setActiveTab("share");
          break;
        case "5":
          setActiveTab("docs");
          break;
        case "6":
          setActiveTab("settings");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "sessions", label: "Conversations" },
    { id: "analytics", label: "Analytics" },
    { id: "projects", label: "Projects" },
    { id: "share", label: "Share" },
    { id: "docs", label: "Docs" },
    { id: "settings", label: "Settings" }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Header connected={watcherConnected} repoCount={0} agentCount={0} />

      {!watcherConnected && (
        <div className="bg-yellow-900/50 border-b border-yellow-700 px-4 py-2 text-sm text-yellow-200">
          Watcher not running. Start with:{" "}
          <code className="bg-yellow-800 px-1 rounded">aw watcher start</code>
        </div>
      )}

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
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "sessions" && <ConversationsPane />}
        {activeTab === "analytics" && <AnalyticsPane />}
        {activeTab === "projects" && <ProjectsPane repos={[]} />}
        {activeTab === "share" && (
          <ContribPane onNavigateToTab={(tab) => setActiveTab(tab as Tab)} />
        )}
        {activeTab === "docs" && <DocumentationPane />}
        {activeTab === "settings" && (
          <SettingsPane
            hiddenTabs={hiddenTabs}
            onToggleTabVisibility={(tab) => {
              setHiddenTabs((prev) => {
                const next = new Set(prev);
                if (next.has(tab)) {
                  next.delete(tab);
                } else {
                  next.add(tab);
                }
                return next;
              });
            }}
          />
        )}
      </main>

      {/* Floating agent status widget - shows when watcher is connected */}
      <AgentStatusWidget />
    </div>
  );
}

export default function AnalyzerAppWrapper() {
  return (
    <LoadingProvider>
      <DataProvider>
        <ConversationProvider>
          <AnalyzerApp />
        </ConversationProvider>
      </DataProvider>
    </LoadingProvider>
  );
}
