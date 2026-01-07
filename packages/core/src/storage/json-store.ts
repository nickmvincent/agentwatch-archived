/**
 * Generic JSON file store for agentwatch.
 *
 * Provides type-safe load/save operations with atomic writes
 * and automatic directory creation.
 */

import { existsSync, readFileSync } from "fs";
import { expandPath, ensureDir, writeFileAtomic } from "./file-utils";

/**
 * Options for JSON store operations.
 */
export interface JsonStoreOptions {
  /** Pretty print JSON output (default: true) */
  pretty?: boolean;
  /** Spaces for indentation when pretty printing (default: 2) */
  indent?: number;
}

/**
 * Load a JSON file, returning a default value if it doesn't exist.
 *
 * @example
 * const config = loadJson<Config>("~/.agentwatch/config.json", { version: 1 });
 */
export function loadJson<T>(filePath: string, defaultValue: T): T {
  const expanded = expandPath(filePath);

  if (!existsSync(expanded)) {
    return defaultValue;
  }

  try {
    const content = readFileSync(expanded, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Save data to a JSON file atomically.
 *
 * @example
 * saveJson("~/.agentwatch/config.json", config);
 */
export function saveJson<T>(
  filePath: string,
  data: T,
  options: JsonStoreOptions = {}
): void {
  const { pretty = true, indent = 2 } = options;
  const expanded = expandPath(filePath);
  ensureDir(expanded);

  const content = pretty
    ? JSON.stringify(data, null, indent)
    : JSON.stringify(data);
  writeFileAtomic(expanded, content);
}

/**
 * Update a JSON file by loading, transforming, and saving.
 * The transform function receives the current data and returns the new data.
 *
 * @example
 * updateJson<Config>("~/.agentwatch/config.json", { version: 1 }, (config) => ({
 *   ...config,
 *   lastUpdated: new Date().toISOString()
 * }));
 */
export function updateJson<T>(
  filePath: string,
  defaultValue: T,
  transform: (data: T) => T,
  options: JsonStoreOptions = {}
): T {
  const current = loadJson(filePath, defaultValue);
  const updated = transform(current);
  saveJson(filePath, updated, options);
  return updated;
}

/**
 * Create a typed JSON store for a specific file path and data type.
 * Useful for creating reusable store instances.
 *
 * @example
 * const configStore = createJsonStore<Config>("~/.agentwatch/config.json", { version: 1 });
 * const config = configStore.load();
 * configStore.save({ ...config, updated: true });
 */
export function createJsonStore<T>(filePath: string, defaultValue: T) {
  return {
    /** Path to the JSON file */
    path: expandPath(filePath),

    /** Load the current data */
    load: (): T => loadJson(filePath, defaultValue),

    /** Save new data */
    save: (data: T, options?: JsonStoreOptions): void =>
      saveJson(filePath, data, options),

    /** Update data with a transform function */
    update: (transform: (data: T) => T, options?: JsonStoreOptions): T =>
      updateJson(filePath, defaultValue, transform, options),

    /** Check if the file exists */
    exists: (): boolean => existsSync(expandPath(filePath))
  };
}

/**
 * Versioned store with automatic migration support.
 */
export interface VersionedStore<T> {
  version: number;
  data: T;
  updatedAt: string;
}

/**
 * Create a versioned JSON store with migration support.
 *
 * @example
 * const store = createVersionedStore<Metadata>("~/.agentwatch/metadata.json", {
 *   metadata: {},
 *   version: 1
 * });
 */
export function createVersionedStore<T>(
  filePath: string,
  defaultValue: VersionedStore<T>
) {
  const baseStore = createJsonStore<VersionedStore<T>>(filePath, defaultValue);

  return {
    ...baseStore,

    /** Load data with automatic version checking */
    load: (): VersionedStore<T> => {
      const stored = baseStore.load();
      // In the future, migrations can be applied here based on version
      return stored;
    },

    /** Save data with automatic timestamp update */
    save: (data: T, options?: JsonStoreOptions): void => {
      const current = baseStore.load();
      baseStore.save(
        {
          version: current.version,
          data,
          updatedAt: new Date().toISOString()
        },
        options
      );
    },

    /** Get just the data portion */
    getData: (): T => baseStore.load().data,

    /** Update just the data portion */
    updateData: (transform: (data: T) => T, options?: JsonStoreOptions): T => {
      const current = baseStore.load();
      const newData = transform(current.data);
      baseStore.save(
        {
          ...current,
          data: newData,
          updatedAt: new Date().toISOString()
        },
        options
      );
      return newData;
    }
  };
}
