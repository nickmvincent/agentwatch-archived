# Getting Started

Set up agentwatch in under 5 minutes.

## Quick Start

### 1. Install and Start

```bash
# Clone and install
git clone https://github.com/nickmvincent/agentwatch
cd agentwatch
bun install

# Link the CLI
cd packages/cli && bun link && cd ../..

# Start the watcher (always-on monitoring)
aw watcher start

# Open the analyzer dashboard (browser-based analysis)
aw analyze
```

**Two servers:**
- **Watcher** (port 8420) - Real-time monitoring, hook capture, process scanning
- **Analyzer** (port 8421) - Session analysis, enrichments, annotations, export

## How Agentwatch Works

Understanding agentwatch's mental model helps you use it effectively.

### Three Data Sources

```
┌─────────────────────────────────────────────────────────────┐
│                     AGENTWATCH WATCHER                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. HOOKS (collected)     2. TRANSCRIPTS (read)   3. PROCESSES │
│  ┌──────────────┐        ┌──────────────┐        ┌─────────┐ │
│  │ Claude Code  │        │ ~/.claude/   │        │ ps aux  │ │
│  │ sends events │        │ ~/.codex/    │        │ scans   │ │
│  │ to watcher   │        │ ~/.gemini/   │        │         │ │
│  └──────────────┘        └──────────────┘        └─────────┘ │
│         │                       │                      │     │
│         ▼                       ▼                      ▼     │
│  ~/.agentwatch/hooks/     Index only         ~/.agentwatch/  │
│  (we create this)        (files are theirs)   processes/     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Two Storage Locations

| Location | Purpose | Contents |
|----------|---------|----------|
| `~/.config/agentwatch/` | **Settings** | `config.toml` (all preferences) |
| `~/.agentwatch/` | **Data** | Events, sessions, hooks, index |

### Key Insight

**What agentwatch creates vs. what it reads:**

- **Creates:** Hook event data, process logs, transcript index, event log
- **Reads only:** Agent transcript files (`~/.claude/projects/`, etc.)

Uninstalling agentwatch leaves agent transcripts untouched. Delete `~/.agentwatch/` to remove all collected data.

### 2. Install Claude Code Hooks (Optional)

For real-time monitoring of Claude Code sessions:

```bash
aw hooks install
```

This adds hooks to `~/.claude/settings.json` that send events to the watcher.

<details>
<summary><strong>What do hooks collect?</strong></summary>

- Tool call events (which tools, inputs, outputs)
- Session start/end timestamps
- Permission request events
- Notification events

See [Data Sources](data-sources.md) for full details.
</details>

### 3. Configure Security (Optional)

**For code quality:** Enable the Test Gate

```bash
aw security enable
```

**For machine protection:** Configure deny rules in `~/.claude/settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Bash(rm -rf /*)",
      "Write(.env*)",
      "Bash(*|sh)"
    ]
  }
}
```

See [Security Guide](security.md) for threat categories and mitigations.

## Web UI Overview

### Watcher Dashboard (port 8420)

Real-time monitoring with 4 tabs:

| Tab | Purpose |
|-----|---------|
| **Agents** | Running AI agents (state, CPU, memory, hook sessions) |
| **Repos** | Git repository status (dirty, conflicts) |
| **Ports** | Listening ports linked to agent processes |
| **Timeline** | Live activity feed |

### Analyzer Dashboard (port 8421)

Analysis and export with 7 tabs:

| Tab | Purpose |
|-----|---------|
| **Sessions** | Browse enriched sessions with auto-tags, quality scores |
| **Analytics** | Success rates, cost trends, quality distribution |
| **Projects** | Organize sessions by project |
| **Share** | Export, redact, and share sessions |
| **Command** | Session management |
| **Docs** | In-app documentation |
| **Settings** | Configuration and preferences |

**Keyboard shortcuts:** `1-9` switch tabs, `r` refresh

## Common Workflows

### Monitor Claude Code Sessions

1. Start watcher: `aw watcher start`
2. Install hooks: `aw hooks install`
3. Open watcher UI: http://localhost:8420
4. Use Claude Code normally—activity appears in real-time

### Analyze Past Sessions

1. Start analyzer: `aw analyze`
2. Go to **Sessions** tab
3. Browse sessions with quality scores and auto-tags
4. Add annotations for sessions you want to review

### Ensure Tests Pass Before Commits

1. Enable Test Gate: `aw security enable`
2. Claude Code will be blocked from committing until tests pass

<details>
<summary><strong>How Test Gate works</strong></summary>

1. When you run your test command, agentwatch writes a "pass file"
2. Before `git commit`, agentwatch checks if tests passed recently
3. If not, the commit is blocked with an error message
4. The pass file expires after 5 minutes (configurable)
</details>

### View Trends and Analytics

1. Start analyzer: `aw analyze`
2. Go to **Analytics** tab
3. Select time range (7d, 14d, 30d)
4. View success rate trends, cost breakdowns by task type

## Troubleshooting

### Hooks not working

```bash
# Check hook installation
aw hooks status

# Reinstall hooks
aw hooks uninstall
aw hooks install
```

### Watcher won't start

```bash
# Check if already running
aw watcher status

# Check port 8420
lsof -i :8420

# Stop and restart
aw watcher stop
aw watcher start
```

### No sessions appearing

- Ensure hooks are installed: `aw hooks status`
- Ensure watcher is running: `aw watcher status`
- Check the Agents tab—hook sessions should appear in real-time

## Next Steps

- [Data Sources](data-sources.md) — Understand what agentwatch collects
- [Security Guide](security.md) — Threat categories and mitigations
- [Configuration](configuration.md) — Full configuration reference

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Compared against Claude Code docs, verified commands |
| Added mental model section | 2026-01-02 | Claude | Three data sources, two storage locations |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
