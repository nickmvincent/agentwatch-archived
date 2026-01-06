import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8420;

// Claude Code settings file location
const CLAUDE_CONFIG_PATH = join(homedir(), ".claude", "settings.json");

export const hooksCommand = new Command("hooks").description(
  "Manage Claude Code hooks integration"
);

hooksCommand
  .command("install")
  .description("Install agentwatch hooks into Claude Code")
  .option(
    "--url <url>",
    "Watcher URL",
    `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
  )
  .action(async (options) => {
    const hookUrl = options.url;

    // Create hook script content
    const hookScript = createHookScript(hookUrl);

    // Ensure .claude directory exists
    const claudeDir = dirname(CLAUDE_CONFIG_PATH);
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Read or create settings
    let settings: Record<string, unknown> = {};
    if (existsSync(CLAUDE_CONFIG_PATH)) {
      try {
        settings = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, "utf-8"));
      } catch {
        console.log(
          pc.yellow("Warning: Existing settings.json is invalid JSON")
        );
        console.log(
          pc.yellow(
            "Your existing configuration will be preserved, but please check the file manually"
          )
        );
        console.log(pc.gray(`  ${CLAUDE_CONFIG_PATH}`));
        console.log();
        return;
      }
    }

    // Add hooks configuration for all 10 Claude Code hooks
    const hooks = (settings.hooks ?? {}) as Record<string, unknown>;

    // All available Claude Code hooks
    const HOOK_TYPES = [
      "PreToolUse",
      "PostToolUse",
      "SessionStart",
      "SessionEnd",
      "Notification",
      "PermissionRequest",
      "UserPromptSubmit",
      "Stop",
      "SubagentStop",
      "PreCompact"
    ];

    // Initialize all hook arrays
    for (const hookType of HOOK_TYPES) {
      hooks[hookType] = hooks[hookType] ?? [];
    }

    // Map Claude Code hook names to API endpoint names
    const hookEndpointMap: Record<string, string> = {
      PreToolUse: "pre-tool-use",
      PostToolUse: "post-tool-use",
      SessionStart: "session-start",
      SessionEnd: "session-end",
      Notification: "notification",
      PermissionRequest: "permission-request",
      UserPromptSubmit: "user-prompt-submit",
      Stop: "stop",
      SubagentStop: "subagent-stop",
      PreCompact: "pre-compact"
    };

    // Check if agentwatch hook already exists in the array
    const hasAgentwatchHook = (arr: unknown[]) => {
      return (
        arr as Array<{ hooks?: Array<{ command?: string }>; command?: string }>
      ).some((entry) => {
        // Check nested hooks array format
        if (entry.hooks) {
          return entry.hooks.some((h) => h.command?.includes("/api/hooks/"));
        }
        // Check flat format (invalid but might exist from old installs)
        return entry.command?.includes("/api/hooks/");
      });
    };

    // Add our hook to each hook type using the correct nested structure
    for (const hookType of HOOK_TYPES) {
      const endpoint = hookEndpointMap[hookType];
      const hookEntry = {
        matcher: "", // Match all (empty string = match everything)
        hooks: [
          {
            type: "command",
            command: `curl -s -m 1 -X POST ${hookUrl}/api/hooks/${endpoint} -H 'Content-Type: application/json' -d @-`
          }
        ]
      };

      if (!hasAgentwatchHook(hooks[hookType] as unknown[])) {
        (hooks[hookType] as unknown[]).push(hookEntry);
      }
    }

    settings.hooks = hooks;

    // Write settings
    writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(settings, null, 2));

    console.log(pc.green("Agentwatch hooks installed successfully"));
    console.log(pc.gray(`Configuration written to ${CLAUDE_CONFIG_PATH}`));
  });

hooksCommand
  .command("uninstall")
  .description("Remove agentwatch hooks from Claude Code")
  .action(async () => {
    if (!existsSync(CLAUDE_CONFIG_PATH)) {
      console.log(pc.yellow("No Claude Code settings found"));
      return;
    }

    try {
      const settings = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, "utf-8"));
      const hooks = settings.hooks ?? {};

      // Remove our hooks from all hook types (handles both nested and flat formats)
      const removeHook = (arr: unknown[]) => {
        return (
          arr as Array<{
            hooks?: Array<{ command?: string }>;
            command?: string;
          }>
        ).filter((entry) => {
          // Check nested hooks array format
          if (entry.hooks) {
            return !entry.hooks.some((h) => h.command?.includes("/api/hooks/"));
          }
          // Check flat format (invalid but might exist from old installs)
          return !entry.command?.includes("/api/hooks/");
        });
      };

      const HOOK_TYPES = [
        "PreToolUse",
        "PostToolUse",
        "SessionStart",
        "SessionEnd",
        "Notification",
        "PermissionRequest",
        "UserPromptSubmit",
        "Stop",
        "SubagentStop",
        "PreCompact"
      ];

      for (const hookType of HOOK_TYPES) {
        if (hooks[hookType]) {
          hooks[hookType] = removeHook(hooks[hookType]);
        }
      }

      settings.hooks = hooks;
      writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(settings, null, 2));

      console.log(pc.green("Agentwatch hooks removed successfully"));
    } catch (e) {
      console.log(
        pc.red(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
      );
    }
  });

hooksCommand
  .command("status")
  .description("Check hooks installation status")
  .action(async () => {
    if (!existsSync(CLAUDE_CONFIG_PATH)) {
      console.log(pc.yellow("Claude Code settings not found"));
      console.log(pc.gray(`Expected at: ${CLAUDE_CONFIG_PATH}`));
      return;
    }

    try {
      const settings = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, "utf-8"));
      const hooks = settings.hooks ?? {};

      // Check if agentwatch hook exists (handles both nested and flat formats)
      const checkHook = (arr: unknown[]) => {
        return (
          arr as Array<{
            hooks?: Array<{ command?: string }>;
            command?: string;
          }>
        ).some((entry) => {
          // Check nested hooks array format
          if (entry.hooks) {
            return entry.hooks.some((h) => h.command?.includes("/api/hooks/"));
          }
          // Check flat format (invalid but might exist from old installs)
          return entry.command?.includes("/api/hooks/");
        });
      };

      const HOOK_TYPES = [
        { name: "PreToolUse", label: "PreToolUse" },
        { name: "PostToolUse", label: "PostToolUse" },
        { name: "SessionStart", label: "SessionStart" },
        { name: "SessionEnd", label: "SessionEnd" },
        { name: "Notification", label: "Notification" },
        { name: "PermissionRequest", label: "PermissionRequest" },
        { name: "UserPromptSubmit", label: "UserPromptSubmit" },
        { name: "Stop", label: "Stop" },
        { name: "SubagentStop", label: "SubagentStop" },
        { name: "PreCompact", label: "PreCompact" }
      ];

      console.log(pc.cyan("Hooks Status"));
      console.log(pc.gray("-".repeat(50)));

      let installedCount = 0;
      for (const { name, label } of HOOK_TYPES) {
        const installed = checkHook(hooks[name] ?? []);
        if (installed) installedCount++;
        const padded = label.padEnd(18);
        console.log(
          `  ${padded} ${installed ? pc.green("installed") : pc.gray("not installed")}`
        );
      }

      console.log(pc.gray("-".repeat(50)));
      if (installedCount === HOOK_TYPES.length) {
        console.log(pc.green(`All ${HOOK_TYPES.length} hooks installed`));
      } else if (installedCount === 0) {
        console.log(pc.yellow("No hooks installed"));
      } else {
        console.log(
          pc.yellow(`${installedCount}/${HOOK_TYPES.length} hooks installed`)
        );
      }
    } catch (e) {
      console.log(
        pc.red(
          `Error reading settings: ${e instanceof Error ? e.message : "Unknown error"}`
        )
      );
    }
  });

function createHookScript(hookUrl: string): string {
  return `#!/bin/bash
# Agentwatch hook script
curl -s -m 1 -X POST "${hookUrl}/api/hooks/\${HOOK_TYPE:-unknown}" \\
  -H "Content-Type: application/json" \\
  -d @-
`;
}
