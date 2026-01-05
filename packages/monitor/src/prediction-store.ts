/**
 * Storage for run predictions and calibration data.
 *
 * Enables tracking user predictions before agent runs and
 * computing calibration scores based on actual outcomes.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "fs";
import { homedir } from "os";
import { join } from "path";
import type {
  CalibrationResult,
  CalibrationStats,
  ConfidenceLevel,
  RunOutcome,
  RunPrediction
} from "@agentwatch/core";
import { CONFIDENCE_INTERVALS } from "@agentwatch/core";

export type PredictionChangeCallback = (
  prediction: RunPrediction,
  outcome?: RunOutcome
) => void;

/**
 * Storage for run predictions and calibration data.
 */
export class PredictionStore {
  private dataDir: string;
  private predictions: Map<string, RunPrediction> = new Map();
  private outcomes: Map<string, RunOutcome> = new Map();
  private calibrationCache: CalibrationStats | null = null;
  private onPredictionChange?: PredictionChangeCallback;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(homedir(), ".agentwatch", "predictions");
    mkdirSync(this.dataDir, { recursive: true });
    this.loadData();
  }

  /**
   * Set callback for prediction/outcome changes.
   */
  setCallback(callback: PredictionChangeCallback): void {
    this.onPredictionChange = callback;
  }

  // ==========================================================================
  // Predictions
  // ==========================================================================

  /**
   * Create a new prediction.
   */
  createPrediction(
    data: Omit<RunPrediction, "id" | "createdAt">
  ): RunPrediction {
    const id = this.generateId();
    const prediction: RunPrediction = {
      ...data,
      id,
      createdAt: Date.now()
    };

    this.predictions.set(id, prediction);
    this.persistPrediction(prediction);
    this.invalidateCalibrationCache();

    if (this.onPredictionChange) {
      try {
        this.onPredictionChange(prediction);
      } catch {
        // Ignore callback errors
      }
    }

    return prediction;
  }

  /**
   * Get a prediction by ID.
   */
  getPrediction(id: string): RunPrediction | null {
    return this.predictions.get(id) ?? null;
  }

  /**
   * Get prediction for a managed session.
   */
  getPredictionForSession(managedSessionId: string): RunPrediction | null {
    for (const prediction of this.predictions.values()) {
      if (prediction.managedSessionId === managedSessionId) {
        return prediction;
      }
    }
    return null;
  }

  /**
   * List predictions with optional filtering.
   */
  listPredictions(options?: {
    hasOutcome?: boolean;
    limit?: number;
  }): Array<{ prediction: RunPrediction; outcome?: RunOutcome }> {
    let results: Array<{ prediction: RunPrediction; outcome?: RunOutcome }> =
      [];

    for (const prediction of this.predictions.values()) {
      const outcome = this.outcomes.get(prediction.id);

      if (options?.hasOutcome !== undefined) {
        if (options.hasOutcome && !outcome) continue;
        if (!options.hasOutcome && outcome) continue;
      }

      results.push({ prediction, outcome });
    }

    // Sort by creation time, newest first
    results.sort((a, b) => b.prediction.createdAt - a.prediction.createdAt);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // ==========================================================================
  // Outcomes
  // ==========================================================================

  /**
   * Record an outcome for a prediction.
   */
  recordOutcome(
    data: Omit<RunOutcome, "recordedAt">
  ): { outcome: RunOutcome; calibration: CalibrationResult } | null {
    const prediction = this.predictions.get(data.predictionId);
    if (!prediction) return null;

    const outcome: RunOutcome = {
      ...data,
      recordedAt: Date.now()
    };

    this.outcomes.set(data.predictionId, outcome);
    this.persistOutcome(outcome);
    this.invalidateCalibrationCache();

    const calibration = this.calculateCalibrationResult(prediction, outcome);

    if (this.onPredictionChange) {
      try {
        this.onPredictionChange(prediction, outcome);
      } catch {
        // Ignore callback errors
      }
    }

    return { outcome, calibration };
  }

  /**
   * Get outcome for a prediction.
   */
  getOutcome(predictionId: string): RunOutcome | null {
    return this.outcomes.get(predictionId) ?? null;
  }

  // ==========================================================================
  // Calibration
  // ==========================================================================

  /**
   * Calculate calibration result for a single prediction/outcome pair.
   */
  calculateCalibrationResult(
    prediction: RunPrediction,
    outcome: RunOutcome
  ): CalibrationResult {
    // Duration scoring
    const durationError =
      prediction.predictedDurationMinutes > 0
        ? (outcome.actualDurationMinutes -
            prediction.predictedDurationMinutes) /
          prediction.predictedDurationMinutes
        : 0;

    const durationInterval =
      CONFIDENCE_INTERVALS[prediction.durationConfidence];
    const durationWithinConfidence =
      Math.abs(durationError) <= durationInterval;
    const durationScore = Math.max(0, 100 - Math.abs(durationError) * 100);

    // Token scoring
    const tokenError =
      prediction.predictedTokens > 0
        ? (outcome.actualTokens - prediction.predictedTokens) /
          prediction.predictedTokens
        : 0;

    const tokenInterval = CONFIDENCE_INTERVALS[prediction.tokenConfidence];
    const tokenWithinConfidence = Math.abs(tokenError) <= tokenInterval;
    const tokenScore = Math.max(0, 100 - Math.abs(tokenError) * 100);

    // Success scoring (simple: did user mark success and exit code was 0?)
    const expectedSuccess = outcome.exitCode === 0;
    const successPredictionCorrect =
      outcome.userMarkedSuccess === expectedSuccess;
    const successScore = outcome.userMarkedSuccess ? 100 : 0;

    // Overall: weighted average (duration 40%, tokens 40%, success 20%)
    const overallScore =
      durationScore * 0.4 + tokenScore * 0.4 + successScore * 0.2;

    return {
      predictionId: prediction.id,
      durationError,
      durationWithinConfidence,
      durationScore,
      tokenError,
      tokenWithinConfidence,
      tokenScore,
      successPredictionCorrect,
      successScore,
      overallScore
    };
  }

  /**
   * Get cached calibration statistics.
   */
  getCalibrationStats(): CalibrationStats {
    if (this.calibrationCache) {
      return this.calibrationCache;
    }

    const stats = this.computeCalibrationStats();
    this.calibrationCache = stats;
    this.persistCalibrationCache(stats);
    return stats;
  }

  /**
   * Compute calibration statistics from all predictions with outcomes.
   */
  private computeCalibrationStats(): CalibrationStats {
    const predictionsWithOutcomes: Array<{
      prediction: RunPrediction;
      outcome: RunOutcome;
      calibration: CalibrationResult;
    }> = [];

    for (const prediction of this.predictions.values()) {
      const outcome = this.outcomes.get(prediction.id);
      if (outcome) {
        const calibration = this.calculateCalibrationResult(
          prediction,
          outcome
        );
        predictionsWithOutcomes.push({ prediction, outcome, calibration });
      }
    }

    if (predictionsWithOutcomes.length === 0) {
      return {
        totalPredictions: this.predictions.size,
        completedPredictions: 0,
        overallCalibrationScore: 0,
        recentTrend: "stable",
        history: []
      };
    }

    // Calculate overall score
    const totalScore = predictionsWithOutcomes.reduce(
      (sum, { calibration }) => sum + calibration.overallScore,
      0
    );
    const overallCalibrationScore = totalScore / predictionsWithOutcomes.length;

    // Build daily history
    const dailyScores = new Map<string, { total: number; count: number }>();

    for (const { outcome, calibration } of predictionsWithOutcomes) {
      const dateStr = new Date(outcome.recordedAt).toISOString().split("T")[0]!;
      const existing = dailyScores.get(dateStr) ?? { total: 0, count: 0 };
      existing.total += calibration.overallScore;
      existing.count += 1;
      dailyScores.set(dateStr, existing);
    }

    const history = [...dailyScores.entries()]
      .map(([date, { total, count }]) => ({
        date,
        score: total / count,
        count
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate trend (last 7 days vs previous 7 days)
    const recentTrend = this.calculateTrend(history);

    return {
      totalPredictions: this.predictions.size,
      completedPredictions: predictionsWithOutcomes.length,
      overallCalibrationScore,
      recentTrend,
      history
    };
  }

  /**
   * Calculate trend from history.
   */
  private calculateTrend(
    history: CalibrationStats["history"]
  ): CalibrationStats["recentTrend"] {
    if (history.length < 2) return "stable";

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;
    const fourteenDaysAgo = now - 14 * 86400000;

    const recent = history.filter((h) => {
      const ts = new Date(h.date).getTime();
      return ts >= sevenDaysAgo;
    });

    const previous = history.filter((h) => {
      const ts = new Date(h.date).getTime();
      return ts >= fourteenDaysAgo && ts < sevenDaysAgo;
    });

    if (recent.length === 0 || previous.length === 0) return "stable";

    const recentAvg =
      recent.reduce((sum, h) => sum + h.score, 0) / recent.length;
    const previousAvg =
      previous.reduce((sum, h) => sum + h.score, 0) / previous.length;

    const diff = recentAvg - previousAvg;

    if (diff > 5) return "improving";
    if (diff < -5) return "declining";
    return "stable";
  }

  /**
   * Get calibration history for charts.
   */
  getCalibrationHistory(days = 30): CalibrationStats["history"] {
    const stats = this.getCalibrationStats();
    const cutoff = Date.now() - days * 86400000;

    return stats.history.filter((h) => {
      const ts = new Date(h.date).getTime();
      return ts >= cutoff;
    });
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  private persistPrediction(prediction: RunPrediction): void {
    try {
      const file = join(this.dataDir, "predictions.jsonl");
      appendFileSync(file, JSON.stringify(prediction) + "\n");
    } catch {
      // Ignore persistence errors
    }
  }

  private persistOutcome(outcome: RunOutcome): void {
    try {
      const file = join(this.dataDir, "outcomes.jsonl");
      appendFileSync(file, JSON.stringify(outcome) + "\n");
    } catch {
      // Ignore persistence errors
    }
  }

  private persistCalibrationCache(stats: CalibrationStats): void {
    try {
      const file = join(this.dataDir, "calibration.json");
      writeFileSync(file, JSON.stringify(stats, null, 2));
    } catch {
      // Ignore persistence errors
    }
  }

  private invalidateCalibrationCache(): void {
    this.calibrationCache = null;
  }

  private loadData(): void {
    this.loadPredictions();
    this.loadOutcomes();
    this.loadCalibrationCache();
  }

  private loadPredictions(): void {
    try {
      const file = join(this.dataDir, "predictions.jsonl");
      if (!existsSync(file)) return;

      const content = readFileSync(file, "utf-8");
      const cutoff = Date.now() - 90 * 86400000; // Keep 90 days

      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const prediction = JSON.parse(line) as RunPrediction;
          if (prediction.createdAt > cutoff) {
            this.predictions.set(prediction.id, prediction);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore load errors
    }
  }

  private loadOutcomes(): void {
    try {
      const file = join(this.dataDir, "outcomes.jsonl");
      if (!existsSync(file)) return;

      const content = readFileSync(file, "utf-8");

      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const outcome = JSON.parse(line) as RunOutcome;
          // Only load outcomes for predictions we have
          if (this.predictions.has(outcome.predictionId)) {
            this.outcomes.set(outcome.predictionId, outcome);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore load errors
    }
  }

  private loadCalibrationCache(): void {
    try {
      const file = join(this.dataDir, "calibration.json");
      if (!existsSync(file)) return;

      this.calibrationCache = JSON.parse(
        readFileSync(file, "utf-8")
      ) as CalibrationStats;
    } catch {
      this.calibrationCache = null;
    }
  }

  /**
   * Clean up old data.
   */
  cleanup(maxDays = 90): void {
    const cutoff = Date.now() - maxDays * 86400000;
    let changed = false;

    for (const [id, prediction] of this.predictions) {
      if (prediction.createdAt < cutoff) {
        this.predictions.delete(id);
        this.outcomes.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.invalidateCalibrationCache();
      // Rewrite JSONL files with current data
      this.rewriteData();
    }
  }

  private rewriteData(): void {
    try {
      // Rewrite predictions
      const predictionsFile = join(this.dataDir, "predictions.jsonl");
      const predictionsContent = [...this.predictions.values()]
        .map((p) => JSON.stringify(p))
        .join("\n");
      writeFileSync(predictionsFile, predictionsContent + "\n");

      // Rewrite outcomes
      const outcomesFile = join(this.dataDir, "outcomes.jsonl");
      const outcomesContent = [...this.outcomes.values()]
        .map((o) => JSON.stringify(o))
        .join("\n");
      writeFileSync(outcomesFile, outcomesContent + "\n");
    } catch {
      // Ignore rewrite errors
    }
  }
}
