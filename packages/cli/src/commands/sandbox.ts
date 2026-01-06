import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8420;

const DEFAULT_IMAGE_NAME = "claude-sandbox";
const DEFAULT_SCRIPT_PATH = join(
  homedir(),
  ".local",
  "bin",
  "claude-sandboxed"
);

// Claude Code settings file location
const CLAUDE_CONFIG_PATH = join(homedir(), ".claude", "settings.json");

export const sandboxCommand = new Command("sandbox").description(
  "Manage Docker sandbox for secure Claude Code operation"
);

// =============================================================================
// sandbox install
// =============================================================================
sandboxCommand
  .command("install")
  .description("Install Docker sandbox (build image, install script)")
  .option("--force", "Force rebuild of Docker image")
  .option(
    "--script-path <path>",
    "Custom path for claude-sandboxed script",
    DEFAULT_SCRIPT_PATH
  )
  .option("--image-name <name>", "Custom Docker image name", DEFAULT_IMAGE_NAME)
  .action(async (options) => {
    console.log(pc.cyan("Installing Docker sandbox for Claude Code...\n"));

    // Check Docker
    console.log(pc.gray("Checking Docker..."));
    const dockerStatus = checkDocker();
    if (!dockerStatus.installed) {
      console.log(pc.red("Docker is not installed."));
      console.log(
        pc.gray(
          "Install Docker Desktop from: https://www.docker.com/products/docker-desktop"
        )
      );
      console.log(
        pc.gray("Or use Colima (brew install colima && colima start)")
      );
      return;
    }
    if (!dockerStatus.running) {
      console.log(pc.red("Docker daemon is not running."));
      console.log(pc.gray("Start Docker Desktop or run: colima start"));
      return;
    }
    console.log(pc.green(`  Docker ${dockerStatus.version} ✓`));

    // Build image
    console.log(pc.gray("\nBuilding Docker image..."));
    const imageExists = checkImage(options.imageName);
    if (imageExists && !options.force) {
      console.log(pc.green(`  Image '${options.imageName}' already exists ✓`));
    } else {
      const buildSuccess = await buildDockerImage(
        options.imageName,
        options.force
      );
      if (!buildSuccess) {
        console.log(pc.red("Failed to build Docker image"));
        return;
      }
      console.log(pc.green(`  Image '${options.imageName}' built ✓`));
    }

    // Install script
    console.log(pc.gray("\nInstalling claude-sandboxed script..."));
    const scriptSuccess = installScript(options.scriptPath, options.imageName);
    if (!scriptSuccess) {
      console.log(pc.red("Failed to install script"));
      return;
    }
    console.log(pc.green(`  Script installed at ${options.scriptPath} ✓`));

    // Check PATH
    const pathDirs = (process.env.PATH || "").split(":");
    const scriptDir = dirname(options.scriptPath);
    if (!pathDirs.includes(scriptDir)) {
      console.log(pc.yellow(`\nNote: ${scriptDir} is not in your PATH`));
      console.log(pc.gray("Add to ~/.zshrc or ~/.bashrc:"));
      console.log(pc.white(`  export PATH="$PATH:${scriptDir}"`));
    }

    // Success message
    console.log(pc.green("\n✓ Docker sandbox installed successfully!\n"));
    console.log(pc.cyan("Usage:"));
    console.log(
      pc.white("  claude-sandboxed              # Run Claude in Docker sandbox")
    );
    console.log(pc.white("  claude-sandboxed --help       # Show help"));
    console.log(pc.gray("\nOptional alias (add to ~/.zshrc):"));
    console.log(pc.white("  alias cs='claude-sandboxed'"));
  });

// =============================================================================
// sandbox status
// =============================================================================
sandboxCommand
  .command("status")
  .description("Check sandbox installation status")
  .option("--image-name <name>", "Custom Docker image name", DEFAULT_IMAGE_NAME)
  .option("--script-path <path>", "Custom script path", DEFAULT_SCRIPT_PATH)
  .action(async (options) => {
    console.log(pc.cyan("Sandbox Status\n"));

    // Docker status
    const docker = checkDocker();
    console.log(pc.white("Docker:"));
    console.log(
      `  Installed: ${docker.installed ? pc.green("yes") : pc.red("no")}`
    );
    console.log(
      `  Running:   ${docker.running ? pc.green("yes") : pc.red("no")}`
    );
    if (docker.version) {
      console.log(`  Version:   ${pc.gray(docker.version)}`);
    }

    // Image status
    console.log(pc.white("\nDocker Image:"));
    if (docker.running) {
      const imageExists = checkImage(options.imageName);
      console.log(`  Name:      ${options.imageName}`);
      console.log(
        `  Exists:    ${imageExists ? pc.green("yes") : pc.yellow("no")}`
      );
    } else {
      console.log(pc.gray("  (Docker not running - cannot check image)"));
    }

    // Script status
    console.log(pc.white("\nScript:"));
    const scriptExists = existsSync(options.scriptPath);
    console.log(`  Path:      ${options.scriptPath}`);
    console.log(
      `  Installed: ${scriptExists ? pc.green("yes") : pc.yellow("no")}`
    );

    // Check PATH
    const pathDirs = (process.env.PATH || "").split(":");
    const scriptDir = dirname(options.scriptPath);
    const inPath = pathDirs.includes(scriptDir);
    console.log(`  In PATH:   ${inPath ? pc.green("yes") : pc.yellow("no")}`);

    // Overall status
    const imageExists = docker.running && checkImage(options.imageName);
    const ready = docker.running && imageExists && scriptExists;
    console.log(pc.white("\nOverall:"));
    console.log(
      `  Ready:     ${ready ? pc.green("yes - you can use claude-sandboxed") : pc.yellow("no - run: agentwatch sandbox install")}`
    );
  });

// =============================================================================
// sandbox run
// =============================================================================
sandboxCommand
  .command("run")
  .description("Run Claude Code in Docker sandbox")
  .option("--image-name <name>", "Custom Docker image name", DEFAULT_IMAGE_NAME)
  .allowUnknownOption(true)
  .action(async (options, command) => {
    // Get extra args after 'run'
    const extraArgs = command.args;

    // Check Docker
    const docker = checkDocker();
    if (!docker.running) {
      console.log(pc.red("Docker is not running. Start Docker first."));
      return;
    }

    // Check image exists
    if (!checkImage(options.imageName)) {
      console.log(pc.red(`Docker image '${options.imageName}' not found.`));
      console.log(pc.gray("Run: agentwatch sandbox install"));
      return;
    }

    // Build docker run command
    const dockerArgs = [
      "run",
      "-it",
      "--rm",
      "-v",
      `${process.cwd()}:/workspace`,
      "-v",
      `${homedir()}/.claude:/home/claude/.claude`,
      "-v",
      `${homedir()}/.agentwatch:/home/claude/.agentwatch:ro`,
      "-e",
      "ANTHROPIC_API_KEY",
      "-e",
      "CLAUDE_CODE_USE_BEDROCK",
      "-e",
      "CLAUDE_CODE_USE_VERTEX",
      "-e",
      "AWS_ACCESS_KEY_ID",
      "-e",
      "AWS_SECRET_ACCESS_KEY",
      "-e",
      "AWS_SESSION_TOKEN",
      "-e",
      "AWS_REGION",
      "-e",
      "GOOGLE_APPLICATION_CREDENTIALS",
      "--network",
      "bridge",
      options.imageName,
      "--dangerously-skip-permissions",
      ...extraArgs
    ];

    // Spawn docker process
    const proc = spawn("docker", dockerArgs, {
      stdio: "inherit"
    });

    proc.on("close", (code) => {
      process.exit(code ?? 0);
    });
  });

// =============================================================================
// sandbox preset
// =============================================================================
sandboxCommand
  .command("preset <name>")
  .description("Apply a permission preset to ~/.claude/settings.json")
  .option("--dry-run", "Show what would change without applying")
  .option("--host <host>", "Watcher host", DEFAULT_HOST)
  .option("--port <port>", "Watcher port", String(DEFAULT_PORT))
  .action(async (name, options) => {
    // Fetch presets from watcher
    const url = `http://${options.host}:${options.port}/api/sandbox/presets`;

    let presets: Array<{
      id: string;
      name: string;
      description: string;
      sandbox: unknown;
      permissions: unknown;
    }>;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        // Watcher not running, use built-in presets
        presets = getBuiltInPresets();
      } else {
        const data = (await res.json()) as { presets: typeof presets };
        presets = data.presets;
      }
    } catch {
      // Use built-in presets if watcher unavailable
      presets = getBuiltInPresets();
    }

    const preset = presets.find((p) => p.id === name.toLowerCase());
    if (!preset) {
      console.log(pc.red(`Unknown preset: ${name}`));
      console.log(pc.gray("Available presets:"));
      for (const p of presets) {
        console.log(`  ${pc.cyan(p.id)} - ${p.description}`);
      }
      return;
    }

    console.log(pc.cyan(`Applying '${preset.name}' preset...\n`));
    console.log(pc.gray(preset.description));
    console.log();

    // Show what will be applied
    const settings = presetToSettings(preset);
    console.log(pc.white("Settings to apply:"));
    console.log(pc.gray(JSON.stringify(settings, null, 2)));

    if (options.dryRun) {
      console.log(pc.yellow("\n--dry-run: No changes made"));
      return;
    }

    // Read existing settings
    let existingSettings: Record<string, unknown> = {};
    if (existsSync(CLAUDE_CONFIG_PATH)) {
      try {
        existingSettings = JSON.parse(
          readFileSync(CLAUDE_CONFIG_PATH, "utf-8")
        );
      } catch {
        console.log(
          pc.yellow("Warning: Existing settings.json is invalid JSON")
        );
        console.log(pc.yellow("Creating new settings file"));
      }
    }

    // Merge settings (preset values override)
    const merged = { ...existingSettings, ...settings };

    // Ensure directory exists
    const dir = dirname(CLAUDE_CONFIG_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write settings
    writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(merged, null, 2));

    console.log(
      pc.green(`\n✓ Preset '${preset.name}' applied to ${CLAUDE_CONFIG_PATH}`)
    );
  });

// =============================================================================
// sandbox config
// =============================================================================
sandboxCommand
  .command("config")
  .description("Show current sandbox configuration")
  .action(async () => {
    if (!existsSync(CLAUDE_CONFIG_PATH)) {
      console.log(pc.yellow("No Claude Code settings found"));
      console.log(pc.gray(`Expected at: ${CLAUDE_CONFIG_PATH}`));
      return;
    }

    try {
      const settings = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, "utf-8"));

      console.log(pc.cyan("Claude Code Settings\n"));

      // Sandbox config
      console.log(pc.white("Sandbox:"));
      if (settings.sandbox) {
        console.log(
          `  Enabled:    ${settings.sandbox.enabled ? pc.green("yes") : pc.gray("no")}`
        );
        console.log(
          `  Auto-allow: ${settings.sandbox.autoAllowBashIfSandboxed ? pc.green("yes") : pc.gray("no")}`
        );
        if (settings.sandbox.network) {
          console.log(
            `  Network:    ${pc.gray(settings.sandbox.network.allowedDomains?.length || 0)} allowed domains`
          );
        }
      } else {
        console.log(pc.gray("  Not configured"));
      }

      // Permissions config
      console.log(pc.white("\nPermissions:"));
      if (settings.permissions) {
        const allowCount = settings.permissions.allow?.length || 0;
        const denyCount = settings.permissions.deny?.length || 0;
        console.log(`  Allow:      ${pc.green(allowCount)} rules`);
        console.log(`  Deny:       ${pc.red(denyCount)} rules`);
      } else {
        console.log(pc.gray("  Not configured"));
      }

      // Hooks config
      console.log(pc.white("\nHooks:"));
      if (settings.hooks) {
        const hookTypes = Object.keys(settings.hooks);
        for (const type of hookTypes) {
          const hooks = settings.hooks[type] as unknown[];
          console.log(
            `  ${type}: ${hooks.length} hook${hooks.length !== 1 ? "s" : ""}`
          );
        }
      } else {
        console.log(pc.gray("  Not configured"));
      }
    } catch (e) {
      console.log(
        pc.red(
          `Error reading settings: ${e instanceof Error ? e.message : "Unknown error"}`
        )
      );
    }
  });

// =============================================================================
// Helper functions
// =============================================================================

function checkDocker(): {
  installed: boolean;
  running: boolean;
  version: string | null;
} {
  try {
    const versionOutput = execSync("docker --version", {
      encoding: "utf-8",
      timeout: 5000
    }).trim();
    const versionStr =
      versionOutput.replace("Docker version ", "").split(",")[0] ?? null;
    try {
      execSync("docker info", {
        encoding: "utf-8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"]
      });
      return {
        installed: true,
        running: true,
        version: versionStr
      };
    } catch {
      return {
        installed: true,
        running: false,
        version: versionStr
      };
    }
  } catch {
    return { installed: false, running: false, version: null };
  }
}

function checkImage(imageName: string): boolean {
  try {
    execSync(`docker image inspect ${imageName}`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

async function buildDockerImage(
  imageName: string,
  force: boolean
): Promise<boolean> {
  // Create temp directory for Dockerfile
  const tmpDir = join(homedir(), ".agentwatch", "sandbox");
  mkdirSync(tmpDir, { recursive: true });

  const dockerfile = getDockerfileContent();
  const dockerfilePath = join(tmpDir, "Dockerfile");
  writeFileSync(dockerfilePath, dockerfile);

  return new Promise((resolve) => {
    const args = ["build", "-t", imageName];
    if (force) args.push("--no-cache");
    args.push(tmpDir);

    const proc = spawn("docker", args, { stdio: "inherit" });

    proc.on("close", (code) => {
      resolve(code === 0);
    });

    proc.on("error", () => {
      resolve(false);
    });
  });
}

function installScript(scriptPath: string, imageName: string): boolean {
  try {
    const dir = dirname(scriptPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const script = getScriptContent(imageName);
    writeFileSync(scriptPath, script);

    // Make executable
    const { chmodSync } = require("fs");
    chmodSync(scriptPath, 0o755);

    return true;
  } catch {
    return false;
  }
}

function getDockerfileContent(): string {
  const homeDir = homedir();
  return `# Claude Code Sandboxed Container
# Built by agentwatch sandbox install

FROM node:20-slim

# Install dependencies
RUN apt-get update && apt-get install -y \\
    git \\
    curl \\
    ripgrep \\
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for better security
RUN useradd -m -s /bin/bash claude

# Create paths for hooks with absolute paths to work
RUN mkdir -p ${homeDir.split("/").slice(0, 3).join("/")} && \\
    ln -s /home/claude/.agentwatch ${homeDir}/.agentwatch 2>/dev/null || true && \\
    ln -s /home/claude/.claude ${homeDir}/.claude 2>/dev/null || true

USER claude

WORKDIR /workspace

ENTRYPOINT ["claude"]
`;
}

function getScriptContent(imageName: string): string {
  return `#!/bin/bash
# Claude Code in Docker sandbox
# Generated by: agentwatch sandbox install

set -e

IMAGE_NAME="${imageName}"

if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "Error: Docker image '$IMAGE_NAME' not found."
    echo "Run: agentwatch sandbox install"
    exit 1
fi

docker run -it --rm \\
    -v "$(pwd):/workspace" \\
    -v "$HOME/.claude:/home/claude/.claude" \\
    -v "$HOME/.agentwatch:/home/claude/.agentwatch:ro" \\
    -e ANTHROPIC_API_KEY \\
    -e CLAUDE_CODE_USE_BEDROCK \\
    -e CLAUDE_CODE_USE_VERTEX \\
    -e AWS_ACCESS_KEY_ID \\
    -e AWS_SECRET_ACCESS_KEY \\
    -e AWS_SESSION_TOKEN \\
    -e AWS_REGION \\
    -e GOOGLE_APPLICATION_CREDENTIALS \\
    --network bridge \\
    "$IMAGE_NAME" --dangerously-skip-permissions "$@"
`;
}

function getBuiltInPresets() {
  return [
    {
      id: "permissive",
      name: "Permissive",
      description: "Minimal restrictions for trusted projects",
      sandbox: { enabled: false, autoAllowBashIfSandboxed: false },
      permissions: {
        allow: ["Bash(ls:*)", "Bash(git:*)", "Bash(npm:*)", "Bash(bun:*)"],
        deny: ["Bash(rm -rf /)"]
      }
    },
    {
      id: "balanced",
      name: "Balanced",
      description: "Standard safety with usability. macOS sandbox.",
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
        network: {
          allowedDomains: [
            "registry.npmjs.org",
            "github.com",
            "api.github.com",
            "raw.githubusercontent.com",
            "pypi.org",
            "files.pythonhosted.org",
            "api.anthropic.com"
          ],
          allowLocalBinding: true
        }
      },
      permissions: {
        allow: [],
        deny: ["Bash(curl:*)|sh", "Bash(wget:*)|bash"]
      }
    },
    {
      id: "restrictive",
      name: "Restrictive",
      description: "Maximum protection. Docker container isolation.",
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: false,
        network: {
          allowedDomains: ["api.anthropic.com"],
          allowLocalBinding: false
        }
      },
      permissions: {
        allow: [],
        deny: ["Bash(rm:*)", "Bash(curl:*)", "Bash(wget:*)", "Write(.env*)"]
      }
    },
    {
      id: "custom",
      name: "Custom",
      description: "User-defined rules",
      sandbox: { enabled: false, autoAllowBashIfSandboxed: false },
      permissions: { allow: [], deny: [] }
    }
  ];
}

function presetToSettings(preset: {
  sandbox: unknown;
  permissions: unknown;
}): Record<string, unknown> {
  const settings: Record<string, unknown> = {};

  const sandbox = preset.sandbox as { enabled?: boolean };
  if (sandbox?.enabled) {
    settings.sandbox = preset.sandbox;
  }

  const permissions = preset.permissions as {
    allow?: string[];
    deny?: string[];
  };
  if (permissions?.allow?.length || permissions?.deny?.length) {
    settings.permissions = preset.permissions;
  }

  return settings;
}
