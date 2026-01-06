import { useEffect, useMemo, useState } from "react";
import type { ListeningPort, Project } from "../api/types";
import { useData } from "../context/DataProvider";

interface PortsPaneProps {
  ports: ListeningPort[];
  hiddenPorts: Set<number>;
  onToggleHide: (port: number) => void;
  onBulkHide?: (ports: number[]) => void;
  onClearHidden?: () => void;
}

const PORT_CATEGORIES: Record<number, string> = {
  3000: "React/Next.js/Rails",
  3001: "React/Next.js",
  3002: "React/Next.js",
  4000: "GraphQL/Remix",
  4200: "Angular",
  4321: "Astro",
  4322: "Astro",
  5000: "Flask/Python",
  5001: "Flask/Python",
  5173: "Vite",
  5174: "Vite",
  5555: "Prisma Studio",
  6006: "Storybook",
  8000: "Django/Python",
  8080: "Generic HTTP",
  8081: "Generic HTTP",
  8420: "Agentwatch",
  8787: "Wrangler/CF",
  8888: "Jupyter",
  9000: "PHP/Generic",
  9229: "Node Debug",
  9292: "Ruby/Rack",
  19000: "Expo",
  19001: "Expo",
  19002: "Expo DevTools",
  24678: "Vite HMR"
};

function categorizePort(port: number): string | null {
  return PORT_CATEGORIES[port] ?? null;
}

function formatBindAddress(addr: string): string {
  if (addr === "*" || addr === "0.0.0.0") return "all";
  if (addr === "::") return "all (v6)";
  if (addr === "127.0.0.1" || addr === "::1") return "localhost";
  return addr;
}

function formatAge(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diff = diffMs / 1000;
  if (diff < 0) return "now";
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function formatCwd(cwd: string | undefined): string | null {
  if (!cwd) return null;
  // Get last folder name from path
  const parts = cwd.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : null;
}

export function PortsPane({
  ports,
  hiddenPorts,
  onToggleHide,
  onBulkHide,
  onClearHidden
}: PortsPaneProps) {
  const { getProjects } = useData();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    getProjects().then(setProjects).catch(console.error);
  }, [getProjects]);

  // Match port cwd to projects
  const getProjectForPort = useMemo(() => {
    return (cwd: string | undefined): Project | null => {
      if (!cwd) return null;
      // Normalize paths for comparison
      const normalizedCwd = cwd.replace(/\/$/, "");
      for (const project of projects) {
        for (const path of project.paths) {
          const normalizedPath = path.replace(/\/$/, "").replace(/^~/, "");
          if (
            normalizedCwd === normalizedPath ||
            normalizedCwd.startsWith(normalizedPath + "/") ||
            normalizedCwd.endsWith("/" + normalizedPath) ||
            normalizedCwd.includes("/" + normalizedPath + "/")
          ) {
            return project;
          }
        }
      }
      return null;
    };
  }, [projects]);

  const visiblePorts = ports.filter((p) => !hiddenPorts.has(p.port));
  const hiddenPortsList = ports.filter((p) => hiddenPorts.has(p.port));
  const sortedPorts = [...visiblePorts].sort((a, b) => a.port - b.port);
  const sortedHiddenPorts = [...hiddenPortsList].sort(
    (a, b) => a.port - b.port
  );
  const agentLinked = visiblePorts.filter((p) => p.agent_label).length;
  const projectLinked = visiblePorts.filter((p) => getProjectForPort(p.cwd)).length;

  // Bulk hide helpers
  const portsOver10000 = visiblePorts
    .filter((p) => p.port >= 10000)
    .map((p) => p.port);
  const portsWithoutAgent = visiblePorts
    .filter((p) => !p.agent_label)
    .map((p) => p.port);
  const portsWithoutCategory = visiblePorts
    .filter((p) => !categorizePort(p.port))
    .map((p) => p.port);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">
            Listening Ports
            <span className="ml-2 text-sm text-gray-400">
              ({visiblePorts.length}
              {hiddenPortsList.length > 0
                ? ` visible, ${hiddenPortsList.length} hidden`
                : " total"}
              )
            </span>
          </h2>
          <div className="flex gap-3">
            {projectLinked > 0 && (
              <span className="text-sm text-yellow-400">
                {projectLinked} project-linked
              </span>
            )}
            {agentLinked > 0 && (
              <span className="text-sm text-green-400">
                {agentLinked} agent-linked
              </span>
            )}
          </div>
        </div>

        {/* Info banner */}
        <details className="mt-2 text-xs text-gray-400">
          <summary className="cursor-pointer hover:text-gray-300">
            ℹ️ About this data
          </summary>
          <div className="mt-2 p-3 bg-gray-700/50 rounded space-y-1">
            <p>
              <strong>Source:</strong> Real-time port scanning via{" "}
              <code className="bg-gray-800 px-1 rounded">lsof</code> (every few
              seconds)
            </p>
            <p>
              <strong>Agent linking:</strong> Ports are matched to detected
              agents by process ID
            </p>
            <p>
              <strong>Categories:</strong> Common dev ports (React, Vite,
              Django, etc.) are auto-labeled
            </p>
            <p>
              <strong>Hidden ports:</strong> Click the hide button to filter out
              ports; settings persist in config.toml
            </p>
          </div>
        </details>

        {/* Bulk hide controls */}
        {onBulkHide && visiblePorts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="text-gray-500 py-1">Quick hide:</span>
            {portsOver10000.length > 0 && (
              <button
                onClick={() => onBulkHide(portsOver10000)}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                title={`Hide ports: ${portsOver10000.join(", ")}`}
              >
                ≥10000 ({portsOver10000.length})
              </button>
            )}
            {portsWithoutAgent.length > 0 &&
              portsWithoutAgent.length < visiblePorts.length && (
                <button
                  onClick={() => onBulkHide(portsWithoutAgent)}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                  title="Keep only agent-linked ports"
                >
                  Non-agent ({portsWithoutAgent.length})
                </button>
              )}
            {portsWithoutCategory.length > 0 &&
              portsWithoutCategory.length < visiblePorts.length && (
                <button
                  onClick={() => onBulkHide(portsWithoutCategory)}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                  title="Keep only categorized dev ports"
                >
                  Uncategorized ({portsWithoutCategory.length})
                </button>
              )}
            {hiddenPortsList.length > 0 && onClearHidden && (
              <button
                onClick={onClearHidden}
                className="px-2 py-1 bg-gray-700 hover:bg-amber-700 text-amber-400 rounded transition-colors ml-auto"
                title="Show all hidden ports"
              >
                Show all ({hiddenPortsList.length})
              </button>
            )}
          </div>
        )}
      </div>
      <div className="overflow-auto max-h-96">
        {sortedPorts.length === 0 ? (
          <div className="px-4 py-8 text-gray-500 text-center">
            No listening ports detected
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-750 text-gray-400">
              <tr>
                <th className="text-left px-4 py-2">Port</th>
                <th className="text-left px-4 py-2">Bind</th>
                <th className="text-left px-4 py-2">Process</th>
                <th className="text-left px-4 py-2">Project</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Agent</th>
                <th className="text-left px-4 py-2">Up</th>
                <th className="text-left px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sortedPorts.map((port) => {
                const category = categorizePort(port.port);
                const matchedProject = getProjectForPort(port.cwd);
                const folderName = formatCwd(port.cwd);
                const isIPv6 = port.protocol === "tcp6";
                const portUrl = `http://localhost:${port.port}`;
                return (
                  <tr
                    key={port.port}
                    className={`border-t border-gray-700 hover:bg-gray-750 ${
                      port.agent_label ? "bg-green-900/10" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-mono">
                      <a
                        href={portUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`hover:underline ${port.agent_label ? "text-green-400" : "text-white"}`}
                        title={`Open ${portUrl}`}
                      >
                        {port.port}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gray-400">
                      {formatBindAddress(port.bind_address)}
                      {isIPv6 && (
                        <span
                          className="ml-1 text-xs text-cyan-500"
                          title="IPv6"
                        >
                          v6
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-blue-400">
                      {port.process_name}
                      <span className="text-gray-500 ml-1">({port.pid})</span>
                    </td>
                    <td
                      className="px-4 py-2"
                      title={port.cwd || undefined}
                    >
                      {matchedProject ? (
                        <span className="text-yellow-400 font-medium">
                          {matchedProject.name}
                        </span>
                      ) : folderName ? (
                        <span className="text-gray-400">{folderName}</span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-purple-400">
                      {category || <span className="text-gray-600">-</span>}
                    </td>
                    <td className="px-4 py-2">
                      {port.agent_label ? (
                        <span className="text-green-400 font-medium">
                          {port.agent_label}
                        </span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-400">
                      {formatAge(port.first_seen)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => onToggleHide(port.port)}
                        className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-colors text-xs"
                        title="Hide this port"
                      >
                        ⊘
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Hidden ports section */}
      {sortedHiddenPorts.length > 0 && (
        <details className="border-t border-gray-700">
          <summary className="px-4 py-2 text-sm text-gray-500 hover:text-gray-400 cursor-pointer hover:bg-gray-750 transition-colors">
            {sortedHiddenPorts.length} hidden port
            {sortedHiddenPorts.length > 1 ? "s" : ""}
          </summary>
          <div className="px-4 py-2 flex flex-wrap gap-2 bg-gray-850">
            {sortedHiddenPorts.map((port) => (
              <button
                key={port.port}
                onClick={() => onToggleHide(port.port)}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 rounded transition-colors"
                title="Show this port"
              >
                <span className="font-mono">{port.port}</span>
                <span className="text-gray-500">({port.process_name})</span>
                <span>◉</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
