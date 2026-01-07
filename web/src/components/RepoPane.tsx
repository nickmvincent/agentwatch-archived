import { useState } from "react";
import type { RepoStatus } from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

interface RepoPaneProps {
  repos: RepoStatus[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may not be available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-1 p-0.5 text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
      title="Copy path"
    >
      {copied ? (
        <svg
          className="w-3 h-3 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
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

function getSpecialState(repo: RepoStatus): string | null {
  if (repo.conflict) return "CONFLICT";
  if (repo.rebase) return "REBASE";
  if (repo.merge) return "MERGE";
  if (repo.cherry_pick) return "CHERRY";
  if (repo.revert) return "REVERT";
  return null;
}

export function RepoPane({ repos }: RepoPaneProps) {
  const dirtyRepos = repos.filter((r) => r.dirty);
  const cleanRepos = repos.filter((r) => !r.dirty);
  const showSelfDocs = useSelfDocumentingVisible();

  return (
    <SelfDocumentingSection
      title="Repositories"
      componentId="watcher.repos.repo-pane"
      reads={[
        { path: "GET /api/repos", description: "Repository status snapshots" },
        {
          path: "WebSocket /ws",
          description: "Repo updates (repos_update)"
        }
      ]}
      writes={[
        {
          path: "POST /api/repos/rescan",
          description: "Trigger an immediate repository rescan"
        }
      ]}
      notes={[
        "Only dirty repos are shown by default; clean repos can be included via query.",
        "Special states include conflict, rebase, merge, cherry-pick, and revert."
      ]}
      visible={showSelfDocs}
    >
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Repositories
              <span className="ml-2 text-sm text-gray-400">
                ({repos.length} monitored)
              </span>
            </h2>
            <div className="flex items-center gap-2 text-xs">
              {dirtyRepos.length > 0 && (
                <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 rounded">
                  {dirtyRepos.length} dirty
                </span>
              )}
              {cleanRepos.length > 0 && (
                <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded">
                  {cleanRepos.length} clean
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
                <strong>Source:</strong> Periodic git status checks on
                configured directories
              </p>
              <p>
                <strong>Config:</strong> Set{" "}
                <code className="bg-gray-800 px-1 rounded">
                  repos.scan_paths
                </code>{" "}
                in{" "}
                <code className="bg-gray-800 px-1 rounded">
                  ~/.agentwatch/config.toml
                </code>
              </p>
              <p>
                <strong>Shows:</strong> Dirty repos (staged, modified, untracked
                files) and special states (conflicts, rebases, merges)
              </p>
            </div>
          </details>
        </div>
        <div className="overflow-auto max-h-96">
          {dirtyRepos.length === 0 ? (
            <div className="px-4 py-8 text-gray-500 text-center">
              All repositories clean
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-750 text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Branch</th>
                  <th className="text-left px-4 py-2">Changes</th>
                  <th className="text-left px-4 py-2">Sync</th>
                  <th className="text-left px-4 py-2">Modified</th>
                </tr>
              </thead>
              <tbody>
                {dirtyRepos.map((repo) => {
                  const special = getSpecialState(repo);
                  return (
                    <tr
                      key={repo.repo_id}
                      className="group border-t border-gray-700 hover:bg-gray-750"
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center">
                          <span className="text-white font-medium">
                            {repo.name}
                          </span>
                          <CopyButton text={repo.path} />
                        </div>
                        <div
                          className="text-xs text-gray-500 truncate max-w-48"
                          title={repo.path}
                        >
                          {repo.path}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-blue-400">{repo.branch}</td>
                      <td className="px-4 py-2">
                        {repo.staged > 0 && (
                          <span
                            className="text-green-400 mr-2"
                            title="Staged changes ready to commit"
                          >
                            {repo.staged} staged
                          </span>
                        )}
                        {repo.unstaged > 0 && (
                          <span
                            className="text-yellow-400 mr-2"
                            title="Modified files not yet staged"
                          >
                            {repo.unstaged} modified
                          </span>
                        )}
                        {repo.untracked > 0 && (
                          <span
                            className="text-gray-400"
                            title="New files not tracked by git"
                          >
                            {repo.untracked} untracked
                          </span>
                        )}
                        {repo.staged === 0 &&
                          repo.unstaged === 0 &&
                          repo.untracked === 0 && (
                            <span className="text-gray-500">-</span>
                          )}
                      </td>
                      <td className="px-4 py-2">
                        {special ? (
                          <span className="text-red-400 font-bold">
                            {special}
                          </span>
                        ) : repo.ahead > 0 || repo.behind > 0 ? (
                          <span className="text-purple-400">
                            {repo.ahead > 0 && `↑${repo.ahead}`}
                            {repo.behind > 0 && ` ↓${repo.behind}`}
                          </span>
                        ) : repo.upstream_name ? (
                          <span
                            className="text-green-600"
                            title="Up to date with remote"
                          >
                            ✓
                          </span>
                        ) : (
                          <span
                            className="text-gray-600"
                            title="No remote tracking branch"
                          >
                            local
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-400">
                        {formatAge(repo.last_change_time)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
