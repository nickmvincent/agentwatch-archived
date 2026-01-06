/**
 * Watcher daemon CLI commands.
 *
 * Usage:
 *   aw watcher start [--foreground]
 *   aw watcher stop
 *   aw watcher status
 *   aw watcher restart
 */

import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8420;

export const watcherCommand = new Command("watcher").description(
  "Manage the watcher daemon (real-time monitoring)"
);

watcherCommand
  .command("start")
  .description("Start the watcher daemon")
  .option("-H, --host <host>", "Host to bind", DEFAULT_HOST)
  .option("-p, --port <port>", "Port to bind", String(DEFAULT_PORT))
  .option("-f, --foreground", "Run in foreground")
  .action(async (options) => {
    const host = options.host;
    const port = Number.parseInt(options.port, 10);

    if (options.foreground) {
      console.log(pc.cyan(`Starting watcher on ${host}:${port}...`));

      const { WatcherServer } = await import("@agentwatch/watcher");
      const server = new WatcherServer();
      server.run(host, port);
    } else {
      console.log(
        pc.cyan(`Starting watcher in background on ${host}:${port}...`)
      );

      const repoRoot = import.meta.dir + "/../../../..";
      const subprocess = Bun.spawn(
        [
          process.execPath,
          "run",
          import.meta.dir + "/../watcher-runner.ts",
          "--host",
          host,
          "--port",
          String(port)
        ],
        {
          cwd: repoRoot,
          stdio: ["ignore", "ignore", "ignore"]
        }
      );
      subprocess.unref();

      await new Promise((r) => setTimeout(r, 1000));

      try {
        const res = await fetch(`http://${host}:${port}/api/status`);
        if (res.ok) {
          console.log(pc.green("Watcher started successfully"));
          printWatcherInfo();
          return;
        }

        const health = await fetch(`http://${host}:${port}/api/health`);
        if (health.ok) {
          console.log(pc.green("Watcher started successfully"));
          printWatcherInfo();
        } else {
          console.log(pc.yellow("Watcher started but health check failed"));
        }
      } catch (e) {
        console.log(
          pc.red(`Watcher failed to start at http://${host}:${port}`)
        );
        console.log(
          pc.gray(`Error: ${e instanceof Error ? e.message : String(e)}`)
        );
      }
    }
  });

function printWatcherInfo() {
  console.log();
  console.log(pc.gray("Watcher monitors:"));
  console.log(pc.gray("  • Running AI agents (Claude, Codex, Gemini)"));
  console.log(pc.gray("  • Git repository status"));
  console.log(pc.gray("  • Hook events (session lifecycle, tool usage)"));
  console.log();
  console.log(pc.gray("Data stored at: ~/.agentwatch/"));
}

watcherCommand
  .command("stop")
  .description("Stop the watcher daemon")
  .option("-H, --host <host>", "Watcher host", DEFAULT_HOST)
  .option("-p, --port <port>", "Watcher port", String(DEFAULT_PORT))
  .action(async (options) => {
    const host = options.host;
    const port = Number.parseInt(options.port, 10);

    try {
      const res = await fetch(`http://${host}:${port}/api/shutdown`, {
        method: "POST"
      });

      if (res.ok) {
        console.log(pc.green("Watcher stopped"));
      } else {
        console.log(pc.red("Failed to stop watcher"));
      }
    } catch {
      console.log(pc.yellow("Watcher not running or unreachable"));
    }
  });

watcherCommand
  .command("status")
  .description("Check watcher status")
  .option("-H, --host <host>", "Watcher host", DEFAULT_HOST)
  .option("-p, --port <port>", "Watcher port", String(DEFAULT_PORT))
  .action(async (options) => {
    const host = options.host;
    const port = Number.parseInt(options.port, 10);

    try {
      const res = await fetch(`http://${host}:${port}/api/status`);

      if (res.ok) {
        const data = (await res.json()) as {
          agent_count: number;
          repo_count: number;
          uptime_seconds: number;
        };
        console.log(pc.green("Watcher running"));
        console.log(`  Agents: ${pc.blue(data.agent_count)}`);
        console.log(`  Repos: ${pc.yellow(data.repo_count)}`);
        console.log(`  Uptime: ${pc.gray(formatUptime(data.uptime_seconds))}`);
        return;
      }

      const health = await fetch(`http://${host}:${port}/api/health`);
      if (health.ok) {
        console.log(pc.green("Watcher running"));
      } else {
        console.log(pc.red("Watcher not responding correctly"));
      }
    } catch {
      console.log(pc.red("Watcher not running"));
    }
  });

watcherCommand
  .command("restart")
  .description("Restart the watcher daemon")
  .option("-H, --host <host>", "Watcher host", DEFAULT_HOST)
  .option("-p, --port <port>", "Watcher port", String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      await fetch(`http://${options.host}:${options.port}/api/shutdown`, {
        method: "POST"
      });
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Ignore if not running
    }

    console.log(pc.cyan("Restarting watcher..."));

    const repoRoot = import.meta.dir + "/../../../..";
    const subprocess = Bun.spawn(
      [
        process.execPath,
        "run",
        import.meta.dir + "/../watcher-runner.ts",
        "--host",
        options.host,
        "--port",
        options.port
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "ignore", "ignore"]
      }
    );
    subprocess.unref();

    await new Promise((r) => setTimeout(r, 1000));

    try {
      const res = await fetch(
        `http://${options.host}:${options.port}/api/status`
      );
      if (res.ok) {
        console.log(pc.green("Watcher restarted"));
        printWatcherInfo();
        return;
      }

      const health = await fetch(
        `http://${options.host}:${options.port}/api/health`
      );
      if (health.ok) {
        console.log(pc.green("Watcher restarted"));
        printWatcherInfo();
      } else {
        console.log(pc.yellow("Watcher restarted but health check failed"));
      }
    } catch {
      console.log(pc.red("Watcher failed to restart"));
    }
  });

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
