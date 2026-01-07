export interface SelfDocFileInfo {
  path: string;
  description?: string;
}

export interface SelfDocEntry {
  title?: string;
  reads?: (string | SelfDocFileInfo)[];
  writes?: (string | SelfDocFileInfo)[];
  tests?: string[];
  calculations?: string[];
  notes?: string[];
}

export const SELF_DOCS: Record<string, SelfDocEntry> = {
  "watcher.global.header": {
    title: "Watcher Header",
    reads: [
      {
        path: "GET /api/sandbox/status",
        description: "Sandbox readiness and Docker status"
      }
    ],
    notes: ["Watcher connectivity and counts are derived from WebSocket data."]
  },
  "watcher.agents.pane": {
    title: "Agents",
    reads: [
      {
        path: "WebSocket /ws",
        description: "Live agent snapshots and session updates"
      },
      {
        path: "GET /api/managed-sessions",
        description: "Managed sessions launched via aw run"
      },
      {
        path: "GET /api/hooks/sessions",
        description: "Hook sessions for activity correlation"
      }
    ],
    writes: [
      {
        path: "POST /api/agents/:pid/signal",
        description: "Send process signals to agents"
      },
      {
        path: "POST /api/agents/:pid/kill",
        description: "Terminate a running agent"
      },
      {
        path: "POST /api/agents/:pid/metadata",
        description: "Persist agent naming and notes"
      }
    ],
    tests: ["packages/watcher/test/api.test.ts", "packages/monitor/test/scanners.test.ts"],
    notes: [
      "State uses CPU heuristics with wrapper data when available.",
      "Conversation links are inferred from working directory and timing."
    ]
  },
  "watcher.agents.detail-modal": {
    title: "Agent Detail",
    reads: [
      {
        path: "GET /api/agents/:pid/metadata",
        description: "Agent metadata for naming and annotations"
      },
      {
        path: "GET /api/enrichments/:sessionId",
        description: "Session enrichments and annotations"
      }
    ],
    writes: [
      {
        path: "POST /api/agents/:pid/metadata",
        description: "Persist agent metadata updates"
      },
      {
        path: "POST /api/agents/:pid/signal",
        description: "Send SIGINT/SIGTSTP/SIGCONT/SIGTERM/SIGKILL"
      },
      {
        path: "POST /api/agents/:pid/kill",
        description: "Terminate agent process"
      },
      {
        path: "PATCH /api/conversation-metadata/:id",
        description: "Persist conversation naming and notes"
      }
    ],
    tests: ["packages/watcher/test/api.test.ts"],
    notes: [
      "Conversation context is inferred from hook sessions and transcripts.",
      "Agent output capture is only available in wrapped mode."
    ]
  },
  "watcher.agents.annotation-panel": {
    title: "Annotation Panel",
    reads: [
      { path: "~/.agentwatch/annotations.json", description: "Manual annotation store" },
      {
        path: "~/.agentwatch/conversation-metadata.json",
        description: "Conversation naming metadata"
      }
    ],
    writes: [
      {
        path: "POST /api/enrichments/:sessionId/annotation",
        description: "Persist annotation updates"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts"],
    notes: ["Annotations are stored locally and surfaced across tools."]
  },
  "watcher.agents.hook-timeline": {
    title: "Hook Timeline",
    reads: [
      { path: "GET /api/hooks/sessions", description: "Hook sessions list" },
      { path: "GET /api/hooks/tools/recent", description: "Recent tool calls" },
      { path: "GET /api/hooks/stats/daily", description: "Daily hook stats" }
    ],
    tests: ["packages/watcher/test/api.test.ts"],
    notes: [
      "Timeline data is derived from in-memory hook store snapshots.",
      "Token counts are aggregated from Stop hook events."
    ]
  },
  "watcher.agents.hook-enhancements": {
    title: "Hook Enhancements",
    reads: [
      {
        path: "GET /api/config",
        description: "Hook enhancements configuration"
      }
    ],
    tests: ["packages/watcher/test/api.test.ts"],
    notes: ["Hook enhancements are watcher-side policies and utilities."]
  },
  "watcher.repos.pane": {
    title: "Projects",
    reads: [
      {
        path: "GET /api/projects",
        description: "Configured project definitions"
      },
      {
        path: "GET /api/projects/config-path",
        description: "Location of the projects config file"
      },
      {
        path: "GET /api/analytics/by-project",
        description: "Per-project analytics (when enabled)"
      }
    ],
    writes: [
      {
        path: "POST /api/projects",
        description: "Create a new project"
      },
      {
        path: "PATCH /api/projects/:id",
        description: "Update project details"
      },
      {
        path: "DELETE /api/projects/:id",
        description: "Remove a project"
      },
      {
        path: "POST /api/projects/infer",
        description: "Infer projects from scanned repos"
      }
    ],
    tests: ["packages/analyzer/test/api.test.ts"],
    notes: [
      "Repo status comes from watcher scans and is matched to project paths.",
      "Analytics are optional and use the configured lookback window."
    ]
  },
  "watcher.repos.repo-pane": {
    title: "Repositories",
    reads: [
      { path: "GET /api/repos", description: "Repository status snapshots" },
      {
        path: "WebSocket /ws",
        description: "Repo updates (repos_update)"
      }
    ],
    writes: [
      {
        path: "POST /api/repos/rescan",
        description: "Trigger an immediate repository rescan"
      }
    ],
    notes: [
      "Only dirty repos are shown by default; clean repos can be included via query.",
      "Special states include conflict, rebase, merge, cherry-pick, and revert."
    ]
  },
  "watcher.ports.pane": {
    title: "Ports",
    reads: [
      {
        path: "WebSocket /ws",
        description: "Live port scans with process correlation"
      },
      {
        path: "GET /api/projects",
        description: "Projects used to label port locations"
      }
    ],
    tests: ["packages/monitor/test/scanners.test.ts"],
    notes: [
      "Port detection uses lsof and associates child processes to agents.",
      "Hidden ports are UI-only preferences in this pane."
    ]
  },
  "watcher.activity.pane": {
    title: "Activity Feed",
    reads: [
      {
        path: "WebSocket /ws (agentwatch_event)",
        description: "Real-time unified events from EventBus"
      },
      {
        path: "GET /api/events/recent",
        description: "Historical events from EventBus buffer"
      }
    ],
    writes: [
      {
        path: "~/.agentwatch/events.jsonl",
        description: "Persistent audit log of all events"
      }
    ],
    notes: [
      "Shows all AgentWatch events from the unified EventBus.",
      "Events include: processes, ports, sessions, tools, system.",
      "Filter by category or action to focus the timeline.",
      "Click any event to see full details."
    ]
  },
  "watcher.hooks.pane": {
    title: "Hooks",
    reads: [
      { path: "GET /api/hooks/sessions", description: "Hook session snapshots" },
      {
        path: "GET /api/hooks/tools/stats",
        description: "Aggregated tool usage stats"
      },
      {
        path: "GET /api/hooks/stats/daily",
        description: "Daily hook statistics"
      },
      {
        path: "GET /api/hook-enhancements",
        description: "Enhancements configuration"
      },
      { path: "GET /api/cost/status", description: "Cost control status" },
      { path: "GET /api/rules", description: "Automation rules list" },
      {
        path: "GET /api/notifications/providers",
        description: "Notification provider status"
      }
    ],
    notes: [
      "Live sections rely on in-memory watcher state.",
      "Historical stats are read from persisted logs."
    ]
  },
  "watcher.command.pane": {
    title: "Command Center",
    reads: [
      { path: "GET /api/projects", description: "Project list for run context" },
      {
        path: "GET /api/principles",
        description: "Principles from selected project path"
      },
      {
        path: "GET /api/predictions",
        description: "Recent predictions and outcomes"
      },
      {
        path: "GET /api/calibration",
        description: "Calibration stats for predictions"
      },
      {
        path: "GET /api/command-center/tmux-available",
        description: "tmux availability for interactive runs"
      }
    ],
    writes: [
      {
        path: "POST /api/managed-sessions/run",
        description: "Launch a managed run (headless)"
      },
      {
        path: "POST /api/managed-sessions/run-interactive",
        description: "Launch a managed run (interactive)"
      },
      {
        path: "POST /api/predictions",
        description: "Create a prediction entry"
      },
      {
        path: "POST /api/predictions/:id/outcome",
        description: "Record run outcomes for calibration"
      }
    ],
    tests: ["packages/watcher/test/integration.test.ts"],
    notes: [
      "Run endpoints are still being wired in watcher.",
      "Predictions are persisted separately from managed sessions."
    ]
  },
  "watcher.settings.pane": {
    title: "Watcher Settings",
    reads: [
      { path: "GET /api/config/raw", description: "Raw watcher config file" }
    ],
    writes: [
      { path: "PUT /api/config/raw", description: "Persist watcher config" }
    ],
    tests: ["packages/watcher/test/api.test.ts"],
    notes: [
      "Changes take effect after restarting the watcher process.",
      "The watcher config lives under ~/.config/agentwatch/."
    ]
  },
  "watcher.settings.hook-enhancements": {
    title: "Hook Enhancements",
    reads: [
      {
        path: "GET /api/config",
        description: "Hook enhancements configuration"
      }
    ],
    tests: ["packages/watcher/test/api.test.ts"],
    notes: ["Hook enhancements are watcher-side policies and utilities."]
  },
  "analyzer.global.header": {
    title: "Header",
    notes: [
      "Displays watcher connectivity and aggregate counts from props.",
      "Tab loading state is provided by the loading context."
    ]
  },
  "analyzer.conversations.pane": {
    title: "Conversations",
    reads: [
      {
        path: "GET /api/contrib/correlated",
        description: "Correlated sessions + transcripts"
      },
      {
        path: "GET /api/enrichments",
        description: "Enrichment summary for sessions"
      },
      {
        path: "GET /api/enrichments/:sessionId",
        description: "Detailed enrichment payload"
      },
      {
        path: "GET /api/projects",
        description: "Project metadata for filtering"
      }
    ],
    writes: [
      {
        path: "POST /api/enrichments/:sessionId/annotation",
        description: "Manual annotation and workflow status"
      },
      {
        path: "POST /api/enrichments/compute",
        description: "Bulk enrichment computation"
      },
      {
        path: "POST /api/enrichments/analyze-transcript",
        description: "Run enrichment analysis for a transcript"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts", "packages/analyzer/test/api.test.ts"],
    notes: [
      "Transcript lookback window is controlled by analyzer config.",
      "Session links are built from hook data plus transcript discovery."
    ]
  },
  "analyzer.conversations.card": {
    title: "Conversation Card",
    reads: [
      {
        path: "GET /api/contrib/correlated",
        description: "Conversation summary + transcript linkage"
      },
      {
        path: "GET /api/enrichments",
        description: "Enrichment summary for quality/task tags"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts"],
    notes: ["Card content is derived from correlated session metadata."]
  },
  "analyzer.conversations.detail-modal": {
    title: "Conversation Detail",
    reads: [
      {
        path: "GET /api/enrichments/:sessionId",
        description: "Session enrichments and annotations"
      },
      {
        path: "GET /api/enrichments/privacy-risk/:id",
        description: "Privacy risk analysis"
      }
    ],
    writes: [
      {
        path: "POST /api/enrichments/:sessionId/annotation",
        description: "Update manual annotations"
      },
      {
        path: "POST /api/enrichments/:sessionId/tags",
        description: "Update user tags"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts"],
    notes: ["Detail view aggregates hooks, transcript, and enrichment data."]
  },
  "analyzer.conversations.annotation-panel": {
    title: "Annotation Panel",
    reads: [
      { path: "~/.agentwatch/annotations.json", description: "Manual annotation store" },
      {
        path: "~/.agentwatch/conversation-metadata.json",
        description: "Conversation naming metadata"
      }
    ],
    writes: [
      {
        path: "POST /api/enrichments/:sessionId/annotation",
        description: "Persist annotation updates"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts"],
    notes: ["Annotations are stored locally and surfaced across tools."]
  },
  "analyzer.conversations.workflow-widget": {
    title: "Workflow Progress",
    reads: [
      {
        path: "GET /api/enrichments/workflow-stats",
        description: "Workflow status totals"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts"],
    notes: ["Counts are derived from enrichment workflow status values."]
  },
  "analyzer.conversations.chat-viewer": {
    title: "Chat viewer",
    reads: [
      {
        path: "GET /api/privacy-flags",
        description: "Existing privacy flags for the session"
      }
    ],
    writes: [
      { path: "POST /api/privacy-flags", description: "Create a privacy flag" },
      {
        path: "PATCH /api/privacy-flags/:id",
        description: "Update privacy flag notes/exclusion"
      },
      {
        path: "DELETE /api/privacy-flags/:id",
        description: "Remove a privacy flag"
      }
    ],
    notes: [
      "Sidechain messages are hidden by default.",
      "MarkdownRenderer is used for message content."
    ]
  },
  "analyzer.conversations.diff-view": {
    title: "Diff viewer",
    calculations: [
      "diff-match-patch diffing for inline views",
      "Placeholder extraction for redaction summaries"
    ],
    notes: ["Supports full inline view or changes-only view."]
  },
  "analyzer.analytics.pane": {
    title: "Analytics",
    reads: [
      {
        path: "GET /api/analytics/combined",
        description: "Aggregated analytics data by timeframe"
      },
      {
        path: "GET /api/hooks/stats/daily",
        description: "Daily hook statistics"
      },
      {
        path: "GET /api/hooks/tools/stats",
        description: "Per-tool usage statistics"
      }
    ],
    tests: ["e2e/analyzer-flow.spec.ts", "packages/analyzer/test/api.test.ts"],
    notes: [
      "Dashboard charts are derived from aggregated analytics endpoints.",
      "Exports are generated server-side for the selected time window."
    ]
  },
  "analyzer.analytics.outcome-modal": {
    title: "Outcome recording",
    writes: [
      {
        path: "POST /api/predictions/:id/outcome",
        description: "Record run outcome and calibration data"
      }
    ],
    calculations: [
      "Token estimate based on duration heuristic",
      "Error percentage vs predicted duration/tokens"
    ],
    notes: [
      "Shows calibration score after submission before closing.",
      "Defaults success state from exit code when available."
    ]
  },
  "analyzer.projects.pane": {
    title: "Projects",
    reads: [
      {
        path: "GET /api/projects",
        description: "Configured project definitions"
      },
      {
        path: "GET /api/projects/config-path",
        description: "Location of the projects config file"
      },
      {
        path: "GET /api/analytics/by-project",
        description: "Per-project analytics (when enabled)"
      }
    ],
    writes: [
      {
        path: "POST /api/projects",
        description: "Create a new project"
      },
      {
        path: "PATCH /api/projects/:id",
        description: "Update project details"
      },
      {
        path: "DELETE /api/projects/:id",
        description: "Remove a project"
      },
      {
        path: "POST /api/projects/infer",
        description: "Infer projects from scanned repos"
      }
    ],
    tests: ["packages/analyzer/test/api.test.ts"],
    notes: [
      "Repo status comes from watcher scans and is matched to project paths.",
      "Analytics are optional and use the configured lookback window."
    ]
  },
  "analyzer.share.pane": {
    title: "Share",
    reads: [
      {
        path: "GET /api/contrib/correlated",
        description: "Correlated sessions and transcripts"
      },
      {
        path: "GET /api/contrib/fields",
        description: "Redaction field schemas"
      },
      {
        path: "GET /api/contrib/profiles",
        description: "Saved redaction profiles"
      },
      {
        path: "GET /api/contrib/research-profiles",
        description: "Research profile presets"
      },
      {
        path: "GET /api/contrib/destinations",
        description: "Share destinations"
      },
      {
        path: "GET /api/share/status",
        description: "HuggingFace auth status"
      }
    ],
    writes: [
      {
        path: "POST /api/contrib/prepare",
        description: "Prepare sanitized sessions for export"
      },
      {
        path: "POST /api/contrib/export",
        description: "Export prepared sessions"
      },
      {
        path: "POST /api/contrib/settings",
        description: "Persist contributor settings"
      },
      {
        path: "POST /api/contrib/profiles",
        description: "Save redaction profiles"
      },
      {
        path: "PUT /api/contrib/profiles/active",
        description: "Select active redaction profile"
      },
      {
        path: "POST /api/share/huggingface",
        description: "Upload exports to HuggingFace"
      }
    ],
    tests: ["e2e/contrib-flow.spec.ts", "e2e/analyzer-flow.spec.ts"],
    notes: [
      "Redaction settings persist through analyzer config and contributor settings.",
      "Exports remain local until you explicitly upload them."
    ]
  },
  "analyzer.share.field-tree": {
    title: "Field selection",
    calculations: [
      "Tree construction from dot-path fields",
      "Tri-state selection for parent nodes",
      "Sensitive/content-heavy field classification"
    ],
    notes: [
      "Essential fields cannot be removed.",
      "Profiles apply pre-built field selections."
    ]
  },
  "analyzer.share.research-profile-selector": {
    title: "Research profiles",
    reads: [
      {
        path: "GET /api/contrib/research-profiles",
        description: "Profile definitions and kept field lists"
      }
    ],
    notes: ["Selection passes kept_fields to export configuration."]
  },
  "analyzer.share.chat-viewer": {
    title: "Chat viewer",
    reads: [
      {
        path: "GET /api/privacy-flags",
        description: "Existing privacy flags for the session"
      }
    ],
    writes: [
      { path: "POST /api/privacy-flags", description: "Create a privacy flag" },
      {
        path: "PATCH /api/privacy-flags/:id",
        description: "Update privacy flag notes/exclusion"
      },
      {
        path: "DELETE /api/privacy-flags/:id",
        description: "Remove a privacy flag"
      }
    ],
    notes: [
      "Sidechain messages are hidden by default.",
      "MarkdownRenderer is used for message content."
    ]
  },
  "analyzer.share.diff-view": {
    title: "Raw JSON diff",
    calculations: [
      "diff-match-patch semantic diffing",
      "JSON stringify normalization for comparison"
    ],
    notes: ["Large diffs require confirmation to render."]
  },
  "analyzer.docs.pane": {
    title: "Docs",
    reads: [
      { path: "GET /api/docs", description: "Documentation index" },
      { path: "GET /api/docs/:id", description: "Markdown content for docs" }
    ],
    tests: ["packages/analyzer/test/api.test.ts"],
    notes: ["Docs are served from the local docs/ directory."]
  },
  "analyzer.docs.markdown-renderer": {
    title: "Markdown rendering",
    calculations: [
      "Custom markdown parsing with code block preservation",
      "HTML tag escaping for safety"
    ],
    notes: ["Uses dangerouslySetInnerHTML after sanitizing unsupported tags."]
  },
  "analyzer.settings.pane": {
    title: "Settings",
    reads: [
      { path: "GET /api/config", description: "Watcher and analyzer config" },
      {
        path: "GET /api/claude/settings",
        description: "Claude Code settings.json"
      },
      {
        path: "GET /api/claude/reference/env-vars",
        description: "Env var reference"
      },
      {
        path: "GET /api/claude/reference/permissions",
        description: "Permission reference"
      }
    ],
    writes: [
      {
        path: "PATCH /api/config",
        description: "Update configuration values"
      },
      {
        path: "PATCH /api/claude/settings",
        description: "Merge Claude settings"
      },
      {
        path: "PUT /api/claude/settings",
        description: "Replace Claude settings"
      }
    ],
    tests: ["packages/watcher/test/api.test.ts"],
    notes: ["Settings changes persist to TOML and JSON files on disk."]
  },
  "analyzer.settings.reference-pane": {
    title: "Reference",
    reads: [
      {
        path: "GET /api/reference/format-schemas",
        description: "Supported and planned transcript schemas"
      },
      { path: "GET /api/reference/mcp-config", description: "MCP servers" },
      {
        path: "GET /api/reference/permissions",
        description: "Claude Code permission modes"
      },
      {
        path: "GET /api/reference/env-vars",
        description: "Environment variables reference"
      }
    ],
    calculations: ["Token cost estimation from model pricing"],
    notes: ["Reference data is read-only and reflects current settings."]
  },
  "analyzer.settings.audit-log": {
    title: "Audit log",
    reads: [
      { path: "GET /api/audit", description: "Audit event stream" },
      {
        path: "GET /api/audit/categories",
        description: "Event categories and counts"
      },
      {
        path: "GET /api/audit/sources",
        description: "Data source inventory"
      },
      {
        path: "GET /api/audit/edge-cases",
        description: "Edge case behaviors"
      },
      {
        path: "GET /api/audit/calculations",
        description: "Audit calculation definitions"
      }
    ],
    notes: [
      "Timeline updates with category filters and pagination limits.",
      "Sources reflect local ~/.agentwatch state."
    ]
  },
  "analyzer.settings.toast": {
    title: "Toast notifications",
    notes: [
      "Auto-dismisses after a timeout unless manually closed.",
      "Used for async notifications across tools."
    ]
  },
  "analyzer.settings.info-tooltip": {
    title: "Info tooltip",
    notes: ["Hover to reveal inline documentation."]
  },
  "analyzer.settings.storage-info": {
    title: "Storage path",
    notes: ["Documents where local data is stored on disk."]
  }
};
