# agentwatch

A tool with two purposes:

1. **Monitor & control AI coding agents** — see what's running, track sessions, enforce security gates
2. **Review & contribute session data** — sanitize transcripts, enrich with feedback, share with researchers

## Architecture

Agentwatch uses a **two-server architecture**:

| Component | Port | Purpose | Lifecycle |
|-----------|------|---------|-----------|
| **Watcher** | 8420 | Real-time monitoring daemon | Always-on background service |
| **Analyzer** | 8421 | Analysis and sharing dashboard | On-demand (opens with browser, closes when browser closes) |

**Watcher** monitors running processes, captures hook events, and provides WebSocket updates.
**Analyzer** handles transcript indexing, enrichments, annotations, and data sharing.

## Quick Start

```bash
# Install
git clone https://github.com/nickmvincent/agentwatch && cd agentwatch
bun install
cd packages/cli && bun link && cd ../..

# Start the watcher (background monitoring)
aw watcher start

# For Claude Code: Install hooks for real-time tracking
aw hooks install

# Open analysis dashboard (when you want to review sessions)
aw analyze            # Opens browser, closes with browser
```

### User Flow

1. **Start watcher once** — `aw watcher start` runs in background, monitors agents
2. **Work normally** — Claude Code hooks capture tool usage automatically
3. **Open analyzer when needed** — `aw analyze` for reviewing sessions, analytics, sharing

## Agent Support

| Agent | Transcripts | Hooks | Process Detection | Command Center |
|-------|:-----------:|:-----:|:-----------------:|:--------------:|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | ✅ | ✅ | ✅ | ✅ |
| [Codex CLI](https://github.com/openai/codex) | ✅ | — | ✅ | ✅ |
| [Gemini CLI](https://github.com/google/gemini-cli) | ✅ | — | ✅ | ✅ |
| [Cursor](https://cursor.com) | — | — | ✅ | — |
| [OpenCode](https://github.com/opencode-ai/opencode) | — | — | ✅ | — |

**Legend:**
- **Transcripts**: Read and parse local session logs (`~/.claude/`, `~/.codex/`, `~/.gemini/`)
- **Hooks**: Real-time tool tracking via Claude Code hooks (`aw hooks install`)
- **Process Detection**: Detect running agents, view CPU/memory
- **Command Center**: Launch agent sessions via web UI

See [Getting Started](docs/getting-started.md) for detailed setup instructions.

## Features

### For Daily Development

| Feature | Description |
|---------|-------------|
| **Monitor** | Detect running agents, view state (working/waiting/stalled), CPU/memory |
| **Track** | Session history, tool usage stats, token counts, cost estimation |
| **Secure** | Test Gate blocks commits until tests pass; permission presets for protection |
| **Launch** | Start agents with `aw run "prompt"` and track what you asked |

### For Data Contribution

| Feature | Description |
|---------|-------------|
| **Analyze** | Auto-tags, quality scores, success rates, loop detection |
| **Annotate** | Rate sessions (thumbs up/down), add notes and tags |
| **Sanitize** | Redact secrets, PII, file paths before sharing |
| **Contribute** | Export bundles or upload directly to HuggingFace |
| **Audit** | Full transparency into what data is collected and shared |

See [CLI Reference](docs/cli-reference.md) for all commands.

## Web UIs

### Watcher Dashboard (port 8420)

Real-time monitoring — view with `aw watcher start` then open http://localhost:8420

| Tab | Purpose |
|-----|---------|
| **Agents** | Monitor running agents, session status, tool usage |
| **Repos** | Git repository status (staged, unstaged, conflicts) |
| **Ports** | Listening ports spawned by agents |
| **Timeline** | Real-time activity feed |

### Analyzer Dashboard (port 8421)

Analysis and sharing — open with `aw analyze`

| Tab | Purpose |
|-----|---------|
| **Sessions** | Browse all sessions with enrichments and annotations |
| **Analytics** | Success rates, costs, quality trends over time |
| **Projects** | Manage project configurations |
| **Share** | Sanitize and export sessions for contribution |
| **Command** | Launch agent sessions |
| **Docs** | In-app documentation |
| **Settings** | Claude Code settings, Test Gate configuration |

**Keyboard shortcuts:** `1-7` switch tabs, `r` refresh

## Documentation

| Getting Started | Reference | Contributing Data |
|-----------------|-----------|-------------------|
| [Getting Started](docs/getting-started.md) | [CLI Reference](docs/cli-reference.md) | [Data Contribution Guide](docs/data-contribution-guide.md) |
| [Glossary](docs/glossary.md) | [Configuration](docs/configuration.md) | [Data Sources](docs/data-sources.md) |
| [Security Guide](docs/security.md) | [API Reference](docs/api-reference.md) | |

**Full index:** [docs/README.md](docs/README.md)


## Package Structure

```
packages/
├── cli/              # Command-line interface (aw watcher, aw analyze)
├── core/             # Shared types and utilities
├── watcher/          # Watcher server (port 8420) - monitoring daemon
├── analyzer/         # Analyzer server (port 8421) - analysis dashboard
├── shared-api/       # Shared API utilities (converters, sanitizers)
├── monitor/          # Process and repo scanning
├── pre-share/        # Sanitization pipeline
├── tui/              # Terminal UI (Ink/React)
├── daemon/           # [DEPRECATED] Legacy combined server
└── transcript-parser/# Transcript parsing utilities

web/                  # Web dashboards (React + Vite)
├── src/apps/watcher/ # Watcher UI (Agents, Repos, Ports, Timeline)
├── src/apps/analyzer/# Analyzer UI (Sessions, Analytics, Share, etc.)
└── src/components/   # Shared React components

pages/                # Static demo site (Astro)
docs/                 # Documentation
```

## Development

```bash
bun run dev              # Watcher + unified web with hot reload
bun run build            # Build all packages
bun run test             # Run all tests (831 tests)

# Build split UIs
cd web
bun run build:watcher    # Build watcher UI → dist/watcher/
bun run build:analyzer   # Build analyzer UI → dist/analyzer/
```

| Command | Description |
|---------|-------------|
| `bun run dev` | Full-stack with hot reload (http://localhost:5173) |
| `bun run dev:watcher` | Watcher dev mode |
| `bun run dev:web` | Web only (needs watcher running) |
| `aw watcher start` | Production watcher (port 8420) |
| `aw analyze` | Production analyzer (port 8421) |

## License

MIT
