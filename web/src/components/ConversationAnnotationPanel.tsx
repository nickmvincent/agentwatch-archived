import { useEffect, useMemo, useState } from "react";
import { setSessionAnnotation } from "../api/client";
import type { ManualAnnotationEnrichment, WorkflowStatus } from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

interface ConversationAnnotationPanelProps {
  componentId?: string;
  sessionId: string;
  manualAnnotation?: ManualAnnotationEnrichment | null;
  conversationName?: string | null;
  conversationNamePlaceholder?: string;
  onConversationNameSave?: (name: string | null) => Promise<void>;
  onAnnotationSaved?: (manual: ManualAnnotationEnrichment | null) => void;
}

const STORE_PATH = "~/.agentwatch/enrichments/store.json";
const NAME_STORE_PATH = "~/.agentwatch/conversation-metadata.json";

export function ConversationAnnotationPanel({
  componentId = "analyzer.conversations.annotation-panel",
  sessionId,
  manualAnnotation,
  conversationName,
  conversationNamePlaceholder,
  onConversationNameSave,
  onAnnotationSaved
}: ConversationAnnotationPanelProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const [nameValue, setNameValue] = useState(conversationName || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [feedback, setFeedback] = useState<
    ManualAnnotationEnrichment["feedback"]
  >(manualAnnotation?.feedback ?? null);
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [goalAchieved, setGoalAchieved] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number | "">("");
  const [workflowStatus, setWorkflowStatus] =
    useState<WorkflowStatus>("pending");
  const [extraDataText, setExtraDataText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFeedback(manualAnnotation?.feedback ?? null);
    setTagsInput(manualAnnotation?.userTags?.join(", ") || "");
    setNotes(manualAnnotation?.notes || "");
    setTaskDescription(manualAnnotation?.taskDescription || "");
    setGoalAchieved(
      manualAnnotation?.goalAchieved === undefined
        ? null
        : manualAnnotation.goalAchieved
    );
    setRating(manualAnnotation?.rating ?? "");
    setWorkflowStatus(manualAnnotation?.workflowStatus ?? "pending");
    setExtraDataText(
      manualAnnotation?.extraData
        ? JSON.stringify(manualAnnotation.extraData, null, 2)
        : ""
    );
  }, [manualAnnotation]);

  useEffect(() => {
    setNameValue(conversationName || "");
  }, [conversationName]);

  const lastUpdated = useMemo(() => {
    if (!manualAnnotation?.updatedAt) return null;
    return new Date(manualAnnotation.updatedAt).toLocaleString();
  }, [manualAnnotation?.updatedAt]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaveMessage(null);

    let extraData: Record<string, unknown> | undefined;
    if (extraDataText.trim()) {
      try {
        extraData = JSON.parse(extraDataText);
      } catch (err) {
        setSaving(false);
        setError("Extra data must be valid JSON.");
        return;
      }
    }

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const result = await setSessionAnnotation(sessionId, feedback, {
        notes: notes || undefined,
        userTags: tags,
        extraData,
        rating: rating === "" ? undefined : rating,
        taskDescription: taskDescription || undefined,
        goalAchieved: goalAchieved === null ? undefined : goalAchieved,
        workflowStatus
      });
      onAnnotationSaved?.(result.manual_annotation || null);
      setSaveMessage("Annotation saved.");
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save annotation."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleNameSave = async () => {
    if (!onConversationNameSave) return;
    const trimmed = nameValue.trim();
    await onConversationNameSave(trimmed ? trimmed : null);
    setIsEditingName(false);
  };

  return (
    <SelfDocumentingSection componentId={componentId} visible={showSelfDocs}>
      <div className="space-y-6">
        {onConversationNameSave && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">
                Conversation Name
              </h3>
              {!isEditingName && (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Edit
                </button>
              )}
            </div>
            {isEditingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  placeholder={
                    conversationNamePlaceholder || "Conversation name"
                  }
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                />
                <button
                  onClick={handleNameSave}
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setNameValue(conversationName || "");
                    setIsEditingName(false);
                  }}
                  className="px-3 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="text-sm text-gray-300">
                {conversationName || (
                  <span className="text-gray-500">
                    {conversationNamePlaceholder || "Unnamed"}
                  </span>
                )}
              </div>
            )}
            <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
              <span>Stored in</span>
              <code className="bg-gray-900/60 px-1 rounded">
                {NAME_STORE_PATH}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(NAME_STORE_PATH)}
                className="text-blue-400 hover:text-blue-300"
                type="button"
              >
                Copy path
              </button>
            </div>
          </div>
        )}

        <div className="border border-gray-700 rounded-lg p-4 bg-gray-800/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Annotation</h3>
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>

          {error && (
            <div className="mb-3 text-sm text-red-300 bg-red-900/30 border border-red-700 rounded p-2">
              {error}
            </div>
          )}
          {saveMessage && (
            <div className="mb-3 text-sm text-green-300 bg-green-900/30 border border-green-700 rounded p-2">
              {saveMessage}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-400 mb-2">Feedback</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFeedback("positive")}
                  className={`px-3 py-1.5 rounded text-sm ${
                    feedback === "positive"
                      ? "bg-green-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Good
                </button>
                <button
                  onClick={() => setFeedback("negative")}
                  className={`px-3 py-1.5 rounded text-sm ${
                    feedback === "negative"
                      ? "bg-red-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Bad
                </button>
                <button
                  onClick={() => setFeedback(null)}
                  className={`px-3 py-1.5 rounded text-sm ${
                    feedback === null
                      ? "bg-gray-500 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Rating
                </label>
                <select
                  value={rating}
                  onChange={(e) =>
                    setRating(
                      e.target.value ? Number.parseInt(e.target.value, 10) : ""
                    )
                  }
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                >
                  <option value="">Unrated</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Workflow Status
                </label>
                <select
                  value={workflowStatus}
                  onChange={(e) =>
                    setWorkflowStatus(e.target.value as WorkflowStatus)
                  }
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                >
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="ready_to_contribute">Ready</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  id={`goal-achieved-${sessionId}`}
                  type="checkbox"
                  checked={goalAchieved === true}
                  onChange={(e) => setGoalAchieved(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
                />
                <label
                  htmlFor={`goal-achieved-${sessionId}`}
                  className="text-sm text-gray-300"
                >
                  Goal achieved
                </label>
                {goalAchieved === false && (
                  <button
                    onClick={() => setGoalAchieved(null)}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    reset
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="performance, reliability, frontend"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated tags for organization and search.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Task / Goal Description
              </label>
              <input
                type="text"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="What was the agent trying to accomplish?"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about the session..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white min-h-[90px]"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Arbitrary JSON Data
              </label>
              <textarea
                value={extraDataText}
                onChange={(e) => setExtraDataText(e.target.value)}
                placeholder='{"risk": "low", "reviewer": "me"}'
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 min-h-[120px] font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Stored verbatim as JSON in the enrichment store for this
                session.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-700 pt-4">
            <div className="text-xs text-gray-500 flex items-center gap-2">
              Stored in{" "}
              <code className="bg-gray-900/60 px-1 rounded">{STORE_PATH}</code>
              <button
                onClick={() => navigator.clipboard.writeText(STORE_PATH)}
                className="text-blue-400 hover:text-blue-300"
                type="button"
              >
                Copy path
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-sm rounded"
            >
              {saving ? "Saving..." : "Save Annotation"}
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Privacy flags are added from the Chat view using the 🚩 control.
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
