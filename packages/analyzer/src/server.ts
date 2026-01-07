/**
 * Analyzer server for on-demand analysis of AI agent sessions.
 *
 * Responsibilities:
 * - Transcript analysis and enrichment
 * - Quality scoring and auto-tagging
 * - Manual annotation workflow
 * - Analytics and statistics
 * - Share/export to HuggingFace
 *
 * Browser-only lifecycle: starts temp server, opens browser, shuts down when browser closes.
 */

import { createAnalyzerApp, type AnalyzerAppState } from "./api";
import { BrowserLifecycle } from "./browser-lifecycle";

export interface AnalyzerServerOptions {
  /** Port to listen on */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** Whether to open browser automatically */
  openBrowser?: boolean;
  /** Watcher API URL for live data */
  watcherUrl?: string;
  /** Whether to run in headless mode (no browser lifecycle) */
  headless?: boolean;
}

export class AnalyzerServer {
  private options: Required<AnalyzerServerOptions>;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private lifecycle: BrowserLifecycle | null = null;
  private started = false;
  private startedAt = 0;

  constructor(options: AnalyzerServerOptions = {}) {
    this.options = {
      port: options.port ?? 8421,
      host: options.host ?? "localhost",
      openBrowser: options.openBrowser ?? true,
      watcherUrl: options.watcherUrl ?? "http://localhost:8420",
      headless: options.headless ?? false
    };
  }

  async start(): Promise<void> {
    if (this.started) return;

    const state: AnalyzerAppState = {
      startedAt: Date.now(),
      watcherUrl: this.options.watcherUrl,
      shutdown: () => this.stop(),
      recordHeartbeat: () => this.recordHeartbeat()
    };

    const app = createAnalyzerApp(state);

    this.server = Bun.serve({
      hostname: this.options.host,
      port: this.options.port,
      fetch: app.fetch
    });

    this.started = true;
    this.startedAt = Date.now();

    console.log(
      `Analyzer listening on http://${this.options.host}:${this.options.port}`
    );

    // Set up browser lifecycle if not headless
    if (!this.options.headless) {
      this.lifecycle = new BrowserLifecycle({
        shutdownTimeoutMs: 30000,
        onShutdown: () => this.stop()
      });
      this.lifecycle.start();

      // Open browser
      if (this.options.openBrowser) {
        const url = `http://${this.options.host}:${this.options.port}`;
        const open = process.platform === "darwin" ? "open" : "xdg-open";
        Bun.spawn([open, url]);
      }
    }
  }

  stop(): void {
    if (!this.started) return;

    this.lifecycle?.stop();
    this.server?.stop();
    this.server = null;
    this.started = false;

    console.log("Analyzer stopped");
    process.exit(0);
  }

  recordHeartbeat(): void {
    this.lifecycle?.recordHeartbeat();
  }

  get isRunning(): boolean {
    return this.started;
  }

  get url(): string {
    return `http://${this.options.host}:${this.options.port}`;
  }
}
