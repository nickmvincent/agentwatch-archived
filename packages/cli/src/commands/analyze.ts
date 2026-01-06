/**
 * Analyzer CLI command.
 *
 * Opens an on-demand analysis dashboard in the browser.
 * The server shuts down automatically when the browser is closed.
 *
 * Usage:
 *   aw analyze [--port <port>] [--headless]
 */

import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_PORT = 8421;
const WATCHER_URL = "http://localhost:8420";

export const analyzeCommand = new Command("analyze")
  .description("Open analyzer dashboard (browser-only)")
  .option("-p, --port <port>", "Port for analyzer", String(DEFAULT_PORT))
  .option("--headless", "Run without opening browser (for scripts)")
  .option("--watcher <url>", "Watcher URL", WATCHER_URL)
  .action(async (options) => {
    const port = Number.parseInt(options.port, 10);
    const headless = options.headless ?? false;
    const watcherUrl = options.watcher;

    // Check if watcher is running
    try {
      const watcherStatus = await fetch(`${watcherUrl}/api/status`);
      if (!watcherStatus.ok) {
        console.log(pc.yellow("Watcher not running. Some features may be limited."));
        console.log(pc.gray(`  Start with: aw watcher start`));
        console.log();
      }
    } catch {
      console.log(pc.yellow("Watcher not running. Some features may be limited."));
      console.log(pc.gray(`  Start with: aw watcher start`));
      console.log();
    }

    console.log(pc.cyan(`Starting analyzer on port ${port}...`));

    const { AnalyzerServer } = await import("@agentwatch/analyzer");
    const server = new AnalyzerServer({
      port,
      host: "localhost",
      watcherUrl,
      openBrowser: !headless,
      headless
    });

    await server.start();

    if (headless) {
      console.log(pc.green(`Analyzer running at http://localhost:${port}`));
      console.log(pc.gray("Press Ctrl+C to stop"));
    } else {
      console.log(pc.green("Analyzer opened in browser"));
      console.log(pc.gray("Close browser tab to stop analyzer"));
    }
  });
