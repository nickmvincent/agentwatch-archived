import { useEffect, useState } from "react";
import { fetchWorkflowStats, type WorkflowStats } from "../api/client";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

interface WorkflowProgressWidgetProps {
  onFilterClick?: (status: string) => void;
  refreshTrigger?: number;
}

export function WorkflowProgressWidget({
  onFilterClick,
  refreshTrigger
}: WorkflowProgressWidgetProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const selfDocs = {
    title: "Workflow Progress",
    componentId: "analyzer.conversations.workflow-widget",
    reads: [
      {
        path: "GET /api/enrichments/workflow-stats",
        description: "Workflow status totals"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts"],
    notes: ["Counts are derived from enrichment workflow status values."]
  };
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [refreshTrigger]);

  async function loadStats() {
    try {
      setLoading(true);
      const result = await fetchWorkflowStats();
      setStats(result);
    } catch (e) {
      console.error("Failed to load workflow stats:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !stats) {
    return (
      <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-500 text-sm">Loading progress...</div>
        </div>
      </SelfDocumentingSection>
    );
  }

  const reviewedCount = stats.reviewed + stats.ready_to_contribute;
  const progressPercent =
    stats.total > 0 ? Math.round((reviewedCount / stats.total) * 100) : 0;

  return (
    <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">
          Review Progress
        </h3>

        {/* Progress bar */}
        <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Stats */}
        <div className="flex justify-between text-xs text-gray-400 mb-3">
          <span>
            {reviewedCount} / {stats.total} reviewed
          </span>
          <span>{progressPercent}%</span>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => onFilterClick?.("reviewed")}
            className="flex items-center justify-between p-2 bg-gray-700/50 rounded hover:bg-gray-700 transition-colors"
          >
            <span className="text-blue-400">Reviewed</span>
            <span className="text-white font-medium">{stats.reviewed}</span>
          </button>
          <button
            onClick={() => onFilterClick?.("ready_to_contribute")}
            className="flex items-center justify-between p-2 bg-gray-700/50 rounded hover:bg-gray-700 transition-colors"
          >
            <span className="text-green-400">Ready</span>
            <span className="text-white font-medium">
              {stats.ready_to_contribute}
            </span>
          </button>
          <button
            onClick={() => onFilterClick?.("skipped")}
            className="flex items-center justify-between p-2 bg-gray-700/50 rounded hover:bg-gray-700 transition-colors"
          >
            <span className="text-gray-400">Skipped</span>
            <span className="text-white font-medium">{stats.skipped}</span>
          </button>
          <button
            onClick={() => onFilterClick?.("pending")}
            className="flex items-center justify-between p-2 bg-gray-700/50 rounded hover:bg-gray-700 transition-colors"
          >
            <span className="text-yellow-400">Pending</span>
            <span className="text-white font-medium">{stats.pending}</span>
          </button>
        </div>

        {/* Clear filter */}
        <button
          onClick={() => onFilterClick?.("all")}
          className="mt-2 w-full text-center text-xs text-gray-500 hover:text-gray-400"
        >
          Show all
        </button>
      </div>
    </SelfDocumentingSection>
  );
}
