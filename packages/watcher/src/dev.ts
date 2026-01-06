#!/usr/bin/env bun
/**
 * Development entry point for the Watcher server.
 *
 * Starts the watcher on HOST/PORT with hot reload.
 */

import { WatcherServer } from "./server";

const host = process.env.HOST ?? "localhost";
const port = Number.parseInt(process.env.PORT ?? "8420", 10);
const debug = !!process.env.DEBUG;

console.log(
  `[dev] Starting watcher on ${host}:${port}${debug ? " (DEBUG mode)" : ""}...`
);

const server = new WatcherServer();
server.run(host, port);
