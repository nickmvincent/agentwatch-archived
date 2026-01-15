import {
  createServiceLogger,
  registerSettingsReloadEndpoint,
  startService
} from "@aw-clean/core";
import { SERVICE_NAME, clearRegexCache, createHooksApp } from "./service";

await startService(SERVICE_NAME, {
  createApp: ({
    settings,
    logger,
    enableHttpLogs,
    settingsPaths,
    defaultSettings
  }) => {
    const { logger: responderLogger, logPath: responderLogPath } =
      createServiceLogger(settings, SERVICE_NAME, "responder");

    const { app } = createHooksApp({
      settings,
      logger,
      responderLogger,
      configPath: settingsPaths.configPath,
      defaultSettings,
      enableHttpLogs
    });

    return { app, logPaths: { "responder log file": responderLogPath } };
  },
  registerReload: (app, init) => {
    registerSettingsReloadEndpoint(app, init.settings, async () => {
      const updated = await init.reloadSettings();
      clearRegexCache();
      return updated;
    });
  }
});
