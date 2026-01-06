# Glossary

This glossary explains technical terms used throughout the agentwatch documentation. If you're new to AI coding agents or unfamiliar with some concepts, start here.

## AI Coding Agents

### Agent
An AI-powered tool that can execute code, run commands, and interact with your computer on your behalf. Unlike chat-based AI (where you copy-paste suggestions), agents directly perform actions like editing files, running tests, and making git commits.

**Examples:** Claude Code, Codex CLI, Cursor, Gemini CLI, OpenCode

### Claude Code
Anthropic's official AI coding agent. It runs in your terminal and can read/write files, run shell commands, search the web, and more. Claude Code is the primary agent that agentwatch integrates with.

**Learn more:** [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code/overview)

### Session
A single conversation with an AI agent, from when you start it to when it ends. During a session, you might have multiple back-and-forth exchanges as the agent completes tasks.

### Transcript
A complete record of a session, including all messages exchanged between you and the agent, tool calls made, and results. Transcripts are stored as files on your computer.

## Technical Concepts

### Watcher
The always-on background process that monitors agent activity in real-time. It captures hook events, scans running processes, and tracks repository status. Runs on port 8420.

**To start:** `aw watcher start`
**To stop:** `aw watcher stop`

### Analyzer
The on-demand analysis server that provides session enrichments, quality scores, annotations, and export capabilities. Opens in your browser and closes when the browser closes. Runs on port 8421.

**To start:** `aw analyze`

### Hooks
Small scripts that run automatically when certain events happen in Claude Code. For example, a "PreToolUse" hook runs right before Claude uses a tool, giving you a chance to block or modify it.

**Types of hooks (10 total):**
- `SessionStart` - When a Claude Code session begins
- `SessionEnd` - When a session terminates
- `PreToolUse` - Before Claude uses a tool (can block/modify)
- `PostToolUse` - After a tool completes (for logging)
- `Notification` - When Claude sends a notification
- `PermissionRequest` - When Claude asks for permission
- `UserPromptSubmit` - When you submit a prompt
- `Stop` - When a session is stopped/finished
- `SubagentStop` - When a subagent stops
- `PreCompact` - Before transcript compaction

**Learn more:** [Claude Code Hooks Documentation](https://docs.anthropic.com/en/docs/claude-code/hooks)

### MCP (Model Context Protocol)
A standardized way for AI agents to connect to external tools and services. MCP servers provide capabilities like file access, database queries, or API integrations that agents can use.

**Example:** An MCP server for GitHub lets Claude Code create issues or pull requests.

**Learn more:** [MCP Specification](https://modelcontextprotocol.io/)

### Tool
A specific action an agent can take. Tools include:
- `Bash` - Run shell commands
- `Read` - Read file contents
- `Write` - Create or overwrite files
- `Edit` - Make changes to existing files
- `WebFetch` - Fetch content from URLs

When Claude Code runs a command, it's "using the Bash tool."

## Data Formats

### JSON
JavaScript Object Notation - a common format for structured data. Uses curly braces `{}` for objects and square brackets `[]` for arrays.

```json
{
  "name": "example",
  "count": 42,
  "items": ["a", "b", "c"]
}
```

### JSONL (JSON Lines)
A file format where each line is a separate JSON object. Used for log files because new entries can be appended without rewriting the whole file.

```jsonl
{"event": "start", "time": "2024-01-01T10:00:00Z"}
{"event": "tool_use", "tool": "Bash", "success": true}
{"event": "end", "time": "2024-01-01T10:05:00Z"}
```

### TOML
A configuration file format used by agentwatch. More readable than JSON for configuration.

```toml
# This is a comment
[section]
setting = "value"
number = 42
enabled = true
```

## Security Terms

### Sandbox
An isolated environment that restricts what a program can access. A sandboxed agent can only access specific files and network resources, protecting the rest of your system.

**Analogy:** Like a playground with a fence - the agent can play inside but can't wander outside.

### Docker Container
A lightweight, isolated environment that runs applications. More isolated than sandboxing because the agent runs in a completely separate "mini-computer" inside your computer.

**Learn more:** [Docker Documentation](https://docs.docker.com/)

### Permission Rules
Patterns that control what Claude Code is allowed to do. Rules are defined in `~/.claude/settings.json` and can allow, deny, or ask for approval.

```json
{
  "permissions": {
    "allow": ["Read"],
    "deny": ["Bash(rm -rf /*)"]
  }
}
```

### PII (Personally Identifiable Information)
Data that could identify a specific person: names, email addresses, phone numbers, addresses, social security numbers, etc. Agentwatch can redact PII before sharing transcripts.

### Redaction
The process of removing or replacing sensitive information with placeholders. For example, replacing `sk-abc123...` with `<API_KEY>`.

### Sanitization
The complete process of preparing data for sharing, including redaction, field stripping, and validation. Sanitization ensures no sensitive data leaks into shared transcripts.

## Sharing & Contribution

### HuggingFace
A platform for sharing datasets and AI models. Agentwatch can upload sanitized transcripts to HuggingFace to contribute to public AI training data.

**Learn more:** [HuggingFace Datasets](https://huggingface.co/docs/datasets/)

### Gist
A GitHub feature for sharing code snippets or files. Agentwatch can create gists for quick sharing of individual sessions.

### Bundle
A ZIP file containing prepared transcripts, a preparation report, and optionally markdown versions of the sessions. Bundles are the standard way to export multiple sessions.

## Process & System Terms

### PID (Process ID)
A number assigned to every running program by your operating system. Used to identify and control specific processes.

### Working Directory
The folder where a program is running from. When you open a terminal and type `pwd`, it shows your working directory.

### PTY (Pseudo-Terminal)
A virtual terminal that lets programs interact with other programs as if they were typing in a terminal. Used for process wrapping and capturing output.

### Signal
A message sent to a process to control it:
- `SIGINT` (Ctrl+C) - Interrupt/stop gracefully
- `SIGTERM` - Terminate gracefully
- `SIGKILL` - Force kill immediately
- `SIGTSTP` (Ctrl+Z) - Suspend/pause

## Agentwatch-Specific Terms

### Agentwatch Object
A unified unit of AI coding agent data that combines information from hooks, transcripts, process snapshots, and enrichments. The primary entity for tracking, analyzing, and sharing session data.

### Enrichment
Additional metadata computed or added to a session after it ends. Includes auto-tags, quality scores, outcome signals, and manual annotations. Enrichments are stored persistently for export and analysis.

### Auto-Tags
Automatically inferred labels for a session based on patterns in tool usage, file paths, and commands. Examples include task types (bugfix, feature, test), languages (TypeScript, Python), and domains (frontend, backend).

### Quality Score
A computed score (0-100) that rates session quality based on multiple signals: no failures, has commits, no loops, time efficiency. Used to identify successful patterns and problematic sessions.

### Outcome Signals
Data extracted from tool responses that indicate session outcomes: test results (passed/failed counts), exit codes, time-to-green (first test pass after changes).

### Loop Detection
Automatic detection of problematic patterns in tool usage: retry loops (same command repeated), oscillation (alternating between states), permission loops (repeated permission requests), and dead ends (multiple consecutive failures).

### Manual Annotation
User-provided feedback on a session: thumbs up/down rating, notes, and custom tags. Used to mark sessions for training data, identify issues, or categorize work.

### Test Gate
An agentwatch feature that blocks git commits until tests have passed. Ensures Claude Code doesn't commit broken code.

### Deny Rules
Permission rules that block specific operations. Configured in `~/.claude/settings.json` to prevent dangerous commands like `rm -rf` or writing to sensitive files.

### Correlation
Matching data from different sources - connecting hook events to transcript files to build a complete picture of a session.

### Pre-Share
The agentwatch package (`@agentwatch/pre-share`) that handles sanitization, field selection, and export. Prepares transcripts for safe sharing.

## File Locations

Agentwatch stores data in two main locations:

| Location | What it stores |
|----------|----------------|
| `~/.config/agentwatch/` | Configuration (settings, UI prefs, sharing defaults) |
| `~/.agentwatch/` | Data (events, sessions, hooks, transcripts index) |

Files agentwatch **reads but doesn't write**:

| Location | Owner |
|----------|-------|
| `~/.claude/projects/` | Claude Code transcripts |
| `~/.codex/sessions/` | Codex CLI transcripts |
| `~/.gemini/tmp/*/chats/` | Gemini CLI transcripts |

**Note:** `~` means your home directory (e.g., `/Users/yourname` on macOS).

For a complete file reference, see [Data Sources](data-sources.md#complete-file-reference).

## Common Abbreviations

| Abbreviation | Full Form |
|--------------|-----------|
| API | Application Programming Interface |
| CLI | Command Line Interface |
| CPU | Central Processing Unit |
| JSON | JavaScript Object Notation |
| JSONL | JSON Lines |
| MCP | Model Context Protocol |
| PID | Process ID |
| PII | Personally Identifiable Information |
| PTY | Pseudo-Terminal |
| REST | Representational State Transfer |
| TOML | Tom's Obvious Minimal Language |
| TUI | Terminal User Interface |
| URL | Uniform Resource Locator |
| VPS | Virtual Private Server |
| WS | WebSocket |

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Updated "Security Gate" → "Deny Rules" |
| Simplified file locations | 2026-01-02 | Claude | Link to data-sources.md for full reference |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>

