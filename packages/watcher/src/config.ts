/**
 * Watcher configuration.
 * Simplified version of daemon config focused on monitoring needs.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface WatcherConfig {
  roots: string[];
  repo: {
    refreshFastSeconds: number;
    refreshSlowSeconds: number;
    includeUntracked: boolean;
    showClean: boolean;
  };
  watcher: {
    host: string;
    port: number;
    logDir: string;
  };
  hookEnhancements: {
    costControls: {
      enabled: boolean;
      sessionLimitUsd: number;
      dailyLimitUsd: number;
      warningThreshold: number;
    };
    notificationHub: {
      enabled: boolean;
      desktop: boolean;
      webhook?: string;
    };
  };
}

const DEFAULT_CONFIG: WatcherConfig = {
  roots: [homedir()],
  repo: {
    refreshFastSeconds: 2,
    refreshSlowSeconds: 30,
    includeUntracked: true,
    showClean: false
  },
  watcher: {
    host: "localhost",
    port: 8420,
    logDir: "~/.agentwatch/logs"
  },
  hookEnhancements: {
    costControls: {
      enabled: false,
      sessionLimitUsd: 5.0,
      dailyLimitUsd: 50.0,
      warningThreshold: 0.8
    },
    notificationHub: {
      enabled: false,
      desktop: true
    }
  }
};

export function loadConfig(): WatcherConfig {
  const configPath = join(homedir(), ".config", "agentwatch", "config.toml");

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    // Simple TOML parsing for known keys
    const config = { ...DEFAULT_CONFIG };

    // Parse roots
    const rootsMatch = content.match(/roots\s*=\s*\[([\s\S]*?)\]/);
    if (rootsMatch?.[1]) {
      const roots = rootsMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      if (roots.length > 0) {
        config.roots = roots;
      }
    }

    // Parse watcher section
    const watcherHostMatch = content.match(
      /\[(?:daemon|watcher)\][\s\S]*?host\s*=\s*["']([^"']+)["']/
    );
    if (watcherHostMatch?.[1]) {
      config.watcher.host = watcherHostMatch[1];
    }

    const watcherPortMatch = content.match(
      /\[(?:daemon|watcher)\][\s\S]*?port\s*=\s*(\d+)/
    );
    if (watcherPortMatch?.[1]) {
      config.watcher.port = Number.parseInt(watcherPortMatch[1], 10);
    }

    return config;
  } catch {
    return DEFAULT_CONFIG;
  }
}
