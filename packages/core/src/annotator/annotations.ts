/**
 * Session annotations and heuristic scoring.
 *
 * Stores user feedback (thumbs up/down) and computes
 * automatic success scores based on available signals.
 *
 * Storage: ~/.agentwatch/annotations.json
 */

import type { HookSession, ToolUsage } from "../types";
import { ANNOTATIONS_FILE } from "../storage/paths";
import { loadJson, saveJson } from "../storage";

/**
 * User feedback annotation for a session.
 */
export interface SessionAnnotation {
  /** Session ID (matches hook session or local transcript) */
  sessionId: string;
  /** User feedback: positive, negative, or null (unlabeled) */
  feedback: "positive" | "negative" | null;
  /** Optional notes from user */
  notes?: string;
  /** When the annotation was created/updated */
  updatedAt: string;
}

/**
 * Heuristic-based success score for a session.
 */
export interface HeuristicScore {
  /** Overall score 0-100 */
  score: number;
  /** Classification based on score */
  classification: "likely_success" | "likely_failed" | "uncertain";
  /** Individual signal scores */
  signals: {
    /** No tool failures in session */
    noFailures: { value: boolean; weight: number };
    /** Commits were made */
    hasCommits: { value: boolean; weight: number };
    /** Session ended normally (not stalled/abandoned) */
    normalEnd: { value: boolean; weight: number };
    /** Reasonable tool count (not too few, not excessive) */
    reasonableToolCount: { value: boolean; weight: number };
    /** Session duration vs tool ratio is healthy */
    healthyPacing: { value: boolean; weight: number };
  };
}

/**
 * Combined annotation data for a session.
 */
export interface SessionAnnotationData {
  annotation: SessionAnnotation | null;
  heuristic: HeuristicScore | null;
}

/**
 * All annotations stored on disk.
 */
export interface AnnotationsStore {
  /** Map of session ID to annotation */
  annotations: Record<string, SessionAnnotation>;
  /** When the store was last updated */
  updatedAt: string;
  /** Version for future migrations */
  version: number;
}

/**
 * Summary statistics for annotations.
 */
export interface AnnotationStats {
  total: number;
  positive: number;
  negative: number;
  unlabeled: number;
  likelySuccess: number;
  likelyFailed: number;
  uncertain: number;
}

/**
 * Load annotations from disk.
 */
export function loadAnnotations(): AnnotationsStore {
  const defaultStore: AnnotationsStore = {
    annotations: {},
    updatedAt: new Date().toISOString(),
    version: 1
  };

  const data = loadJson<Partial<AnnotationsStore>>(
    ANNOTATIONS_FILE,
    defaultStore
  );

  return {
    annotations: data.annotations || {},
    updatedAt: data.updatedAt || new Date().toISOString(),
    version: data.version || 1
  };
}

/**
 * Save annotations to disk.
 */
export function saveAnnotations(store: AnnotationsStore): void {
  store.updatedAt = new Date().toISOString();
  saveJson(ANNOTATIONS_FILE, store);
}

/**
 * Get annotation for a specific session.
 */
export function getAnnotation(sessionId: string): SessionAnnotation | null {
  const store = loadAnnotations();
  return store.annotations[sessionId] || null;
}

/**
 * Set annotation for a session.
 */
export function setAnnotation(
  sessionId: string,
  feedback: "positive" | "negative" | null,
  notes?: string
): SessionAnnotation {
  const store = loadAnnotations();
  const annotation: SessionAnnotation = {
    sessionId,
    feedback,
    notes,
    updatedAt: new Date().toISOString()
  };
  store.annotations[sessionId] = annotation;
  saveAnnotations(store);
  return annotation;
}

/**
 * Delete annotation for a session.
 */
export function deleteAnnotation(sessionId: string): boolean {
  const store = loadAnnotations();
  if (store.annotations[sessionId]) {
    delete store.annotations[sessionId];
    saveAnnotations(store);
    return true;
  }
  return false;
}

/**
 * Get all annotations.
 */
export function getAllAnnotations(): Record<string, SessionAnnotation> {
  const store = loadAnnotations();
  return store.annotations;
}

/**
 * Compute heuristic success score for a hook session.
 */
export function computeHeuristicScore(
  session: HookSession,
  toolUsages?: ToolUsage[]
): HeuristicScore {
  const signals = {
    noFailures: { value: true, weight: 30 },
    hasCommits: { value: false, weight: 25 },
    normalEnd: { value: true, weight: 20 },
    reasonableToolCount: { value: true, weight: 15 },
    healthyPacing: { value: true, weight: 10 }
  };

  // Check for tool failures
  if (toolUsages && toolUsages.length > 0) {
    const failures = toolUsages.filter((t) => t.success === false);
    // Allow some failures, but flag if > 20% failed
    const failureRate = failures.length / toolUsages.length;
    signals.noFailures.value = failureRate < 0.2;
  }

  // Check for commits
  signals.hasCommits.value = (session.commits?.length || 0) > 0;

  // Check for normal end (not awaiting user and has endTime, or was active recently)
  const isActive = session.endTime === undefined;
  if (isActive) {
    signals.normalEnd.value = true; // Still running, assume OK
  } else if (session.endTime) {
    // Ended - check if it was a normal end (not stalled)
    const lastActivityGap = session.endTime - session.lastActivity;
    // If last activity was right before end, it's normal
    signals.normalEnd.value = lastActivityGap < 60000; // Within 1 minute
  } else {
    // No endTime and not active - might be stalled
    signals.normalEnd.value = false;
  }

  // Reasonable tool count (between 3 and 500)
  signals.reasonableToolCount.value =
    session.toolCount >= 3 && session.toolCount <= 500;

  // Healthy pacing: not too many tools per minute
  const sessionDurationMs = isActive
    ? Date.now() - session.startTime
    : (session.endTime || session.lastActivity) - session.startTime;
  const sessionMinutes = Math.max(1, sessionDurationMs / 60000);
  const toolsPerMinute = session.toolCount / sessionMinutes;
  // Reasonable pace: 0.5 to 20 tools per minute
  signals.healthyPacing.value = toolsPerMinute >= 0.5 && toolsPerMinute <= 20;

  // Calculate total score
  let score = 0;
  let totalWeight = 0;
  for (const signal of Object.values(signals)) {
    if (signal.value) {
      score += signal.weight;
    }
    totalWeight += signal.weight;
  }
  const normalizedScore = Math.round((score / totalWeight) * 100);

  // Classify
  let classification: HeuristicScore["classification"];
  if (normalizedScore >= 70) {
    classification = "likely_success";
  } else if (normalizedScore < 40) {
    classification = "likely_failed";
  } else {
    classification = "uncertain";
  }

  return {
    score: normalizedScore,
    classification,
    signals
  };
}

/**
 * Get annotation statistics.
 */
export function getAnnotationStats(
  sessionIds: string[],
  heuristicScores?: Map<string, HeuristicScore>
): AnnotationStats {
  const store = loadAnnotations();

  let positive = 0;
  let negative = 0;
  let likelySuccess = 0;
  let likelyFailed = 0;
  let uncertain = 0;

  for (const sessionId of sessionIds) {
    const annotation = store.annotations[sessionId];
    if (annotation?.feedback === "positive") {
      positive++;
    } else if (annotation?.feedback === "negative") {
      negative++;
    }

    const heuristic = heuristicScores?.get(sessionId);
    if (heuristic) {
      if (heuristic.classification === "likely_success") {
        likelySuccess++;
      } else if (heuristic.classification === "likely_failed") {
        likelyFailed++;
      } else {
        uncertain++;
      }
    } else {
      uncertain++;
    }
  }

  return {
    total: sessionIds.length,
    positive,
    negative,
    unlabeled: sessionIds.length - positive - negative,
    likelySuccess,
    likelyFailed,
    uncertain
  };
}
