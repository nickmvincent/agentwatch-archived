# Data Sources

Agentwatch accesses AI agent activity from three sources. **Understanding what agentwatch collects vs. what it simply reads is important for your privacy.**

> **New to these terms?** See the [Glossary](glossary.md) for definitions of hooks, watcher, JSONL, and other terms.

## Quick Summary

| Source | Type | Created By | Stored By Agentwatch |
|--------|------|------------|---------------------|
| [Hooks](#source-1-claude-code-hooks) | COLLECTED | Agentwatch | Yes (`~/.agentwatch/hooks/`) |
| [Transcripts](#source-2-local-transcript-files) | READ-ONLY | The agents | No |
| [Process monitoring](#source-3-process-monitoring) | COLLECTED | Agentwatch | Yes (`~/.agentwatch/processes/`) |

---

## Collected vs. Read-Only Data

### Data Agentwatch COLLECTS (only with hooks installed)

When you run `aw hooks install`, agentwatch begins **actively collecting** data from Claude Code:

- Tool call events (name, input, output, timing)
- Session start/end events
- Permission request events

**This data would not exist without agentwatch.** It's created by the hooks you install.

**To stop collection:** Run `aw hooks uninstall` and delete `~/.agentwatch/`.

### Data Agentwatch READS (already exists)

These files are created by the AI agents themselves, **regardless of whether agentwatch is installed**:

| Agent | Files Location |
|-------|----------------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) | `~/.claude/projects/*/*.jsonl` |
| [Codex CLI](https://github.com/openai/codex) | `~/.codex/sessions/*/*/*.jsonl` |
| [Gemini CLI](https://github.com/google/gemini-cli) | `~/.gemini/tmp/*/chats/*.json` |
| [OpenCode](https://github.com/opencode-ai/opencode) | `~/.opencode/` (SQLite, not yet supported) |

**Agentwatch does not create these files.** They exist whether or not you use agentwatch.

**To prevent reading:** Don't enable "Scan local transcripts". Agentwatch never modifies these files.

### Process Information

Agentwatch reads your system's process list to detect running agents and stores periodic snapshots for historical analysis. This is the same information shown by `ps` or Activity Monitor.

---

## Source 1: Claude Code Hooks

**Type: COLLECTED** — Only exists because of agentwatch

[Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) are scripts that Claude Code calls during operation. When you run `aw hooks install`, it adds entries to `~/.claude/settings.json` that send events to the agentwatch watcher.

**What is collected:**
- Tool calls (names, inputs, outputs, success/failure, timing)
- Session lifecycle (start, end, duration)
- Permission requests and notifications
- Token usage and estimated costs

**How to enable:**
```bash
aw hooks install
```

**How to disable:**
```bash
aw hooks uninstall
rm -rf ~/.agentwatch/hooks/  # Remove collected data
```

**Storage:** `~/.agentwatch/hooks/` (daily JSONL files)

---

## Source 2: Local Transcript Files

**Type: READ-ONLY** — Files created by agents, not agentwatch

AI coding agents write session transcripts to your filesystem. Agentwatch can scan and parse these to show historical sessions.

**What agentwatch reads:**
- Conversation messages (user and assistant)
- Tool calls and results
- Token usage and cost data (where available)

**How to enable:** Check "Scan local transcripts" in the Review/Share tab

**How to disable:** Uncheck "Scan local transcripts"

**What agentwatch does NOT do:**
- Modify, delete, or copy these files
- Send this data anywhere

---

## Source 3: Process Monitoring

**Type: COLLECTED** — Stored for historical analysis

Agentwatch detects running AI agent processes and stores periodic snapshots.

**What is collected:**
- Process ID, agent type, command line
- CPU and memory usage
- Current working directory
- Whether process is sandboxed
- Start/end lifecycle events

**Storage:** `~/.agentwatch/processes/` (daily JSONL files, rotated after 30 days)

**How to enable:** Automatic when the watcher is running

**How to disable:** Stop the watcher. Delete `~/.agentwatch/processes/` to remove data.

---

## Privacy Summary

| If you want... | Do this |
|----------------|---------|
| No data collection at all | Don't install hooks, don't run watcher |
| Read-only access to existing sessions | Enable "Scan local transcripts" only |
| Real-time monitoring with collection | Install hooks and run watcher |
| Remove all collected data | `aw hooks uninstall && rm -rf ~/.agentwatch/` |

---

## FAQ

### Does agentwatch send data anywhere?
No. All data stays on your machine. Hook events go to your local watcher (localhost:8420), and the web UI connects to localhost only.

### Can I use agentwatch without collecting any new data?
Yes. Don't install hooks and don't run the watcher. You can still view existing transcript files and use the cost calculator.

Note: Running the watcher collects process snapshots. For transcript-only access without process logging, use CLI scan commands instead.

### What's the difference between hook sessions and transcripts?
- **Hook sessions**: Data agentwatch collected via hooks (in `~/.agentwatch/`)
- **Transcripts**: Files the agents created themselves (in `~/.claude/`, `~/.codex/`, etc.)

### How do I see what data agentwatch has collected?
```bash
ls -la ~/.agentwatch/
```

### How do I completely remove all agentwatch data?
```bash
aw hooks uninstall
rm -rf ~/.agentwatch/
rm -rf ~/.config/agentwatch/  # Optional: remove config
```

This does NOT delete transcript files—those belong to the agents.

---

## Sharing Data

When you share sessions, agentwatch protects sensitive information:

**Field stripping** removes entire fields (like `cwd`, `transcript_path`)

**Content redaction** replaces patterns within fields:
- API keys → `<API_KEY_1>`
- Emails → `<EMAIL_1>`
- Paths → `<HOME>/code`
- Tokens → `<GITHUB_TOKEN_1>`

See [Security Guide](security.md#security-enables-easier-sharing) for details.

---

## External Resources

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code/overview)
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Codex CLI](https://github.com/openai/codex)
- [Gemini CLI](https://github.com/google/gemini-cli)
- [OpenCode](https://github.com/opencode-ai/opencode)

---

*For developer documentation (file formats, event log patterns, adding new features), see [CLAUDE.md](../CLAUDE.md) and inline code comments.*
