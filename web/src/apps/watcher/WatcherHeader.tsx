/**
 * Watcher Header - Extended header with sandbox status.
 */

import { useEffect, useState } from "react";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "../../components/ui/SelfDocumentingSection";

interface SandboxStatus {
  docker: {
    installed: boolean;
    running: boolean;
    version: string | null;
  };
  image: {
    exists: boolean;
    imageId: string | null;
  };
  script: {
    installed: boolean;
    executable: boolean;
  };
  ready: boolean;
}

interface WatcherHeaderProps {
  connected: boolean;
  repoCount: number;
  agentCount: number;
  sessionCount: number;
}

const API_BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/\/api$/, "")
  : "";
const ANALYZER_URL = "http://localhost:8421";

export function WatcherHeader({
  connected,
  repoCount,
  agentCount,
  sessionCount
}: WatcherHeaderProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus | null>(
    null
  );

  // Check sandbox status on mount
  useEffect(() => {
    const checkSandbox = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sandbox/status`);
        if (res.ok) {
          const data = await res.json();
          setSandboxStatus(data);
        }
      } catch {
        // Sandbox endpoint might not be available
      }
    };

    checkSandbox();
    // Refresh every 30 seconds
    const interval = setInterval(checkSandbox, 30000);
    return () => clearInterval(interval);
  }, []);

  const openAnalyzer = () => {
    window.open(ANALYZER_URL, "_blank");
  };

  return (
    <SelfDocumentingSection
      componentId="watcher.global.header"
      visible={showSelfDocs}
    >
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">Agentwatch Watcher</h1>
            <span
              className={`px-2 py-1 rounded text-xs ${
                connected
                  ? "bg-green-900 text-green-300"
                  : "bg-red-900 text-red-300"
              }`}
            >
              {connected ? "Connected" : "Disconnected"}
            </span>

            {/* Sandbox Status Indicator */}
            {sandboxStatus && <SandboxIndicator status={sandboxStatus} />}
          </div>

          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex items-center gap-3 text-gray-400 text-sm">
              <span title="Active hook sessions">{sessionCount} sessions</span>
              <span>{agentCount} agents</span>
              <span>{repoCount} repos</span>
            </div>

            {/* Open Analyzer Button */}
            <button
              onClick={openAnalyzer}
              className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-gray-700 hover:bg-gray-600 text-gray-300"
              title="Open Analyzer dashboard"
            >
              Open Analyzer
            </button>
          </div>
        </div>
      </header>
    </SelfDocumentingSection>
  );
}

function SandboxIndicator({ status }: { status: SandboxStatus }) {
  const [expanded, setExpanded] = useState(false);

  // Don't show if sandbox is not configured
  if (!status.docker.installed && !status.script.installed) {
    return null;
  }

  const getStatusColor = () => {
    if (status.ready) return "bg-green-900 text-green-300";
    if (status.docker.running && status.image.exists)
      return "bg-yellow-900 text-yellow-300";
    return "bg-gray-700 text-gray-400";
  };

  const getStatusText = () => {
    if (status.ready) return "Sandbox Ready";
    if (!status.docker.installed) return "Docker Not Installed";
    if (!status.docker.running) return "Docker Not Running";
    if (!status.image.exists) return "Image Not Built";
    if (!status.script.installed) return "Script Missing";
    return "Sandbox Partial";
  };

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`px-2 py-1 rounded text-xs flex items-center gap-1.5 ${getStatusColor()}`}
        title="Click for sandbox details"
      >
        {status.ready ? "🔒" : "⚠️"} {getStatusText()}
      </button>

      {expanded && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 p-3 text-xs">
          <h4 className="font-medium text-white mb-2">Sandbox Status</h4>
          <div className="space-y-1.5">
            <StatusRow
              label="Docker"
              ok={status.docker.running}
              detail={status.docker.version || "Not installed"}
            />
            <StatusRow
              label="Image"
              ok={status.image.exists}
              detail={status.image.imageId || "Not built"}
            />
            <StatusRow
              label="Script"
              ok={status.script.installed && status.script.executable}
              detail={status.script.installed ? "Installed" : "Not installed"}
            />
          </div>
          {!status.ready && (
            <p className="mt-2 text-gray-500 text-[10px]">
              Run{" "}
              <code className="bg-gray-700 px-1 rounded">aw sandbox setup</code>{" "}
              to configure
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusRow({
  label,
  ok,
  detail
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={ok ? "text-green-400" : "text-gray-500"}>
          {detail}
        </span>
        <span
          className={`w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-gray-600"}`}
        />
      </div>
    </div>
  );
}
