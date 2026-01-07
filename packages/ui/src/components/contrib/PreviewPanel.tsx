/**
 * PreviewPanel - Preview panel showing diff between original and redacted content.
 */

import type { PreparedSession, RedactionReport } from "../../adapters/types";
import { DiffView } from "../DiffView";
import { HELP_CONTENT, HelpIcon } from "../HelpText";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "../SelfDocumentingSection";

export interface PreviewPanelProps {
  sessions: PreparedSession[];
  previewIndex: number;
  onPreviewIndexChange: (index: number) => void;
  diffViewMode: "full" | "changes" | "original" | "raw";
  onDiffViewModeChange: (mode: "full" | "changes" | "original" | "raw") => void;
  loading: boolean;
  fieldsStripped?: Record<string, number>;
  redactionReport?: RedactionReport;
}

export function PreviewPanel({
  sessions,
  previewIndex,
  onPreviewIndexChange,
  diffViewMode,
  onDiffViewModeChange,
  loading,
  fieldsStripped,
  redactionReport
}: PreviewPanelProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const currentSession = sessions[previewIndex];

  if (loading) {
    return (
      <SelfDocumentingSection
        title="Preview panel"
        componentId="static.share.preview-panel"
        notes={["Preview content is generated from prepared sessions."]}
        visible={showSelfDocs}
      >
        <div className="bg-gray-900 rounded border border-gray-700 p-8 text-center text-gray-500">
          Preparing preview...
        </div>
      </SelfDocumentingSection>
    );
  }

  if (!sessions.length) {
    return (
      <SelfDocumentingSection
        title="Preview panel"
        componentId="static.share.preview-panel"
        notes={["Preview content is generated from prepared sessions."]}
        visible={showSelfDocs}
      >
        <div className="bg-gray-900 rounded border border-gray-700 p-8 text-center text-gray-500">
          Select sessions to preview
        </div>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection
      title="Preview panel"
      componentId="static.share.preview-panel"
      notes={[
        "Supports full diff, changes-only, original, and raw JSON modes.",
        "Field stripping and warnings are shown below the preview."
      ]}
      visible={showSelfDocs}
    >
      <div className="space-y-3">
        {/* View mode tabs + Session navigator */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(["changes", "full", "original", "raw"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onDiffViewModeChange(mode)}
                className={`px-3 py-1.5 text-xs rounded-t ${
                  diffViewMode === mode
                    ? "bg-gray-900 text-white border-t border-l border-r border-gray-600"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}
              >
                {mode === "changes"
                  ? "Changes"
                  : mode === "full"
                    ? "Full Diff"
                    : mode === "original"
                      ? "Original"
                      : "Raw JSON"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onPreviewIndexChange(Math.max(0, previewIndex - 1))
              }
              disabled={previewIndex === 0}
              className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              ←
            </button>
            <span className="text-xs text-gray-400">
              {previewIndex + 1} / {sessions.length}
            </span>
            <button
              onClick={() =>
                onPreviewIndexChange(
                  Math.min(sessions.length - 1, previewIndex + 1)
                )
              }
              disabled={previewIndex >= sessions.length - 1}
              className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              →
            </button>
            {currentSession && (
              <span className="flex items-center gap-1">
                <span
                  className={`px-1.5 py-0.5 text-xs rounded ${
                    currentSession.score >= 80
                      ? "bg-green-900/50 text-green-400"
                      : currentSession.score >= 50
                        ? "bg-yellow-900/50 text-yellow-400"
                        : "bg-red-900/50 text-red-400"
                  }`}
                >
                  Score: {currentSession.score}
                </span>
                <HelpIcon tooltip={HELP_CONTENT.privacyScore} />
              </span>
            )}
          </div>
        </div>

        {/* Diff View */}
        <div className="bg-gray-900 rounded border border-gray-700 p-3 max-h-[400px] overflow-y-auto">
          {currentSession ? (
            diffViewMode === "raw" ? (
              <div className="font-mono text-xs whitespace-pre-wrap break-words text-gray-200">
                {currentSession.rawJson ||
                  JSON.stringify(
                    JSON.parse(currentSession.previewRedacted || "{}"),
                    null,
                    2
                  )}
              </div>
            ) : diffViewMode === "original" ? (
              <div className="font-mono text-sm whitespace-pre-wrap break-words text-gray-200">
                {currentSession.previewOriginal || "No content available"}
              </div>
            ) : (
              <DiffView
                original={currentSession.previewOriginal}
                redacted={currentSession.previewRedacted}
                mode={diffViewMode}
              />
            )
          ) : (
            <div className="text-gray-500 text-sm text-center py-8">
              No preview available
            </div>
          )}
        </div>

        {/* Session quick tabs */}
        {sessions.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {sessions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => onPreviewIndexChange(idx)}
                className={`px-2 py-1 text-xs rounded ${
                  idx === previewIndex
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        )}

        {/* Stripped Fields Indicator */}
        {fieldsStripped && Object.keys(fieldsStripped).length > 0 && (
          <div className="p-2 bg-purple-900/30 border border-purple-700 rounded">
            <div className="text-xs text-purple-400 font-medium mb-1">
              Fields Stripped ({Object.keys(fieldsStripped).length})
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.keys(fieldsStripped)
                .slice(0, 10)
                .map((field, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 text-xs bg-purple-900/50 text-purple-300 rounded line-through"
                  >
                    {field}
                  </span>
                ))}
              {Object.keys(fieldsStripped).length > 10 && (
                <span className="text-xs text-purple-400">
                  +{Object.keys(fieldsStripped).length - 10} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Warnings */}
        {redactionReport && redactionReport.residueWarnings.length > 0 && (
          <div className="p-2 bg-yellow-900/30 border border-yellow-700 rounded">
            <div className="text-xs text-yellow-400 font-medium mb-1">
              Warnings ({redactionReport.residueWarnings.length})
            </div>
            <div className="text-xs text-yellow-300 space-y-0.5 max-h-20 overflow-y-auto">
              {redactionReport.residueWarnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SelfDocumentingSection>
  );
}
