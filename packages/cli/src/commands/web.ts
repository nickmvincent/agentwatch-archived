import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8420;

export const webCommand = new Command("web")
  .description("Open the watcher dashboard")
  .option("-H, --host <host>", "Watcher host", DEFAULT_HOST)
  .option("-p, --port <port>", "Watcher port", String(DEFAULT_PORT))
  .option("--no-open", "Don't open browser automatically")
  .action(async (options) => {
    const watcherUrl = `http://${options.host}:${options.port}`;

    // Check if watcher is running
    try {
      const res = await fetch(`${watcherUrl}/api/status`);
      if (!res.ok) {
        const health = await fetch(`${watcherUrl}/api/health`);
        if (!health.ok) {
          console.log(
            pc.yellow("Watcher not responding. Starting watcher...")
          );
          await startWatcher(options.host, options.port);
        }
      }
    } catch {
      console.log(pc.yellow("Watcher not running. Starting watcher..."));
      await startWatcher(options.host, options.port);
    }

    console.log(pc.green(`Watcher dashboard available at ${watcherUrl}`));
    console.log(pc.gray("For analyzer UI, use: aw analyze"));

    if (options.open !== false) {
      // Open browser
      const openCmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";

      Bun.spawn([openCmd, watcherUrl], {
        stdio: ["ignore", "ignore", "ignore"]
      });
    }
  });

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
