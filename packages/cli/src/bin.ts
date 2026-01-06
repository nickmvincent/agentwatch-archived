#!/usr/bin/env bun
/**
 * AgentWatch CLI - Unified command-line interface
 */

import { program } from "commander";
import pc from "picocolors";
import { analyzeCommand } from "./commands/analyze.js";
import { daemonCommand } from "./commands/daemon.js";
import { hooksCommand } from "./commands/hooks.js";
import { logsCommand } from "./commands/logs.js";
import { runCommand } from "./commands/run.js";
import { sandboxCommand } from "./commands/sandbox.js";
import { securityCommand } from "./commands/security.js";
import { sessionsCommand } from "./commands/sessions.js";
import { tuiCommand } from "./commands/tui.js";
import { watcherCommand } from "./commands/watcher.js";
import { webCommand } from "./commands/web.js";

program
  .name("agentwatch")
  .description("Monitor coding agents and git repositories")
  .version("0.1.0");

// Add commands
program.addCommand(watcherCommand);
program.addCommand(analyzeCommand);
program.addCommand(daemonCommand);  // Keep for backwards compatibility
program.addCommand(tuiCommand);
program.addCommand(webCommand);
program.addCommand(logsCommand);
program.addCommand(hooksCommand);
program.addCommand(securityCommand);
program.addCommand(sandboxCommand);
program.addCommand(runCommand);
program.addCommand(sessionsCommand);

// Default to TUI if no command specified
program.action(() => {
  tuiCommand.parseAsync([], { from: "user" });
});

program.parse();
