/**
 * Session enrichment types for agentwatch
 *
 * Enrichments are computed or user-provided metadata attached to sessions.
 * They support the Objects panel (detailed session view) and Analytics panel.
 */

// =============================================================================
// SESSION REFERENCE
// =============================================================================

/**
 * Flexible reference to a session (supports multiple ID types for linking).
 * Resolution order: correlationId > hookSessionId > transcriptId
 */
export interface SessionRef {
  /** Primary: correlation ID from Conversation */
  correlationId?: string;
  /** Fallback: hook session ID */
  hookSessionId?: string;
  /** Fallback: local transcript ID */
  transcriptId?: string;
}

/**
 * Source of an enrichment.
 */
export type EnrichmentSource =
  | "auto" // Automatically computed at session end
  | "user" // User-provided via UI
  | "import" // Imported from external source
  | "heuristic"; // Computed from heuristics

// =============================================================================
// TASK TYPES & AUTO-TAGS
// =============================================================================

/**
 * Inferred task type categories.
 */
export type TaskType =
  | "feature" // New functionality, significant additions
  | "bugfix" // Fixes, error resolution
  | "refactor" // Restructuring without behavior change
  | "test" // Test additions/modifications
  | "docs" // Documentation changes
  | "config" // Configuration/build changes
  | "exploration" // Read-heavy, no commits
  | "unknown"; // Could not infer

/**
 * Tag categories for auto-generated tags.
 */
export type TagCategory =
  | "task_type" // bugfix, feature, refactor, test, docs
  | "language" // typescript, python, rust
  | "domain" // frontend, backend, database, devops
  | "outcome" // success, failure, abandoned
  | "pattern" // debugging, exploration, implementation
  | "custom"; // user-defined

/**
 * A single auto-generated tag.
 */
export interface AutoTag {
  /** Tag name (e.g., "bugfix", "typescript", "frontend") */
  name: string;
  /** Category of the tag */
  category: TagCategory;
  /** How the tag was inferred (e.g., "file extension .ts", "command npm test") */
  inferredFrom: string;
  /** Confidence score 0-1 */
  confidence: number;
}

/**
 * Auto-tags enrichment for a session.
 */
export interface AutoTagsEnrichment {
  /** Auto-generated tags based on session analysis */
  tags: AutoTag[];
  /** Inferred primary task type */
  taskType: TaskType;
  /** User-defined tags (editable) */
  userTags: string[];
  /** When tags were computed */
  computedAt: string;
}

// =============================================================================
// OUTCOME SIGNALS
// =============================================================================

/**
 * Test run results extracted from tool responses.
 */
export interface TestResults {
  /** Whether tests were run */
  ran: boolean;
  /** Number of passing tests */
  passed: number;
  /** Number of failing tests */
  failed: number;
  /** Number of skipped tests */
  skipped: number;
  /** Total test duration in ms */
  totalDurationMs: number;
  /** Timestamp of last test run */
  lastRunAt: string;
  /** Test command used (e.g., "npm test", "pytest") */
  testCommand?: string;
}

/**
 * Lint results extracted from tool responses.
 */
export interface LintResults {
  /** Whether linting was run */
  ran: boolean;
  /** Number of errors */
  errors: number;
  /** Number of warnings */
  warnings: number;
  /** Number of auto-fixed issues */
  autoFixed: number;
  /** Linter used (e.g., "eslint", "ruff") */
  linter?: string;
}

/**
 * Build status extracted from tool responses.
 */
export interface BuildStatus {
  /** Whether build was run */
  ran: boolean;
  /** Whether build succeeded */
  success: boolean;
  /** Build duration in ms */
  durationMs: number;
  /** Build tool used (e.g., "tsc", "cargo build") */
  buildTool?: string;
}

/**
 * Summary of exit codes from commands.
 */
export interface ExitCodeSummary {
  /** Count of zero exit codes (success) */
  successCount: number;
  /** Count of non-zero exit codes (failure) */
  failureCount: number;
  /** Last non-zero exit code details */
  lastFailure?: {
    code: number;
    command: string;
    timestamp: number;
  };
}

/**
 * Git operation outcomes during session.
 */
export interface GitOutcomes {
  /** Number of commits created */
  commitsCreated: number;
  /** Number of commits pushed */
  commitsPushed: number;
  /** Whether merge conflicts occurred */
  mergeConflicts: boolean;
  /** Number of rebase attempts */
  rebaseAttempts: number;
  /** Number of stash operations */
  stashOperations: number;
}

/**
 * Outcome signals enrichment - extracted from tool responses at session end.
 */
export interface OutcomeSignalsEnrichment {
  /** Test run results */
  testResults?: TestResults;
  /** Lint results */
  lintResults?: LintResults;
  /** Build status */
  buildStatus?: BuildStatus;
  /** Exit code summary */
  exitCodes: ExitCodeSummary;
  /** Time to first test pass after changes (ms) */
  timeToGreenMs?: number;
  /** Git operation outcomes */
  gitOutcomes?: GitOutcomes;
  /** When signals were extracted */
  computedAt: string;
}

// =============================================================================
// QUALITY SCORE
// =============================================================================

/**
 * Quality score dimensions.
 */
export interface QualityDimensions {
  /** Task completion score 0-100 */
  completion: number;
  /** Code quality score 0-100 */
  codeQuality: number;
  /** Efficiency score 0-100 (tool usage, no loops) */
  efficiency: number;
  /** Safety score 0-100 (no dangerous ops) */
  safety: number;
}

/**
 * Classification based on quality score.
 */
export type QualityClassification =
  | "excellent" // 80-100
  | "good" // 60-79
  | "fair" // 40-59
  | "poor" // 0-39
  | "unknown"; // insufficient data

/**
 * Heuristic signal used in quality scoring.
 */
export interface HeuristicSignal {
  /** Whether the signal is positive */
  value: boolean;
  /** Weight in overall score (0-100) */
  weight: number;
  /** Description of the signal */
  description?: string;
}

/**
 * Quality score enrichment - composite score with breakdown.
 */
export interface QualityScoreEnrichment {
  /** Overall quality score 0-100 */
  overall: number;
  /** Classification based on score */
  classification: QualityClassification;
  /** Breakdown by dimension */
  dimensions: QualityDimensions;
  /** Heuristic signals used in calculation */
  heuristicSignals: Record<string, HeuristicSignal>;
  /** When score was computed */
  computedAt: string;
}

// =============================================================================
// QUALITY CONFIG
// =============================================================================

/**
 * Weights for quality dimensions (should sum to 100).
 */
export interface QualityDimensionWeights {
  /** Task completion weight (default: 35) */
  completion: number;
  /** Code quality weight (default: 25) */
  codeQuality: number;
  /** Efficiency weight (default: 25) */
  efficiency: number;
  /** Safety weight (default: 15) */
  safety: number;
}

/**
 * Weights for heuristic signals (should sum to 100).
 */
export interface QualitySignalWeights {
  /** No failures signal weight (default: 30) */
  noFailures: number;
  /** Has commits signal weight (default: 25) */
  hasCommits: number;
  /** Normal end signal weight (default: 20) */
  normalEnd: number;
  /** Reasonable tool count signal weight (default: 15) */
  reasonableToolCount: number;
  /** Healthy pacing signal weight (default: 10) */
  healthyPacing: number;
}

/**
 * Quality scoring pipeline configuration.
 */
export interface QualityConfig {
  /** Weights for quality dimensions */
  dimensionWeights: QualityDimensionWeights;
  /** Weights for heuristic signals */
  signalWeights: QualitySignalWeights;
}

/**
 * Default quality configuration.
 */
export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  dimensionWeights: {
    completion: 35,
    codeQuality: 25,
    efficiency: 25,
    safety: 15
  },
  signalWeights: {
    noFailures: 30,
    hasCommits: 25,
    normalEnd: 20,
    reasonableToolCount: 15,
    healthyPacing: 10
  }
};

// =============================================================================
// MANUAL ANNOTATION
// =============================================================================

/**
 * User feedback type.
 */
export type FeedbackType = "positive" | "negative" | null;

/**
 * Workflow/review status for a session.
 * Used for tracking user progress through transcript review.
 */
export type WorkflowStatus =
  | "pending" // Not yet reviewed (default)
  | "reviewed" // User has reviewed the session
  | "ready_to_contribute" // Approved for dataset contribution
  | "skipped"; // User chose to skip/ignore

/**
 * Manual annotation enrichment - user-provided feedback.
 */
export interface ManualAnnotationEnrichment {
  /** User feedback (thumbs up/down) */
  feedback: FeedbackType;
  /** User-provided notes */
  notes?: string;
  /** User-defined tags */
  userTags: string[];
  /** Arbitrary user-provided structured data */
  extraData?: Record<string, unknown>;
  /** Optional 1-5 rating for more granular feedback */
  rating?: number;
  /** User description of the task goal */
  taskDescription?: string;
  /** Whether the goal was achieved */
  goalAchieved?: boolean;
  /** Workflow/review status for contribution tracking */
  workflowStatus?: WorkflowStatus;
  /** When annotation was last updated */
  updatedAt: string;
}

// =============================================================================
// LOOP DETECTION
// =============================================================================

/**
 * Type of detected loop pattern.
 */
export type LoopPatternType =
  | "retry" // Same command repeated with failures
  | "oscillation" // Alternating between two states
  | "dead_end" // Long pause followed by different approach
  | "permission_loop"; // Repeated permission requests

/**
 * How a loop was resolved.
 */
export type LoopResolution =
  | "success" // Eventually succeeded
  | "user_intervention" // User stepped in
  | "timeout" // Agent timed out
  | "abandoned"; // Agent gave up

/**
 * A detected loop pattern.
 */
export interface LoopPattern {
  /** Type of loop */
  patternType: LoopPatternType;
  /** Commands or tools involved */
  involvedOperations: string[];
  /** Number of iterations */
  iterations: number;
  /** When the loop started (timestamp) */
  startedAt: number;
  /** When the loop ended (null if ongoing) */
  endedAt: number | null;
  /** How the loop was resolved */
  resolution?: LoopResolution;
  /** Normalized command pattern */
  normalizedPattern?: string;
}

/**
 * Loop detection enrichment - stuck pattern analysis.
 */
export interface LoopDetectionEnrichment {
  /** Whether any loops were detected */
  loopsDetected: boolean;
  /** Detected loop patterns */
  patterns: LoopPattern[];
  /** Total retry count across all patterns */
  totalRetries: number;
  /** Time spent in loops (ms) */
  timeInLoopsMs: number;
  /** When detection was run */
  computedAt: string;
}

// =============================================================================
// GIT DIFF SNAPSHOT
// =============================================================================

/**
 * Git state at a point in time.
 */
export interface GitStateSnapshot {
  /** Current branch name */
  branch: string;
  /** Current commit hash (short) */
  commitHash: string;
  /** Whether working directory is dirty */
  isDirty: boolean;
  /** Number of staged files */
  stagedCount: number;
  /** Number of unstaged modified files */
  unstagedCount: number;
  /** Number of untracked files */
  untrackedCount: number;
  /** When snapshot was captured */
  capturedAt: number;
}

/**
 * Summary of changes between session start and end.
 */
export interface DiffSummary {
  /** Number of files changed */
  filesChanged: number;
  /** Lines added */
  linesAdded: number;
  /** Lines removed */
  linesRemoved: number;
  /** New files created */
  filesCreated: number;
  /** Files deleted */
  filesDeleted: number;
  /** Commits created during session */
  commitsCreated: number;
}

/**
 * Individual file change in diff.
 */
export interface FileChange {
  /** File path */
  path: string;
  /** Change status */
  status: "added" | "modified" | "deleted" | "renamed";
  /** Lines added */
  insertions: number;
  /** Lines removed */
  deletions: number;
}

/**
 * Git diff snapshot enrichment - repo state at session start/end.
 */
export interface DiffSnapshotEnrichment {
  /** Snapshot at session start */
  start: GitStateSnapshot;
  /** Snapshot at session end (null if still active) */
  end: GitStateSnapshot | null;
  /** Summary of changes */
  summary: DiffSummary;
  /** Per-file changes (top 50) */
  fileChanges: FileChange[];
  /** When snapshot was computed */
  computedAt: string;
}

// =============================================================================
// COMBINED SESSION ENRICHMENTS
// =============================================================================

/**
 * Source of enrichment data.
 */
export type EnrichmentDataSource =
  | "hooks" // Computed from Claude Code hooks (realtime)
  | "transcript"; // Computed from transcript file analysis

/**
 * All enrichments for a single session.
 */
export interface SessionEnrichments {
  /** Session reference */
  sessionRef: SessionRef;
  /** Auto-tags and task type */
  autoTags?: AutoTagsEnrichment;
  /** Outcome signals (tests, lint, build) */
  outcomeSignals?: OutcomeSignalsEnrichment;
  /** Quality score with breakdown */
  qualityScore?: QualityScoreEnrichment;
  /** Manual annotation (thumbs, notes) */
  manualAnnotation?: ManualAnnotationEnrichment;
  /** Loop detection results */
  loopDetection?: LoopDetectionEnrichment;
  /** Git diff snapshot */
  diffSnapshot?: DiffSnapshotEnrichment;
  /** When any enrichment was last updated */
  updatedAt: string;
  /** Source of the enrichment data (hooks = realtime, transcript = post-analysis) */
  source?: EnrichmentDataSource;
}

// =============================================================================
// ENRICHMENT STORE
// =============================================================================

/**
 * Enrichment store persisted to disk.
 */
export interface EnrichmentStore {
  /** Map of canonical session ID to enrichments */
  sessions: Record<string, SessionEnrichments>;
  /** Store metadata */
  meta: {
    version: number;
    updatedAt: string;
    /** Count of sessions by enrichment type */
    enrichmentCounts: {
      autoTags: number;
      outcomeSignals: number;
      qualityScore: number;
      manualAnnotation: number;
      loopDetection: number;
      diffSnapshot: number;
    };
  };
}

/**
 * Audit log entry for enrichment changes.
 */
export interface EnrichmentAuditEntry {
  /** When the change occurred */
  timestamp: string;
  /** What happened */
  action: "create" | "update" | "delete";
  /** Session reference */
  sessionRef: SessionRef;
  /** Which enrichment type was modified */
  enrichmentType:
    | "autoTags"
    | "outcomeSignals"
    | "qualityScore"
    | "manualAnnotation"
    | "loopDetection"
    | "diffSnapshot";
  /** Source of the change */
  source: EnrichmentSource;
  /** Previous value (for updates/deletes) */
  previousValue?: unknown;
  /** New value (for creates/updates) */
  newValue?: unknown;
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

/**
 * Analytics summary for dashboard.
 */
export interface AnalyticsSummary {
  /** Total number of sessions in range */
  totalSessions: number;
  /** Success rate percentage (0-100) */
  successRate: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Average session duration in ms */
  avgDurationMs: number;
  /** Trend indicators */
  trends: {
    successRate: "up" | "down" | "stable";
    cost: "up" | "down" | "stable";
    quality: "up" | "down" | "stable";
  };
}

/**
 * Daily/weekly metric point for time series.
 */
export interface TrendPoint {
  /** Date string (YYYY-MM-DD or YYYY-Www) */
  date: string;
  /** Number of successful sessions */
  successCount: number;
  /** Number of failed sessions */
  failureCount: number;
  /** Success rate percentage */
  rate: number;
}

/**
 * Cost breakdown by task type.
 */
export interface CostByType {
  /** Task type */
  taskType: TaskType;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Number of sessions */
  sessionCount: number;
  /** Average cost per session */
  avgCostUsd: number;
}

/**
 * Tool retry pattern for analytics.
 */
export interface ToolRetryPattern {
  /** Tool name */
  toolName: string;
  /** Total calls */
  totalCalls: number;
  /** Number of retries (same tool, similar input, after failure) */
  retries: number;
  /** Failure rate percentage */
  failureRate: number;
  /** Average retries per failure */
  avgRetriesPerFailure: number;
  /** Common error messages */
  commonErrors: string[];
}

/**
 * Quality score distribution bucket.
 */
export interface QualityBucket {
  /** Bucket range label (e.g., "0-25", "25-50") */
  range: string;
  /** Min score in bucket */
  min: number;
  /** Max score in bucket */
  max: number;
  /** Number of sessions in bucket */
  count: number;
  /** Percentage of total */
  percentage: number;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a canonical ID from a session reference.
 */
export function canonicalizeSessionRef(ref: SessionRef): string {
  if (ref.correlationId) return `corr:${ref.correlationId}`;
  if (ref.hookSessionId) return `hook:${ref.hookSessionId}`;
  if (ref.transcriptId) return `transcript:${ref.transcriptId}`;
  throw new Error("Invalid SessionRef: no ID provided");
}

/**
 * Get quality classification from score.
 */
export function getQualityClassification(score: number): QualityClassification {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  if (score > 0) return "poor";
  return "unknown";
}

/**
 * Create an empty SessionEnrichments object.
 */
export function createEmptyEnrichments(ref: SessionRef): SessionEnrichments {
  return {
    sessionRef: ref,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Create an empty EnrichmentStore.
 */
export function createEmptyEnrichmentStore(): EnrichmentStore {
  return {
    sessions: {},
    meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      enrichmentCounts: {
        autoTags: 0,
        outcomeSignals: 0,
        qualityScore: 0,
        manualAnnotation: 0,
        loopDetection: 0,
        diffSnapshot: 0
      }
    }
  };
}
