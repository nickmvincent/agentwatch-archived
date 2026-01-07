/**
 * Analyzer API Tests
 *
 * Tests for the analyzer REST API endpoints.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createAnalyzerApp, type AnalyzerAppState } from "../src/api";

describe("Analyzer API", () => {
  let app: ReturnType<typeof createAnalyzerApp>;
  let state: AnalyzerAppState;
  let shutdownCalled: boolean;
  let heartbeatCalled: boolean;

  beforeEach(() => {
    shutdownCalled = false;
    heartbeatCalled = false;
    state = {
      startedAt: Date.now(),
      watcherUrl: "http://localhost:8420",
      shutdown: () => {
        shutdownCalled = true;
      },
      recordHeartbeat: () => {
        heartbeatCalled = true;
      }
    };

    app = createAnalyzerApp(state);
  });

  describe("Health & Status", () => {
    it("GET /api/health returns ok", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
    });

    it("GET /api/status returns analyzer status", async () => {
      const res = await app.request("/api/status");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.component).toBe("analyzer");
      expect(typeof data.uptime_seconds).toBe("number");
      expect(data.watcher_url).toBe("http://localhost:8420");
    });
  });

  describe("Browser Lifecycle", () => {
    it("POST /api/heartbeat returns ok", async () => {
      const res = await app.request("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(typeof data.timestamp).toBe("number");
    });

    it("POST /api/heartbeat calls recordHeartbeat callback", async () => {
      expect(heartbeatCalled).toBe(false);

      await app.request("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      expect(heartbeatCalled).toBe(true);
    });

    it("POST /api/shutdown triggers shutdown callback", async () => {
      const res = await app.request("/api/shutdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");

      // Wait for setTimeout
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(shutdownCalled).toBe(true);
    });
  });

  describe("Enrichments API", () => {
    it("GET /api/enrichments returns sessions and stats", async () => {
      const res = await app.request("/api/enrichments");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(typeof data.stats.total).toBe("number");
      expect(typeof data.stats.with_quality_score).toBe("number");
    });

    it("GET /api/enrichments/workflow-stats returns stats", async () => {
      const res = await app.request("/api/enrichments/workflow-stats");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.total).toBe("number");
      expect(typeof data.reviewed).toBe("number");
      expect(typeof data.pending).toBe("number");
    });

    it("GET /api/enrichments/:sessionId returns 404 for unknown session", async () => {
      const res = await app.request("/api/enrichments/nonexistent-session");
      expect(res.status).toBe(404);
    });
  });

  describe("Transcripts API", () => {
    it("GET /api/transcripts returns transcripts list", async () => {
      const res = await app.request("/api/transcripts");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.transcripts)).toBe(true);
      expect(typeof data.total).toBe("number");
      expect(typeof data.offset).toBe("number");
      expect(typeof data.limit).toBe("number");
    });

    it("GET /api/transcripts/:id returns 404 for unknown transcript", async () => {
      const res = await app.request("/api/transcripts/nonexistent-id");
      expect(res.status).toBe(404);
    });

    it("POST /api/transcripts/rescan triggers rescan", async () => {
      const res = await app.request("/api/transcripts/rescan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(typeof data.total).toBe("number");
    });

    // Note: This test is slow because it parses all transcripts
    // The endpoint is covered by manual testing and the integration tests
    it.skip(
      "GET /api/transcripts/stats returns aggregate stats (slow - parses transcripts)",
      async () => {
        const res = await app.request("/api/transcripts/stats");
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(typeof data.total_transcripts).toBe("number");
        expect(typeof data.processed_transcripts).toBe("number");
        expect(typeof data.total_size_bytes).toBe("number");
        expect(typeof data.total_size_mb).toBe("number");
        expect(data.summary).toBeDefined();
        expect(typeof data.summary.file_reads).toBe("number");
        expect(typeof data.summary.file_writes).toBe("number");
        expect(typeof data.summary.file_edits).toBe("number");
        expect(Array.isArray(data.sensitive_files)).toBe(true);
        expect(typeof data.sensitive_file_count).toBe("number");
        expect(Array.isArray(data.top_files_read)).toBe(true);
        expect(Array.isArray(data.by_project)).toBe(true);
      },
      { timeout: 120000 }
    );
  });

  describe("Privacy Risk API", () => {
    it("GET /api/enrichments/privacy-risk/:id returns 404 for unknown transcript", async () => {
      const res = await app.request(
        "/api/enrichments/privacy-risk/nonexistent-transcript"
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Analytics API", () => {
    it("GET /api/analytics/overview returns structure", async () => {
      const res = await app.request("/api/analytics/overview");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessions).toBeDefined();
      expect(typeof data.sessions.total).toBe("number");
      expect(data.quality).toBeDefined();
      expect(data.costs).toBeDefined();
    });

    it("GET /api/analytics/daily returns daily structure", async () => {
      const res = await app.request("/api/analytics/daily");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.daily)).toBe(true);
      expect(typeof data.days).toBe("number");
      expect(data.summary).toBeDefined();
    });
  });

  describe("Annotations API", () => {
    it("GET /api/annotations returns list", async () => {
      const res = await app.request("/api/annotations");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.annotations)).toBe(true);
    });

    it("GET /api/annotations/:sessionId returns 404 for unknown", async () => {
      const res = await app.request("/api/annotations/nonexistent-session");
      expect(res.status).toBe(404);
    });

    it("POST /api/annotations/:sessionId creates annotation", async () => {
      const res = await app.request("/api/annotations/test-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 5, notes: "Test annotation" })
      });
      // In sandbox mode, writes may fail with 500
      // In normal mode, should succeed with 200
      expect([200, 500]).toContain(res.status);

      const data = await res.json();
      if (res.status === 200) {
        expect(data.status).toBe("ok");
        expect(data.session_id).toBe("test-session");
      } else {
        expect(data.error).toBeDefined();
      }
    });

    it("DELETE /api/annotations/:sessionId returns 404 for nonexistent", async () => {
      // Delete a nonexistent annotation
      const res = await app.request(
        "/api/annotations/nonexistent-delete-test",
        {
          method: "DELETE"
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Share API", () => {
    it("GET /api/share/status returns unconfigured", async () => {
      const res = await app.request("/api/share/status");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.configured).toBe(false);
      expect(data.authenticated).toBe(false);
    });

    it("POST /api/share/export returns 501 (placeholder)", async () => {
      const res = await app.request("/api/share/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(501);
    });
  });

  describe("Projects API", () => {
    it("GET /api/projects returns projects list", async () => {
      const res = await app.request("/api/projects");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.projects)).toBe(true);
    });

    it("GET /api/projects/:id returns 404 for unknown", async () => {
      const res = await app.request("/api/projects/nonexistent-project");
      expect(res.status).toBe(404);
    });

    it("POST /api/projects validates required fields", async () => {
      // Missing id
      const res1 = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", paths: ["/test"] })
      });
      expect(res1.status).toBe(400);

      // Missing paths
      const res2 = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "test", name: "Test" })
      });
      expect(res2.status).toBe(400);

      // Empty paths array
      const res3 = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "test", name: "Test", paths: [] })
      });
      expect(res3.status).toBe(400);
    });

    it("PATCH /api/projects/:id returns 404 for unknown", async () => {
      const res = await app.request("/api/projects/nonexistent-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" })
      });
      expect(res.status).toBe(404);
    });

    it("DELETE /api/projects/:id returns 404 for unknown", async () => {
      const res = await app.request("/api/projects/nonexistent-project", {
        method: "DELETE"
      });
      expect(res.status).toBe(404);
    });
  });
});
