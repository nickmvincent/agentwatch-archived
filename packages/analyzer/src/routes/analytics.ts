/**
 * Analytics routes.
 *
 * Provides endpoints for:
 * - Overview statistics
 * - Daily breakdowns
 * - Quality distribution
 * - Per-project analytics
 *
 * @module routes/analytics
 */

import type { Hono } from "hono";
import { Database } from "bun:sqlite";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadTranscriptIndex,
  getIndexedTranscripts,
  getIndexStats
} from "../transcript-index";
import { getAllEnrichments, getEnrichmentStats } from "../enrichment-store";
import { loadAnalyzerConfig } from "../config";
import { correlateSessionsWithTranscripts } from "../correlation";
import { readHookSessions, readToolUsages } from "../hooks-data";
import { discoverLocalTranscripts } from "../local-logs";

/**
 * Register analytics routes.
 *
 * @param app - The Hono app instance
 */
export function registerAnalyticsRoutes(app: Hono): void {
  /**
   * GET /api/analytics/overview
   *
   * Get overview statistics.
   *
   * @returns {
   *   sessions: { total, with_enrichments, with_feedback },
   *   quality: { average_score, distribution },
   *   costs: { total_usd, average_per_session }
   * }
   */
  app.get("/api/analytics/overview", async (c) => {
    try {
      const index = loadTranscriptIndex();
      const indexStats = getIndexStats(index);
      const enrichStats = getEnrichmentStats();
      const withFeedback =
        enrichStats.annotated.positive + enrichStats.annotated.negative;

      return c.json({
        sessions: {
          total: indexStats.total,
          with_enrichments: enrichStats.totalSessions,
          with_feedback: withFeedback
        },
        quality: {
          average_score: null,
          distribution: enrichStats.qualityDistribution
        },
        costs: {
          total_usd: 0,
          average_per_session: 0
        }
      });
    } catch {
      return c.json({
        sessions: { total: 0, with_enrichments: 0, with_feedback: 0 },
        quality: { average_score: null, distribution: {} },
        costs: { total_usd: 0, average_per_session: 0 }
      });
    }
  });

  /**
   * GET /api/analytics/daily
   *
   * Get daily breakdown of sessions and quality.
   *
   * @query days - Number of days to include (default: 30)
   * @returns { days, daily: Array, summary }
   */
  app.get("/api/analytics/daily", async (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);
    try {
      const index = loadTranscriptIndex();
      const transcripts = getIndexedTranscripts(index, {});
      const enrichments = getAllEnrichments();

      // Group by date
      const byDate = new Map<
        string,
        { total: number; success: number; failure: number }
      >();
      const cutoff = Date.now() - days * 86400 * 1000;

      for (const t of transcripts) {
        if (t.modifiedAt < cutoff) continue;
        const date = new Date(t.modifiedAt).toISOString().slice(0, 10);
        const stats = byDate.get(date) || { total: 0, success: 0, failure: 0 };
        stats.total++;

        // Check enrichment quality
        const enrichment = enrichments[`transcript:${t.id}`];
        if (enrichment?.qualityScore) {
          if (enrichment.qualityScore.overall >= 60) stats.success++;
          else if (enrichment.qualityScore.overall < 40) stats.failure++;
        }

        byDate.set(date, stats);
      }

      const dailyData = Array.from(byDate.entries())
        .map(([date, stats]) => ({
          date,
          total: stats.total,
          success_count: stats.success,
          failure_count: stats.failure,
          rate:
            stats.total > 0
              ? Math.round((stats.success / stats.total) * 1000) / 10
              : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return c.json({
        days,
        daily: dailyData,
        summary: {
          total_days: dailyData.length,
          total_sessions: dailyData.reduce((sum, d) => sum + d.total, 0)
        }
      });
    } catch {
      return c.json({
        days,
        daily: [],
        summary: { total_days: 0, total_sessions: 0 }
      });
    }
  });

  /**
   * GET /api/analytics/quality-distribution
   *
   * Get quality score distribution across sessions.
   *
   * @returns {
   *   total_scored: number,
   *   distribution: Array<{ range, min, max, count, percentage }>,
   *   percentiles: { p25, p50, p75, p90 }
   * }
   */
  app.get("/api/analytics/quality-distribution", (c) => {
    try {
      const enrichments = getAllEnrichments();

      const buckets = [
        { range: "0-25", min: 0, max: 25, count: 0 },
        { range: "25-50", min: 25, max: 50, count: 0 },
        { range: "50-75", min: 50, max: 75, count: 0 },
        { range: "75-100", min: 75, max: 100, count: 0 }
      ];

      let total = 0;
      const scores: number[] = [];

      for (const enrichment of Object.values(enrichments)) {
        if (!enrichment.qualityScore) continue;

        const score = enrichment.qualityScore.overall;
        scores.push(score);
        total++;

        for (const bucket of buckets) {
          if (score >= bucket.min && score < bucket.max) {
            bucket.count++;
            break;
          }
          if (score >= 100 && bucket.max === 100) {
            bucket.count++;
            break;
          }
        }
      }

      scores.sort((a, b) => a - b);
      const percentiles = {
        p25: scores[Math.floor(scores.length * 0.25)] || 0,
        p50: scores[Math.floor(scores.length * 0.5)] || 0,
        p75: scores[Math.floor(scores.length * 0.75)] || 0,
        p90: scores[Math.floor(scores.length * 0.9)] || 0
      };

      return c.json({
        total_scored: total,
        distribution: buckets.map((b) => ({
          range: b.range,
          min: b.min,
          max: b.max,
          count: b.count,
          percentage: total > 0 ? Math.round((b.count / total) * 1000) / 10 : 0
        })),
        percentiles
      });
    } catch {
      return c.json({ total_scored: 0, distribution: [], percentiles: {} });
    }
  });

  /**
   * GET /api/analytics/by-project
   *
   * Get analytics grouped by project.
   *
   * @query days - Number of days to include (default: 30)
   * @returns {
   *   days: number,
   *   breakdown: ProjectAnalyticsItem[],
   *   unassigned: { session_count, total_cost_usd, ... }
   * }
   */
  app.get("/api/analytics/by-project", async (c) => {
    try {
      const days = Number.parseInt(c.req.query("days") ?? "30", 10);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      const config = loadAnalyzerConfig();
      const index = loadTranscriptIndex();
      const allTranscripts = getIndexedTranscripts(index, {});
      const transcripts = allTranscripts.filter((t) => t.modifiedAt >= cutoff);
      const enrichments = getAllEnrichments();

      // Group transcripts by project with full stats
      const byProject = new Map<
        string,
        {
          name: string;
          session_count: number;
          total_cost_usd: number;
          total_input_tokens: number;
          total_output_tokens: number;
          success_count: number;
          failure_count: number;
        }
      >();

      // Initialize projects
      for (const project of config.projects) {
        byProject.set(project.id, {
          name: project.name,
          session_count: 0,
          total_cost_usd: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          success_count: 0,
          failure_count: 0
        });
      }

      // Unassigned bucket
      const unassigned = {
        session_count: 0,
        total_cost_usd: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        success_count: 0,
        failure_count: 0
      };

      for (const t of transcripts) {
        const enrichment = enrichments[`transcript:${t.id}`];
        const outcome = enrichment?.outcomeSignals;

        // Determine success/failure from test results
        const testsRan = outcome?.testResults?.ran ?? false;
        const testsPassed =
          testsRan && (outcome?.testResults?.failed ?? 0) === 0;
        const testsFailed = testsRan && (outcome?.testResults?.failed ?? 0) > 0;

        // Find matching project
        let matched = false;
        for (const project of config.projects) {
          for (const path of project.paths) {
            if (t.projectDir?.startsWith(path)) {
              const stats = byProject.get(project.id);
              if (stats) {
                stats.session_count++;
                if (testsPassed) {
                  stats.success_count++;
                } else if (testsFailed) {
                  stats.failure_count++;
                }
              }
              matched = true;
              break;
            }
          }
          if (matched) break;
        }

        if (!matched) {
          unassigned.session_count++;
          if (testsPassed) {
            unassigned.success_count++;
          } else if (testsFailed) {
            unassigned.failure_count++;
          }
        }
      }

      const breakdown = Array.from(byProject.entries()).map(([id, stats]) => ({
        project_id: id,
        project_name: stats.name,
        session_count: stats.session_count,
        total_cost_usd: stats.total_cost_usd,
        total_input_tokens: stats.total_input_tokens,
        total_output_tokens: stats.total_output_tokens,
        success_count: stats.success_count,
        failure_count: stats.failure_count
      }));

      return c.json({
        days,
        breakdown,
        unassigned
      });
    } catch {
      return c.json({
        days: 30,
        breakdown: [],
        unassigned: {
          session_count: 0,
          total_cost_usd: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          success_count: 0,
          failure_count: 0
        }
      });
    }
  });

  /**
   * GET /api/analytics/combined
   *
   * Combined analytics response for the analyzer UI.
   */
  app.get("/api/analytics/combined", async (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);

    try {
      const index = loadTranscriptIndex();
      const indexStats = getIndexStats(index);
      const enrichStats = getEnrichmentStats();
      const enrichments = getAllEnrichments();
      const transcripts = getIndexedTranscripts(index, {});

      // Daily success trend (reuse daily logic)
      const byDate = new Map<
        string,
        { total: number; success: number; failure: number }
      >();
      const cutoff = Date.now() - days * 86400 * 1000;

      for (const t of transcripts) {
        if (t.modifiedAt < cutoff) continue;
        const date = new Date(t.modifiedAt).toISOString().slice(0, 10);
        const stats = byDate.get(date) || { total: 0, success: 0, failure: 0 };
        stats.total++;

        const enrichment = enrichments[`transcript:${t.id}`];
        if (enrichment?.qualityScore) {
          if (enrichment.qualityScore.overall >= 60) stats.success++;
          else if (enrichment.qualityScore.overall < 40) stats.failure++;
        }

        byDate.set(date, stats);
      }

      const successTrend = Array.from(byDate.entries())
        .map(([date, stats]) => ({
          date,
          total: stats.total,
          success_count: stats.success,
          failure_count: stats.failure,
          rate:
            stats.total > 0
              ? Math.round((stats.success / stats.total) * 1000) / 10
              : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const successTotals = successTrend.reduce(
        (acc, point) => {
          acc.total += point.total;
          acc.success += point.success_count;
          return acc;
        },
        { total: 0, success: 0 }
      );
      const successRate =
        successTotals.total > 0
          ? Math.round((successTotals.success / successTotals.total) * 1000) /
            10
          : 0;

      // Quality distribution
      const buckets = [
        { range: "0-25", min: 0, max: 25, count: 0 },
        { range: "25-50", min: 25, max: 50, count: 0 },
        { range: "50-75", min: 50, max: 75, count: 0 },
        { range: "75-100", min: 75, max: 100, count: 0 }
      ];

      let totalScored = 0;
      const scores: number[] = [];

      for (const enrichment of Object.values(enrichments)) {
        if (!enrichment.qualityScore) continue;
        const score = enrichment.qualityScore.overall;
        scores.push(score);
        totalScored++;
        for (const bucket of buckets) {
          if (score >= bucket.min && score < bucket.max) {
            bucket.count++;
            break;
          }
          if (score >= 100 && bucket.max === 100) {
            bucket.count++;
            break;
          }
        }
      }

      scores.sort((a, b) => a - b);
      const percentiles = {
        p25: scores[Math.floor(scores.length * 0.25)] || 0,
        p50: scores[Math.floor(scores.length * 0.5)] || 0,
        p75: scores[Math.floor(scores.length * 0.75)] || 0,
        p90: scores[Math.floor(scores.length * 0.9)] || 0
      };

      const qualityDistribution = {
        total_scored: totalScored,
        distribution: buckets.map((b) => ({
          range: b.range,
          min: b.min,
          max: b.max,
          count: b.count,
          percentage:
            totalScored > 0
              ? Math.round((b.count / totalScored) * 1000) / 10
              : 0
        })),
        percentiles
      };

      // By-project analytics (reuse /analytics/by-project logic)
      const cutoffByProject = Date.now() - days * 24 * 60 * 60 * 1000;
      const config = loadAnalyzerConfig();
      const filtered = transcripts.filter(
        (t) => t.modifiedAt >= cutoffByProject
      );

      const byProject = new Map<
        string,
        {
          name: string;
          session_count: number;
          total_cost_usd: number;
          total_input_tokens: number;
          total_output_tokens: number;
          success_count: number;
          failure_count: number;
        }
      >();

      for (const project of config.projects) {
        byProject.set(project.id, {
          name: project.name,
          session_count: 0,
          total_cost_usd: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          success_count: 0,
          failure_count: 0
        });
      }

      const unassigned = {
        session_count: 0,
        total_cost_usd: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        success_count: 0,
        failure_count: 0
      };

      for (const t of filtered) {
        const enrichment = enrichments[`transcript:${t.id}`];
        const outcome = enrichment?.outcomeSignals;
        const testsRan = outcome?.testResults?.ran ?? false;
        const testsPassed =
          testsRan && (outcome?.testResults?.failed ?? 0) === 0;
        const testsFailed = testsRan && (outcome?.testResults?.failed ?? 0) > 0;

        let matched = false;
        for (const project of config.projects) {
          for (const path of project.paths) {
            if (t.projectDir?.startsWith(path)) {
              const stats = byProject.get(project.id);
              if (stats) {
                stats.session_count++;
                if (testsPassed) {
                  stats.success_count++;
                } else if (testsFailed) {
                  stats.failure_count++;
                }
              }
              matched = true;
              break;
            }
          }
          if (matched) break;
        }

        if (!matched) {
          unassigned.session_count++;
          if (testsPassed) {
            unassigned.success_count++;
          } else if (testsFailed) {
            unassigned.failure_count++;
          }
        }
      }

      const breakdown = Array.from(byProject.entries()).map(([id, stats]) => ({
        project_id: id,
        project_name: stats.name,
        session_count: stats.session_count,
        total_cost_usd: stats.total_cost_usd,
        total_input_tokens: stats.total_input_tokens,
        total_output_tokens: stats.total_output_tokens,
        success_count: stats.success_count,
        failure_count: stats.failure_count
      }));

      const dashboard = {
        time_range: {
          start: new Date(Date.now() - days * 86400 * 1000).toISOString(),
          end: new Date().toISOString(),
          days
        },
        summary: {
          total_sessions: indexStats.total,
          success_rate: successRate,
          total_cost_usd: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          avg_duration_ms: 0
        },
        enrichment_stats: enrichStats,
        sources: {
          hook_sessions: 0,
          local_transcripts: indexStats.total
        }
      };

      return c.json({
        days,
        dashboard,
        success_trend: successTrend,
        cost_by_type: [],
        tool_retries: [],
        quality_distribution: qualityDistribution,
        loops: {
          sessions_with_loops: 0,
          total_loops: 0,
          total_retries: 0,
          by_pattern_type: {}
        },
        by_project: {
          breakdown,
          unassigned
        }
      });
    } catch {
      return c.json({
        days,
        dashboard: {
          time_range: {
            start: new Date(Date.now() - days * 86400 * 1000).toISOString(),
            end: new Date().toISOString(),
            days
          },
          summary: {
            total_sessions: 0,
            success_rate: 0,
            total_cost_usd: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            avg_duration_ms: 0
          },
          enrichment_stats: getEnrichmentStats()
        },
        success_trend: [],
        cost_by_type: [],
        tool_retries: [],
        quality_distribution: {
          total_scored: 0,
          distribution: [],
          percentiles: { p25: 0, p50: 0, p75: 0, p90: 0 }
        },
        loops: {
          sessions_with_loops: 0,
          total_loops: 0,
          total_retries: 0,
          by_pattern_type: {}
        },
        by_project: {
          breakdown: [],
          unassigned: {
            session_count: 0,
            total_cost_usd: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            success_count: 0,
            failure_count: 0
          }
        }
      });
    }
  });

  /**
   * GET /api/analytics/export/sqlite
   *
   * Export correlated sessions to a lightweight SQLite DB for notebooks.
   */
  app.get("/api/analytics/export/sqlite", async (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);
    const tmpPath = join(
      tmpdir(),
      `agentwatch-export-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`
    );

    try {
      const hookSessions = readHookSessions(days);
      const toolUsages = readToolUsages(days);
      const transcripts = await discoverLocalTranscripts();
      const correlated = correlateSessionsWithTranscripts(
        hookSessions,
        transcripts,
        toolUsages
      );
      const enrichments = getAllEnrichments();

      const db = new Database(tmpPath);
      db.exec(`
        CREATE TABLE conversations (
          correlation_id TEXT PRIMARY KEY,
          start_time INTEGER,
          end_time INTEGER,
          agent TEXT,
          cwd TEXT,
          match_type TEXT,
          has_hook INTEGER,
          has_transcript INTEGER,
          tool_count INTEGER,
          message_count INTEGER,
          size_bytes INTEGER,
          quality_score REAL,
          feedback TEXT,
          workflow_status TEXT
        );
      `);

      const insert = db.prepare(`
        INSERT INTO conversations (
          correlation_id,
          start_time,
          end_time,
          agent,
          cwd,
          match_type,
          has_hook,
          has_transcript,
          tool_count,
          message_count,
          size_bytes,
          quality_score,
          feedback,
          workflow_status
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        );
      `);

      for (const conv of correlated) {
        const correlationId = conv.correlationId;
        const enrichment =
          enrichments[`corr:${correlationId}`] ||
          (conv.hookSession
            ? enrichments[`hook:${conv.hookSession.sessionId}`]
            : undefined) ||
          (conv.transcript
            ? enrichments[`transcript:${conv.transcript.id}`]
            : undefined);

        const qualityScore = enrichment?.qualityScore?.overall ?? null;
        const feedback = enrichment?.manualAnnotation?.feedback ?? null;
        const workflowStatus =
          enrichment?.manualAnnotation?.workflowStatus ?? null;

        insert.run(
          correlationId,
          conv.startTime,
          conv.hookSession?.endTime ?? null,
          conv.agent,
          conv.cwd ?? null,
          conv.matchType,
          conv.hookSession ? 1 : 0,
          conv.transcript ? 1 : 0,
          conv.hookSession?.toolCount ?? null,
          conv.transcript?.messageCount ?? null,
          conv.transcript?.sizeBytes ?? null,
          qualityScore,
          feedback,
          workflowStatus
        );
      }

      db.close();

      const content = await Bun.file(tmpPath).arrayBuffer();
      rmSync(tmpPath, { force: true });

      return new Response(content, {
        headers: {
          "Content-Type": "application/vnd.sqlite3",
          "Content-Disposition": `attachment; filename="agentwatch-conversations.sqlite"`
        }
      });
    } catch {
      try {
        rmSync(tmpPath, { force: true });
      } catch {
        // Ignore cleanup errors.
      }
      return c.json({ error: "Failed to export SQLite bundle" }, 500);
    }
  });
}
