import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { SCHEMA_VERSION } from "./types";

export type DataManifest = {
  schema_version: string;
  initialized_at: string;
  last_migration_at?: string;
};

export type MigrationContext = {
  dataDir: string;
  log: (message: string) => void;
};

export type Migration = {
  id: string;
  from: string;
  to: string;
  run: (context: MigrationContext) => Promise<void>;
};

export async function loadManifest(path: string): Promise<DataManifest | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as DataManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeManifest(
  path: string,
  manifest: DataManifest
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function runMigrations(options: {
  dataDir: string;
  migrations: Migration[];
  manifestPath?: string;
  logger?: (message: string) => void;
}): Promise<DataManifest> {
  const log = options.logger ?? (() => {});
  const manifestPath =
    options.manifestPath ?? join(options.dataDir, "manifest.json");
  const existing = await loadManifest(manifestPath);
  if (!existing) {
    const initialized: DataManifest = {
      schema_version: SCHEMA_VERSION,
      initialized_at: new Date().toISOString()
    };
    await writeManifest(manifestPath, initialized);
    log(`Initialized manifest at ${manifestPath}`);
    return initialized;
  }

  if (existing.schema_version === SCHEMA_VERSION) {
    return existing;
  }

  let current = existing.schema_version;
  for (const migration of options.migrations) {
    if (migration.from === current) {
      log(
        `Running migration ${migration.id} (${migration.from} -> ${migration.to})`
      );
      await migration.run({ dataDir: options.dataDir, log });
      current = migration.to;
      existing.schema_version = current;
      existing.last_migration_at = new Date().toISOString();
      await writeManifest(manifestPath, existing);
    }
  }

  if (existing.schema_version !== SCHEMA_VERSION) {
    throw new Error(
      `No migration path to ${SCHEMA_VERSION} (current: ${existing.schema_version})`
    );
  }

  return existing;
}
