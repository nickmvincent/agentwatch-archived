#!/usr/bin/env bun
/**
 * Development entry point for the Analyzer server.
 */

import { AnalyzerServer } from "./server";

const host = process.env.HOST ?? "localhost";
const port = Number.parseInt(process.env.PORT ?? "8421", 10);
const watcherUrl = process.env.WATCHER_URL ?? "http://localhost:8420";
const headless = process.env.HEADLESS === "1";
const openBrowser = !process.env.NO_OPEN;

console.log(
  `[dev] Starting analyzer on ${host}:${port} (watcher: ${watcherUrl})...`
);

const server = new AnalyzerServer({
  host,
  port,
  watcherUrl,
  headless,
  openBrowser
});

await server.start();

// Keep process alive
await new Promise(() => {});
