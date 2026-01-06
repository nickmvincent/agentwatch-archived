# TUI vs Web UI

Agentwatch provides two interfaces: a terminal-based TUI and a browser-based Web UI. This guide helps you choose the right one.

## Quick Comparison

| Aspect | TUI | Web UI |
|--------|-----|--------|
| **Launch** | `aw` or `aw tui` (legacy daemon UI) | `aw watcher start` + `aw analyze` |
| **Daemon required** | Yes (legacy daemon auto-started) | Watcher required; analyzer is on-demand |
| **Best for** | Quick monitoring, SSH | Full features, analytics |
| **Keyboard-driven** | Yes | Yes (shortcuts) |
| **Real-time updates** | Polling | WebSocket |

---

## TUI (Terminal UI)

### When to Use
- Quick status check on agents
- Working over SSH
- Minimal resource usage
- No browser needed
- Lightweight terminal workflow

### Launching
```bash
aw          # Default TUI mode
aw tui      # Explicit TUI command
```

### Keyboard Controls

| Key | Action |
|-----|--------|
| `q` | Quit |
| `j/k` or `↓/↑` | Navigate up/down |
| `R` | Toggle repos pane |
| `Tab` | Switch panes |
| `g` | Toggle agent grouping |
| `e` | Collapse/expand group |
| `i` | Send interrupt (Ctrl+C) |
| `s` | Pause/resume agent |
| `x` | Terminate agent |
| `X` | Force kill agent |
| `t` | Open terminal at cwd |
| `/` | Search/filter |
| `space` | Pause updates |
| `?` | Show help |

### Features

**What TUI has:**
- Agent monitoring with status, CPU, memory
- Repository monitoring (all repos, not just dirty)
- Process control (signals, kill)
- Agent grouping and pinning
- Split pane view (agents + repos)
- Ignore list management
- Text search/filter

**What TUI doesn't have:**
- Claude Code hook integration
- Session timelines and tool stats
- Security configuration UI
- Transcript sharing/sanitization
- Settings editor
- Port monitoring

### Legacy Daemon Mode

The current TUI connects to the legacy daemon and will auto-start it if needed.
Standalone scanning mode is not available in the current CLI.

## Web UI

### When to Use
- Full feature access
- Security and sandbox setup
- Session analytics and cost tracking
- Transcript sharing
- Claude Code settings management
- Visual documentation

### Launching
```bash
# Start watcher (real-time monitoring)
aw watcher start

# Open watcher dashboard (port 8420)
# http://localhost:8420

# Open analyzer dashboard (port 8421)
aw analyze
```

### Watcher Dashboard (port 8420)

Real-time monitoring - always running:

| Tab | Purpose |
|-----|---------|
| **Agents** | Running AI agents with status and controls |
| **Repos** | Git repository status (dirty repos only) |
| **Ports** | Listening network ports |
| **Timeline** | Live activity feed |

### Analyzer Dashboard (port 8421)

Analysis and export - opens in browser:

| Tab | Purpose |
|-----|---------|
| **Sessions** | Browse enriched sessions with quality scores |
| **Analytics** | Success rates, cost trends, quality distribution |
| **Projects** | Organize sessions by project |
| **Share** | Export, redact, and share sessions |
| **Command** | Session management |
| **Docs** | In-app documentation |
| **Settings** | Configuration and preferences |

### Features

**What Web UI has (that TUI doesn't):**
- Claude Code hook integration
  - Session tracking
  - Tool usage statistics
  - Timeline visualization
  - Daily activity charts
- Security configuration
  - Test Gate setup
  - Docker sandbox installation
  - Permission presets
  - In-app documentation
- Transcript management
  - Sanitization with pattern matching
  - Residue checking
  - Cost estimation
  - HuggingFace upload
  - GitHub Gist sharing
- Settings management
  - Claude settings.json editor
  - MCP server viewer
  - Permissions reference
  - Environment variables reference
- Port monitoring
  - Listening ports list
  - Agent-port linking
- Real-time WebSocket updates

**What Web UI doesn't have (that TUI does):**
- Agent grouping by type
- Agent pinning
- Split pane view
- Ignore list UI

## Decision Guide

### Use TUI when...
- You need a quick status check
- You're working over SSH
- You prefer keyboard-only navigation
- You need minimal resource usage

### Use Web UI when...
- You want full Claude Code integration
- You need to configure security settings
- You want to share or analyze transcripts
- You need to track costs
- You want visual analytics
- You need to edit Claude settings

### Use Both when...
- TUI for quick monitoring during work
- Web UI for periodic deep analysis
- TUI over SSH, Web UI locally

## Common Workflows

### Quick Check (TUI)
```bash
aw          # See what's running
# Press 'q' to quit
```

### Full Monitoring (Watcher)
```bash
aw watcher start
# Open http://localhost:8420 - leave browser tab open
```

### SSH Monitoring (TUI)
```bash
ssh myserver
aw          # Works in terminal
```

### Session Analysis (Analyzer)
```bash
aw watcher start    # Must be running for hooks
aw analyze          # Opens analyzer dashboard
# Navigate to Sessions tab for enriched sessions
```

### Session Sharing (Analyzer)
```bash
aw analyze
# Navigate to Share tab
```

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Verified commands and keyboard shortcuts |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
