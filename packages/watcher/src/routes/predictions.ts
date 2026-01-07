/**
 * Prediction and calibration routes for Command Center.
 *
 * Provides endpoints for:
 * - Creating/listing predictions
 * - Recording outcomes
 * - Calibration statistics
 * - Tmux availability check
 */

import { execSync } from "child_process";
import type { Hono } from "hono";
import type { PredictionStore } from "@agentwatch/monitor";
import type { RunOutcome, RunPrediction } from "@agentwatch/core";

/**
 * Convert prediction to snake_case API format.
 */
function predictionToDict(prediction: RunPrediction, outcome?: RunOutcome) {
  return {
    id: prediction.id,
    managed_session_id: prediction.managedSessionId,
    created_at: prediction.createdAt,
    predicted_duration_minutes: prediction.predictedDurationMinutes,
    duration_confidence: prediction.durationConfidence,
    predicted_tokens: prediction.predictedTokens,
    token_confidence: prediction.tokenConfidence,
    success_conditions: prediction.successConditions,
    intentions: prediction.intentions,
    selected_principles: prediction.selectedPrinciples,
    principles_path: prediction.principlesPath,
    outcome: outcome
      ? {
          prediction_id: outcome.predictionId,
          managed_session_id: outcome.managedSessionId,
          recorded_at: outcome.recordedAt,
          actual_duration_minutes: outcome.actualDurationMinutes,
          actual_tokens: outcome.actualTokens,
          exit_code: outcome.exitCode,
          user_marked_success: outcome.userMarkedSuccess,
          outcome_notes: outcome.outcomeNotes
        }
      : null
  };
}

/**
 * Register prediction and calibration routes.
 */
export function registerPredictionRoutes(
  app: Hono,
  predictionStore: PredictionStore
): void {
  /**
   * GET /api/predictions
   * List predictions with optional filtering.
   */
  app.get("/api/predictions", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "20", 10);
    const hasOutcome = c.req.query("has_outcome");

    const results = predictionStore.listPredictions({
      limit,
      hasOutcome: hasOutcome === "true" ? true : hasOutcome === "false" ? false : undefined
    });

    return c.json({
      predictions: results.map(({ prediction, outcome }) =>
        predictionToDict(prediction, outcome)
      )
    });
  });

  /**
   * POST /api/predictions
   * Create a new prediction.
   */
  app.post("/api/predictions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      managed_session_id?: string;
      predicted_duration_minutes?: number;
      duration_confidence?: "low" | "medium" | "high";
      predicted_tokens?: number;
      token_confidence?: "low" | "medium" | "high";
      success_conditions?: string;
      intentions?: string;
      selected_principles?: string[];
      principles_path?: string;
    };

    if (!body.managed_session_id) {
      return c.json({ error: "managed_session_id is required" }, 400);
    }

    const prediction = predictionStore.createPrediction({
      managedSessionId: body.managed_session_id,
      predictedDurationMinutes: body.predicted_duration_minutes ?? 30,
      durationConfidence: body.duration_confidence ?? "medium",
      predictedTokens: body.predicted_tokens ?? 50000,
      tokenConfidence: body.token_confidence ?? "medium",
      successConditions: body.success_conditions ?? "",
      intentions: body.intentions ?? "",
      selectedPrinciples: body.selected_principles,
      principlesPath: body.principles_path
    });

    return c.json(predictionToDict(prediction));
  });

  /**
   * GET /api/predictions/:id
   * Get a specific prediction.
   */
  app.get("/api/predictions/:id", (c) => {
    const id = c.req.param("id");
    const prediction = predictionStore.getPrediction(id);

    if (!prediction) {
      return c.json({ error: "Prediction not found" }, 404);
    }

    const outcome = predictionStore.getOutcome(id) ?? undefined;
    return c.json(predictionToDict(prediction, outcome));
  });

  /**
   * POST /api/predictions/:id/outcome
   * Record an outcome for a prediction.
   */
  app.post("/api/predictions/:id/outcome", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      actual_duration_minutes?: number;
      actual_tokens?: number;
      exit_code?: number;
      user_marked_success?: boolean;
      outcome_notes?: string;
    };

    const prediction = predictionStore.getPrediction(id);
    if (!prediction) {
      return c.json({ error: "Prediction not found" }, 404);
    }

    const result = predictionStore.recordOutcome({
      predictionId: id,
      managedSessionId: prediction.managedSessionId,
      actualDurationMinutes: body.actual_duration_minutes ?? 0,
      actualTokens: body.actual_tokens ?? 0,
      exitCode: body.exit_code ?? -1,
      userMarkedSuccess: body.user_marked_success ?? false,
      outcomeNotes: body.outcome_notes
    });

    if (!result) {
      return c.json({ error: "Failed to record outcome" }, 500);
    }

    return c.json({
      outcome: {
        prediction_id: result.outcome.predictionId,
        managed_session_id: result.outcome.managedSessionId,
        recorded_at: result.outcome.recordedAt,
        actual_duration_minutes: result.outcome.actualDurationMinutes,
        actual_tokens: result.outcome.actualTokens,
        exit_code: result.outcome.exitCode,
        user_marked_success: result.outcome.userMarkedSuccess,
        outcome_notes: result.outcome.outcomeNotes
      },
      calibration: {
        prediction_id: result.calibration.predictionId,
        duration_error: result.calibration.durationError,
        duration_within_confidence: result.calibration.durationWithinConfidence,
        duration_score: result.calibration.durationScore,
        token_error: result.calibration.tokenError,
        token_within_confidence: result.calibration.tokenWithinConfidence,
        token_score: result.calibration.tokenScore,
        success_prediction_correct: result.calibration.successPredictionCorrect,
        success_score: result.calibration.successScore,
        overall_score: result.calibration.overallScore
      }
    });
  });

  /**
   * GET /api/calibration
   * Get calibration statistics.
   */
  app.get("/api/calibration", (c) => {
    const stats = predictionStore.getCalibrationStats();

    return c.json({
      totalPredictions: stats.totalPredictions,
      completedPredictions: stats.completedPredictions,
      overallCalibrationScore: stats.overallCalibrationScore,
      recentTrend: stats.recentTrend,
      history: stats.history
    });
  });

  /**
   * GET /api/command-center/tmux-available
   * Check if tmux is available on the system.
   */
  app.get("/api/command-center/tmux-available", (c) => {
    let available = false;
    let version: string | null = null;

    try {
      const result = execSync("tmux -V", {
        encoding: "utf-8",
        timeout: 5000
      }).trim();
      available = true;
      version = result;
    } catch {
      // tmux not available
    }

    return c.json({ available, version });
  });
}
