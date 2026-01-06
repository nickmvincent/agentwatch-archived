/**
 * Enrichment store for Agentwatch Objects.
 *
 * Agentwatch Objects are the core unit of useful coding agent data:
 * - Captured from transcripts, hooks, wrapped processes, or scanned processes
 * - Merged into a coherent object with the best available data
 * - Scored automatically (quality, outcomes, loop detection)
 * - Annotated by users (thumbs, notes, tags)
 * - Ready to share publicly or privately
 *
 * This store persists enrichments (auto-tags, scores, annotations, etc.)
 * that enhance raw session data into shareable, valuable objects.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { logAuditEvent } from "./audit-log";
import type {
  AutoTagsEnrichment,
  DiffSnapshotEnrichment,
  EnrichmentSource,
  EnrichmentStore,
  FeedbackType,
  LoopDetectionEnrichment,
  ManualAnnotationEnrichment,
  OutcomeSignalsEnrichment,
  QualityScoreEnrichment,
  SessionEnrichments,
  SessionRef,
  WorkflowStatus
} from "@agentwatch/core";

import { canonicalizeSessionRef } from "@agentwatch/core";

// Re-export utility functions
export { canonicalizeSessionRef } from "@agentwatch/core";

const ENRICHMENTS_DIR = "~/.agentwatch/enrichments";
const STORE_PATH = "~/.agentwatch/enrichments/store.json";

function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// =============================================================================
// STORE OPERATIONS
// =============================================================================

/**
 * Load enrichment store from disk.
 */
export function loadEnrichmentStore(): EnrichmentStore {
  const path = expandPath(STORE_PATH);
  if (!existsSync(path)) {
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
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return {
      sessions: data.sessions || {},
      meta: {
        version: data.meta?.version || 1,
        updatedAt: data.meta?.updatedAt || new Date().toISOString(),
        enrichmentCounts: data.meta?.enrichmentCounts || {
          autoTags: 0,
          outcomeSignals: 0,
          qualityScore: 0,
          manualAnnotation: 0,
          loopDetection: 0,
          diffSnapshot: 0
        }
      }
    };
  } catch {
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
}

/**
 * Save enrichment store to disk.
 */
export function saveEnrichmentStore(store: EnrichmentStore): void {
  const path = expandPath(STORE_PATH);
  ensureDir(path);
  store.meta.updatedAt = new Date().toISOString();

  // Recount enrichments
  store.meta.enrichmentCounts = {
    autoTags: 0,
    outcomeSignals: 0,
    qualityScore: 0,
    manualAnnotation: 0,
    loopDetection: 0,
    diffSnapshot: 0
  };
  for (const session of Object.values(store.sessions)) {
    if (session.autoTags) store.meta.enrichmentCounts.autoTags++;
    if (session.outcomeSignals) store.meta.enrichmentCounts.outcomeSignals++;
    if (session.qualityScore) store.meta.enrichmentCounts.qualityScore++;
    if (session.manualAnnotation)
      store.meta.enrichmentCounts.manualAnnotation++;
    if (session.loopDetection) store.meta.enrichmentCounts.loopDetection++;
    if (session.diffSnapshot) store.meta.enrichmentCounts.diffSnapshot++;
  }

  writeFileSync(path, JSON.stringify(store, null, 2));
}

// =============================================================================
// ENRICHMENT CRUD
// =============================================================================

/**
 * Get canonical ID for a session reference.
 */
function getCanonicalId(ref: SessionRef): string {
  if (ref.correlationId) return `corr:${ref.correlationId}`;
  if (ref.hookSessionId) return `hook:${ref.hookSessionId}`;
  if (ref.transcriptId) return `transcript:${ref.transcriptId}`;
  throw new Error("Invalid SessionRef: no ID provided");
}

/**
 * Get all enrichments for a session.
 * Tries multiple ID formats to handle legacy data where hookSessionId was used as correlationId.
 */
export function getEnrichments(ref: SessionRef): SessionEnrichments | null {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);

  // Try the canonical ID first
  if (store.sessions[id]) {
    return store.sessions[id];
  }

  // If looking up by hookSessionId and not found, also try corr: prefix
  // (legacy data stored hookSessionId as correlationId)
  if (ref.hookSessionId && !ref.correlationId) {
    const altId = `corr:${ref.hookSessionId}`;
    if (store.sessions[altId]) {
      return store.sessions[altId];
    }
  }

  return null;
}

/**
 * Get or create enrichments for a session.
 */
export function getOrCreateEnrichments(ref: SessionRef): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);

  if (!store.sessions[id]) {
    store.sessions[id] = {
      sessionRef: ref,
      updatedAt: new Date().toISOString()
    };
    saveEnrichmentStore(store);
  }

  return store.sessions[id];
}

/**
 * Set auto-tags enrichment for a session.
 */
export function setAutoTags(
  ref: SessionRef,
  enrichment: AutoTagsEnrichment,
  source: EnrichmentSource = "auto"
): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);
  const now = new Date().toISOString();

  const existing = store.sessions[id];
  const previousValue = existing?.autoTags;

  if (!store.sessions[id]) {
    store.sessions[id] = { sessionRef: ref, updatedAt: now };
  }

  store.sessions[id].autoTags = enrichment;
  store.sessions[id].updatedAt = now;
  saveEnrichmentStore(store);

  logAuditEvent(
    "enrichment",
    previousValue ? "update" : "create",
    id,
    `AutoTags enrichment ${previousValue ? "updated" : "created"}`,
    { enrichmentType: "autoTags", sessionRef: ref, enrichmentSource: source },
    source === "user" ? "user" : "api"
  );

  return store.sessions[id];
}

/**
 * Set outcome signals enrichment for a session.
 */
export function setOutcomeSignals(
  ref: SessionRef,
  enrichment: OutcomeSignalsEnrichment,
  source: EnrichmentSource = "auto"
): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);
  const now = new Date().toISOString();

  const existing = store.sessions[id];
  const previousValue = existing?.outcomeSignals;

  if (!store.sessions[id]) {
    store.sessions[id] = { sessionRef: ref, updatedAt: now };
  }

  store.sessions[id].outcomeSignals = enrichment;
  store.sessions[id].updatedAt = now;
  saveEnrichmentStore(store);

  logAuditEvent(
    "enrichment",
    previousValue ? "update" : "create",
    id,
    `OutcomeSignals enrichment ${previousValue ? "updated" : "created"}`,
    {
      enrichmentType: "outcomeSignals",
      sessionRef: ref,
      enrichmentSource: source
    },
    source === "user" ? "user" : "api"
  );

  return store.sessions[id];
}

/**
 * Set quality score enrichment for a session.
 */
export function setQualityScore(
  ref: SessionRef,
  enrichment: QualityScoreEnrichment,
  source: EnrichmentSource = "auto"
): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);
  const now = new Date().toISOString();

  const existing = store.sessions[id];
  const previousValue = existing?.qualityScore;

  if (!store.sessions[id]) {
    store.sessions[id] = { sessionRef: ref, updatedAt: now };
  }

  store.sessions[id].qualityScore = enrichment;
  store.sessions[id].updatedAt = now;
  saveEnrichmentStore(store);

  logAuditEvent(
    "enrichment",
    previousValue ? "update" : "create",
    id,
    `QualityScore enrichment ${previousValue ? "updated" : "created"}`,
    {
      enrichmentType: "qualityScore",
      sessionRef: ref,
      enrichmentSource: source
    },
    source === "user" ? "user" : "api"
  );

  return store.sessions[id];
}

/**
 * Set manual annotation for a session (thumbs up/down, notes, tags, workflow status).
 */
export function setManualAnnotation(
  ref: SessionRef,
  feedback: FeedbackType,
  options?: {
    notes?: string;
    userTags?: string[];
    extraData?: Record<string, unknown>;
    rating?: number;
    taskDescription?: string;
    goalAchieved?: boolean;
    workflowStatus?: WorkflowStatus;
  }
): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);
  const now = new Date().toISOString();

  const existing = store.sessions[id];
  const previousValue = existing?.manualAnnotation;

  if (!store.sessions[id]) {
    store.sessions[id] = { sessionRef: ref, updatedAt: now };
  }

  // Merge with existing annotation
  const existingAnnotation = existing?.manualAnnotation;
  const enrichment: ManualAnnotationEnrichment = {
    feedback,
    notes: options?.notes ?? existingAnnotation?.notes,
    userTags: options?.userTags ?? existingAnnotation?.userTags ?? [],
    extraData: options?.extraData ?? existingAnnotation?.extraData,
    rating: options?.rating ?? existingAnnotation?.rating,
    taskDescription:
      options?.taskDescription ?? existingAnnotation?.taskDescription,
    goalAchieved: options?.goalAchieved ?? existingAnnotation?.goalAchieved,
    workflowStatus:
      options?.workflowStatus ?? existingAnnotation?.workflowStatus,
    updatedAt: now
  };

  store.sessions[id].manualAnnotation = enrichment;
  store.sessions[id].updatedAt = now;
  saveEnrichmentStore(store);

  logAuditEvent(
    "enrichment",
    previousValue ? "update" : "create",
    id,
    `ManualAnnotation ${previousValue ? "updated" : "created"}: ${feedback || "no feedback"}`,
    { enrichmentType: "manualAnnotation", sessionRef: ref, feedback },
    "user"
  );

  return store.sessions[id];
}

/**
 * Set loop detection enrichment for a session.
 */
export function setLoopDetection(
  ref: SessionRef,
  enrichment: LoopDetectionEnrichment,
  source: EnrichmentSource = "auto"
): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);
  const now = new Date().toISOString();

  const existing = store.sessions[id];
  const previousValue = existing?.loopDetection;

  if (!store.sessions[id]) {
    store.sessions[id] = { sessionRef: ref, updatedAt: now };
  }

  store.sessions[id].loopDetection = enrichment;
  store.sessions[id].updatedAt = now;
  saveEnrichmentStore(store);

  logAuditEvent(
    "enrichment",
    previousValue ? "update" : "create",
    id,
    `LoopDetection enrichment ${previousValue ? "updated" : "created"}`,
    {
      enrichmentType: "loopDetection",
      sessionRef: ref,
      enrichmentSource: source
    },
    source === "user" ? "user" : "api"
  );

  return store.sessions[id];
}

/**
 * Set diff snapshot enrichment for a session.
 */
export function setDiffSnapshot(
  ref: SessionRef,
  enrichment: DiffSnapshotEnrichment,
  source: EnrichmentSource = "auto"
): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);
  const now = new Date().toISOString();

  const existing = store.sessions[id];
  const previousValue = existing?.diffSnapshot;

  if (!store.sessions[id]) {
    store.sessions[id] = { sessionRef: ref, updatedAt: now };
  }

  store.sessions[id].diffSnapshot = enrichment;
  store.sessions[id].updatedAt = now;
  saveEnrichmentStore(store);

  logAuditEvent(
    "enrichment",
    previousValue ? "update" : "create",
    id,
    `DiffSnapshot enrichment ${previousValue ? "updated" : "created"}`,
    {
      enrichmentType: "diffSnapshot",
      sessionRef: ref,
      enrichmentSource: source
    },
    source === "user" ? "user" : "api"
  );

  return store.sessions[id];
}

/**
 * Update user tags on a session.
 */
export function updateUserTags(
  ref: SessionRef,
  tags: string[]
): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);
  const now = new Date().toISOString();

  if (!store.sessions[id]) {
    store.sessions[id] = { sessionRef: ref, updatedAt: now };
  }

  // Update in autoTags if exists
  if (store.sessions[id].autoTags) {
    store.sessions[id].autoTags.userTags = tags;
  }

  // Update in manualAnnotation if exists, or create one
  if (store.sessions[id].manualAnnotation) {
    store.sessions[id].manualAnnotation.userTags = tags;
    store.sessions[id].manualAnnotation.updatedAt = now;
  } else {
    store.sessions[id].manualAnnotation = {
      feedback: null,
      userTags: tags,
      updatedAt: now
    };
  }

  store.sessions[id].updatedAt = now;
  saveEnrichmentStore(store);

  return store.sessions[id];
}

/**
 * Delete all enrichments for a session.
 */
export function deleteEnrichments(ref: SessionRef): boolean {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);

  if (store.sessions[id]) {
    delete store.sessions[id];
    saveEnrichmentStore(store);

    logAuditEvent(
      "enrichment",
      "delete",
      id,
      "All enrichments deleted for session",
      { sessionRef: ref },
      "user"
    );

    return true;
  }
  return false;
}

/**
 * Get all sessions with enrichments.
 */
export function getAllEnrichments(): Record<string, SessionEnrichments> {
  const store = loadEnrichmentStore();
  return store.sessions;
}

/**
 * Get enrichment store metadata.
 */
export function getEnrichmentStoreMeta(): EnrichmentStore["meta"] {
  const store = loadEnrichmentStore();
  return store.meta;
}

/**
 * Bulk get enrichments for multiple sessions.
 */
export function bulkGetEnrichments(
  refs: SessionRef[]
): Record<string, SessionEnrichments | null> {
  const store = loadEnrichmentStore();
  const result: Record<string, SessionEnrichments | null> = {};

  for (const ref of refs) {
    const id = getCanonicalId(ref);
    result[id] = store.sessions[id] || null;
  }

  return result;
}

// =============================================================================
// MIGRATION FROM OLD ANNOTATIONS
// =============================================================================

/**
 * Migrate old annotations.json to new enrichment store.
 * Call this once on daemon startup.
 */
export function migrateFromAnnotations(): {
  migrated: number;
  skipped: number;
} {
  const oldPath = expandPath("~/.agentwatch/annotations.json");
  const backupPath = expandPath("~/.agentwatch/annotations.json.backup");

  if (!existsSync(oldPath)) {
    return { migrated: 0, skipped: 0 };
  }

  // Check if already migrated
  if (existsSync(backupPath)) {
    return { migrated: 0, skipped: 0 };
  }

  try {
    const oldData = JSON.parse(readFileSync(oldPath, "utf-8"));
    const annotations = oldData.annotations || {};

    let migrated = 0;
    let skipped = 0;

    for (const [sessionId, annotation] of Object.entries(annotations)) {
      const ann = annotation as {
        feedback?: string;
        notes?: string;
        updatedAt?: string;
      };

      // Create session ref from old sessionId
      const ref: SessionRef = { hookSessionId: sessionId };

      // Check if already exists in new store
      const existing = getEnrichments(ref);
      if (existing?.manualAnnotation) {
        skipped++;
        continue;
      }

      // Migrate to new format
      setManualAnnotation(ref, (ann.feedback as FeedbackType) || null, {
        notes: ann.notes
      });
      migrated++;
    }

    // Backup old file
    if (migrated > 0) {
      const fs = require("fs");
      fs.renameSync(oldPath, backupPath);
    }

    return { migrated, skipped };
  } catch (err) {
    console.error("Migration from annotations.json failed:", err);
    return { migrated: 0, skipped: 0 };
  }
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get enrichment statistics.
 */
export function getEnrichmentStats(): {
  totalSessions: number;
  byType: EnrichmentStore["meta"]["enrichmentCounts"];
  annotated: { positive: number; negative: number; unlabeled: number };
  qualityDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
} {
  const store = loadEnrichmentStore();

  const stats = {
    totalSessions: Object.keys(store.sessions).length,
    byType: store.meta.enrichmentCounts,
    annotated: { positive: 0, negative: 0, unlabeled: 0 },
    qualityDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 }
  };

  for (const session of Object.values(store.sessions)) {
    // Count annotations
    if (session.manualAnnotation?.feedback === "positive") {
      stats.annotated.positive++;
    } else if (session.manualAnnotation?.feedback === "negative") {
      stats.annotated.negative++;
    } else {
      stats.annotated.unlabeled++;
    }

    // Count quality scores
    if (session.qualityScore) {
      const score = session.qualityScore.overall;
      if (score >= 80) stats.qualityDistribution.excellent++;
      else if (score >= 60) stats.qualityDistribution.good++;
      else if (score >= 40) stats.qualityDistribution.fair++;
      else stats.qualityDistribution.poor++;
    }
  }

  return stats;
}

// =============================================================================
// BATCH UPDATE
// =============================================================================

/**
 * Update multiple enrichments for a session at once.
 * Used by auto-enrichment pipeline to set all computed enrichments.
 */
export function updateEnrichments(
  sessionId: string,
  ref: SessionRef,
  enrichments: Partial<SessionEnrichments>
): void {
  const store = loadEnrichmentStore();
  const canonicalId = canonicalizeSessionRef(ref);

  // Get or create session enrichments
  let session = store.sessions[canonicalId];
  if (!session) {
    session = {
      sessionRef: ref,
      updatedAt: new Date().toISOString()
    };
    store.sessions[canonicalId] = session;
  }

  // Update individual enrichments
  if (enrichments.autoTags) {
    session.autoTags = enrichments.autoTags;
    store.meta.enrichmentCounts.autoTags++;
  }

  if (enrichments.outcomeSignals) {
    session.outcomeSignals = enrichments.outcomeSignals;
    store.meta.enrichmentCounts.outcomeSignals++;
  }

  if (enrichments.qualityScore) {
    session.qualityScore = enrichments.qualityScore;
    store.meta.enrichmentCounts.qualityScore++;
  }

  if (enrichments.loopDetection) {
    session.loopDetection = enrichments.loopDetection;
    store.meta.enrichmentCounts.loopDetection++;
  }

  if (enrichments.diffSnapshot) {
    session.diffSnapshot = enrichments.diffSnapshot;
    store.meta.enrichmentCounts.diffSnapshot++;
  }

  session.updatedAt = new Date().toISOString();
  store.meta.updatedAt = session.updatedAt;

  saveEnrichmentStore(store);

  // Log a single audit event for the batch update
  const updatedTypes: string[] = [];
  if (enrichments.autoTags) updatedTypes.push("autoTags");
  if (enrichments.outcomeSignals) updatedTypes.push("outcomeSignals");
  if (enrichments.qualityScore) updatedTypes.push("qualityScore");
  if (enrichments.loopDetection) updatedTypes.push("loopDetection");
  if (enrichments.diffSnapshot) updatedTypes.push("diffSnapshot");

  if (updatedTypes.length > 0) {
    logAuditEvent(
      "enrichment",
      "compute",
      canonicalId,
      `Auto-enrichment computed: ${updatedTypes.join(", ")}`,
      { sessionRef: ref, enrichmentTypes: updatedTypes },
      "api"
    );
  }
}
