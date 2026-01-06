#!/usr/bin/env bun
/**
 * Watcher runner - starts the watcher server
 * This is a separate process that can be spawned in the background
 */

import { WatcherServer } from "@agentwatch/watcher";

const args = process.argv.slice(2);

let host = "localhost";
let port = 8420;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];

  if (arg === "--host" && nextArg) {
    host = nextArg;
    i++;
  } else if (arg === "--port" && nextArg) {
    port = Number.parseInt(nextArg, 10);
    i++;
  } else if (arg?.startsWith("--host=")) {
    host = arg.split("=")[1] ?? host;
  } else if (arg?.startsWith("--port=")) {
    port = Number.parseInt(arg.split("=")[1] ?? String(port), 10);
  }
}

const server = new WatcherServer();
server.run(host, port);
