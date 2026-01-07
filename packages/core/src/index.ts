/**
 * @agentwatch/core
 *
 * Core library for agentwatch - the agentic coding helper suite.
 *
 * This package provides:
 * - Shared types for agents, repos, hooks, and sanitization
 * - Transcript parsing and sanitization
 * - Cost estimation utilities
 * - Storage utilities (paths, JSON/JSONL stores)
 *
 * Note: Sanitization, field stripping, preparation pipeline, and output formatters
 * are now provided by @agentwatch/pre-share and re-exported here for backwards compatibility.
 */

// Types (core-specific types + re-export from pre-share)
export * from "./types";

// Parsers (agentwatch-specific)
export * from "./parsers";

// Constants (centralized configuration defaults)
export * from "./constants";

// Storage utilities (paths, file helpers, JSON/JSONL stores)
export * from "./storage";

// Annotator (agent/conversation metadata, annotations)
export * from "./annotator";

// Audit log (event logging)
export * from "./audit";

// EventBus (unified event stream)
export * from "./events";

// Re-export everything from @agentwatch/pre-share for backwards compatibility
export * from "@agentwatch/pre-share";
