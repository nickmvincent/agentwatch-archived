/**
 * Core types for agentwatch
 *
 * This module exports all shared types used across the agentwatch ecosystem:
 * - Agent monitoring types
 * - Repository status types
 * - Claude Code hook integration types
 * - Sanitization/redaction types (from @agentwatch/pre-share)
 * - Contribution/sharing types (from @agentwatch/pre-share)
 * - Cost estimation types
 */

// Agent/process monitoring
export * from "./agents";

// Git repository monitoring
export * from "./repos";

// Claude Code hook integration
export * from "./hooks";

// Cost estimation
export * from "./cost";

// Sharing providers
export * from "./sharing";

// Port/server monitoring
export * from "./ports";

// Agent metadata (naming, annotations)
export * from "./agent-metadata";

// Conversation metadata (naming)
export * from "./conversation-metadata";

// Session enrichments (auto-tags, quality scores, annotations)
export * from "./enrichments";

// Run predictions and calibration
export * from "./predictions";

// Note: Pre-share types are re-exported from the main @agentwatch/core entry point
// via `export * from "@agentwatch/pre-share"` in src/index.ts
