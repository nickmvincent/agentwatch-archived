import type { Settings, VerboseLogger } from "@aw-clean/core";
import { startService } from "@aw-clean/core";
import {
  SERVICE_NAME,
  buildAgentMatchers,
  createScannerApp,
  enrichAgents,
  pruneSeenAgents,
  scanAgentProcesses,
  type AgentSeenState
} from "./service";

let settingsRef: Settings | null = null;
let loggerRef: VerboseLogger | null = null;
let matchers = buildAgentMatchers([]);
const seen: AgentSeenState = new Map();
let scanTimer: ReturnType<typeof setInterval> | null = null;
let scanInFlight = false;

await startService(SERVICE_NAME, {
  requireWriter: true,
  createApp: ({ settings, logger, enableHttpLogs, writer }) => {
    settingsRef = settings;
    loggerRef = logger;
    matchers = buildAgentMatchers(settings.scanner.agentMatchers);
    const scan = () =>
      scanAgentProcesses(matchers, Bun.spawn, settings.scanner.resolveCwd);
    const { app } = createScannerApp({
      settings,
      logger,
      writer: writer!,
      enableHttpLogs,
      scan,
      seen
    });
    return { app };
  },
  registerReload: (app, { settings, reloadSettings }) => {
    app.post("/api/settings/reload", async (c) => {
      await reloadSettings();
      matchers = buildAgentMatchers(settings.scanner.agentMatchers);
      stopScannerLoop();
      startScannerLoop();
      return c.json({
        ok: true,
        settings,
        note: "Restart required for port/log path changes."
      });
    });
  }
});

async function scanAndLog() {
  if (!settingsRef || !loggerRef) return;
  if (!settingsRef.scanner.enabled) return;
  if (scanInFlight) return;
  scanInFlight = true;
  const scannedAt = new Date().toISOString();
  try {
    const agents = enrichAgents(
      await scanAgentProcesses(
        matchers,
        Bun.spawn,
        settingsRef.scanner.resolveCwd
      ),
      seen,
      scannedAt
    );
    pruneSeenAgents(seen, scannedAt, settingsRef.scanner.seenRetentionMs);
    await Promise.all(
      agents.map((agent) =>
        loggerRef.log(
          agent.seenStatus === "known" ? "process.seen" : "process.discovered",
          { ...agent }
        )
      )
    );
  } finally {
    scanInFlight = false;
  }
}

function startScannerLoop() {
  if (!settingsRef) return;
  if (!settingsRef.scanner.enabled) return;
  if (settingsRef.scanner.scanIntervalMs <= 0) return;
  scanTimer = setInterval(() => {
    void scanAndLog();
  }, settingsRef.scanner.scanIntervalMs);
}

function stopScannerLoop() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

stopScannerLoop();
startScannerLoop();
