/**
 * aw run - Launch an agent with a tracked prompt
 */

import { DAEMON } from "@agentwatch/core";
import { Command } from "commander";
import pc from "picocolors";
import { $ } from "bun";

const DEFAULT_HOST = DAEMON.HOST;
const DEFAULT_PORT = DAEMON.PORT;

// Agent CLI commands
const AGENT_COMMANDS: Record<
  string,
  { interactive: string[]; print: string[] }
> = {
  claude: {
    interactive: ["claude"],
    print: ["claude", "--print"]
  },
  codex: {
    interactive: ["codex"],
    print: ["codex", "--quiet"]
  },
  gemini: {
    interactive: ["gemini"],
    print: ["gemini"]
  }
};

/**
 * Check if tmux is available
 */
async function hasTmux(): Promise<boolean> {
  try {
    const result = await $`which tmux`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Run comparison mode with tmux (interactive panes)
 */
async function runTmuxCompare(
  prompt: string,
  agents: string[],
  host: string,
  port: string
): Promise<void> {
  const inTmux = !!process.env.TMUX;
  const escapedPrompt = prompt.replace(/'/g, "'\\''"); // Escape single quotes
  const windowName = "aw-compare";
  const shell = process.env.SHELL || "/bin/bash";

  // Build the pane commands - use login shell to ensure PATH is set correctly
  // Escape double quotes in prompt for the inner command
  const escapedForShell = escapedPrompt.replace(/"/g, '\\"');
  const paneCommands = agents.map(
    (agent) =>
      `${shell} -lc "aw run \\"${escapedForShell}\\" -a ${agent} -H ${host} --port ${port}"`
  );

  if (inTmux) {
    // Already in tmux - create new window with panes
    console.log(pc.cyan(`Creating tmux window with ${agents.length} panes...`));

    // First pane via new-window
    let cmd = `tmux new-window -n '${windowName}' '${paneCommands[0]}'`;

    // Additional panes via split-window
    for (let i = 1; i < paneCommands.length; i++) {
      cmd += ` \\; split-window -h '${paneCommands[i]}'`;
    }

    // Even layout
    cmd += ` \\; select-layout even-horizontal`;

    await $`sh -c ${cmd}`;
  } else {
    // Not in tmux - create new session
    console.log(
      pc.cyan(`Creating tmux session with ${agents.length} panes...`)
    );

    // First pane via new-session
    let cmd = `tmux new-session -d -s '${windowName}' '${paneCommands[0]}'`;

    // Additional panes via split-window
    for (let i = 1; i < paneCommands.length; i++) {
      cmd += ` \\; split-window -h '${paneCommands[i]}'`;
    }

    // Even layout and attach
    cmd += ` \\; select-layout even-horizontal \\; attach`;

    await $`sh -c ${cmd}`;
  }
}

/**
 * Run comparison mode with print (collect and display outputs)
 */
async function runPrintCompare(
  prompt: string,
  agents: string[],
  host: string,
  port: string
): Promise<number> {
  const daemonUrl = `http://${host}:${port}`;
  const cwd = process.cwd();

  console.log(pc.cyan(`Running ${agents.length} agents in parallel...\n`));

  // Launch all agents in parallel
  const results = await Promise.all(
    agents.map(async (agent) => {
      const agentConfig = AGENT_COMMANDS[agent]!;
      const cmdArgs = [...agentConfig.print, prompt];

      // Create session
      let sessionId: string | null = null;
      try {
        const res = await fetch(`${daemonUrl}/api/managed-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, agent, cwd })
        });
        if (res.ok) {
          const session = (await res.json()) as { id: string };
          sessionId = session.id;
        }
      } catch {
        // Ignore
      }

      // Spawn agent
      const proc = Bun.spawn(cmdArgs, {
        cwd,
        stdio: ["inherit", "pipe", "pipe"],
        env: process.env
      });

      // Update session with PID
      if (sessionId) {
        try {
          await fetch(`${daemonUrl}/api/managed-sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pid: proc.pid })
          });
        } catch {
          // Ignore
        }
      }

      const exitCode = await proc.exited;
      const output = proc.stdout ? await new Response(proc.stdout).text() : "";

      // End session
      if (sessionId) {
        try {
          await fetch(`${daemonUrl}/api/managed-sessions/${sessionId}/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exit_code: exitCode })
          });
        } catch {
          // Ignore
        }
      }

      return { agent, output, exitCode };
    })
  );

  // Display results
  const divider = "─".repeat(60);
  for (const { agent, output, exitCode } of results) {
    const status =
      exitCode === 0 ? pc.green("✓") : pc.red(`✗ (exit ${exitCode})`);
    console.log(pc.bold(`\n${divider}`));
    console.log(pc.bold(pc.cyan(`  ${agent.toUpperCase()}`)) + ` ${status}`);
    console.log(pc.bold(`${divider}\n`));
    console.log(output.trim() || pc.gray("(no output)"));
  }

  // Return non-zero if any failed
  return results.some((r) => r.exitCode !== 0) ? 1 : 0;
}

export const runCommand = new Command("run")
  .description("Launch an agent session with a tracked prompt")
  .argument("<prompt>", "The prompt to send to the agent")
  .option(
    "-a, --agent <agent>",
    "Agent to use (claude, codex, gemini)",
    "claude"
  )
  .option(
    "-c, --compare <agents>",
    "Compare multiple agents (comma-separated, e.g. claude,codex,gemini)"
  )
  .option("-p, --print", "Non-interactive mode (agent outputs and exits)")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("--port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (prompt: string, options) => {
    const { agent, compare, print, host, port } = options;
    const daemonUrl = `http://${host}:${port}`;

    // Handle compare mode
    if (compare) {
      const agents = compare.split(",").map((a: string) => a.trim());

      // Validate all agents
      const invalidAgents = agents.filter((a: string) => !AGENT_COMMANDS[a]);
      if (invalidAgents.length > 0) {
        console.log(pc.red(`Unknown agent(s): ${invalidAgents.join(", ")}`));
        console.log(
          pc.gray(`Supported agents: ${Object.keys(AGENT_COMMANDS).join(", ")}`)
        );
        process.exit(1);
      }

      if (agents.length < 2) {
        console.log(pc.red("Compare mode requires at least 2 agents"));
        process.exit(1);
      }

      console.log(pc.bold(`Comparing: ${agents.join(", ")}`));
      console.log(
        pc.gray(
          `Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}`
        )
      );
      console.log();

      if (print) {
        // Print mode - run all and collect outputs
        const exitCode = await runPrintCompare(prompt, agents, host, port);
        process.exit(exitCode);
      } else {
        // Interactive mode - use tmux
        const tmuxAvailable = await hasTmux();
        if (!tmuxAvailable) {
          console.log(pc.red("tmux is required for interactive compare mode"));
          console.log(pc.gray("Install with: brew install tmux"));
          console.log(
            pc.gray("Or use --print flag for non-interactive comparison")
          );
          process.exit(1);
        }

        await runTmuxCompare(prompt, agents, host, port);
        process.exit(0);
      }
    }

    // Single agent mode - validate agent
    if (!AGENT_COMMANDS[agent]) {
      console.log(pc.red(`Unknown agent: ${agent}`));
      console.log(
        pc.gray(`Supported agents: ${Object.keys(AGENT_COMMANDS).join(", ")}`)
      );
      process.exit(1);
    }

    const cwd = process.cwd();

    // Create session via daemon API
    let sessionId: string | null = null;
    try {
      const res = await fetch(`${daemonUrl}/api/managed-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, agent, cwd })
      });

      if (res.ok) {
        const session = (await res.json()) as { id: string };
        sessionId = session.id;
        console.log(pc.gray(`Session ${sessionId} created`));
      } else {
        console.log(
          pc.yellow(
            "Warning: Could not create session (daemon may not be running)"
          )
        );
      }
    } catch {
      console.log(
        pc.yellow("Warning: Could not connect to daemon. Session not tracked.")
      );
    }

    // Build command
    const agentConfig = AGENT_COMMANDS[agent];
    const cmdArgs = print
      ? [...agentConfig.print, prompt]
      : [...agentConfig.interactive, prompt];

    console.log(
      pc.cyan(`Starting ${agent}${print ? " (non-interactive)" : ""}...`)
    );
    console.log(
      pc.gray(
        `Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}`
      )
    );

    // Spawn the agent
    const proc = Bun.spawn(cmdArgs, {
      cwd,
      stdio: print
        ? ["inherit", "pipe", "pipe"]
        : ["inherit", "inherit", "inherit"],
      env: process.env
    });

    // Update session with PID
    if (sessionId) {
      try {
        await fetch(`${daemonUrl}/api/managed-sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pid: proc.pid })
        });
      } catch {
        // Ignore errors
      }
    }

    // Wait for process to complete
    const exitCode = await proc.exited;

    // If print mode, show output
    if (print && proc.stdout) {
      const output = await new Response(proc.stdout).text();
      if (output.trim()) {
        console.log();
        console.log(output);
      }
    }

    // End session
    if (sessionId) {
      try {
        await fetch(`${daemonUrl}/api/managed-sessions/${sessionId}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exit_code: exitCode })
        });
      } catch {
        // Ignore errors
      }
    }

    // Report status
    if (exitCode === 0) {
      console.log(pc.green(`\n${agent} completed successfully`));
    } else {
      console.log(pc.red(`\n${agent} exited with code ${exitCode}`));
    }

    process.exit(exitCode);
  });
