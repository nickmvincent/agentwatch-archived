/**
 * Configuration and settings routes.
 *
 * Provides endpoints for:
 * - Watcher configuration (roots, refresh intervals)
 * - Claude Code settings management (~/.claude/settings.json)
 *
 * @module routes/config
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type { Hono } from "hono";
import { getConfigPath, saveWatcherConfig } from "../config";
import type { WatcherConfig } from "../config";

/**
 * Path to Claude Code's settings file.
 */
const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

/**
 * Register watcher configuration routes.
 *
 * @param app - The Hono app instance
 * @param config - Current watcher configuration
 */
export function registerConfigRoutes(app: Hono, config: WatcherConfig): void {
  /**
   * GET /api/config
   *
   * Get current watcher configuration.
   *
   * @returns Configuration object (roots, repo settings, server settings)
   */
  app.get("/api/config", (c) => {
    return c.json({
      roots: config.roots,
      repo: {
        refresh_fast_seconds: config.repo.refreshFastSeconds,
        refresh_slow_seconds: config.repo.refreshSlowSeconds,
        include_untracked: config.repo.includeUntracked,
        show_clean: config.repo.showClean
      },
      daemon: {
        host: config.watcher.host,
        port: config.watcher.port
      },
      watcher: {
        host: config.watcher.host,
        port: config.watcher.port,
        log_dir: config.watcher.logDir
      },
      test_gate: {
        enabled: config.testGate.enabled,
        test_command: config.testGate.testCommand,
        pass_file: config.testGate.passFile,
        pass_file_max_age_seconds: config.testGate.passFileMaxAgeSeconds
      },
      notifications: {
        enable: config.notifications.enable,
        hook_awaiting_input: config.notifications.hookAwaitingInput,
        hook_session_end: config.notifications.hookSessionEnd,
        hook_tool_failure: config.notifications.hookToolFailure,
        hook_long_running: config.notifications.hookLongRunning,
        long_running_threshold_seconds:
          config.notifications.longRunningThresholdSeconds,
        hook_session_start: config.notifications.hookSessionStart,
        hook_pre_tool_use: config.notifications.hookPreToolUse,
        hook_post_tool_use: config.notifications.hookPostToolUse,
        hook_notification: config.notifications.hookNotification,
        hook_permission_request: config.notifications.hookPermissionRequest,
        hook_user_prompt_submit: config.notifications.hookUserPromptSubmit,
        hook_stop: config.notifications.hookStop,
        hook_subagent_stop: config.notifications.hookSubagentStop,
        hook_pre_compact: config.notifications.hookPreCompact
      },
      agents: {
        refresh_seconds: config.agents.refreshSeconds,
        matchers: config.agents.matchers.map((m) => ({
          label: m.label,
          type: m.type,
          pattern: m.pattern
        }))
      }
    });
  });

  /**
   * PATCH /api/config
   *
   * Update watcher configuration.
   */
  app.patch("/api/config", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const updates: string[] = [];

    if (Array.isArray(body.roots)) {
      config.roots = body.roots.filter((r) => typeof r === "string") as string[];
      updates.push("roots");
    }

    if (typeof body.repo === "object" && body.repo) {
      const repo = body.repo as Record<string, unknown>;
      if (typeof repo.refresh_fast_seconds === "number") {
        config.repo.refreshFastSeconds = repo.refresh_fast_seconds;
        updates.push(`repo.refresh_fast_seconds = ${repo.refresh_fast_seconds}`);
      }
      if (typeof repo.refresh_slow_seconds === "number") {
        config.repo.refreshSlowSeconds = repo.refresh_slow_seconds;
        updates.push(`repo.refresh_slow_seconds = ${repo.refresh_slow_seconds}`);
      }
      if (typeof repo.include_untracked === "boolean") {
        config.repo.includeUntracked = repo.include_untracked;
        updates.push(`repo.include_untracked = ${repo.include_untracked}`);
      }
      if (typeof repo.show_clean === "boolean") {
        config.repo.showClean = repo.show_clean;
        updates.push(`repo.show_clean = ${repo.show_clean}`);
      }
    }

    const daemon = (body.daemon ?? body.watcher) as
      | Record<string, unknown>
      | undefined;
    if (daemon && typeof daemon === "object") {
      if (typeof daemon.host === "string") {
        config.watcher.host = daemon.host;
        updates.push(`watcher.host = ${daemon.host}`);
      }
      if (typeof daemon.port === "number") {
        config.watcher.port = daemon.port;
        updates.push(`watcher.port = ${daemon.port}`);
      }
      if (typeof daemon.log_dir === "string") {
        config.watcher.logDir = daemon.log_dir;
        updates.push(`watcher.log_dir = ${daemon.log_dir}`);
      }
    }

    if (typeof body.test_gate === "object" && body.test_gate) {
      const tg = body.test_gate as Record<string, unknown>;
      if (typeof tg.enabled === "boolean") {
        config.testGate.enabled = tg.enabled;
        updates.push(`test_gate.enabled = ${tg.enabled}`);
      }
      if (typeof tg.test_command === "string") {
        config.testGate.testCommand = tg.test_command;
        updates.push(`test_gate.test_command = ${tg.test_command}`);
      }
      if (typeof tg.pass_file === "string") {
        config.testGate.passFile = tg.pass_file;
        updates.push(`test_gate.pass_file = ${tg.pass_file}`);
      }
      if (typeof tg.pass_file_max_age_seconds === "number") {
        config.testGate.passFileMaxAgeSeconds =
          tg.pass_file_max_age_seconds;
        updates.push(
          `test_gate.pass_file_max_age_seconds = ${tg.pass_file_max_age_seconds}`
        );
      }
    }

    if (typeof body.notifications === "object" && body.notifications) {
      const n = body.notifications as Record<string, unknown>;
      if (typeof n.enable === "boolean") {
        config.notifications.enable = n.enable;
        updates.push(`notifications.enable = ${n.enable}`);
      }
      if (typeof n.hook_awaiting_input === "boolean") {
        config.notifications.hookAwaitingInput = n.hook_awaiting_input;
        updates.push(
          `notifications.hook_awaiting_input = ${n.hook_awaiting_input}`
        );
      }
      if (typeof n.hook_session_end === "boolean") {
        config.notifications.hookSessionEnd = n.hook_session_end;
        updates.push(`notifications.hook_session_end = ${n.hook_session_end}`);
      }
      if (typeof n.hook_tool_failure === "boolean") {
        config.notifications.hookToolFailure = n.hook_tool_failure;
        updates.push(`notifications.hook_tool_failure = ${n.hook_tool_failure}`);
      }
      if (typeof n.hook_long_running === "boolean") {
        config.notifications.hookLongRunning = n.hook_long_running;
        updates.push(`notifications.hook_long_running = ${n.hook_long_running}`);
      }
      if (typeof n.long_running_threshold_seconds === "number") {
        config.notifications.longRunningThresholdSeconds =
          n.long_running_threshold_seconds;
        updates.push(
          `notifications.long_running_threshold_seconds = ${n.long_running_threshold_seconds}`
        );
      }
      if (typeof n.hook_session_start === "boolean") {
        config.notifications.hookSessionStart = n.hook_session_start;
        updates.push(`notifications.hook_session_start = ${n.hook_session_start}`);
      }
      if (typeof n.hook_pre_tool_use === "boolean") {
        config.notifications.hookPreToolUse = n.hook_pre_tool_use;
        updates.push(`notifications.hook_pre_tool_use = ${n.hook_pre_tool_use}`);
      }
      if (typeof n.hook_post_tool_use === "boolean") {
        config.notifications.hookPostToolUse = n.hook_post_tool_use;
        updates.push(`notifications.hook_post_tool_use = ${n.hook_post_tool_use}`);
      }
      if (typeof n.hook_notification === "boolean") {
        config.notifications.hookNotification = n.hook_notification;
        updates.push(`notifications.hook_notification = ${n.hook_notification}`);
      }
      if (typeof n.hook_permission_request === "boolean") {
        config.notifications.hookPermissionRequest = n.hook_permission_request;
        updates.push(
          `notifications.hook_permission_request = ${n.hook_permission_request}`
        );
      }
      if (typeof n.hook_user_prompt_submit === "boolean") {
        config.notifications.hookUserPromptSubmit =
          n.hook_user_prompt_submit;
        updates.push(
          `notifications.hook_user_prompt_submit = ${n.hook_user_prompt_submit}`
        );
      }
      if (typeof n.hook_stop === "boolean") {
        config.notifications.hookStop = n.hook_stop;
        updates.push(`notifications.hook_stop = ${n.hook_stop}`);
      }
      if (typeof n.hook_subagent_stop === "boolean") {
        config.notifications.hookSubagentStop = n.hook_subagent_stop;
        updates.push(`notifications.hook_subagent_stop = ${n.hook_subagent_stop}`);
      }
      if (typeof n.hook_pre_compact === "boolean") {
        config.notifications.hookPreCompact = n.hook_pre_compact;
        updates.push(`notifications.hook_pre_compact = ${n.hook_pre_compact}`);
      }
    }

    if (typeof body.agents === "object" && body.agents) {
      const agents = body.agents as Record<string, unknown>;
      if (typeof agents.refresh_seconds === "number") {
        config.agents.refreshSeconds = agents.refresh_seconds;
        updates.push(`agents.refresh_seconds = ${agents.refresh_seconds}`);
      }
      if (Array.isArray(agents.matchers)) {
        config.agents.matchers = agents.matchers
          .filter((m) => typeof m === "object" && m)
          .map((m) => ({
            label: String((m as Record<string, unknown>).label || ""),
            type: String((m as Record<string, unknown>).type || "cmd_regex") as
              | "cmd_regex"
              | "exe_path",
            pattern: String((m as Record<string, unknown>).pattern || "")
          }))
          .filter((m) => m.label && m.pattern);
        updates.push("agents.matchers");
      }
    }

    if (updates.length > 0) {
      try {
        saveWatcherConfig(config);
      } catch (err) {
        console.error("Failed to persist watcher config:", err);
      }
    }

    return c.json({ success: true, updates });
  });

  /**
   * GET /api/config/raw
   *
   * Get raw watcher config file content.
   */
  app.get("/api/config/raw", (c) => {
    const configPath = getConfigPath();
    try {
      if (!existsSync(configPath)) {
        return c.json({ exists: false, path: configPath, content: "" });
      }
      const content = readFileSync(configPath, "utf-8");
      return c.json({ exists: true, path: configPath, content });
    } catch (error) {
      return c.json(
        { error: "Failed to read config file", details: String(error) },
        500
      );
    }
  });

  /**
   * PUT /api/config/raw
   *
   * Update raw watcher config file content.
   */
  app.put("/api/config/raw", async (c) => {
    const configPath = getConfigPath();
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        content?: string;
      };
      if (typeof body.content !== "string") {
        return c.json({ error: "Content must be a string" }, 400);
      }

      const configDir = dirname(configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(configPath, body.content, "utf-8");

      return c.json({
        success: true,
        path: configPath,
        message: "Config saved. Restart watcher to apply changes."
      });
    } catch (error) {
      return c.json(
        { error: "Failed to write config file", details: String(error) },
        500
      );
    }
  });
}

/**
 * Register Claude Code settings routes.
 *
 * These endpoints manage Claude Code's settings.json file, allowing
 * reading and modifying hooks, permissions, and other settings.
 *
 * @param app - The Hono app instance
 */
export function registerClaudeSettingsRoutes(app: Hono): void {
  /**
   * GET /api/claude/settings
   *
   * Read Claude Code settings.
   *
   * @returns {
   *   exists: boolean,
   *   path: string,
   *   settings: object | null,
   *   raw: string | null,
   *   error: string | null
   * }
   */
  app.get("/api/claude/settings", (c) => {
    if (!existsSync(CLAUDE_SETTINGS_PATH)) {
      return c.json({
        exists: false,
        path: CLAUDE_SETTINGS_PATH,
        settings: null,
        raw: null,
        error: null
      });
    }

    try {
      const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
      const settings = JSON.parse(content) as Record<string, unknown>;
      return c.json({
        exists: true,
        path: CLAUDE_SETTINGS_PATH,
        settings,
        raw: content,
        error: null
      });
    } catch (e) {
      try {
        const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
        return c.json({
          exists: true,
          path: CLAUDE_SETTINGS_PATH,
          settings: null,
          raw: content,
          error:
            e instanceof Error ? e.message : "Failed to parse settings.json"
        });
      } catch {
        return c.json(
          {
            exists: true,
            path: CLAUDE_SETTINGS_PATH,
            settings: null,
            raw: null,
            error: "Failed to read settings.json"
          },
          400
        );
      }
    }
  });

  /**
   * PUT /api/claude/settings
   *
   * Replace Claude Code settings entirely.
   *
   * @body raw - Raw JSON string to write
   * @body settings - Settings object to write (alternative to raw)
   * @returns { success: boolean, path: string, settings: object }
   */
  app.put("/api/claude/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      raw?: string;
      settings?: Record<string, unknown>;
    };

    try {
      let settingsToWrite: Record<string, unknown>;

      if (body.raw !== undefined) {
        try {
          settingsToWrite = JSON.parse(body.raw);
        } catch (e) {
          return c.json(
            {
              success: false,
              error:
                "Invalid JSON: " +
                (e instanceof Error ? e.message : "Parse error")
            },
            400
          );
        }
      } else if (body.settings !== undefined) {
        settingsToWrite = body.settings;
      } else {
        return c.json(
          {
            success: false,
            error: "Either 'raw' or 'settings' must be provided"
          },
          400
        );
      }

      const claudeDir = dirname(CLAUDE_SETTINGS_PATH);
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(settingsToWrite, null, 2) + "\n"
      );

      return c.json({
        success: true,
        path: CLAUDE_SETTINGS_PATH,
        settings: settingsToWrite
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Failed to write settings"
        },
        500
      );
    }
  });

  /**
   * PATCH /api/claude/settings
   *
   * Merge updates into existing Claude Code settings.
   *
   * Deep merges for known keys (hooks, permissions, env).
   * Shallow merges for other keys.
   *
   * @body Any settings keys to merge
   * @returns { success: boolean, path: string, settings: object }
   *
   * @example
   * ```bash
   * # Add a hook while preserving existing ones
   * curl -X PATCH http://localhost:8420/api/claude/settings \
   *   -H "Content-Type: application/json" \
   *   -d '{"hooks": {"PreToolUse": [{"type": "url", "url": "..."}]}}'
   * ```
   */
  app.patch("/api/claude/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    try {
      let settings: Record<string, unknown> = {};
      if (existsSync(CLAUDE_SETTINGS_PATH)) {
        try {
          settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
        } catch {
          return c.json(
            {
              success: false,
              error:
                "Existing settings.json is invalid JSON. Use PUT to replace entirely."
            },
            400
          );
        }
      }

      // Deep merge for specific known keys
      if (body.hooks !== undefined) {
        const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
        const newHooks = body.hooks as Record<string, unknown>;
        settings.hooks = { ...existingHooks, ...newHooks };
      }

      if (body.permissions !== undefined) {
        const existingPerms = (settings.permissions ?? {}) as Record<
          string,
          unknown
        >;
        const newPerms = body.permissions as Record<string, unknown>;
        settings.permissions = { ...existingPerms, ...newPerms };
      }

      if (body.env !== undefined) {
        const existingEnv = (settings.env ?? {}) as Record<string, unknown>;
        const newEnv = body.env as Record<string, unknown>;
        settings.env = { ...existingEnv, ...newEnv };
      }

      // Shallow merge for other keys
      for (const key of Object.keys(body)) {
        if (!["hooks", "permissions", "env"].includes(key)) {
          settings[key] = body[key];
        }
      }

      const claudeDir = dirname(CLAUDE_SETTINGS_PATH);
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(settings, null, 2) + "\n"
      );

      return c.json({
        success: true,
        path: CLAUDE_SETTINGS_PATH,
        settings
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Failed to update settings"
        },
        500
      );
    }
  });
}
