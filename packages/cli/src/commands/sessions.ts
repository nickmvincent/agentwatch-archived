/**
 * aw sessions - List and view managed agent sessions
 */

import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8420;

interface ManagedSessionResponse {
  id: string;
  prompt: string;
  agent: string;
  pid: number | null;
  cwd: string;
  started_at: number;
  ended_at: number | null;
  exit_code: number | null;
  status: "running" | "completed" | "failed";
  duration_ms: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatStatus(status: string): string {
  switch (status) {
    case "running":
      return pc.green("running");
    case "completed":
      return pc.blue("done");
    case "failed":
      return pc.red("failed");
    default:
      return pc.gray(status);
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export const sessionsCommand = new Command("sessions")
  .description("List and view managed agent sessions")
  .argument("[id]", "Session ID to view details")
  .option("-a, --active", "Show only active (running) sessions")
  .option("-n, --limit <count>", "Number of sessions to show", "20")
  .option("--agent <agent>", "Filter by agent type")
  .option("-H, --host <host>", "Watcher host", DEFAULT_HOST)
  .option("--port <port>", "Watcher port", String(DEFAULT_PORT))
  .action(async (id: string | undefined, options) => {
    const { active, limit, agent, host, port } = options;
    const watcherUrl = `http://${host}:${port}`;

    try {
      if (id) {
        // Show specific session
        const res = await fetch(`${watcherUrl}/api/managed-sessions/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            console.log(pc.red(`Session not found: ${id}`));
          } else {
            console.log(pc.red(`Error fetching session: ${res.statusText}`));
          }
          process.exit(1);
        }

        const session = (await res.json()) as ManagedSessionResponse;

        console.log(pc.cyan("Session Details"));
        console.log(pc.gray("─".repeat(50)));
        console.log(`${pc.bold("ID:")}       ${session.id}`);
        console.log(`${pc.bold("Agent:")}    ${session.agent}`);
        console.log(`${pc.bold("Status:")}   ${formatStatus(session.status)}`);
        console.log(
          `${pc.bold("PID:")}      ${session.pid ?? pc.gray("(not started)")}`
        );
        console.log(
          `${pc.bold("Duration:")} ${formatDuration(session.duration_ms)}`
        );
        console.log(
          `${pc.bold("Started:")}  ${new Date(session.started_at).toLocaleString()}`
        );
        if (session.ended_at) {
          console.log(
            `${pc.bold("Ended:")}    ${new Date(session.ended_at).toLocaleString()}`
          );
        }
        if (session.exit_code !== null) {
          console.log(
            `${pc.bold("Exit:")}     ${session.exit_code === 0 ? pc.green("0") : pc.red(String(session.exit_code))}`
          );
        }
        console.log(`${pc.bold("CWD:")}      ${session.cwd}`);
        console.log();
        console.log(pc.bold("Prompt:"));
        console.log(pc.white(session.prompt));
      } else {
        // List sessions
        const params = new URLSearchParams();
        if (active) params.set("active", "true");
        params.set("limit", limit);
        if (agent) params.set("agent", agent);

        const res = await fetch(`${watcherUrl}/api/managed-sessions?${params}`);
        if (!res.ok) {
          console.log(pc.red(`Error fetching sessions: ${res.statusText}`));
          process.exit(1);
        }

        const sessions = (await res.json()) as ManagedSessionResponse[];

        if (sessions.length === 0) {
          console.log(
            pc.gray(active ? "No active sessions" : "No sessions found")
          );
          console.log();
          console.log(pc.gray("Start a session with:"));
          console.log(pc.cyan('  aw run "your prompt here"'));
          return;
        }

        // Table header
        const idWidth = 10;
        const agentWidth = 8;
        const statusWidth = 8;
        const durationWidth = 10;
        const promptWidth = 40;

        console.log(
          pc.bold(
            `${"ID".padEnd(idWidth)} ${"AGENT".padEnd(agentWidth)} ${"STATUS".padEnd(statusWidth)} ${"DURATION".padEnd(durationWidth)} PROMPT`
          )
        );
        console.log(
          pc.gray(
            "─".repeat(
              idWidth +
                agentWidth +
                statusWidth +
                durationWidth +
                promptWidth +
                4
            )
          )
        );

        for (const session of sessions) {
          const id = session.id.padEnd(idWidth);
          const agent = session.agent.padEnd(agentWidth);
          const status = formatStatus(session.status).padEnd(statusWidth + 10); // Extra for color codes
          const duration = formatDuration(session.duration_ms).padEnd(
            durationWidth
          );
          const prompt = truncate(
            session.prompt.replace(/\n/g, " "),
            promptWidth
          );

          console.log(
            `${id} ${agent} ${status} ${duration} ${pc.gray(prompt)}`
          );
        }

        console.log();
        console.log(
          pc.gray(
            `Showing ${sessions.length} session(s). Use 'aw sessions <id>' for details.`
          )
        );
      }
    } catch (e) {
      console.log(pc.red("Could not connect to watcher"));
      console.log(
        pc.gray(`Error: ${e instanceof Error ? e.message : String(e)}`)
      );
      console.log();
      console.log(pc.gray("Start the watcher with:"));
      console.log(pc.cyan("  aw watcher start"));
      process.exit(1);
    }
  });
