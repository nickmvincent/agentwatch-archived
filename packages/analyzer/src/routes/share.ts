/**
 * Share and export routes.
 *
 * Provides endpoints for:
 * - HuggingFace auth + upload helpers
 * - Share/export entrypoints
 *
 * @module routes/share
 */

import type { Hono } from "hono";
import {
  createSanitizer,
  createBundle,
  scoreText
} from "@agentwatch/pre-share";
import type {
  ContribSession,
  ContributorMeta,
  RedactionReport
} from "@agentwatch/pre-share";
import { hookSessionToDict, toolUsageToDict } from "@agentwatch/shared-api";
import { correlateSessionsWithTranscripts } from "../correlation";
import { readHookSessions, readToolUsages } from "../hooks-data";
import { discoverLocalTranscripts, readTranscript } from "../local-logs";
import {
  checkDatasetAccess,
  checkHFCLIAuth,
  exchangeHFOAuthCode,
  getHFCachedToken,
  getHFOAuthURL,
  uploadToHuggingFace,
  validateHuggingFaceToken,
  type HFOAuthConfig
} from "../huggingface";
import {
  loadContributorSettings,
  saveContributorSettings
} from "../contributor-settings";

/**
 * Register share routes.
 *
 * @param app - The Hono app instance
 */
export function registerShareRoutes(app: Hono): void {
  app.get("/api/share/status", async (c) => {
    const settings = loadContributorSettings();
    return c.json({
      configured: true,
      authenticated: !!settings.hfToken,
      dataset_url: settings.hfDataset
        ? `https://huggingface.co/datasets/${settings.hfDataset}`
        : null
    });
  });

  // ==========================================================================
  // HuggingFace Integration Endpoints
  // ==========================================================================
  app.get("/api/share/huggingface/cli-auth", async (c) => {
    const status = await checkHFCLIAuth();
    return c.json(status);
  });

  app.post("/api/share/huggingface/use-cli-token", async (c) => {
    const token = await getHFCachedToken();
    if (token) {
      return c.json({ success: true, token });
    }
    return c.json({
      success: false,
      error:
        "No cached token found. Run 'huggingface-cli login' to authenticate."
    });
  });

  app.get("/api/share/huggingface/oauth/config", (c) => {
    const clientId = process.env.HF_OAUTH_CLIENT_ID;
    const origin = new URL(c.req.url).origin;

    return c.json({
      configured: !!clientId,
      clientId: clientId || null,
      redirectUri: `${origin}/api/share/huggingface/oauth/callback`,
      scopes: ["read-repos", "write-repos", "write-discussions"],
      setupUrl: "https://huggingface.co/settings/applications"
    });
  });

  app.post("/api/share/huggingface/oauth/start", async (c) => {
    const clientId = process.env.HF_OAUTH_CLIENT_ID;
    if (!clientId) {
      return c.json(
        {
          success: false,
          error:
            "OAuth not configured. Set HF_OAUTH_CLIENT_ID environment variable."
        },
        400
      );
    }

    const origin = new URL(c.req.url).origin;
    const oauthConfig: HFOAuthConfig = {
      clientId,
      clientSecret: process.env.HF_OAUTH_CLIENT_SECRET,
      redirectUri: `${origin}/api/share/huggingface/oauth/callback`,
      scopes: ["read-repos", "write-repos", "write-discussions"]
    };

    const result = await getHFOAuthURL(oauthConfig);
    return c.json({
      success: true,
      url: result.url,
      state: result.state
    });
  });

  app.get("/api/share/huggingface/oauth/callback", async (c) => {
    const code = c.req.query("code");
    const oauthState = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");

    if (error) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>HuggingFace Login Failed</title></head>
          <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1 style="color: #dc2626;">Login Failed</h1>
            <p>${errorDescription || error}</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body>
        </html>
      `);
    }

    if (!code || !oauthState) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>HuggingFace Login Failed</title></head>
          <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1 style="color: #dc2626;">Login Failed</h1>
            <p>Missing authorization code or state</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body>
        </html>
      `);
    }

    const clientId = process.env.HF_OAUTH_CLIENT_ID;
    if (!clientId) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>HuggingFace Login Failed</title></head>
          <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1 style="color: #dc2626;">Login Failed</h1>
            <p>OAuth not configured</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body>
        </html>
      `);
    }

    const origin = new URL(c.req.url).origin;
    const oauthConfig: HFOAuthConfig = {
      clientId,
      clientSecret: process.env.HF_OAUTH_CLIENT_SECRET,
      redirectUri: `${origin}/api/share/huggingface/oauth/callback`
    };

    const result = await exchangeHFOAuthCode(code, oauthState, oauthConfig);

    if (!result.success) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>HuggingFace Login Failed</title></head>
          <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1 style="color: #dc2626;">Login Failed</h1>
            <p>${result.error}</p>
            <p><a href="javascript:window.close()">Close this window</a></p>
          </body>
        </html>
      `);
    }

    saveContributorSettings({ hfToken: result.accessToken });

    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>HuggingFace Login Successful</title></head>
        <body style="font-family: system-ui; padding: 2rem; text-align: center;">
          <h1 style="color: #16a34a;">Login Successful!</h1>
          <p>Logged in as <strong>${result.username || "unknown"}</strong></p>
          <p>You can close this window.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'hf-oauth-success',
                username: ${JSON.stringify(result.username)},
              }, '*');
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  });

  app.post("/api/share/huggingface/validate", async (c) => {
    const body = (await c.req.json()) as { token: string };
    const result = await validateHuggingFaceToken(body.token);
    return c.json(result);
  });

  app.post("/api/share/huggingface/check-repo", async (c) => {
    const body = (await c.req.json()) as { token: string; repo_id: string };
    const result = await checkDatasetAccess(body.token, body.repo_id);
    return c.json(result);
  });

  app.post("/api/share/huggingface", async (c) => {
    const body = (await c.req.json()) as {
      correlation_ids?: string[];
      session_ids?: string[];
      local_ids?: string[];
      token?: string;
      repo_id: string;
      create_pr?: boolean;
      contributor_id?: string;
      license?: string;
      ai_preference?: string;
      format?: "zip" | "jsonl" | "auto";
    };

    let token = body.token;
    if (!token) {
      const settings = loadContributorSettings();
      token = settings.hfToken;
    }

    const hasCorrelations =
      body.correlation_ids && body.correlation_ids.length > 0;
    const hasHookSessions = body.session_ids && body.session_ids.length > 0;
    const hasLocalSessions = body.local_ids && body.local_ids.length > 0;

    if (
      !token ||
      !body.repo_id ||
      (!hasCorrelations && !hasHookSessions && !hasLocalSessions)
    ) {
      return c.json(
        {
          error:
            "Missing required fields: token, repo_id, and at least one session"
        },
        400
      );
    }

    const sanitizer = createSanitizer({
      redactSecrets: true,
      redactPii: true,
      redactPaths: true
    });

    const contribSessions: Array<
      ContribSession & { sanitized: unknown; previewRedacted?: string }
    > = [];

    const addContribSession = async (
      sessionId: string,
      sessionContent: Record<string, unknown>,
      source: string,
      mtimeUtc: string,
      sourcePathHint: string | undefined,
      entryTypes: Record<string, number>
    ) => {
      const contentStr = JSON.stringify(sessionContent);
      const sanitized = sanitizer.redactObject(sessionContent);
      const previewText = contentStr.slice(0, 500);
      const quality = scoreText(previewText);

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(contentStr)
      );
      const rawSha256 = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      contribSessions.push({
        sessionId,
        source,
        rawSha256,
        mtimeUtc,
        data: sessionContent,
        preview: previewText,
        score: quality,
        approxChars: contentStr.length,
        sourcePathHint: sourcePathHint ?? "unknown",
        filePath: `sessions/${sessionId}.json`,
        entryTypes,
        primaryType: "session",
        sanitized,
        previewRedacted: String(sanitizer.redactText(previewText))
      });
    };

    if (body.correlation_ids?.length) {
      const hookSessions = readHookSessions();
      const transcripts = await discoverLocalTranscripts();
      const toolUsagesMap = readToolUsages();

      const correlated = correlateSessionsWithTranscripts(
        hookSessions,
        transcripts,
        toolUsagesMap
      );
      const correlationMap = new Map(
        correlated.map((conv) => [conv.correlationId, conv])
      );

      for (const correlationId of body.correlation_ids) {
        const conv = correlationMap.get(correlationId);
        if (!conv) continue;

        const sessionContent: Record<string, unknown> = {
          correlation_id: correlationId
        };
        let source = "unknown";
        let sessionId = correlationId;
        let mtimeUtc = new Date().toISOString();
        let sourcePathHint: string | undefined;
        const entryTypes: Record<string, number> = { session: 1 };

        if (conv.hookSession) {
          Object.assign(sessionContent, hookSessionToDict(conv.hookSession));
          sessionContent.tool_usages = (conv.toolUsages ?? []).map((u) =>
            toolUsageToDict(u)
          );
          source = conv.hookSession.source || "claude";
          sessionId = conv.hookSession.sessionId;
          mtimeUtc = new Date(conv.hookSession.startTime).toISOString();
          sourcePathHint =
            conv.hookSession.transcriptPath || conv.hookSession.cwd;
          entryTypes.tool_usage = conv.toolUsages?.length ?? 0;
        }

        if (conv.transcript) {
          const parsed = await readTranscript(conv.transcript.id);
          if (parsed) {
            sessionContent.messages = parsed.messages;
            sessionContent.agent = parsed.agent;
            sessionContent.path = parsed.path;
            sessionContent.cost_estimate = {
              total_input_tokens: parsed.totalInputTokens,
              total_output_tokens: parsed.totalOutputTokens,
              estimated_cost_usd: parsed.estimatedCostUsd
            };
            entryTypes.message = parsed.messages?.length ?? 0;
            if (!conv.hookSession) {
              source = parsed.agent;
              sessionId = conv.transcript.id;
              mtimeUtc = new Date(
                conv.transcript.modifiedAt ?? Date.now()
              ).toISOString();
              sourcePathHint = parsed.path;
            }
          }
        }

        await addContribSession(
          sessionId,
          sessionContent,
          source,
          mtimeUtc,
          sourcePathHint,
          entryTypes
        );
      }
    } else {
      const hookSessions = readHookSessions();
      const toolUsagesMap = readToolUsages();
      const hookMap = new Map(
        hookSessions.map((session) => [session.sessionId, session])
      );

      for (const sessionId of body.session_ids ?? []) {
        const session = hookMap.get(sessionId);
        if (!session) continue;

        const toolUsages = toolUsagesMap.get(sessionId) || [];
        const sessionContent = {
          ...hookSessionToDict(session),
          tool_usages: toolUsages.map((u) => toolUsageToDict(u))
        };

        await addContribSession(
          sessionId,
          sessionContent,
          session.source || "claude",
          new Date(session.startTime).toISOString(),
          session.transcriptPath || session.cwd,
          { session: 1, tool_usage: toolUsages.length }
        );
      }

      const localMeta = body.local_ids?.length
        ? await discoverLocalTranscripts()
        : [];

      for (const localId of body.local_ids ?? []) {
        const transcript = await readTranscript(localId);
        if (!transcript) continue;
        const meta = localMeta.find((m) => m.id === localId);

        const sessionContent = {
          source: "local",
          agent: transcript.agent,
          session_id: localId,
          path: transcript.path,
          messages: transcript.messages,
          cost_estimate: {
            total_input_tokens: transcript.totalInputTokens,
            total_output_tokens: transcript.totalOutputTokens,
            estimated_cost_usd: transcript.estimatedCostUsd
          }
        };

        await addContribSession(
          localId,
          sessionContent,
          transcript.agent,
          meta?.modifiedAt
            ? new Date(meta.modifiedAt).toISOString()
            : new Date().toISOString(),
          transcript.path,
          { session: 1, message: transcript.messages?.length ?? 0 }
        );
      }
    }

    if (contribSessions.length === 0) {
      return c.json({ error: "No valid sessions found" }, 400);
    }

    const contributor: ContributorMeta = {
      contributorId: body.contributor_id || "anonymous",
      license: body.license || "CC-BY-4.0",
      aiPreference: body.ai_preference || "train-genai=deny",
      rightsStatement: "I have the right to share these transcripts",
      rightsConfirmed: true,
      reviewedConfirmed: true
    };

    const report = sanitizer.getReport();
    const redactionReport: RedactionReport = {
      ...report,
      residueWarnings: [],
      blocked: false
    };

    try {
      let bundleFormat: "zip" | "jsonl" = "zip";
      if (body.format === "jsonl") {
        bundleFormat = "jsonl";
      } else if (body.format === "auto" || !body.format) {
        bundleFormat = contribSessions.length <= 3 ? "jsonl" : "zip";
      }

      const { DIMENSION_WEIGHTS, SIGNAL_WEIGHTS } = await import(
        "../enrichments/quality-score"
      );

      const bundleResult = await createBundle({
        sessions: contribSessions,
        contributor,
        appVersion: "agentwatch-0.2.0",
        redaction: redactionReport,
        format: bundleFormat,
        qualityConfig: {
          dimensionWeights: DIMENSION_WEIGHTS,
          signalWeights: SIGNAL_WEIGHTS
        }
      });

      const uploadContent =
        bundleResult.bundleFormat === "jsonl"
          ? new TextDecoder().decode(bundleResult.bundleBytes)
          : bundleResult.bundleBytes;

      const uploadResult = await uploadToHuggingFace(
        uploadContent,
        bundleResult.bundleId,
        {
          token,
          repoId: body.repo_id,
          createPr: body.create_pr ?? true,
          commitMessage: `Add contribution bundle ${bundleResult.bundleId.slice(0, 16)}`,
          prTitle: `Contribution: ${contribSessions.length} session(s)`,
          prDescription: `Bundle ID: ${bundleResult.bundleId}\nSessions: ${contribSessions.length}\nRedactions: ${report.totalRedactions}`
        }
      );

      if (!uploadResult.success) {
        return c.json({ error: uploadResult.error }, 500);
      }

      return c.json({
        success: true,
        bundle_id: bundleResult.bundleId,
        session_count: contribSessions.length,
        redaction_count: report.totalRedactions,
        url: uploadResult.url,
        pr_number: uploadResult.prNumber,
        commit_sha: uploadResult.commitSha,
        is_pull_request: uploadResult.isPullRequest,
        was_fallback: uploadResult.wasFallback
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  });

  // ==========================================================================
  // Legacy placeholder (not used by the analyzer UI)
  // ==========================================================================
  app.post("/api/share/export", async (c) => {
    return c.json({ error: "Not implemented" }, 501);
  });
}
