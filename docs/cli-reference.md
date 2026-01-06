# CLI Reference

Complete reference for the `aw` command-line tool.

## Quick Reference

| Command | Description |
|---------|-------------|
| `aw watcher start` | Start real-time monitoring (port 8420) |
| `aw analyze` | Open analyzer dashboard (port 8421) |
| `aw hooks install` | Install Claude Code hooks |
| `aw tui` | Start terminal UI |
| `aw run "<prompt>"` | Launch tracked agent session |
| `aw sessions` | List managed sessions |
| `aw logs` | View hook session logs |
| `aw sandbox install` | Install Docker sandbox |
| `aw security status` | Check Test Gate status |

---

## aw watcher

Manage the watcher (real-time monitoring daemon).

```bash
aw watcher start             # Start in background
aw watcher start -f          # Start in foreground (see logs)
aw watcher stop              # Stop watcher
aw watcher status            # Check status
aw watcher restart           # Restart watcher
```

**Options:** `-H, --host <host>` (default: 127.0.0.1), `-p, --port <port>` (default: 8420)

---

## aw analyze

Open the analyzer dashboard (browser-based analysis).

```bash
aw analyze                   # Opens browser, closes when browser closes
aw analyze --headless        # No browser (for scripts)
aw analyze --port 8422       # Custom port
```

**Options:** `-p, --port <port>` (default: 8421), `--headless` (no browser)

---

## aw hooks

Manage Claude Code hooks integration.

```bash
aw hooks install             # Install hooks to ~/.claude/settings.json
aw hooks uninstall           # Remove hooks
aw hooks status              # Check installation status
```

**Options:** `--url <url>` watcher URL (default: http://127.0.0.1:8420)

Installs hooks for: PreToolUse, PostToolUse, SessionStart, SessionEnd, Notification, PermissionRequest, UserPromptSubmit, Stop, SubagentStop, PreCompact.

---

## aw run

Launch an agent session with a tracked prompt.

```bash
aw run "review this code"           # Interactive claude session
aw run -a codex "fix the tests"     # Use codex agent
aw run -a gemini "explain this"     # Use gemini agent
aw run -p "what is 2+2?"            # Non-interactive (print mode)
```

**Options:**
- `-a, --agent <agent>` - Agent to use: `claude` (default), `codex`, `gemini`
- `-p, --print` - Non-interactive mode (agent outputs and exits)
- `-H, --host`, `--port` - Watcher connection

Sessions are tracked via `/api/managed-sessions` when watcher is running.

---

## aw sessions

List and view managed agent sessions.

```bash
aw sessions                  # List recent sessions
aw sessions <id>             # View session details
aw sessions --active         # Show only running sessions
aw sessions --agent claude   # Filter by agent type
aw sessions -n 50            # Show 50 sessions
```

**Options:**
- `-a, --active` - Show only running sessions
- `-n, --limit <count>` - Number to show (default: 20)
- `--agent <agent>` - Filter by agent type

---

## aw logs

View Claude Code hook session logs.

```bash
aw logs                      # List recent hook sessions
aw logs <session_id>         # View session timeline
aw logs -n 50                # Show 50 sessions
```

**Options:** `-n, --tail <count>` (default: 20)

---

## aw tui

Start the terminal UI dashboard.

```bash
aw tui                       # Start TUI
```

Auto-starts the legacy daemon if not running. See [TUI vs Web](tui-vs-web.md) for comparison.

---

## aw sandbox

Manage Docker sandbox for secure Claude Code operation.

```bash
aw sandbox install           # Build image + install script
aw sandbox install --force   # Force rebuild image
aw sandbox status            # Check installation
aw sandbox run               # Run Claude in sandbox
aw sandbox preset <name>     # Apply permission preset
aw sandbox config            # Show current config
```

**Presets:** `permissive`, `balanced`, `restrictive`, `custom`

After install, use `claude-sandboxed` to run Claude in Docker. See [Docker Sandbox](docker-sandbox.md).

---

## aw security / aw test-gate

Test Gate - require tests to pass before git commits.

```bash
aw security status           # Check Test Gate status
aw security enable           # Enable Test Gate
aw security disable          # Disable Test Gate
```

When enabled, git commits are blocked until tests pass. This currently requires the legacy daemon; watcher/analyzer do not expose Test Gate yet. Configure the test command in [Settings](configuration.md#test-gate).

---

## Global Options

Most daemon-backed commands accept:
- `-H, --host <host>` - Legacy daemon host (default: 127.0.0.1)
- `-p, --port <port>` - Legacy daemon port (default: 8420)

Watcher/analyzer commands have their own host/port flags.

---

## Data Storage

| Path | Contents |
|------|----------|
| `~/.agentwatch/` | Main data directory |
| `~/.agentwatch/hooks/` | Hook sessions, tool usages |
| `~/.agentwatch/sessions/` | Managed sessions (`aw run`) |
| `~/.agentwatch/processes/` | Process snapshots |
| `~/.config/agentwatch/config.toml` | Configuration |

See [Data Sources](data-sources.md) for details.

---

<details>
<summary><strong>Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| Created | 2026-01-02 | Claude | Initial CLI reference |
| Human review | — | — | *Awaiting review* |

</details>
