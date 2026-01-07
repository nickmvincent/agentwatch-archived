import { useState } from "react";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./SelfDocumentingSection";

interface InfoTooltipProps {
  /** The tooltip content */
  content: string;
  /** Optional: make tooltip appear on left instead of right */
  position?: "left" | "right" | "top" | "bottom";
  /** Icon to show (default: ?) */
  icon?: string;
}

/**
 * Info icon with tooltip - use this to add inline documentation to settings
 */
export function InfoTooltip({
  content,
  position = "right",
  icon = "?"
}: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const showSelfDocs = useSelfDocumentingVisible();

  const positionClasses = {
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2"
  };

  return (
    <SelfDocumentingSection
      componentId="analyzer.settings.info-tooltip"
      visible={showSelfDocs}
      compact
      inline
    >
      <span
        className="relative inline-flex items-center justify-center"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        <span className="w-4 h-4 rounded-full bg-gray-600 text-gray-300 text-[10px] flex items-center justify-center cursor-help hover:bg-gray-500">
          {icon}
        </span>
        {isVisible && (
          <span
            className={`absolute z-50 w-64 p-2 text-xs bg-gray-900 border border-gray-600 rounded shadow-lg text-gray-200 ${positionClasses[position]}`}
          >
            {content}
          </span>
        )}
      </span>
    </SelfDocumentingSection>
  );
}

interface StorageInfoProps {
  /** Path to the storage location */
  path: string;
  /** Brief description of what's stored */
  description?: string;
  /** Optional: show as compact inline version */
  compact?: boolean;
}

/**
 * Shows where data is stored - use at bottom of panes for transparency
 */
export function StorageInfo({
  path,
  description,
  compact = false
}: StorageInfoProps) {
  const showSelfDocs = useSelfDocumentingVisible();

  if (compact) {
    return (
      <SelfDocumentingSection
        componentId="analyzer.settings.storage-info"
        visible={showSelfDocs}
        compact
        inline
      >
        <span className="text-xs text-gray-500">
          Data: <code className="bg-gray-700/50 px-1 rounded">{path}</code>
        </span>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection
      componentId="analyzer.settings.storage-info"
      visible={showSelfDocs}
    >
      <div className="mt-4 pt-3 border-t border-gray-700/50 text-xs text-gray-500">
        <span className="text-gray-400">Data stored in: </span>
        <code className="bg-gray-700 px-1.5 py-0.5 rounded">{path}</code>
        {description && (
          <span className="ml-2 text-gray-600">{description}</span>
        )}
      </div>
    </SelfDocumentingSection>
  );
}

interface HookTypeInfoProps {
  /** Hook type (SessionStart, PreToolUse, etc) */
  hookType: string;
  /** Show as badge instead of full description */
  asBadge?: boolean;
}

// Hook type descriptions from Claude Code docs
const HOOK_DESCRIPTIONS: Record<
  string,
  { summary: string; when: string; useCase: string }
> = {
  SessionStart: {
    summary: "Session initialized",
    when: "When Claude starts a new session or resumes an existing one",
    useCase: "Inject context, check prerequisites, log session start"
  },
  PreToolUse: {
    summary: "Before tool execution",
    when: "Before Claude executes any tool (Read, Write, Bash, etc.)",
    useCase: "Validate inputs, add dry-run flags, block dangerous operations"
  },
  PostToolUse: {
    summary: "After tool execution",
    when: "After a tool completes (success or failure)",
    useCase: "Log results, track metrics, trigger follow-up actions"
  },
  Stop: {
    summary: "Turn complete",
    when: "When Claude finishes responding and yields control",
    useCase: "Quality gates, notify user, update status"
  },
  SubagentStop: {
    summary: "Subagent finished",
    when: "When a Task agent completes its work",
    useCase: "Validate subagent output, aggregate results"
  },
  Notification: {
    summary: "Status message",
    when: "When Claude wants to send a user notification",
    useCase: "Custom notification routing, logging"
  },
  UserPromptSubmit: {
    summary: "User sent prompt",
    when: "After user submits a message to Claude",
    useCase: "Prompt validation, context injection"
  },
  PermissionRequest: {
    summary: "Approval needed",
    when: "When Claude requests permission for an action",
    useCase: "Auto-approve safe operations, log decisions"
  },
  PreCompact: {
    summary: "Context compaction",
    when: "Before Claude compacts the conversation context",
    useCase: "Preserve important context, log compaction events"
  }
};

/**
 * Shows hook type with description tooltip
 */
export function HookTypeInfo({ hookType, asBadge = false }: HookTypeInfoProps) {
  const [isVisible, setIsVisible] = useState(false);
  const info = HOOK_DESCRIPTIONS[hookType];

  if (!info) {
    return <span className="text-gray-400">{hookType}</span>;
  }

  if (asBadge) {
    return (
      <span
        className="relative inline-flex"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        <span className="px-2 py-0.5 text-xs bg-blue-900/50 text-blue-300 rounded cursor-help">
          {hookType}
        </span>
        {isVisible && (
          <span className="absolute z-50 left-0 top-full mt-1 w-72 p-3 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs">
            <div className="font-medium text-white mb-1">{info.summary}</div>
            <div className="text-gray-400 mb-2">
              <span className="text-gray-500">When: </span>
              {info.when}
            </div>
            <div className="text-gray-400">
              <span className="text-gray-500">Use case: </span>
              {info.useCase}
            </div>
          </span>
        )}
      </span>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <span className="text-blue-400 cursor-help border-b border-dotted border-blue-400/50">
        {hookType}
      </span>
      {isVisible && (
        <div className="absolute z-50 left-0 top-full mt-1 w-72 p-3 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs">
          <div className="font-medium text-white mb-1">{info.summary}</div>
          <div className="text-gray-400 mb-2">
            <span className="text-gray-500">When: </span>
            {info.when}
          </div>
          <div className="text-gray-400">
            <span className="text-gray-500">Use case: </span>
            {info.useCase}
          </div>
        </div>
      )}
    </div>
  );
}

// Export all hook descriptions for use elsewhere
export { HOOK_DESCRIPTIONS };

// Enrichment field descriptions for glossary tooltips
export const ENRICHMENT_GLOSSARY: Record<
  string,
  { summary: string; details: string }
> = {
  // Auto-tags
  task_type: {
    summary: "Inferred task category",
    details:
      "Automatically classified from tool usage patterns: feature, bugfix, refactor, test, docs, config, exploration"
  },
  auto_tags: {
    summary: "Automatically generated tags",
    details:
      "Keywords derived from git commits, file paths, and tool operations. Updated when session ends."
  },

  // Quality scores
  quality_score: {
    summary: "Overall quality rating (0-100)",
    details:
      "Composite score based on completion, code quality, efficiency, and safety dimensions. Higher is better."
  },
  completion_score: {
    summary: "Task completion indicator",
    details:
      "Did the session achieve its apparent goal? Based on commits, successful tool calls, and exit status."
  },
  code_quality_score: {
    summary: "Code quality indicator",
    details:
      "Based on lint results, test outcomes, and edit patterns. Penalized for repeated failures or oscillations."
  },
  efficiency_score: {
    summary: "Resource efficiency",
    details:
      "Token usage relative to work done. Lower token count for same output = higher efficiency."
  },
  safety_score: {
    summary: "Safety indicator",
    details:
      "Were dangerous operations avoided? Penalized for destructive commands, bypassed checks, or sensitive file access."
  },

  // Outcome signals
  exit_code: {
    summary: "Final process exit code",
    details:
      "0 = success, non-zero = error. From the Stop hook or process monitoring."
  },
  test_results: {
    summary: "Test execution results",
    details:
      "Did tests pass? Extracted from test runner output in PostToolUse hooks."
  },
  lint_results: {
    summary: "Lint/format check results",
    details: "Any lint errors or warnings detected during the session."
  },

  // Loop detection
  loop_detected: {
    summary: "Repetitive behavior warning",
    details:
      "Session showed signs of getting stuck: repeated similar tool calls, oscillating edits, or error loops."
  },
  tool_retry: {
    summary: "Tool retry loop",
    details:
      "Same tool called repeatedly with similar inputs, possibly indicating confusion or stuck state."
  },
  file_edit_loop: {
    summary: "Edit oscillation",
    details:
      "Repeated edits to the same file without apparent progress - may indicate the model is struggling."
  },

  // Git/diff
  lines_added: {
    summary: "Lines of code added",
    details:
      "Total lines added across all commits in the session, from git diff analysis."
  },
  lines_removed: {
    summary: "Lines of code removed",
    details: "Total lines removed across all commits in the session."
  },
  files_changed: {
    summary: "Number of files modified",
    details: "Distinct files with changes committed during the session."
  },

  // Annotations
  feedback: {
    summary: "User feedback rating",
    details:
      "Manual thumbs up/down rating. Used to train quality heuristics and filter sessions."
  },
  user_tags: {
    summary: "User-added tags",
    details:
      "Custom tags you add to categorize sessions. Separate from auto-generated tags."
  },
  notes: {
    summary: "User notes",
    details: "Free-form notes about the session for your own reference."
  },

  // Jargon terms
  hook_session: {
    summary: "Session tracked by hooks",
    details:
      "A coding session where agentwatch hooks captured tool usage data (commands, file operations, API calls). Richer than transcripts alone."
  },
  managed_session: {
    summary: "Session started via 'aw run'",
    details:
      "Sessions launched with 'aw run <agent>' have additional metadata: explicit start/end, sandboxing, and environment info."
  },
  enrichment: {
    summary: "Metadata added to sessions",
    details:
      "Post-processing data added to sessions: auto-tags, quality scores, loop detection, git diffs. Stored in ~/.agentwatch/enrichments/"
  },
  transcript: {
    summary: "Full chat log",
    details:
      "Claude Code's conversation file (~/.claude/projects/*/sessions/*.jsonl) containing all messages, tool calls, and responses."
  },
  redaction: {
    summary: "Privacy protection",
    details:
      "Automatic removal of sensitive data (secrets, PII, file paths) before sharing. Patterns defined in redaction profiles."
  },
  data_source: {
    summary: "Where session data comes from",
    details:
      "Full = hooks + transcript matched. Linked = matched by path/time heuristics. Partial = only hooks or only transcript."
  },
  permission_mode: {
    summary: "How Claude handles approvals",
    details:
      "auto = proceed without asking. ask = request approval for each action. off = don't ask (may fail). Set in ~/.claude/settings.json"
  }
};

interface EnrichmentTooltipProps {
  /** Enrichment field key */
  field: string;
  /** Show as inline badge or icon */
  variant?: "icon" | "badge";
}

/**
 * Shows enrichment field with glossary tooltip
 */
export function EnrichmentTooltip({
  field,
  variant = "icon"
}: EnrichmentTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const info = ENRICHMENT_GLOSSARY[field];

  if (!info) {
    return null;
  }

  if (variant === "badge") {
    return (
      <span
        className="relative inline-flex"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        <span className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded cursor-help">
          {field.replace(/_/g, " ")}
        </span>
        {isVisible && (
          <span className="absolute z-50 left-0 top-full mt-1 w-64 p-2 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs">
            <div className="font-medium text-white mb-1">{info.summary}</div>
            <div className="text-gray-400">{info.details}</div>
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className="relative inline-flex items-center justify-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <span className="w-3.5 h-3.5 rounded-full bg-gray-600 text-gray-300 text-[9px] flex items-center justify-center cursor-help hover:bg-gray-500">
        ?
      </span>
      {isVisible && (
        <span className="absolute z-50 left-full ml-1 top-1/2 -translate-y-1/2 w-64 p-2 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs">
          <div className="font-medium text-white mb-1">{info.summary}</div>
          <div className="text-gray-400">{info.details}</div>
        </span>
      )}
    </span>
  );
}
