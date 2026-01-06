#!/usr/bin/env bun
/**
 * TUI entry point for AgentWatch
 */

import { render } from "ink";
import { App } from "./App.js";

const args = process.argv.slice(2);

// Parse --watcher-url flag (with legacy --daemon-url fallback)
let watcherUrl = "http://127.0.0.1:8420";
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  if (arg === "--watcher-url" && nextArg) {
    watcherUrl = nextArg;
    break;
  }
  if (arg === "--daemon-url" && nextArg) {
    watcherUrl = nextArg;
    break;
  }
  if (arg && arg.startsWith("--watcher-url=")) {
    watcherUrl = arg.split("=")[1] ?? watcherUrl;
    break;
  }
  if (arg && arg.startsWith("--daemon-url=")) {
    watcherUrl = arg.split("=")[1] ?? watcherUrl;
    break;
  }
}

render(<App watcherUrl={watcherUrl} />);
