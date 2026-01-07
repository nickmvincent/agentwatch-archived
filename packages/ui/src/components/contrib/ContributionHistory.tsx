/**
 * ContributionHistory - Display contribution history when available.
 */

import type { ContributionHistoryEntry } from "../../adapters/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "../SelfDocumentingSection";

export interface ContributionHistoryProps {
  entries: ContributionHistoryEntry[];
}

export function ContributionHistory({ entries }: ContributionHistoryProps) {
  if (entries.length === 0) return null;
  const showSelfDocs = useSelfDocumentingVisible();

  // Calculate totals
  const totalSessions = entries.reduce((sum, e) => sum + e.sessionCount, 0);
  const lastEntry = entries[entries.length - 1];
  const firstContribution = lastEntry ? new Date(lastEntry.createdAt) : null;

  return (
    <SelfDocumentingSection
      title="Contribution history"
      componentId="static.share.contribution-history"
      notes={["Shows recent export destinations and counts."]}
      visible={showSelfDocs}
    >
      <div className="p-3 bg-gray-700/30 rounded space-y-3">
        <div className="text-sm font-medium text-white">
          Contribution History
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-gray-800 rounded">
            <div className="text-lg font-bold text-blue-400">
              {entries.length}
            </div>
            <div className="text-[10px] text-gray-500">Uploads</div>
          </div>
          <div className="p-2 bg-gray-800 rounded">
            <div className="text-lg font-bold text-green-400">
              {totalSessions}
            </div>
            <div className="text-[10px] text-gray-500">Sessions</div>
          </div>
          <div className="p-2 bg-gray-800 rounded">
            <div className="text-sm font-bold text-purple-400">
              {firstContribution?.toLocaleDateString([], {
                month: "short",
                day: "numeric"
              }) || "-"}
            </div>
            <div className="text-[10px] text-gray-500">First</div>
          </div>
        </div>

        {/* Recent entries */}
        {entries.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] text-gray-500">
              Recent contributions
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1">
              {entries.slice(0, 5).map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-1.5 bg-gray-800 rounded text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1 py-0.5 rounded text-[10px] ${
                        entry.destination.startsWith("huggingface")
                          ? "bg-orange-900/50 text-orange-300"
                          : "bg-gray-600 text-gray-300"
                      }`}
                    >
                      {entry.destination.startsWith("huggingface")
                        ? "HF"
                        : "Local"}
                    </span>
                    <span className="text-gray-300">
                      {entry.sessionCount} sessions
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">
                      {new Date(entry.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric"
                      })}
                    </span>
                    {entry.url && (
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SelfDocumentingSection>
  );
}
