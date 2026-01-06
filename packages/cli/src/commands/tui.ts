import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8420;

export const tuiCommand = new Command("tui")
  .description("Start the TUI dashboard")
  .option("-H, --host <host>", "Watcher host", DEFAULT_HOST)
  .option("-p, --port <port>", "Watcher port", String(DEFAULT_PORT))
  .action(async (options) => {
    const watcherUrl = `http://${options.host}:${options.port}`;

    // Check if watcher is running
    try {
      const res = await fetch(`${watcherUrl}/api/status`);
      if (!res.ok) {
        const health = await fetch(`${watcherUrl}/api/health`);
        if (!health.ok) {
          console.log(pc.yellow("Watcher not responding. Starting watcher..."));
          await startWatcher(options.host, options.port);
        }
      }
    } catch {
      console.log(pc.yellow("Watcher not running. Starting watcher..."));
      await startWatcher(options.host, options.port);
    }

    // Start TUI
    const subprocess = Bun.spawn(
      ["bun", "run", findTuiBin(), "--watcher-url", watcherUrl],
      {
        cwd: process.cwd(),
        stdio: ["inherit", "inherit", "inherit"]
      }
    );

    await subprocess.exited;
  });

function findTuiBin(): string {
  // Try to find the TUI package
  const paths = [
    import.meta.dir + "/../../tui/src/bin.tsx",
    import.meta.dir + "/../../../tui/src/bin.tsx"
  ];

  for (const p of paths) {
    try {
      const file = Bun.file(p);
      if (file.size > 0) return p;
    } catch {
      // Ignore
    }
  }

  // Fall back to package name
  return "@agentwatch/tui/src/bin.tsx";
}

async function startWatcher(host: string, port: string) {
  const repoRoot = import.meta.dir + "/../../../..";
  Bun.spawn(
    [
      "bun",
      "run",
      import.meta.dir + "/../watcher-runner.ts",
      "--host",
      host,
      "--port",
      port
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"]
    }
  );

  // Wait for watcher to start
  await new Promise((r) => setTimeout(r, 1000));
}
