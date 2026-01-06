/**
 * Analyzer configuration types.
 *
 * Minimal config focused on analysis needs.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Project configuration for grouping sessions by repository/workspace.
 */
export interface ProjectConfig {
  /** Unique project identifier (user-defined slug) */
  id: string;
  /** Display name for the project */
  name: string;
  /** One or more paths that belong to this project */
  paths: string[];
  /** Optional description */
  description?: string;
}

/**
 * Analyzer-specific configuration.
 */
export interface AnalyzerConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to */
  host: string;
  /** Watcher API URL */
  watcherUrl: string;
  /** Configured projects */
  projects: ProjectConfig[];
  /** Data directory */
  dataDir: string;
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  port: 8421,
  host: "localhost",
  watcherUrl: "http://localhost:8420",
  projects: [],
  dataDir: join(homedir(), ".agentwatch")
};

/**
 * Load analyzer configuration.
 */
export function loadAnalyzerConfig(): AnalyzerConfig {
  const configPath = join(homedir(), ".config", "agentwatch", "config.toml");

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = { ...DEFAULT_CONFIG };

    // Parse projects section
    const projectsMatch = content.match(
      /\[\[projects\]\][\s\S]*?(?=\[\[|\[(?!\[)|$)/g
    );
    if (projectsMatch) {
      config.projects = projectsMatch
        .map((section) => {
          const idMatch = section.match(/id\s*=\s*["']([^"']+)["']/);
          const nameMatch = section.match(/name\s*=\s*["']([^"']+)["']/);
          const pathsMatch = section.match(/paths\s*=\s*\[([\s\S]*?)\]/);

          const id = idMatch?.[1] ?? "";
          const name = nameMatch?.[1] ?? id;
          const paths =
            pathsMatch?.[1]
              ?.split(",")
              .map((s) => s.trim().replace(/^["']|["']$/g, ""))
              .filter(Boolean) ?? [];

          return { id, name, paths };
        })
        .filter((p) => p.id && p.paths.length > 0);
    }

    return config;
  } catch {
    return DEFAULT_CONFIG;
  }
}
