/**
 * Command Center: Run Prediction & Calibration Types
 *
 * Enables users to register predictions before agent runs and track
 * their calibration accuracy over time.
 */

/**
 * Confidence level for predictions.
 * - low: ~50% confident actual will be within predicted range
 * - medium: ~75% confident
 * - high: ~90% confident
 */
export type ConfidenceLevel = "low" | "medium" | "high";

/**
 * User prediction made before running an agent task.
 */
export interface RunPrediction {
  /** Unique prediction ID */
  id: string;

  /** Associated managed session ID (from `aw run`) */
  managedSessionId: string;

  /** When prediction was created (unix ms) */
  createdAt: number;

  // Time prediction
  /** Predicted wall clock time in minutes */
  predictedDurationMinutes: number;
  /** Confidence level for duration prediction */
  durationConfidence: ConfidenceLevel;

  // Token prediction
  /** Predicted total tokens (input + output) */
  predictedTokens: number;
  /** Confidence level for token prediction */
  tokenConfidence: ConfidenceLevel;

  // Context
  /** Freeform description of what success looks like */
  successConditions: string;
  /** What the user is trying to accomplish */
  intentions: string;

  // Principles (from PRINCIPLES.md)
  /** Selected principles to emphasize (injected into prompt) */
  selectedPrinciples?: string[];
  /** Path to PRINCIPLES.md if found */
  principlesPath?: string;
}

/**
 * Actual outcomes after session completes.
 */
export interface RunOutcome {
  /** Associated prediction ID */
  predictionId: string;

  /** Managed session ID */
  managedSessionId: string;

  /** When outcome was recorded (unix ms) */
  recordedAt: number;

  // Actuals
  /** Actual duration in minutes */
  actualDurationMinutes: number;
  /** Actual total tokens (if available from hook data) */
  actualTokens: number;
  /** Exit code */
  exitCode: number;

  /** Whether user marked it as successful */
  userMarkedSuccess: boolean;
  /** User notes on outcome */
  outcomeNotes?: string;

  // Auto-detected signals (from enrichments)
  /** Number of commits made */
  commitsCreated?: number;
  /** Test results if available */
  testsPassed?: boolean;
  /** Build success if available */
  buildSuccess?: boolean;
}

/**
 * Calibration result for a single prediction.
 */
export interface CalibrationResult {
  predictionId: string;

  // Duration calibration
  /** Percentage error: (actual - predicted) / predicted */
  durationError: number;
  /** Whether actual was within confidence interval */
  durationWithinConfidence: boolean;
  /** Score 0-100 for duration prediction */
  durationScore: number;

  // Token calibration
  tokenError: number;
  tokenWithinConfidence: boolean;
  tokenScore: number;

  // Success calibration
  /** Did success prediction match outcome? */
  successPredictionCorrect: boolean;
  successScore: number;

  // Overall
  /** Weighted average score 0-100 */
  overallScore: number;
}

/**
 * User's running calibration statistics.
 */
export interface CalibrationStats {
  /** Total predictions made */
  totalPredictions: number;
  /** Predictions with recorded outcomes */
  completedPredictions: number;

  /** Overall calibration score 0-100 */
  overallCalibrationScore: number;

  /** Recent trend direction */
  recentTrend: "improving" | "stable" | "declining";

  /** Historical data for charts (daily aggregates) */
  history: Array<{
    date: string; // YYYY-MM-DD
    score: number;
    count: number;
  }>;
}

/**
 * Parsed principle from PRINCIPLES.md
 */
export interface Principle {
  /** Short identifier/key (derived from text) */
  id: string;
  /** Full principle text */
  text: string;
  /** Category/section header if present */
  category?: string;
}

/**
 * PRINCIPLES.md parsing result.
 */
export interface PrinciplesFile {
  /** Path to the file */
  path: string;
  /** Parsed principles */
  principles: Principle[];
  /** File last modified time (unix ms) */
  lastModified: number;
}

// Confidence interval multipliers for scoring
export const CONFIDENCE_INTERVALS: Record<ConfidenceLevel, number> = {
  low: 0.5, // +/- 50%
  medium: 0.25, // +/- 25%
  high: 0.1 // +/- 10%
};
