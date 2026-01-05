/**
 * Audit API Endpoint Tests
 *
 * Tests for the audit log REST API endpoints.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";

// =============================================================================
// MOCK DATA
// =============================================================================

const mockAuditEntries = [
  {
    timestamp: "2024-01-01T10:00:00.000Z",
    category: "daemon",
    action: "start",
    entityId: "daemon-1",
    description: "Daemon started",
    source: "daemon"
  },
  {
    timestamp: "2024-01-01T10:01:00.000Z",
    category: "hook_session",
    action: "start",
    entityId: "session-1",
    description: "Hook session started",
    details: { cwd: "/projects/test" },
    source: "hook"
  },
  {
    timestamp: "2024-01-01T10:05:00.000Z",
    category: "tool_usage",
    action: "create",
    entityId: "tool-1",
    description: "Tool Read invoked",
    source: "hook"
  },
  {
    timestamp: "2024-01-01T10:10:00.000Z",
    category: "hook_session",
    action: "end",
    entityId: "session-1",
    description: "Hook session ended (10 tools, $0.0234)",
    source: "hook"
  },
  {
    timestamp: "2024-01-01T10:15:00.000Z",
    category: "enrichment",
    action: "compute",
    entityId: "session-1",
    description: "Quality score computed",
    source: "daemon"
  }
];

// =============================================================================
// CREATE TEST APP
// =============================================================================

function createTestApp() {
  const app = new Hono();
  const entries = [...mockAuditEntries];

  // GET /api/audit - Get complete audit timeline
  app.get("/api/audit", async (c) => {
    const limit = Number.parseInt(c.req.query("limit") || "100", 10);
    const offset = Number.parseInt(c.req.query("offset") || "0", 10);
    const category = c.req.query("category");
    const since = c.req.query("since");
    const until = c.req.query("until");

    let filtered = [...entries];

    if (category) {
      filtered = filtered.filter((e) => e.category === category);
    }
    if (since) {
      filtered = filtered.filter((e) => e.timestamp >= since);
    }
    if (until) {
      filtered = filtered.filter((e) => e.timestamp <= until);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    const byCategory: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    for (const e of filtered) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byAction[e.action] = (byAction[e.action] || 0) + 1;
    }

    return c.json({
      events: paginated.map((e) => ({
        timestamp: e.timestamp,
        category: e.category,
        action: e.action,
        entity_id: e.entityId,
        description: e.description,
        details: e.details,
        source: e.source
      })),
      stats: {
        total_events: total,
        by_category: byCategory,
        by_action: byAction,
        oldest_event: filtered[filtered.length - 1]?.timestamp,
        newest_event: filtered[0]?.timestamp
      },
      sources: {
        logged: entries.length,
        inferred: 0
      },
      pagination: {
        limit,
        offset,
        has_more: total > offset + limit
      }
    });
  });

  // GET /api/audit/stats - Get audit statistics
  app.get("/api/audit/stats", (c) => {
    const byCategory: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    for (const e of entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byAction[e.action] = (byAction[e.action] || 0) + 1;
    }

    const sorted = [...entries].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    return c.json({
      total_events: entries.length,
      by_category: byCategory,
      by_action: byAction,
      oldest_event: sorted[0]?.timestamp,
      newest_event: sorted[sorted.length - 1]?.timestamp
    });
  });

  // GET /api/audit/categories - Get available categories
  app.get("/api/audit/categories", (c) => {
    return c.json({
      categories: {
        transcript: {
          description: "Local transcript files",
          actions: ["discover", "read", "delete"]
        },
        hook_session: {
          description: "Claude Code hook sessions",
          actions: ["start", "end", "update"]
        },
        tool_usage: {
          description: "Tool invocations",
          actions: ["create", "update"]
        },
        enrichment: {
          description: "Session enrichments",
          actions: ["compute", "update", "delete"]
        },
        annotation: {
          description: "User annotations",
          actions: ["annotate", "update", "delete"]
        },
        conversation: {
          description: "Conversation metadata",
          actions: ["create", "rename", "delete"]
        },
        agent: {
          description: "Agent metadata",
          actions: ["create", "rename", "update", "delete"]
        },
        managed_session: {
          description: "Managed sessions",
          actions: ["create", "start", "end", "update", "delete"]
        },
        process: {
          description: "Process lifecycle",
          actions: ["start", "end"]
        },
        config: { description: "Configuration changes", actions: ["update"] },
        contributor: {
          description: "Contributor settings",
          actions: ["update", "export"]
        },
        daemon: { description: "Daemon lifecycle", actions: ["start", "end"] },
        system: {
          description: "System events",
          actions: ["create", "update", "delete"]
        }
      }
    });
  });

  // POST /api/audit/log - Log a new audit entry
  app.post("/api/audit/log", async (c) => {
    const body = await c.req.json();

    if (
      !body.category ||
      !body.action ||
      !body.entity_id ||
      !body.description
    ) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const entry = {
      timestamp: new Date().toISOString(),
      category: body.category,
      action: body.action,
      entityId: body.entity_id,
      description: body.description,
      details: body.details,
      source: "user"
    };
    entries.push(entry);

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

  // GET /api/audit/entity/:entityId - Get history for entity
  app.get("/api/audit/entity/:entityId", (c) => {
    const entityId = c.req.param("entityId");
    const limit = Number.parseInt(c.req.query("limit") || "50", 10);

    const entityEvents = entries
      .filter((e) => e.entityId === entityId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
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

  // GET /api/audit/recent - Get recent events
  app.get("/api/audit/recent", (c) => {
    const limit = Number.parseInt(c.req.query("limit") || "20", 10);

    const recent = [...entries]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);

    return c.json({
      events: recent.map((e) => ({
        timestamp: e.timestamp,
        category: e.category,
        action: e.action,
        entity_id: e.entityId,
        description: e.description,
        source: e.source
      }))
    });
  });

  // GET /api/audit/data-sources - Get data source info
  app.get("/api/audit/data-sources", (c) => {
    return c.json({
      data_dir: "/home/user/.agentwatch",
      sources: {
        agentwatch_dir: {
          path: "/home/user/.agentwatch",
          exists: true,
          description: "Main AgentWatch data directory"
        },
        hooks: {
          sessions: { exists: true, format: "JSONL" },
          tool_usages: { exists: true, format: "JSONL" }
        }
      },
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/audit/edge-cases - Get edge case documentation
  app.get("/api/audit/edge-cases", (c) => {
    return c.json({
      edge_cases: {
        time_window_changes: {
          title: "User Changes Time Window",
          description: "Analytics recompute when time window changes"
        },
        partial_daemon_uptime: {
          title: "Daemon Only Running Part of Day",
          description: "Hook data only captured while daemon running"
        }
      }
    });
  });

  // GET /api/audit/calculations - Get transparent calculation logic
  app.get("/api/audit/calculations", (c) => {
    return c.json({
      quality_score: {
        description:
          "Quality scores are a weighted average of four dimensions, modified by penalties.",
        dimension_weights: {
          completion: 35,
          codeQuality: 25,
          efficiency: 25,
          safety: 15
        },
        signal_weights: {
          noFailures: 30,
          hasCommits: 25,
          normalEnd: 20,
          reasonableToolCount: 15,
          healthyPacing: 10
        },
        scoring_rules: [
          "Start with 50 points (neutral)",
          "+20 points for making commits"
        ],
        penalties: ["-10 points overall if loops are detected"]
      },
      cost_estimation: {
        description:
          "Costs are estimated locally based on token usage and public pricing.",
        pricing_table: {
          "claude-sonnet-4": { inputPerMillion: 3, outputPerMillion: 15 }
        },
        formulas: ["Input Cost = (Input Tokens / 1M) * Input Rate"],
        disclaimer: "These are estimates only."
      }
    });
  });

  return { app, getEntries: () => entries };
}

// =============================================================================
// TESTS
// =============================================================================

describe("Audit API", () => {
  describe("GET /api/audit", () => {
    it("returns audit events with pagination", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.events).toBeDefined();
      expect(data.stats).toBeDefined();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.limit).toBe(100);
      expect(data.pagination.offset).toBe(0);
    });

    it("respects limit parameter", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit?limit=2");
      const data = await res.json();

      expect(data.events.length).toBe(2);
      expect(data.pagination.has_more).toBe(true);
    });

    it("respects offset parameter", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit?offset=2&limit=2");
      const data = await res.json();

      expect(data.events.length).toBe(2);
      expect(data.pagination.offset).toBe(2);
    });

    it("filters by category", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit?category=hook_session");
      const data = await res.json();

      expect(data.events.length).toBe(2);
      expect(data.events.every((e: any) => e.category === "hook_session")).toBe(
        true
      );
    });

    it("filters by time range (since)", async () => {
      const { app } = createTestApp();
      const res = await app.request(
        "/api/audit?since=2024-01-01T10:05:00.000Z"
      );
      const data = await res.json();

      expect(
        data.events.every((e: any) => e.timestamp >= "2024-01-01T10:05:00.000Z")
      ).toBe(true);
    });

    it("filters by time range (until)", async () => {
      const { app } = createTestApp();
      const res = await app.request(
        "/api/audit?until=2024-01-01T10:05:00.000Z"
      );
      const data = await res.json();

      expect(
        data.events.every((e: any) => e.timestamp <= "2024-01-01T10:05:00.000Z")
      ).toBe(true);
    });

    it("returns stats with events", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit");
      const data = await res.json();

      expect(data.stats.total_events).toBe(5);
      expect(data.stats.by_category).toBeDefined();
      expect(data.stats.by_action).toBeDefined();
      expect(data.stats.oldest_event).toBeDefined();
      expect(data.stats.newest_event).toBeDefined();
    });

    it("sorts events by timestamp descending", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit");
      const data = await res.json();

      for (let i = 1; i < data.events.length; i++) {
        expect(data.events[i - 1].timestamp >= data.events[i].timestamp).toBe(
          true
        );
      }
    });
  });

  describe("GET /api/audit/stats", () => {
    it("returns statistics", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/stats");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total_events).toBe(5);
      expect(data.by_category["hook_session"]).toBe(2);
      expect(data.by_category["daemon"]).toBe(1);
    });

    it("counts actions correctly", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/stats");
      const data = await res.json();

      expect(data.by_action["start"]).toBe(2);
      expect(data.by_action["end"]).toBe(1);
      expect(data.by_action["create"]).toBe(1);
      expect(data.by_action["compute"]).toBe(1);
    });
  });

  describe("GET /api/audit/categories", () => {
    it("returns all categories with descriptions", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/categories");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.categories).toBeDefined();
      expect(data.categories.hook_session).toBeDefined();
      expect(data.categories.hook_session.description).toBeDefined();
      expect(data.categories.hook_session.actions).toContain("start");
      expect(data.categories.hook_session.actions).toContain("end");
    });

    it("includes all expected categories", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/categories");
      const data = await res.json();

      const expectedCategories = [
        "transcript",
        "hook_session",
        "tool_usage",
        "enrichment",
        "annotation",
        "conversation",
        "agent",
        "managed_session",
        "process",
        "config",
        "contributor",
        "daemon",
        "system"
      ];

      for (const cat of expectedCategories) {
        expect(data.categories[cat]).toBeDefined();
      }
    });
  });

  describe("POST /api/audit/log", () => {
    it("creates a new audit entry", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "annotation",
          action: "annotate",
          entity_id: "session-1",
          description: "User added note",
          details: { note: "This was a good session" }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.entry.category).toBe("annotation");
      expect(data.entry.source).toBe("user");
    });

    it("returns error for missing required fields", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "annotation"
          // Missing action, entity_id, description
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("GET /api/audit/entity/:entityId", () => {
    it("returns history for specific entity", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/entity/session-1");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.entity_id).toBe("session-1");
      expect(data.events.length).toBe(3); // start, end, enrichment
      expect(data.total).toBe(3);
    });

    it("returns empty for non-existent entity", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/entity/does-not-exist");

      const data = await res.json();
      expect(data.events.length).toBe(0);
      expect(data.total).toBe(0);
    });

    it("respects limit parameter", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/entity/session-1?limit=1");

      const data = await res.json();
      expect(data.events.length).toBe(1);
    });
  });

  describe("GET /api/audit/recent", () => {
    it("returns recent events", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/recent");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.events).toBeDefined();
      expect(data.events.length).toBeLessThanOrEqual(20);
    });

    it("respects limit parameter", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/recent?limit=3");

      const data = await res.json();
      expect(data.events.length).toBe(3);
    });

    it("returns newest events first", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/recent");
      const data = await res.json();

      for (let i = 1; i < data.events.length; i++) {
        expect(data.events[i - 1].timestamp >= data.events[i].timestamp).toBe(
          true
        );
      }
    });
  });

  describe("GET /api/audit/data-sources", () => {
    it("returns data source information", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/data-sources");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.data_dir).toBeDefined();
      expect(data.sources).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    it("includes hook data sources", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/data-sources");
      const data = await res.json();

      expect(data.sources.hooks).toBeDefined();
      expect(data.sources.hooks.sessions).toBeDefined();
    });
  });

  describe("GET /api/audit/edge-cases", () => {
    it("returns edge case documentation", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/edge-cases");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.edge_cases).toBeDefined();
      expect(data.edge_cases.time_window_changes).toBeDefined();
      expect(data.edge_cases.time_window_changes.title).toBeDefined();
      expect(data.edge_cases.time_window_changes.description).toBeDefined();
    });
  });

  describe("GET /api/audit/calculations", () => {
    it("returns calculation logic and constants", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/audit/calculations");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.quality_score).toBeDefined();
      expect(data.quality_score.dimension_weights).toBeDefined();
      expect(data.quality_score.scoring_rules).toBeDefined();

      expect(data.cost_estimation).toBeDefined();
      expect(data.cost_estimation.pricing_table).toBeDefined();
      expect(data.cost_estimation.formulas).toBeDefined();
    });
  });
});
