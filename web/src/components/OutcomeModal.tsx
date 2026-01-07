/**
 * Modal for recording run outcomes after completion.
 *
 * Shows predicted vs actual comparison and allows user to mark
 * success/failure with optional notes.
 */

import { useState } from "react";
import type {
  CalibrationResult,
  ManagedSession,
  RunPrediction
} from "../api/types";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

const API_BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/\/api$/, "")
  : "";

interface OutcomeModalProps {
  session: ManagedSession;
  prediction: RunPrediction;
  onClose: () => void;
  onRecorded: () => void;
}

export function OutcomeModal({
  session,
  prediction,
  onClose,
  onRecorded
}: OutcomeModalProps) {
  const [userMarkedSuccess, setUserMarkedSuccess] = useState<boolean | null>(
    session.exit_code === 0 ? true : null
  );
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calibrationResult, setCalibrationResult] =
    useState<CalibrationResult | null>(null);
  const showSelfDocs = useSelfDocumentingVisible();

  const actualDurationMinutes = Math.round(session.duration_ms / 60000);
  // Estimate tokens from duration (rough heuristic: ~3000 tokens/minute)
  const estimatedTokens = Math.round(actualDurationMinutes * 3000);

  const handleSubmit = async () => {
    if (userMarkedSuccess === null) {
      setError("Please mark the run as success or failure");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/predictions/${prediction.id}/outcome`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            managedSessionId: session.id,
            actualDurationMinutes,
            actualTokens: estimatedTokens,
            exitCode: session.exit_code ?? -1,
            userMarkedSuccess,
            outcomeNotes: outcomeNotes || undefined
          })
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to record outcome");
      }

      const data = await res.json();
      setCalibrationResult(data.calibration);

      // Delay close to show calibration result
      setTimeout(() => {
        onRecorded();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record outcome");
      setSubmitting(false);
    }
  };

  // Calculate error percentages for display
  const durationError =
    prediction.predictedDurationMinutes > 0
      ? ((actualDurationMinutes - prediction.predictedDurationMinutes) /
          prediction.predictedDurationMinutes) *
        100
      : 0;

  const tokenError =
    prediction.predictedTokens > 0
      ? ((estimatedTokens - prediction.predictedTokens) /
          prediction.predictedTokens) *
        100
      : 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <SelfDocumentingSection
        componentId="analyzer.analytics.outcome-modal"
        visible={showSelfDocs}
        compact
      >
        <div
          className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-lg w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {calibrationResult ? (
            // Show calibration result
            <div className="text-center">
              <h2 className="text-lg font-semibold text-cyan-400 mb-4">
                Outcome Recorded
              </h2>
              <div className="text-5xl font-bold text-cyan-400 mb-2">
                {Math.round(calibrationResult.overallScore)}
              </div>
              <div className="text-sm text-gray-400 mb-4">
                Calibration Score for this prediction
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="p-2 bg-gray-700 rounded">
                  <div className="text-gray-400">Duration</div>
                  <div
                    className={
                      calibrationResult.durationWithinConfidence
                        ? "text-green-400"
                        : "text-yellow-400"
                    }
                  >
                    {Math.round(calibrationResult.durationScore)}
                  </div>
                </div>
                <div className="p-2 bg-gray-700 rounded">
                  <div className="text-gray-400">Tokens</div>
                  <div
                    className={
                      calibrationResult.tokenWithinConfidence
                        ? "text-green-400"
                        : "text-yellow-400"
                    }
                  >
                    {Math.round(calibrationResult.tokenScore)}
                  </div>
                </div>
                <div className="p-2 bg-gray-700 rounded">
                  <div className="text-gray-400">Success</div>
                  <div
                    className={
                      calibrationResult.successPredictionCorrect
                        ? "text-green-400"
                        : "text-red-400"
                    }
                  >
                    {Math.round(calibrationResult.successScore)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Show outcome form
            <>
              <h2 className="text-lg font-semibold text-cyan-400 mb-4">
                Record Outcome
              </h2>

              {error && (
                <div className="mb-4 p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                  {error}
                </div>
              )}

              {/* Prediction vs Actual */}
              <div className="bg-gray-700/50 rounded p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">
                  Predicted vs Actual
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Duration</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-white">
                        {prediction.predictedDurationMinutes}m
                      </span>
                      <span className="text-gray-500">vs</span>
                      <span
                        className={
                          Math.abs(durationError) <= 25
                            ? "text-green-400"
                            : "text-yellow-400"
                        }
                      >
                        {actualDurationMinutes}m
                      </span>
                      <span
                        className={`text-xs ${
                          durationError > 0 ? "text-red-400" : "text-green-400"
                        }`}
                      >
                        ({durationError > 0 ? "+" : ""}
                        {Math.round(durationError)}%)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">
                      Tokens (est.)
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-white">
                        {(prediction.predictedTokens / 1000).toFixed(0)}k
                      </span>
                      <span className="text-gray-500">vs</span>
                      <span
                        className={
                          Math.abs(tokenError) <= 25
                            ? "text-green-400"
                            : "text-yellow-400"
                        }
                      >
                        {(estimatedTokens / 1000).toFixed(0)}k
                      </span>
                      <span
                        className={`text-xs ${
                          tokenError > 0 ? "text-red-400" : "text-green-400"
                        }`}
                      >
                        ({tokenError > 0 ? "+" : ""}
                        {Math.round(tokenError)}%)
                      </span>
                    </div>
                  </div>
                </div>
                {prediction.successConditions && (
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    <div className="text-xs text-gray-400 mb-1">
                      Success Conditions
                    </div>
                    <div className="text-sm text-gray-300">
                      {prediction.successConditions}
                    </div>
                  </div>
                )}
              </div>

              {/* Success/Failure Selection */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">
                  Did the run achieve its goal?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setUserMarkedSuccess(true)}
                    className={`p-3 rounded border-2 transition-colors ${
                      userMarkedSuccess === true
                        ? "border-green-500 bg-green-900/30 text-green-400"
                        : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    <div className="text-2xl mb-1">*</div>
                    <div className="text-sm font-medium">Success</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserMarkedSuccess(false)}
                    className={`p-3 rounded border-2 transition-colors ${
                      userMarkedSuccess === false
                        ? "border-red-500 bg-red-900/30 text-red-400"
                        : "border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    <div className="text-2xl mb-1">x</div>
                    <div className="text-sm font-medium">Failed</div>
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  placeholder="What worked well? What went wrong?"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm h-20 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || userMarkedSuccess === null}
                  className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
                >
                  {submitting ? "Recording..." : "Record Outcome"}
                </button>
              </div>
            </>
          )}
        </div>
      </SelfDocumentingSection>
    </div>
  );
}
