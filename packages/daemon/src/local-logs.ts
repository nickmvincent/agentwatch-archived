/**
 * Local log discovery for AI coding agents.
 *
 * This module now delegates to @agentwatch/transcript-parser for the actual
 * parsing and discovery logic, while maintaining backwards compatibility
 * with the existing API.
 */

import {
  discoverTranscripts,
  parseTranscript,
  formatForDisplay as formatDisplay,
  type TranscriptMeta,
  type ParsedTranscript as ParserParsedTranscript,
  type TranscriptMessage as ParserTranscriptMessage,
  type AgentType
} from "@agentwatch/transcript-parser";

// Re-export types for backwards compatibility
// These match the original interface signatures

export interface LocalTranscript {
  /** Unique ID for this transcript */
  id: string;
  /** Agent type (claude, codex, gemini, etc.) */
  agent: string;
  /** File path */
  path: string;
  /** Session/project name */
  name: string;
  /** Project directory this session was in */
  projectDir: string | null;
  /** File modification time */
  modifiedAt: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Number of messages (if parseable) */
  messageCount: number | null;
  /** First timestamp in the file */
  startTime: number | null;
  /** Last timestamp in the file */
  endTime: number | null;
}

export interface TranscriptMessage {
  uuid: string;
  parentUuid: string | null;
  type: string;
  subtype?: string;
  role?: string;
  content: string | { type: string; text?: string }[];
  timestamp: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  costUsd?: number;
  /** True if this message is from a sub-agent sidechain (e.g., Task tool) */
  isSidechain?: boolean;
  /** Sub-agent ID if this is a sidechain message */
  agentId?: string;
}

export interface ParsedTranscript {
  id: string;
  agent: string;
  name: string;
  path: string;
  projectDir: string | null;
  messages: TranscriptMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

/**
 * Convert TranscriptMeta from parser to LocalTranscript
 */
function metaToLocalTranscript(meta: TranscriptMeta): LocalTranscript {
  return {
    id: meta.id,
    agent: meta.agent,
    path: meta.path,
    name: meta.name,
    projectDir: meta.projectDir,
    modifiedAt: meta.modifiedAt,
    sizeBytes: meta.sizeBytes,
    messageCount: meta.messageCount,
    startTime: meta.startTime,
    endTime: meta.endTime
  };
}

/**
 * Convert ParsedTranscript from parser to local format
 */
function parserToLocalParsed(parsed: ParserParsedTranscript): ParsedTranscript {
  return {
    id: parsed.id,
    agent: parsed.agent,
    name: parsed.name,
    path: parsed.path,
    projectDir: parsed.projectDir,
    messages: parsed.messages as TranscriptMessage[],
    totalInputTokens: parsed.totalInputTokens,
    totalOutputTokens: parsed.totalOutputTokens,
    estimatedCostUsd: parsed.estimatedCostUsd
  };
}

/**
 * Discover all local transcripts from supported agents.
 */
export async function discoverLocalTranscripts(
  agents?: string[]
): Promise<LocalTranscript[]> {
  const transcripts = await discoverTranscripts({
    agents: agents as AgentType[] | undefined
  });

  return transcripts.map(metaToLocalTranscript);
}

/**
 * Read and parse a full transcript file.
 */
export async function readTranscript(
  transcriptId: string
): Promise<ParsedTranscript | null> {
  // Find the transcript by ID
  const transcripts = await discoverTranscripts();
  const meta = transcripts.find((t) => t.id === transcriptId);

  if (!meta) {
    return null;
  }

  return readTranscriptByPath(meta.agent, meta.path);
}

/**
 * Read a transcript by file path.
 */
export async function readTranscriptByPath(
  agent: string,
  filePath: string
): Promise<ParsedTranscript | null> {
  const parsed = await parseTranscript(filePath, agent as AgentType);

  if (!parsed) {
    return null;
  }

  return parserToLocalParsed(parsed);
}

/**
 * Format transcript messages for display.
 */
export function formatTranscriptForDisplay(transcript: ParsedTranscript): {
  role: string;
  content: string;
  timestamp: string;
  meta?: Record<string, unknown>;
  isSidechain?: boolean;
  agentId?: string;
  /** Original message type from transcript (user, assistant, tool_use, tool_result, etc.) */
  messageType?: string;
  /** Whether this message contains thinking content */
  hasThinking?: boolean;
  /** Tool name if this is a tool_use message */
  toolName?: string;
  /** Tool input if this is a tool_use message */
  toolInput?: Record<string, unknown>;
}[] {
  // Use the parser's format function
  const display = formatDisplay(transcript as ParserParsedTranscript);

  // Convert to the expected format
  return display.messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    meta: msg.meta as Record<string, unknown>,
    isSidechain: msg.isSidechain,
    agentId: msg.agentId,
    messageType: msg.messageType,
    hasThinking: msg.hasThinking,
    toolName: msg.toolName,
    toolInput: msg.toolInput
  }));
}
