import { useRef, useState } from "react";
import type {
  Conversation,
  EnrichmentListItem,
  FeedbackType
} from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

// Helper to format timestamps
function formatTime(ts: number): string {
  const date = new Date(ts > 1e12 ? ts : ts * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
}

// Quality score color
function getQualityColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

// Task type badge color
function getTaskTypeColor(taskType: string): string {
  switch (taskType) {
    case "feature":
      return "bg-blue-600";
    case "bugfix":
      return "bg-red-600";
    case "refactor":
      return "bg-purple-600";
    case "test":
      return "bg-green-600";
    case "docs":
      return "bg-yellow-600";
    case "config":
      return "bg-gray-600";
    case "exploration":
      return "bg-cyan-600";
    default:
      return "bg-gray-500";
  }
}

// Extract project name from path (last 2 components or just last)
export function getProjectName(path: string | null | undefined): string {
  if (!path) return "Unknown Project";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "Unknown Project";
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1];
}

// Get data source label from match type
function getDataSourceLabel(matchType: string | undefined): {
  label: string;
  color: string;
} {
  switch (matchType) {
    case "exact":
      return { label: "Full", color: "text-green-400" };
    case "confident":
      return { label: "Linked", color: "text-yellow-400" };
    case "uncertain":
      return { label: "Linked", color: "text-orange-400" };
    case "unmatched":
      return { label: "Partial", color: "text-gray-500" };
    default:
      return { label: "", color: "text-gray-500" };
  }
}

export interface ConversationCardProps {
  conversation: Conversation;
  enrichment?: EnrichmentListItem | null;
  customName?: string;
  isSelected?: boolean;
  onSelect?: () => void;
  onFeedbackClick?: (feedback: FeedbackType) => void;
  onNameEdit?: (name: string) => Promise<void>;
  compact?: boolean;
}

export function ConversationCard({
  conversation,
  enrichment,
  customName,
  isSelected = false,
  onSelect,
  onFeedbackClick,
  onNameEdit,
  compact = false
}: ConversationCardProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const selfDocs = {
    title: "Conversation Card",
    componentId: "analyzer.conversations.card",
    reads: [
      {
        path: "GET /api/contrib/correlated",
        description: "Conversation summary + transcript linkage"
      },
      {
        path: "GET /api/enrichments",
        description: "Enrichment summary for quality/task tags"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts"],
    notes: ["Card content is derived from correlated session metadata."]
  };
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const feedback = enrichment?.feedback;
  const quality = enrichment?.quality_score;
  const taskType = enrichment?.task_type;
  const projectName = getProjectName(conversation.cwd);
  const dataSource = getDataSourceLabel(conversation.match_type);
  const toolCount =
    conversation.tool_count || conversation.hook_session?.tool_count || 0;
  const displayName = customName || projectName;

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingName(true);
    setNameValue(customName || "");
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleSaveName = async () => {
    if (onNameEdit) {
      await onNameEdit(nameValue.trim());
    }
    setIsEditingName(false);
    setNameValue("");
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setNameValue("");
  };

  if (compact) {
    // Compact variant for inline display
    return (
      <SelfDocumentingSection {...selfDocs} visible={showSelfDocs} compact>
        <div
          onClick={onSelect}
          className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
            isSelected ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium truncate ${customName ? "text-blue-300" : "text-white"}`}
              >
                {displayName}
              </span>
              <span className="text-xs text-gray-400">
                {formatTime(conversation.start_time)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{conversation.agent || "agent"}</span>
              {dataSource.label && (
                <>
                  <span className="text-gray-600">•</span>
                  <span className={dataSource.color}>{dataSource.label}</span>
                </>
              )}
            </div>
          </div>
          {quality !== undefined && (
            <span className={`text-xs font-medium ${getQualityColor(quality)}`}>
              {quality}%
            </span>
          )}
        </div>
      </SelfDocumentingSection>
    );
  }

  // Full card variant
  return (
    <SelfDocumentingSection {...selfDocs} visible={showSelfDocs} compact>
      <div
        onClick={onSelect}
        className={`group p-3 rounded cursor-pointer transition-colors ${
          isSelected ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
        }`}
      >
        {/* Conversation name row */}
        <div className="flex items-center justify-between mb-1 gap-2">
          {isEditingName ? (
            <div
              className="flex-1 flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={nameInputRef}
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                placeholder={projectName}
                className="flex-1 px-1.5 py-0.5 bg-gray-800 border border-gray-500 rounded text-sm text-white min-w-0"
              />
              <button
                onClick={handleSaveName}
                className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-400"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-1.5 py-0.5 bg-gray-600 text-white rounded text-xs hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <span
                  className={`text-sm font-medium truncate ${customName ? "text-blue-300" : "text-white"}`}
                  title={
                    customName
                      ? `${customName} (${conversation.cwd || ""})`
                      : conversation.cwd || ""
                  }
                >
                  {displayName}
                </span>
                {onNameEdit && (
                  <button
                    onClick={handleStartEdit}
                    className="p-0.5 text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100 shrink-0"
                    title="Rename conversation"
                  >
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
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {formatTime(conversation.start_time)}
              </span>
            </>
          )}
        </div>

        {/* Agent and data source row */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          {customName && (
            <>
              <span
                className="truncate max-w-[100px]"
                title={conversation.cwd || ""}
              >
                {projectName}
              </span>
              <span className="text-gray-600">•</span>
            </>
          )}
          <span>{conversation.agent || "agent"}</span>
          {dataSource.label && (
            <>
              <span className="text-gray-600">•</span>
              <span className={dataSource.color}>{dataSource.label}</span>
            </>
          )}
          {toolCount > 0 && (
            <>
              <span className="text-gray-600">•</span>
              <span>{toolCount} tools</span>
            </>
          )}
        </div>

        {/* Badges and thumbs row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {taskType && (
              <span
                className={`px-1.5 py-0.5 rounded text-xs text-white ${getTaskTypeColor(taskType)}`}
              >
                {taskType}
              </span>
            )}
            {quality !== undefined && (
              <span
                className={`text-xs font-medium ${getQualityColor(quality)}`}
              >
                {quality}%
              </span>
            )}
          </div>

          {/* Quick thumbs buttons */}
          {onFeedbackClick && (
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onFeedbackClick("positive")}
                className={`p-1 rounded text-sm ${
                  feedback === "positive"
                    ? "bg-green-600 text-white"
                    : "text-gray-400 hover:text-green-400"
                }`}
                title="Mark as positive"
              >
                +
              </button>
              <button
                onClick={() => onFeedbackClick("negative")}
                className={`p-1 rounded text-sm ${
                  feedback === "negative"
                    ? "bg-red-600 text-white"
                    : "text-gray-400 hover:text-red-400"
                }`}
                title="Mark as negative"
              >
                -
              </button>
            </div>
          )}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
