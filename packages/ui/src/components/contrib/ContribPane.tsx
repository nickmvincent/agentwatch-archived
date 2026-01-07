/**
 * ContribPane - Main contribution interface component
 *
 * A unified component for preparing and sharing coding agent transcripts.
 * Works with both daemon API and web worker backends via the adapter interface.
 */

import type { RedactionConfig } from "@agentwatch/pre-share";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useAdapter, useBackend } from "../../adapters/context";
import type {
  BundleResult,
  FieldSchemasResult,
  PreparedSession,
  RedactionReport,
  Session
} from "../../adapters/types";
import type { ContributionHistoryEntry } from "../../adapters/types";
import { ExportSummary, InfoBox } from "../HelpText";
import { HELP_CONTENT, HelpIcon } from "../HelpText";
import { ContributionHistory } from "./ContributionHistory";
import { ContributorInfo } from "./ContributorInfo";
import { FieldSelector } from "./FieldSelector";
import { PreviewPanel } from "./PreviewPanel";
import { RedactionConfig as RedactionConfigPanel } from "./RedactionConfig";
import { Section } from "./Section";
import {
  formatSize,
  formatTime,
  getScoreColorClass,
  getSourceColorClass,
  groupSessionsByDate
} from "./utils";

// ============================================================================
// Main Component
// ============================================================================

export interface ContribPaneProps {
  /** Optional title override */
  title?: string;
  /** Initial sessions (for worker adapter that loads via file) */
  initialSessions?: Session[];
  /** Callback when sessions are updated */
  onSessionsChange?: (sessions: Session[]) => void;
  /** Custom session loader (for pages with file input) */
  sessionLoader?: ReactNode;
  /** Render prop for custom session actions (e.g., View button) */
  renderSessionActions?: (session: Session) => ReactNode;
  /** Callback when a session is clicked for viewing */
  onViewSession?: (session: Session) => void;
}

export function ContribPane({
  title = "Prepare & Share",
  initialSessions = [],
  onSessionsChange,
  sessionLoader,
  renderSessionActions,
  onViewSession
}: ContribPaneProps) {
  const backend = useBackend();
  const { hasHuggingFaceUpload, hasPersistentSettings, hasHistory } =
    useAdapter();

  // Session state
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Session list filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "score_desc" | "score_asc" | "size_desc" | "size_asc"
  >("newest");
  // Redaction config
  const [redactionConfig, setRedactionConfig] = useState<RedactionConfig>({
    redactSecrets: true,
    redactPii: true,
    redactPaths: true,
    maskCodeBlocks: false,
    customRegex: []
  });

  // Field selection
  const [fieldSchemas, setFieldSchemas] = useState<FieldSchemasResult | null>(
    null
  );
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [fieldsPresent, setFieldsPresent] = useState<Set<string>>(new Set());

  // Preview state
  const [preparedSessions, setPreparedSessions] = useState<PreparedSession[]>(
    []
  );
  const [redactionReport, setRedactionReport] =
    useState<RedactionReport | null>(null);
  const [fieldsStripped, setFieldsStripped] = useState<Record<string, number>>(
    {}
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [diffViewMode, setDiffViewMode] = useState<
    "full" | "changes" | "original" | "raw"
  >("changes");

  // Contributor info
  const [contributorId, setContributorId] = useState("");
  const [license, setLicense] = useState("CC-BY-4.0");
  const [aiPreference, setAiPreference] = useState("train-genai=ok");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [reviewedConfirmed, setReviewedConfirmed] = useState(false);

  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  const [bundleResult, setBundleResult] = useState<BundleResult | null>(null);

  // HuggingFace state
  const [hfRepoId, setHfRepoId] = useState("");
  const [hfUsername] = useState<string | null>(null);

  // Contribution history
  const [contributionHistory, setContributionHistory] = useState<
    ContributionHistoryEntry[]
  >([]);

  // UI state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["sessions", "prepare"])
  );

  // Load field schemas
  useEffect(() => {
    backend
      .getFieldSchemas()
      .then((schemas) => {
        setFieldSchemas(schemas);
        setSelectedFields(new Set(schemas.defaultSelected));
      })
      .catch(console.error);
  }, [backend]);

  // Load saved settings if available
  useEffect(() => {
    if (hasPersistentSettings && backend.loadSettings) {
      backend
        .loadSettings()
        .then((settings) => {
          if (settings.contributorId) setContributorId(settings.contributorId);
          if (settings.license) setLicense(settings.license);
          if (settings.aiPreference) setAiPreference(settings.aiPreference);
          if (settings.hfDataset) setHfRepoId(settings.hfDataset);
        })
        .catch(console.error);
    }
  }, [backend, hasPersistentSettings]);

  // Load contribution history if available
  useEffect(() => {
    if (hasHistory && backend.getHistory) {
      backend.getHistory().then(setContributionHistory).catch(console.error);
    }
  }, [backend, hasHistory]);

  // Update sessions when initialSessions changes
  useEffect(() => {
    if (initialSessions.length > 0) {
      setSessions(initialSessions);
    }
  }, [initialSessions]);

  // Notify parent of session changes
  useEffect(() => {
    onSessionsChange?.(sessions);
  }, [sessions, onSessionsChange]);

  // Live preview: update when selection or config changes
  useEffect(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setPreparedSessions([]);
      setRedactionReport(null);
      setFieldsStripped({});
      return;
    }

    const timeout = setTimeout(() => {
      updatePreview(ids);
    }, 500);

    return () => clearTimeout(timeout);
  }, [selectedIds, redactionConfig, selectedFields]);

  const updatePreview = async (sessionIds: string[]) => {
    setPreviewLoading(true);
    try {
      const fieldsToSend =
        selectedFields.size > 0 ? Array.from(selectedFields) : undefined;
      const result = await backend.prepareSessions(
        sessionIds,
        redactionConfig,
        fieldsToSend,
        {
          contributorId: contributorId || "anonymous",
          license,
          aiPreference,
          rightsConfirmed: true,
          reviewedConfirmed: true,
          rightsStatement: "I have the rights to share this content"
        }
      );
      setPreparedSessions(result.sessions);
      setRedactionReport(result.redactionReport);
      setFieldsStripped(result.fieldsStripped || {});
      if (result.fieldsPresent) {
        setFieldsPresent(new Set(result.fieldsPresent));
      }
      if (previewIndex >= result.sessions.length) {
        setPreviewIndex(0);
      }
    } catch (e) {
      console.error("Preview failed:", e);
      setPreparedSessions([]);
      setRedactionReport(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handlers
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const toggleSession = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleField = (path: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleBuildBundle = async () => {
    if (preparedSessions.length === 0) {
      setError("No sessions selected");
      return;
    }
    if (!rightsConfirmed || !reviewedConfirmed) {
      setError("Please confirm both attestations");
      return;
    }

    setExportLoading(true);
    setError(null);
    try {
      const result = await backend.buildBundle(
        Array.from(selectedIds),
        {
          contributorId: contributorId || "anonymous",
          license,
          aiPreference,
          rightsConfirmed,
          reviewedConfirmed,
          rightsStatement: "I have the rights to share this content"
        },
        redactionReport!,
        {},
        "auto"
      );
      setBundleResult(result);

      // Record contribution if history is supported
      if (hasHistory && backend.recordContribution) {
        await backend
          .recordContribution({
            bundleId: result.bundleId,
            createdAt: new Date().toISOString(),
            sessionCount: result.transcriptsCount,
            destination: "local"
          })
          .catch(console.error);
        // Refresh history
        if (backend.getHistory) {
          backend
            .getHistory()
            .then(setContributionHistory)
            .catch(console.error);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build bundle");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!bundleResult) return;
    await backend.downloadBundle(bundleResult);
  };

  const handleHFUpload = async () => {
    if (!bundleResult || !backend.uploadToHuggingFace) return;
    if (!hfRepoId) {
      setError("Please enter a HuggingFace dataset ID");
      return;
    }

    setExportLoading(true);
    try {
      const token = sessionStorage.getItem("hf_access_token");
      const result = await backend.uploadToHuggingFace(
        bundleResult,
        hfRepoId,
        token || undefined
      );
      if (result.success) {
        setError(null);

        // Record contribution
        if (hasHistory && backend.recordContribution) {
          await backend
            .recordContribution({
              bundleId: bundleResult.bundleId,
              createdAt: new Date().toISOString(),
              sessionCount: bundleResult.transcriptsCount,
              destination: `huggingface:${hfRepoId}`,
              url: result.url
            })
            .catch(console.error);
          // Refresh history
          if (backend.getHistory) {
            backend
              .getHistory()
              .then(setContributionHistory)
              .catch(console.error);
          }
        }

        alert(`Uploaded successfully: ${result.url}`);
      } else {
        setError(result.error || "Upload failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setExportLoading(false);
    }
  };

  const handleHFOAuth = async () => {
    if (!backend.startHFOAuth) return;
    try {
      const { authUrl } = await backend.startHFOAuth();
      window.open(authUrl, "_blank", "width=600,height=700");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
    }
  };

  const availableSources = useMemo(() => {
    return Array.from(new Set(sessions.map((s) => s.source))).sort();
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    let filtered = [...sessions];

    if (sourceFilter !== "all") {
      filtered = filtered.filter((session) => session.source === sourceFilter);
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((session) => {
        return (
          session.name.toLowerCase().includes(query) ||
          session.source.toLowerCase().includes(query) ||
          session.projectDir?.toLowerCase()?.includes(query) ||
          session.sourcePathHint?.toLowerCase()?.includes(query)
        );
      });
    }

    switch (sortBy) {
      case "oldest":
        filtered.sort((a, b) => a.modifiedAt - b.modifiedAt);
        break;
      case "score_desc":
        filtered.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        break;
      case "score_asc":
        filtered.sort((a, b) => (a.score ?? 1e9) - (b.score ?? 1e9));
        break;
      case "size_desc":
        filtered.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
        break;
      case "size_asc":
        filtered.sort((a, b) => (a.sizeBytes ?? 1e12) - (b.sizeBytes ?? 1e12));
        break;
      case "newest":
      default:
        filtered.sort((a, b) => b.modifiedAt - a.modifiedAt);
        break;
    }

    return filtered;
  }, [sessions, searchQuery, sourceFilter, sortBy]);

  // Group sessions by date (after filters)
  const groupedSessions = useMemo(
    () => groupSessionsByDate(filteredSessions),
    [filteredSessions]
  );

  const selectAll = () =>
    setSelectedIds(new Set(filteredSessions.map((s) => s.id)));
  const selectNone = () => setSelectedIds(new Set());

  const canBuild =
    rightsConfirmed && reviewedConfirmed && preparedSessions.length > 0;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-gray-400 mt-1">
          Select sessions, configure redaction, preview, and export.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-300 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* Step 1: Sessions */}
        <Section
          title="Select Sessions"
          step={1}
          expanded={expandedSections.has("sessions")}
          onToggle={() => toggleSection("sessions")}
          badge={
            selectedIds.size > 0 ? (
              <span className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                {selectedIds.size} selected
              </span>
            ) : undefined
          }
        >
          <div className="space-y-3">
            {/* Custom session loader (for file upload in pages) */}
            {sessionLoader}

            {/* Session list */}
            {sessions.length > 0 && (
              <>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {filteredSessions.length} session
                      {filteredSessions.length === 1 ? "" : "s"} shown
                      {filteredSessions.length !== sessions.length && (
                        <span className="text-gray-500">
                          {" "}
                          (of {sessions.length})
                        </span>
                      )}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAll}
                        className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                      >
                        Select All
                      </button>
                      <button
                        onClick={selectNone}
                        className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Search by name, source, or path..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-white"
                    />
                    <select
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                      className="px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-white"
                    >
                      <option value="all">All sources</option>
                      {availableSources.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(
                          e.target.value as
                            | "newest"
                            | "oldest"
                            | "score_desc"
                            | "score_asc"
                            | "size_desc"
                            | "size_asc"
                        )
                      }
                      className="px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-white"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="score_desc">Score high → low</option>
                      <option value="score_asc">Score low → high</option>
                      <option value="size_desc">Size large → small</option>
                      <option value="size_asc">Size small → large</option>
                    </select>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-3">
                  {Object.entries(groupedSessions).map(
                    ([date, dateSessions]) => (
                      <div key={date}>
                        <div className="text-xs text-gray-500 mb-1">{date}</div>
                        <div className="space-y-1">
                          {dateSessions.map((session) => (
                            <div
                              key={session.id}
                              className={`p-2 rounded flex items-center gap-2 cursor-pointer transition-colors ${
                                selectedIds.has(session.id)
                                  ? "bg-blue-900/40 border border-blue-600"
                                  : "bg-gray-700/30 hover:bg-gray-700/50 border border-transparent"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedIds.has(session.id)}
                                onChange={() => toggleSession(session.id)}
                                className="rounded"
                              />
                              <div
                                className="flex-1 min-w-0"
                                onClick={() => toggleSession(session.id)}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-1.5 py-0.5 text-xs rounded ${getSourceColorClass(session.source)}`}
                                  >
                                    {session.source}
                                  </span>
                                  <span className="text-sm text-white truncate">
                                    {session.name}
                                  </span>
                                  {session.active && (
                                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                  )}
                                  {session.score !== undefined && (
                                    <span
                                      className={`px-1 py-0.5 text-[10px] rounded ${getScoreColorClass(session.score)}`}
                                    >
                                      {session.score}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                                {session.messageCount != null && (
                                  <span>{session.messageCount} msgs</span>
                                )}
                                {session.sizeBytes && (
                                  <span>{formatSize(session.sizeBytes)}</span>
                                )}
                                <span>{formatTime(session.modifiedAt)}</span>
                                {renderSessionActions?.(session)}
                                {onViewSession && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onViewSession(session);
                                    }}
                                    className="px-1.5 py-0.5 bg-gray-600 rounded hover:bg-gray-500"
                                  >
                                    View
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </>
            )}

            {sessions.length === 0 && !sessionLoader && (
              <div className="text-center py-4 text-gray-500 text-sm">
                No sessions available
              </div>
            )}
          </div>
        </Section>

        {/* Step 2: Prepare & Preview */}
        <Section
          title="Prepare & Preview"
          step={2}
          expanded={expandedSections.has("prepare")}
          onToggle={() => toggleSection("prepare")}
          badge={
            preparedSessions.length > 0 ? (
              <span
                className={`px-2 py-0.5 text-xs rounded ${
                  redactionReport?.blocked ? "bg-red-600" : "bg-green-600"
                } text-white`}
              >
                {redactionReport?.blocked ? "Blocked" : "Ready"}
              </span>
            ) : undefined
          }
        >
          {selectedIds.size === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">
              Select sessions above to configure redaction and preview changes
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {/* Left: Config */}
              <div className="col-span-1 space-y-4">
                <RedactionConfigPanel
                  config={redactionConfig}
                  onChange={setRedactionConfig}
                />
                <FieldSelector
                  schemas={fieldSchemas}
                  selectedFields={selectedFields}
                  fieldsPresent={fieldsPresent}
                  onToggle={toggleField}
                />
              </div>

              {/* Right: Preview */}
              <div className="col-span-2">
                <PreviewPanel
                  sessions={preparedSessions}
                  previewIndex={previewIndex}
                  onPreviewIndexChange={setPreviewIndex}
                  diffViewMode={diffViewMode}
                  onDiffViewModeChange={setDiffViewMode}
                  loading={previewLoading}
                  fieldsStripped={fieldsStripped}
                  redactionReport={redactionReport || undefined}
                />
              </div>
            </div>
          )}
        </Section>

        {/* Step 3: Contributor & Export */}
        <Section
          title="Contributor & Export"
          step={3}
          expanded={expandedSections.has("export")}
          onToggle={() => toggleSection("export")}
        >
          <div className="space-y-4">
            <ContributorInfo
              contributorId={contributorId}
              license={license}
              aiPreference={aiPreference}
              onContributorIdChange={setContributorId}
              onLicenseChange={setLicense}
              onAiPreferenceChange={setAiPreference}
              rightsConfirmed={rightsConfirmed}
              reviewedConfirmed={reviewedConfirmed}
              onRightsConfirmedChange={setRightsConfirmed}
              onReviewedConfirmedChange={setReviewedConfirmed}
            />

            {/* Contribution History (if supported by adapter) */}
            {hasHistory && contributionHistory.length > 0 && (
              <ContributionHistory entries={contributionHistory} />
            )}

            {/* Pre-export Summary */}
            {preparedSessions.length > 0 && redactionReport && (
              <ExportSummary
                sessionCount={preparedSessions.length}
                totalChars={preparedSessions.reduce(
                  (sum, s) => sum + s.approxChars,
                  0
                )}
                redactionCount={redactionReport.totalStringsTouched}
                fieldsStripped={Object.keys(fieldsStripped).length}
                warningCount={redactionReport.residueWarnings.length}
                license={license}
                aiPreference={aiPreference}
              />
            )}

            {/* Build & Export */}
            <div className="p-3 bg-gray-700/30 rounded space-y-3">
              <button
                onClick={handleBuildBundle}
                disabled={!canBuild || exportLoading}
                className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading ? "Building..." : "Build Bundle"}
              </button>

              {!canBuild && preparedSessions.length > 0 && (
                <div className="text-xs text-yellow-400">
                  Please confirm both attestations above to enable export.
                </div>
              )}

              {bundleResult && (
                <div className="space-y-3">
                  <InfoBox type="tip" title="Bundle Ready">
                    <p>
                      <strong>{bundleResult.bundleId}</strong> (
                      {bundleResult.transcriptsCount} sessions)
                    </p>
                    <p className="mt-1 text-gray-400">
                      Format: {bundleResult.bundleFormat.toUpperCase()} -
                      Download or upload to a dataset.
                    </p>
                  </InfoBox>

                  <div className="flex gap-2">
                    <button
                      onClick={handleDownload}
                      className="flex-1 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Download
                    </button>

                    {hasHuggingFaceUpload && (
                      <button
                        onClick={handleHFUpload}
                        disabled={!hfRepoId || exportLoading}
                        className="flex-1 py-1.5 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 disabled:opacity-50"
                      >
                        Upload to HF
                      </button>
                    )}
                  </div>

                  {hasHuggingFaceUpload && (
                    <div className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="username/dataset-name"
                          value={hfRepoId}
                          onChange={(e) => setHfRepoId(e.target.value)}
                          className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs"
                        />
                        {!hfUsername && (
                          <button
                            onClick={handleHFOAuth}
                            className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded hover:bg-gray-600"
                          >
                            Login
                          </button>
                        )}
                        {hfUsername && (
                          <span className="text-xs text-green-400">
                            @{hfUsername}
                          </span>
                        )}
                        <HelpIcon
                          tooltip={HELP_CONTENT.huggingFace.repoFormat}
                        />
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Dataset must exist on HuggingFace. You need write access
                        to upload.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

export default ContribPane;
