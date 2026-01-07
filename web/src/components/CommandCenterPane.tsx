/**
 * Command Center: Run predictions, calibration tracking, and principles injection.
 *
 * Enables users to:
 * - Launch agent runs with predictions
 * - Track prediction accuracy over time
 * - Select PRINCIPLES.md items to inject into prompts
 */

import { useCallback, useEffect, useState } from "react";
import type {
  CalibrationStats,
  ConfidenceLevel,
  ManagedSession,
  Principle,
  Project,
  RunOutcome,
  RunPrediction
} from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

const API_BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/\/api$/, "")
  : "";

interface CommandCenterPaneProps {
  managedSessions: ManagedSession[];
}

type AgentType = "claude" | "codex" | "gemini";

interface PredictionWithOutcome {
  prediction: RunPrediction;
  outcome?: RunOutcome;
}

export function CommandCenterPane({ managedSessions }: CommandCenterPaneProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  // Form state
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("claude");
  const [prompt, setPrompt] = useState("");
  const [predictedDuration, setPredictedDuration] = useState(15);
  const [durationConfidence, setDurationConfidence] =
    useState<ConfidenceLevel>("medium");
  const [predictedTokens, setPredictedTokens] = useState(50000);
  const [tokenConfidence, setTokenConfidence] =
    useState<ConfidenceLevel>("medium");
  const [successConditions, setSuccessConditions] = useState("");
  const [intentions, setIntentions] = useState("");
  const [selectedPrinciples, setSelectedPrinciples] = useState<Set<string>>(
    new Set()
  );

  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [principlesPath, setPrinciplesPath] = useState<string | null>(null);
  const [calibrationStats, setCalibrationStats] =
    useState<CalibrationStats | null>(null);
  const [predictions, setPredictions] = useState<PredictionWithOutcome[]>([]);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [tmuxAvailable, setTmuxAvailable] = useState<boolean | null>(null);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [tmuxAttachCommand, setTmuxAttachCommand] = useState<string | null>(
    null
  );

  // Load initial data
  useEffect(() => {
    loadProjects();
    loadCalibrationStats();
    loadPredictions();
    checkTmuxAvailable();
  }, []);

  const checkTmuxAvailable = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/command-center/tmux-available`);
      if (res.ok) {
        const data = await res.json();
        setTmuxAvailable(data.available);
      }
    } catch {
      setTmuxAvailable(false);
    }
  };

  // Load principles when project changes
  useEffect(() => {
    if (selectedProject) {
      const project = projects.find((p) => p.id === selectedProject);
      if (project?.paths[0]) {
        loadPrinciples(project.paths[0]);
      }
    } else {
      setPrinciples([]);
      setPrinciplesPath(null);
    }
  }, [selectedProject, projects]);

  const loadProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // Ignore errors
    }
  };

  const loadPrinciples = async (cwd: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/principles?cwd=${encodeURIComponent(cwd)}`
      );
      if (res.ok) {
        const data = await res.json();
        setPrinciples(data.principles || []);
        setPrinciplesPath(data.path || null);
      } else {
        setPrinciples([]);
        setPrinciplesPath(null);
      }
    } catch {
      setPrinciples([]);
      setPrinciplesPath(null);
    }
  };

  const loadCalibrationStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/calibration`);
      if (res.ok) {
        const data = await res.json();
        setCalibrationStats(data);
      }
    } catch {
      // Ignore errors
    }
  };

  const loadPredictions = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/predictions?limit=20`);
      if (res.ok) {
        const data = await res.json();
        // Convert snake_case API response to camelCase
        const converted: PredictionWithOutcome[] = (data.predictions || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => ({
            prediction: {
              id: p.id,
              managedSessionId: p.managed_session_id,
              createdAt: p.created_at,
              predictedDurationMinutes: p.predicted_duration_minutes,
              durationConfidence: p.duration_confidence,
              predictedTokens: p.predicted_tokens,
              tokenConfidence: p.token_confidence,
              successConditions: p.success_conditions,
              intentions: p.intentions,
              selectedPrinciples: p.selected_principles,
              principlesPath: p.principles_path
            },
            outcome: p.outcome
              ? {
                  predictionId: p.outcome.prediction_id,
                  managedSessionId: p.outcome.managed_session_id,
                  recordedAt: p.outcome.recorded_at,
                  actualDurationMinutes: p.outcome.actual_duration_minutes,
                  actualTokens: p.outcome.actual_tokens,
                  exitCode: p.outcome.exit_code,
                  userMarkedSuccess: p.outcome.user_marked_success,
                  outcomeNotes: p.outcome.outcome_notes
                }
              : undefined
          })
        );
        setPredictions(converted);
      }
    } catch {
      // Ignore errors
    }
  };

  const togglePrinciple = useCallback((id: string) => {
    setSelectedPrinciples((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleLaunch = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    const project = projects.find((p) => p.id === selectedProject);
    const cwd = project?.paths[0] || process.cwd?.() || ".";

    setLaunching(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/managed-sessions/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          agent: selectedAgent,
          cwd,
          intentions: intentions || undefined,
          principlesInjection:
            selectedPrinciples.size > 0
              ? Array.from(selectedPrinciples)
              : undefined,
          prediction: {
            predictedDurationMinutes: predictedDuration,
            durationConfidence,
            predictedTokens,
            tokenConfidence,
            successConditions,
            intentions,
            selectedPrinciples: Array.from(selectedPrinciples),
            principlesPath: principlesPath || undefined
          }
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to launch run");
      }

      const data = await res.json();

      // Clear form on success
      setPrompt("");
      setSuccessConditions("");
      setIntentions("");
      setSelectedPrinciples(new Set());
      setPredictedDuration(15);
      setPredictedTokens(50000);

      // Show success message
      setSuccessMessage(
        `Run launched! Agent: ${selectedAgent}${data.session?.id ? ` (Session: ${data.session.id.slice(0, 8)}...)` : ""}`
      );
      // Auto-clear after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);

      // Reload predictions
      loadPredictions();
      loadCalibrationStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch run");
    } finally {
      setLaunching(false);
    }
  };

  const handleLaunchInteractive = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    const project = projects.find((p) => p.id === selectedProject);
    const cwd = project?.paths[0] || process.cwd?.() || ".";

    setLaunching(true);
    setError(null);
    setSuccessMessage(null);
    setTmuxAttachCommand(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/managed-sessions/run-interactive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            agent: selectedAgent,
            cwd,
            intentions: intentions || undefined,
            principlesInjection:
              selectedPrinciples.size > 0
                ? Array.from(selectedPrinciples)
                : undefined,
            prediction: {
              predictedDurationMinutes: predictedDuration,
              durationConfidence,
              predictedTokens,
              tokenConfidence,
              successConditions,
              intentions,
              selectedPrinciples: Array.from(selectedPrinciples),
              principlesPath: principlesPath || undefined
            }
          })
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to launch interactive session");
      }

      const data = await res.json();
      // API returns snake_case, convert to camelCase
      setTmuxAttachCommand(data.attach_command || data.attachCommand);

      // Don't clear form - user might want to launch another
      // Reload predictions
      loadPredictions();
      loadCalibrationStats();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to launch interactive session"
      );
    } finally {
      setLaunching(false);
    }
  };

  // Group principles by category
  const principlesByCategory = principles.reduce(
    (acc, p) => {
      const cat = p.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    },
    {} as Record<string, Principle[]>
  );

  // Get active runs (running managed sessions with predictions)
  const activeRuns = managedSessions
    .filter((s) => s.status === "running")
    .map((session) => {
      const pred = predictions.find(
        (p) => p.prediction.managedSessionId === session.id
      );
      return { session, prediction: pred?.prediction };
    });

  // Get recent completed runs with predictions
  const completedRuns = predictions.filter((p) => p.outcome);

  return (
    <SelfDocumentingSection
      componentId="watcher.command.pane"
      visible={showSelfDocs}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-cyan-400">
              Command Center
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Launch runs with predictions and track your calibration score
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-green-900/30 border border-green-700 rounded text-green-300 text-sm flex items-center justify-between">
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-green-400 hover:text-green-300"
            >
              &times;
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: New Run Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* New Run Section */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <h3 className="text-lg font-medium text-white mb-4">
                Launch New Run
              </h3>

              <div className="space-y-4">
                {/* Project and Agent Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Project
                    </label>
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                    >
                      <option value="">Select project...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Agent
                    </label>
                    <select
                      value={selectedAgent}
                      onChange={(e) =>
                        setSelectedAgent(e.target.value as AgentType)
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                    >
                      <option value="claude">Claude</option>
                      <option value="codex">Codex</option>
                      <option value="gemini">Gemini</option>
                    </select>
                  </div>
                </div>

                {/* Prompt */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Prompt
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="What do you want the agent to do?"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm h-24 resize-none"
                  />
                </div>

                {/* Predictions */}
                <div className="border-t border-gray-700 pt-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">
                    Predictions
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Duration (minutes)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={predictedDuration}
                          onChange={(e) =>
                            setPredictedDuration(
                              Number.parseInt(e.target.value) || 0
                            )
                          }
                          min={1}
                          className="w-20 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                        />
                        <select
                          value={durationConfidence}
                          onChange={(e) =>
                            setDurationConfidence(
                              e.target.value as ConfidenceLevel
                            )
                          }
                          className="flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                        >
                          <option value="low">Low (±50%)</option>
                          <option value="medium">Medium (±25%)</option>
                          <option value="high">High (±10%)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Tokens
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={predictedTokens}
                          onChange={(e) =>
                            setPredictedTokens(
                              Number.parseInt(e.target.value) || 0
                            )
                          }
                          min={1000}
                          step={1000}
                          className="w-24 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                        />
                        <select
                          value={tokenConfidence}
                          onChange={(e) =>
                            setTokenConfidence(
                              e.target.value as ConfidenceLevel
                            )
                          }
                          className="flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                        >
                          <option value="low">Low (±50%)</option>
                          <option value="medium">Medium (±25%)</option>
                          <option value="high">High (±10%)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Success Conditions */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Success Conditions
                  </label>
                  <input
                    type="text"
                    value={successConditions}
                    onChange={(e) => setSuccessConditions(e.target.value)}
                    placeholder="Tests pass, bug fixed, etc."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                  />
                </div>

                {/* Intentions */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Intentions (optional)
                  </label>
                  <input
                    type="text"
                    value={intentions}
                    onChange={(e) => setIntentions(e.target.value)}
                    placeholder="Brief description of what you're trying to accomplish"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                  />
                </div>

                {/* Principles */}
                {principles.length > 0 && (
                  <div className="border-t border-gray-700 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-300">
                        Principles from PRINCIPLES.md
                      </h4>
                      {principlesPath && (
                        <span
                          className="text-xs text-gray-500 truncate max-w-[200px]"
                          title={principlesPath}
                        >
                          {principlesPath}
                        </span>
                      )}
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {Object.entries(principlesByCategory).map(
                        ([category, catPrinciples]) => (
                          <div key={category}>
                            <div className="text-xs text-gray-500 mb-1">
                              {category}
                            </div>
                            {catPrinciples.map((p) => (
                              <label
                                key={p.id}
                                className="flex items-start gap-2 py-1 cursor-pointer hover:bg-gray-700/50 rounded px-1"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPrinciples.has(p.id)}
                                  onChange={() => togglePrinciple(p.id)}
                                  className="mt-0.5"
                                />
                                <span className="text-sm text-gray-300">
                                  {p.text}
                                </span>
                              </label>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Launch Buttons */}
                <div className="pt-4 border-t border-gray-700 space-y-3">
                  {/* Interactive mode toggle */}
                  {tmuxAvailable && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={interactiveMode}
                        onChange={(e) => setInteractiveMode(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className="text-sm text-gray-300">
                        Interactive mode (tmux)
                      </span>
                      <span className="text-xs text-gray-500">
                        - attach to terminal session
                      </span>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={
                      interactiveMode ? handleLaunchInteractive : handleLaunch
                    }
                    disabled={launching || !prompt.trim()}
                    className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
                  >
                    {launching
                      ? "Launching..."
                      : interactiveMode
                        ? "Launch Interactive Session"
                        : "Launch with Predictions"}
                  </button>

                  {/* Tmux attach command display */}
                  {tmuxAttachCommand && (
                    <div className="p-3 bg-gray-700/50 rounded border border-cyan-700/50">
                      <div className="text-xs text-cyan-400 mb-1">
                        Session started! Attach with:
                      </div>
                      <code className="text-sm text-white font-mono bg-gray-900 px-2 py-1 rounded block">
                        {tmuxAttachCommand}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(tmuxAttachCommand);
                        }}
                        className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        Copy to clipboard
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Active Runs Section */}
            {activeRuns.length > 0 && (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <h3 className="text-lg font-medium text-white mb-4">
                  Active Runs
                </h3>
                <div className="space-y-3">
                  {activeRuns.map(({ session, prediction }) => (
                    <div
                      key={session.id}
                      className="p-3 bg-gray-700/50 rounded border border-gray-600"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">
                            {session.prompt.slice(0, 80)}
                            {session.prompt.length > 80 ? "..." : ""}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {session.agent} | Running for{" "}
                            {Math.round(session.duration_ms / 60000)} min
                            {prediction && (
                              <span className="text-cyan-400">
                                {" "}
                                | Predicted:{" "}
                                {prediction.predictedDurationMinutes} min
                              </span>
                            )}
                          </div>
                        </div>
                        {prediction && (
                          <div className="ml-2">
                            <ProgressIndicator
                              elapsed={session.duration_ms}
                              predicted={
                                prediction.predictedDurationMinutes * 60000
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: Calibration Stats */}
          <div className="space-y-6">
            {/* Calibration Score */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <h3 className="text-lg font-medium text-white mb-4">
                Your Calibration Score
              </h3>
              {calibrationStats ? (
                <div className="text-center">
                  <div className="text-5xl font-bold text-cyan-400">
                    {Number.isFinite(calibrationStats.overallCalibrationScore)
                      ? Math.round(calibrationStats.overallCalibrationScore)
                      : "--"}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">out of 100</div>
                  <div className="mt-3">
                    <TrendIndicator
                      trend={calibrationStats.recentTrend || "stable"}
                    />
                  </div>

                  {/* Mini history chart */}
                  {calibrationStats.history.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <MiniChart history={calibrationStats.history} />
                    </div>
                  )}

                  <div className="mt-4 text-sm text-gray-400">
                    {calibrationStats.completedPredictions} of{" "}
                    {calibrationStats.totalPredictions} predictions completed
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">
                  <div className="text-4xl mb-2">--</div>
                  <div className="text-sm">
                    Make predictions to start tracking your calibration
                  </div>
                </div>
              )}
            </div>

            {/* Recent Predictions */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <h3 className="text-lg font-medium text-white mb-4">
                Recent Predictions
              </h3>
              {completedRuns.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {completedRuns.slice(0, 10).map(({ prediction, outcome }) => (
                    <div
                      key={prediction.id}
                      className="p-2 bg-gray-700/50 rounded text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 truncate max-w-[150px]">
                          {prediction.intentions || "Run"}
                        </span>
                        {outcome && (
                          <span
                            className={
                              outcome.userMarkedSuccess
                                ? "text-green-400"
                                : "text-red-400"
                            }
                          >
                            {outcome.userMarkedSuccess ? "Success" : "Failed"}
                          </span>
                        )}
                      </div>
                      {outcome && (
                        <div className="text-xs text-gray-500 mt-1">
                          {prediction.predictedDurationMinutes}m predicted vs{" "}
                          {outcome.actualDurationMinutes}m actual
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-4 text-sm">
                  No completed predictions yet
                </div>
              )}
            </div>

            {/* Storage Info */}
            <div className="text-xs text-gray-500 px-2">
              Data stored in ~/.agentwatch/predictions/
            </div>
          </div>
        </div>
      </div>
    </SelfDocumentingSection>
  );
}

// Helper Components

function ProgressIndicator({
  elapsed,
  predicted
}: {
  elapsed: number;
  predicted: number;
}) {
  const percentage = Math.min(100, (elapsed / predicted) * 100);
  const isOverTime = elapsed > predicted;

  return (
    <div className="w-16 h-16 relative">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        {/* Background circle */}
        <circle
          className="text-gray-600"
          strokeWidth="3"
          stroke="currentColor"
          fill="transparent"
          r="16"
          cx="18"
          cy="18"
        />
        {/* Progress circle */}
        <circle
          className={isOverTime ? "text-yellow-400" : "text-cyan-400"}
          strokeWidth="3"
          strokeDasharray={`${percentage}, 100`}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="16"
          cx="18"
          cy="18"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`text-xs font-medium ${isOverTime ? "text-yellow-400" : "text-cyan-400"}`}
        >
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}

function TrendIndicator({
  trend
}: {
  trend: "improving" | "stable" | "declining" | string;
}) {
  const config: Record<string, { icon: string; color: string; label: string }> =
    {
      improving: { icon: "^", color: "text-green-400", label: "Improving" },
      stable: { icon: "~", color: "text-gray-400", label: "Stable" },
      declining: { icon: "v", color: "text-red-400", label: "Declining" }
    };

  const { icon, color, label } = config[trend] ?? config.stable;

  return (
    <div className={`flex items-center justify-center gap-1 ${color}`}>
      <span className="text-lg">{icon}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

function MiniChart({
  history
}: {
  history: Array<{ date: string; score: number; count: number }>;
}) {
  if (history.length === 0) return null;

  // Take last 14 days
  const data = history.slice(-14);
  const maxScore = Math.max(...data.map((d) => d.score), 100);
  const minScore = Math.min(...data.map((d) => d.score), 0);
  const range = maxScore - minScore || 1;

  return (
    <div className="h-12 flex items-end gap-0.5">
      {data.map((d) => {
        const height = ((d.score - minScore) / range) * 100;
        return (
          <div
            key={d.date}
            className="flex-1 bg-cyan-600/60 rounded-t"
            style={{ height: `${Math.max(height, 5)}%` }}
            title={`${d.date}: ${Math.round(d.score)} (${d.count} predictions)`}
          />
        );
      })}
    </div>
  );
}
