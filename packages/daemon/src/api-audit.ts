/**
 * Audit Log API Endpoints
 *
 * Provides endpoints for viewing the complete CRUD timeline of AgentWatch data.
 * Designed for full transparency into how AgentWatch discovers, stores, and computes data.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import { MODEL_PRICING } from "@agentwatch/core";
import type { Hono } from "hono";
import {
  type AuditAction,
  type AuditCategory,
  type AuditEntry,
  type AuditStats,
  DATA_DIR,
  getAuditStats,
  getCompleteTimeline,
  logAuditEvent,
  readAuditLog
} from "./audit-log";
import { DIMENSION_WEIGHTS, SIGNAL_WEIGHTS } from "./enrichments/quality-score";

/**
 * Get file info safely.
 */
function getFileInfo(path: string): {
  exists: boolean;
  size?: number;
  mtime?: Date;
} {
  try {
    if (!existsSync(path)) {
      return { exists: false };
    }
    const stats = statSync(path);
    return {
      exists: true,
      size: stats.size,
      mtime: stats.mtime
    };
  } catch (err) {
    return { exists: false };
  }
}

/**
 * Count files in a directory.
 */
function countFiles(dirPath: string, pattern?: RegExp): number {
  if (!existsSync(dirPath)) return 0;
  try {
    const files = readdirSync(dirPath);
    if (pattern) {
      return files.filter((f) => pattern.test(f)).length;
    }
    return files.length;
  } catch (err) {
    return 0;
  }
}

/**
 * Register audit log endpoints on the app.
 */
export function registerAuditEndpoints(app: Hono): void {
  /**
   * GET /api/audit - Get the complete audit timeline
   */
  app.get("/api/audit", async (c) => {
    const limit = Number(c.req.query("limit") ?? "50");
    const offset = Number(c.req.query("offset") ?? "0");
    const category = c.req.query("category") as AuditCategory | undefined;
    const action = c.req.query("action") as AuditAction | undefined;
    const since = c.req.query("since");
    const until = c.req.query("until");

    try {
      // Read logs
      const allEvents = readAuditLog({ category, action });

      // Apply time filters
      let filtered = allEvents;
      if (since) {
        const sinceDate = new Date(since);
        filtered = filtered.filter((e) => new Date(e.timestamp) >= sinceDate);
      }
      if (until) {
        const untilDate = new Date(until);
        filtered = filtered.filter((e) => new Date(e.timestamp) <= untilDate);
      }

      // Sort by time (newest first) - default for readAuditLog is append order (oldest first)
      filtered.reverse();

      // Pagination
      const page = filtered.slice(offset, offset + limit);

      return c.json({
        events: page,
        stats: getAuditStats(),
        pagination: {
          total: filtered.length,
          limit,
          offset,
          has_more: offset + limit < filtered.length
        },
        sources: {
          file: DATA_DIR,
          inferred: 0 // Legacy inference removed for speed
        }
      });
    } catch (err) {
      console.error("Error serving audit log:", err);
      return c.json(
        {
          error: "Failed to fetch audit log",
          details: String(err)
        },
        500
      );
    }
  });

  /**
   * GET /api/audit/stats - Get audit log statistics
   */
  app.get("/api/audit/stats", (c) => {
    const stats = getAuditStats();
    return c.json(stats);
  });

  /**
   * GET /api/audit/calculations - Get transparent calculation logic
   *
   * This provides full transparency into how AgentWatch computes
   * scores, costs, and other derived metrics.
   */
  app.get("/api/audit/calculations", (c) => {
    return c.json({
      quality_score: {
        description:
          "Quality scores are a weighted average of four dimensions, modified by penalties.",
        dimension_weights: DIMENSION_WEIGHTS,
        signal_weights: SIGNAL_WEIGHTS,
        scoring_rules: [
          "Start with 50 points (neutral)",
          "+20 points for making commits",
          "+15 points for passing tests (if ran)",
          "+10 points if all tests passed (no failures)",
          "+10 points for successful build",
          "-20 points for test failures",
          "-15 points for build failure",
          "+5 points for ending session normally (within 1 min of last activity)"
        ],
        penalties: [
          "-10 points overall if loops are detected",
          "-20 points for high tool failure rate (>30%)",
          "-15 points for excessive tool usage (>500 calls)",
          "-15 points for dangerous commands (rm -rf, sudo, etc.)"
        ]
      },
      cost_estimation: {
        description:
          "Costs are estimated locally based on token usage and public pricing.",
        pricing_table: MODEL_PRICING,
        formulas: [
          "Input Cost = (Input Tokens / 1M) * Input Rate",
          "Output Cost = (Output Tokens / 1M) * Output Rate",
          "Cache Cost = (Cache Tokens / 1M) * Input Rate * 0.25 (25% of input rate)"
        ],
        disclaimer:
          "These are estimates only. Actual billing from providers may vary slightly due to rounding or plan differences."
      }
    });
  });

  /**
   * GET /api/audit/data-sources - Get info about all data files
   *
   * This provides full transparency into what files AgentWatch uses
   * and their current state.
   */
  app.get("/api/audit/data-sources", async (c) => {
    const claudeDir = join(homedir(), ".claude");
    const configDir = join(homedir(), ".config", "agentwatch");

    const sources = {
      // Main AgentWatch data directory
      agentwatch_dir: {
        path: DATA_DIR,
        exists: existsSync(DATA_DIR),
        description: "Main AgentWatch data directory",
        source_code: "packages/core/src/constants.ts"
      },

      // Hook data files
      hooks: {
        sessions: {
          ...getFileInfo(join(DATA_DIR, "hooks", "sessions.jsonl")),
          path: join(DATA_DIR, "hooks", "sessions.jsonl"),
          format: "JSONL (append-only)",
          description: "Hook session start/end events from Claude Code",
          source_code: "packages/monitor/src/hook-store.ts:39",
          edge_cases: [
            "Only populated when daemon is running with hooks enabled",
            "Sessions from before daemon start are not captured",
            "Orphan sessions if daemon crashes without SessionEnd"
          ]
        },
        tool_usages: {
          ...getFileInfo(join(DATA_DIR, "hooks", "tool_usages.jsonl")),
          path: join(DATA_DIR, "hooks", "tool_usages.jsonl"),
          format: "JSONL (append-only)",
          description: "Individual tool invocation records",
          source_code: "packages/monitor/src/hook-store.ts:40",
          edge_cases: [
            "Can grow very large (cleaned up after 30 days or >10k entries)",
            "PreToolUse creates pending entry, PostToolUse completes it"
          ]
        },
        commits: {
          ...getFileInfo(join(DATA_DIR, "hooks", "commits.jsonl")),
          path: join(DATA_DIR, "hooks", "commits.jsonl"),
          format: "JSONL (append-only)",
          description: "Git commits attributed to Claude sessions",
          source_code: "packages/monitor/src/hook-store.ts:41"
        },
        stats: {
          ...getFileInfo(join(DATA_DIR, "hooks", "stats.json")),
          path: join(DATA_DIR, "hooks", "stats.json"),
          format: "JSON",
          description: "Aggregated tool statistics",
          source_code: "packages/monitor/src/hook-store.ts:42"
        }
      },

      // Enrichment data
      enrichments: {
        store: {
          ...getFileInfo(join(DATA_DIR, "enrichments", "store.json")),
          path: join(DATA_DIR, "enrichments", "store.json"),
          format: "JSON",
          description:
            "Session enrichments (quality scores, tags, annotations)",
          source_code: "packages/daemon/src/enrichment-store.ts:38",
          edge_cases: [
            "Enrichments computed at session end by default",
            "Can recompute via API /api/enrichments/compute",
            "Transcript-based enrichments may differ from hook-based"
          ]
        },
        audit: {
          ...getFileInfo(join(DATA_DIR, "enrichments", "audit.jsonl")),
          path: join(DATA_DIR, "enrichments", "audit.jsonl"),
          format: "JSONL (append-only)",
          description: "Audit trail of enrichment changes",
          source_code: "packages/daemon/src/enrichment-store.ts:39"
        }
      },

      // Metadata files
      metadata: {
        conversations: {
          ...getFileInfo(join(DATA_DIR, "conversation-metadata.json")),
          path: join(DATA_DIR, "conversation-metadata.json"),
          format: "JSON",
          description: "Conversation custom names",
          source_code: "packages/daemon/src/conversation-metadata.ts:17"
        },
        agents: {
          ...getFileInfo(join(DATA_DIR, "agent-metadata.json")),
          path: join(DATA_DIR, "agent-metadata.json"),
          format: "JSON",
          description: "Agent custom names and notes",
          source_code: "packages/daemon/src/agent-metadata.ts:19"
        },
        agent_renames: {
          ...getFileInfo(join(DATA_DIR, "agent-renames.jsonl")),
          path: join(DATA_DIR, "agent-renames.jsonl"),
          format: "JSONL (append-only)",
          description: "History of agent renames",
          source_code: "packages/daemon/src/agent-metadata.ts:20"
        }
      },

      // Process logs
      processes: {
        directory: {
          path: join(DATA_DIR, "processes"),
          exists: existsSync(join(DATA_DIR, "processes")),
          snapshot_files: countFiles(
            join(DATA_DIR, "processes"),
            /^snapshots_/
          ),
          event_files: countFiles(join(DATA_DIR, "processes"), /^events_/),
          description: "Process snapshots and lifecycle events",
          source_code: "packages/monitor/src/process-logger.ts",
          edge_cases: [
            "Snapshots taken every 10 scans while daemon is running",
            "Events logged on process start/end detection",
            "Files older than 30 days are auto-deleted"
          ]
        }
      },

      // Session logs
      logs: {
        directory: {
          path: join(DATA_DIR, "logs"),
          exists: existsSync(join(DATA_DIR, "logs")),
          file_count: countFiles(join(DATA_DIR, "logs"), /\.jsonl$/),
          description: "Wrapped session output logs",
          source_code: "packages/daemon/src/session-logger.ts",
          edge_cases: ["Max 500 files kept", "Older than 30 days auto-deleted"]
        }
      },

      // Managed sessions (aw run)
      managed_sessions: {
        directory: {
          path: join(DATA_DIR, "sessions"),
          exists: existsSync(join(DATA_DIR, "sessions")),
          session_count: countFiles(join(DATA_DIR, "sessions"), /\.json$/) - 1, // Exclude index.json
          description: "Sessions created via 'aw run' command",
          source_code: "packages/monitor/src/session-store.ts",
          edge_cases: [
            "One JSON file per session + index.json",
            "Sessions older than 7 days not loaded into memory on startup",
            "Sessions older than 30 days auto-deleted on cleanup"
          ]
        },
        index: {
          ...getFileInfo(join(DATA_DIR, "sessions", "index.json")),
          path: join(DATA_DIR, "sessions", "index.json"),
          format: "JSON",
          description: "Quick-lookup index for managed sessions",
          source_code: "packages/monitor/src/session-store.ts:223"
        }
      },

      // Contributor settings
      contributor: {
        settings: {
          ...getFileInfo(join(DATA_DIR, "contributor.json")),
          path: join(DATA_DIR, "contributor.json"),
          format: "JSON",
          description: "Contributor ID, HF token, redaction profiles",
          source_code: "packages/daemon/src/contributor-settings.ts:227"
        },
        contributions: {
          ...getFileInfo(join(DATA_DIR, "contributions.json")),
          path: join(DATA_DIR, "contributions.json"),
          format: "JSON",
          description: "History of data contributions/exports",
          source_code: "packages/daemon/src/contributor-settings.ts:228"
        }
      },

      // Configuration
      config: {
        main: {
          ...getFileInfo(join(configDir, "config.toml")),
          path: join(configDir, "config.toml"),
          format: "TOML",
          description: "Main daemon configuration",
          source_code: "packages/daemon/src/config.ts:535"
        },
        rules: {
          ...getFileInfo(join(DATA_DIR, "rules.jsonl")),
          path: join(DATA_DIR, "rules.jsonl"),
          format: "JSONL",
          description: "Custom hook enhancement rules",
          source_code: "packages/daemon/src/config.ts:459"
        }
      },

      // Local transcripts (read-only, discovered from Claude/Codex/Gemini)
      local_transcripts: {
        claude: {
          path: join(claudeDir, "projects"),
          exists: existsSync(join(claudeDir, "projects")),
          project_count: countFiles(join(claudeDir, "projects")),
          description: "Claude Code transcript files",
          source_code: "packages/daemon/src/local-logs.ts:155",
          edge_cases: [
            "Discovered on-demand, not actively monitored",
            "Path encoding: /Users/foo/bar → -Users-foo-bar",
            "File mtime used as 'modifiedAt' timestamp",
            "If user moves/deletes files, they disappear from discovery"
          ]
        },
        codex: {
          path: join(homedir(), ".codex", "sessions"),
          exists: existsSync(join(homedir(), ".codex", "sessions")),
          description: "Codex CLI transcript files",
          source_code: "packages/daemon/src/local-logs.ts:190"
        },
        gemini: {
          path: join(homedir(), ".gemini", "tmp"),
          exists: existsSync(join(homedir(), ".gemini", "tmp")),
          description: "Gemini CLI transcript files",
          source_code: "packages/daemon/src/local-logs.ts:240"
        }
      },

      // Audit log itself
      audit: {
        log: {
          ...getFileInfo(join(DATA_DIR, "audit.jsonl")),
          path: join(DATA_DIR, "audit.jsonl"),
          format: "JSONL (append-only)",
          description: "This audit log",
          source_code: "packages/daemon/src/audit-log.ts"
        }
      }
    };

    return c.json({
      data_dir: DATA_DIR,
      sources,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * GET /api/audit/edge-cases - Document known edge cases
   */
  app.get("/api/audit/edge-cases", (c) => {
    const edgeCases = {
      time_window_changes: {
        title: "User Changes Time Window",
        description:
          "When users change the transcript_days setting, analytics are recomputed from scratch each time.",
        behavior: [
          "No caching of computed results - everything recomputes on each request",
          "Changing from 7 days to 30 days will show different totals",
          "Historical data is not lost, just filtered by the window"
        ],
        source_code:
          "packages/daemon/src/api-enrichments.ts (analytics endpoints)"
      },
      transcript_file_changes: {
        title: "User Moves or Deletes Transcript Files",
        description:
          "Local transcripts are discovered on-demand by scanning the filesystem.",
        behavior: [
          "If a transcript file is moved, it will be rediscovered at new location with a new ID",
          "If deleted, it disappears from discovery (enrichments may still exist)",
          "Enrichments are stored by ID - orphaned enrichments are not auto-cleaned",
          "Correlation between hooks and transcripts uses file path matching"
        ],
        source_code:
          "packages/daemon/src/local-logs.ts:discoverLocalTranscripts"
      },
      partial_daemon_uptime: {
        title: "AgentWatch Only Running Part of Day",
        description:
          "Hook data is only captured while the daemon is running with hooks enabled.",
        behavior: [
          "Sessions started before daemon start have no hook data",
          "Sessions interrupted by daemon shutdown may have incomplete data",
          "Process scanning only happens while daemon is running",
          "Local transcripts are always discoverable (filesystem-based)"
        ],
        source_code: "packages/daemon/src/server.ts"
      },
      enrichment_recomputation: {
        title: "When Are Enrichments Recomputed?",
        description: "Enrichments are computed at specific trigger points.",
        behavior: [
          "Hook-based: Computed automatically at SessionEnd hook",
          "Transcript-based: Only computed on explicit API call",
          "Manual: POST /api/enrichments/compute to recompute all",
          "Force flag needed to overwrite existing enrichments",
          "Quality scores depend on available data at compute time"
        ],
        source_code: "packages/daemon/src/enrichments/index.ts"
      },
      correlation_matching: {
        title: "How Sessions Are Matched to Transcripts",
        description:
          "Hook sessions are correlated to local transcripts by file path.",
        behavior: [
          "HookSession.transcriptPath is matched to LocalTranscript.path",
          "If paths don't match exactly, correlation fails",
          "Symlinks may cause mismatches",
          "Correlation stats available at GET /api/contrib/correlated"
        ],
        source_code: "packages/daemon/src/correlation.ts"
      },
      data_retention: {
        title: "Data Retention and Cleanup",
        description: "Different data types have different retention policies.",
        behavior: [
          "Hook sessions: Cleaned up after 30 days",
          "Tool usages: Max 10,000 entries, then oldest removed",
          "Process logs: Max 100 files, 30 days max age",
          "Session logs: Max 500 files, 30 days max age",
          "Enrichments: No automatic cleanup",
          "Config/metadata: Never auto-deleted"
        ],
        source_code: "packages/monitor/src/hook-store.ts:cleanupOldData"
      },
      startup_behavior: {
        title: "What Happens at Daemon Start?",
        description: "Daemon loads recent data into memory on startup.",
        behavior: [
          "Loads hook sessions from last 24 hours into memory",
          "Loads tool usages from last 24 hours",
          "Starts process scanner (every 5 seconds by default)",
          "Starts repo scanner (if roots configured)",
          "Does NOT retroactively create hook data for past sessions"
        ],
        source_code: "packages/daemon/src/server.ts:startDaemon"
      }
    };

    return c.json({ edge_cases: edgeCases });
  });

  /**
   * GET /api/audit/categories - Get available categories and actions
   */
  app.get("/api/audit/categories", (c) => {
    const categories: Record<
      string,
      { description: string; actions: string[] }
    > = {
      transcript: {
        description: "Local transcript files from AI coding agents",
        actions: ["discover", "read", "delete"]
      },
      hook_session: {
        description: "Claude Code hook session lifecycle",
        actions: ["start", "end", "update"]
      },
      tool_usage: {
        description: "Individual tool invocations during sessions",
        actions: ["create", "update"]
      },
      enrichment: {
        description: "Auto-computed session enrichments (quality scores, tags)",
        actions: ["compute", "update", "delete"]
      },
      annotation: {
        description: "User annotations and feedback on sessions",
        actions: ["annotate", "update", "delete"]
      },
      conversation: {
        description: "Conversation metadata and naming",
        actions: ["create", "rename", "delete"]
      },
      agent: {
        description: "Agent process metadata and naming",
        actions: ["create", "rename", "update", "delete"]
      },
      managed_session: {
        description: "User-managed agent sessions (wrapped processes)",
        actions: ["create", "start", "end", "update", "delete"]
      },
      process: {
        description: "Agent process lifecycle events",
        actions: ["start", "end"]
      },
      config: {
        description: "Configuration and settings changes",
        actions: ["update"]
      },
      contributor: {
        description: "Data contribution settings and exports",
        actions: ["update", "export"]
      },
      daemon: {
        description: "Daemon lifecycle events",
        actions: ["start", "end"]
      },
      system: {
        description: "System-level events",
        actions: ["create", "update", "delete"]
      }
    };

    return c.json({ categories });
  });

  /**
   * POST /api/audit/log - Manually log an audit event
   */
  app.post("/api/audit/log", async (c) => {
    const body = (await c.req.json()) as {
      category: AuditCategory;
      action: AuditAction;
      entity_id: string;
      description: string;
      details?: Record<string, unknown>;
    };

    if (
      !body.category ||
      !body.action ||
      !body.entity_id ||
      !body.description
    ) {
      return c.json(
        {
          error:
            "Missing required fields: category, action, entity_id, description"
        },
        400
      );
    }

    const entry = logAuditEvent(
      body.category,
      body.action,
      body.entity_id,
      body.description,
      body.details,
      "user"
    );

    return c.json({
      success: true,
      entry: {
        timestamp: entry.timestamp,
        category: entry.category,
        action: entry.action,
        entity_id: entry.entityId,
        description: entry.description,
        source: entry.source
      }
    });
  });

  /**
   * GET /api/audit/entity/:entityId - Get audit history for a specific entity
   */
  app.get("/api/audit/entity/:entityId", async (c) => {
    const entityId = c.req.param("entityId");
    const limit = Number.parseInt(c.req.query("limit") || "50", 10);

    const result = await getCompleteTimeline({
      limit: 1000,
      includeInferred: true
    });

    const entityEvents = result.events
      .filter((e) => e.entityId === entityId)
      .slice(0, limit);

    return c.json({
      entity_id: entityId,
      events: entityEvents.map((e) => ({
        timestamp: e.timestamp,
        category: e.category,
        action: e.action,
        description: e.description,
        details: e.details,
        source: e.source
      })),
      total: entityEvents.length
    });
  });

  /**
   * GET /api/audit/recent - Get the most recent events
   */
  app.get("/api/audit/recent", async (c) => {
    const limit = Number.parseInt(c.req.query("limit") || "20", 10);

    const result = await getCompleteTimeline({
      limit,
      includeInferred: true
    });

    return c.json({
      events: result.events.map((e) => ({
        timestamp: e.timestamp,
        category: e.category,
        action: e.action,
        entity_id: e.entityId,
        description: e.description,
        source: e.source
      }))
    });
  });
}
