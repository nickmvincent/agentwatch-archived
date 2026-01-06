# Configuration Reference

All agentwatch configuration is stored in `~/.config/agentwatch/config.toml`. This file uses [TOML format](https://toml.io/).

> **New to TOML?** It's a simple configuration format—see the [Glossary](glossary.md) for a quick explanation.
>
> **Claude Code settings** are separate and stored in `~/.claude/settings.json`. See [Claude Code Settings](https://docs.anthropic.com/en/docs/claude-code/settings).

## Repository Monitoring

```toml
# Directories containing git repos to monitor
roots = ["/Users/you/Documents/GitHub", "/Users/you/projects"]

[repo]
# Polling interval for dirty repos (seconds)
refresh_fast_seconds = 3

# Polling interval for clean repos (seconds)
refresh_slow_seconds = 45

# Git operation timeout for quick commands like status (ms)
git_timeout_fast_ms = 800

# Git operation timeout for slow commands like upstream check (ms)
git_timeout_slow_ms = 2500

# Max parallel git operations
concurrency_git = 12

# Include untracked file counts in dirty status
include_untracked = false

# Show repositories with no changes
show_clean = false
```

## Agent Monitoring

```toml
[agents]
# How often to poll for processes (seconds)
refresh_seconds = 1

# Minimum CPU % to consider agent "active" vs "waiting"
active_cpu_threshold = 1.0

# Seconds of inactivity before marking agent as "stalled"
stalled_seconds = 30

# Add custom agent detection patterns
[[agents.matchers]]
label = "claude"
type = "cmd_regex"      # "cmd_regex" or "exe_path"
pattern = "\\bclaude\\b"

[[agents.matchers]]
label = "codex"
type = "cmd_regex"
pattern = "\\bcodex\\b"

[[agents.matchers]]
label = "cursor"
type = "cmd_regex"
pattern = "\\bcursor\\b"

[[agents.matchers]]
label = "gemini"
type = "cmd_regex"
pattern = "\\bgemini\\b"
```

## Watcher Server

```toml
[watcher]
# Host to bind to
host = "127.0.0.1"

# Port to listen on
port = 8420

# Log directory
log_dir = "~/.agentwatch/logs"
```

> **Migration note:** If you have an existing `[daemon]` section in config.toml, it will still be read for backwards compatibility. New installations should use `[watcher]`.

## API Defaults

```toml
[api]
# Default number of output lines to fetch
output_limit = 200

# Default limit for session/event lists
list_limit = 100

# Default days for time-based queries
default_days = 7
```

## UI Preferences

UI settings are stored in config (not browser localStorage), so they sync across browsers.

```toml
[ui]
# Tabs to hide in the web UI (reduces data fetching)
hidden_tabs = []  # ["hooks", "repos", "ports"]

# Ports to hide in the Ports panel
hidden_ports = []  # [3000, 8080, 5432]
```

## Sharing & Redaction

Default redaction settings for the Share tab.

```toml
[sharing.redaction_config]
# Redact API keys, tokens, secrets
redact_secrets = true

# Redact emails, IPs, PII
redact_pii = true

# Redact file paths
redact_paths = true

# Detect high-entropy strings (possible secrets)
enable_high_entropy = true
```

## Conversations

```toml
[conversations]
# Days of transcripts to show (1, 7, 14, 30, 90)
transcript_days = 30

# Include process snapshots for activity without hooks/transcripts
include_process_snapshots = false
```

## Suggestions & Heuristics

```toml
[suggestions]
# Minimum tool calls before calculating failure rate
min_calls_for_failure_rate = 3

# Failure rate threshold for warnings (0-1)
high_failure_rate = 0.5

# Read tool calls to suggest caching
heavy_read_threshold = 30

# Edit operations to note significant changes
many_edits_threshold = 15

# Minutes before session is "long"
long_session_minutes = 30
```

## Test Gate

The Test Gate is a workflow feature that blocks git commits until your tests have passed.
This is the only remaining Agentwatch security feature - for command blocking, use Claude
Code's native deny rules in `~/.claude/settings.json` instead.

```toml
[test_gate]
# Require tests pass before commits
enabled = true

# Command that runs tests (must match what Claude uses)
test_command = "npm test"

# File to record test pass timestamp
pass_file = "~/.agentwatch/test-pass"

# Max age of test pass before requiring new run (seconds)
pass_file_max_age_seconds = 300
```

## Notifications

```toml
[notifications]
# Enable macOS desktop notifications
enable = true

# Notify when Claude needs input
hook_awaiting_input = true

# Notify when session ends
hook_session_end = true

# Notify when tool fails
hook_tool_failure = true

# Notify when long-running command finishes
hook_long_running = true

# Threshold for "long running" (seconds)
long_running_threshold_seconds = 60

# Educational notifications (learn how hooks work)
hook_session_start = false     # Notify on SessionStart hook
hook_pre_tool_use = false      # Notify on PreToolUse hook
hook_post_tool_use = false     # Notify on PostToolUse hook
hook_notification = false      # Notify on Notification hook
hook_permission_request = false # Notify on PermissionRequest hook
hook_user_prompt_submit = false # Notify on UserPromptSubmit hook
hook_stop = false              # Notify on Stop hook
hook_subagent_stop = false     # Notify on SubagentStop hook
hook_pre_compact = false       # Notify on PreCompact hook
```

## Hook Enhancements

These advanced features extend the basic [hook](https://docs.anthropic.com/en/docs/claude-code/hooks) functionality with intelligent responses. Hooks are scripts that Claude Code runs at specific events (session start, before/after tool use, etc.).

### Context Injection

Automatically inject useful context into Claude's sessions:

```toml
[hook_enhancements.context_injection]
# Inject git status/diff on session start
inject_git_context = false

# Inject CLAUDE.md or README.md on session start
inject_project_context = false

# Inject recent errors on prompt submit
inject_recent_errors = false

# Max lines of context to inject
max_context_lines = 100
```

### Token & Cost Tracking

Track token usage and costs per session:

```toml
[hook_enhancements.token_tracking]
# Enable per-session token tracking
enabled = true

# Warn when session cost exceeds this USD amount
cost_warning_threshold_usd = 5.0
```

### Auto-Continue

Automatically continue Claude when conditions aren't met:

```toml
[hook_enhancements.auto_continue]
# Enable auto-continue when conditions aren't met
enabled = false

# Auto-continue if tests are failing
on_failing_tests = false

# Auto-continue if lint errors exist
on_lint_errors = false

# Max auto-continue attempts per session
max_attempts = 3
```

### Input Modification

Modify tool inputs before execution (PreToolUse hook):

```toml
[hook_enhancements.input_modification]
# Enable input modification for PreToolUse
enabled = false

# Auto-add --dry-run flags to destructive commands
add_dry_run_flags = false

# Enforce commit message format
enforce_commit_format = false

# Commit message prefix (e.g., "feat:", "fix:")
commit_message_prefix = ""
```

### Auto Permissions

Automatically approve permission requests for read-only operations:

```toml
[hook_enhancements.auto_permissions]
# Enable auto-approve for permissions
enabled = false

# Auto-approve read-only operations (Read, Glob, Grep, WebFetch, WebSearch)
auto_approve_read_only = false
```

Note: For blocking operations on protected paths, use Claude Code's native deny rules
in `~/.claude/settings.json` instead.

### Subagent Quality Gates

Validate subagent outputs before allowing parent to continue:

```toml
[hook_enhancements.subagent_quality]
# Enable quality validation for subagents
enabled = false

# Require subagent to complete successfully
require_success = false
```

### Rules Engine

Define custom rules for pattern-based decisions on hook events:

```toml
[hook_enhancements.rules]
# Enable rules-based decision making
enabled = false

# Path to custom rules file (JSONL format)
rules_file = ""

# Built-in rule sets to enable
# Options: "SECURITY", "PATH_SANITIZATION", "COMMIT_STYLE"
enabled_rule_sets = []
```

Rules are defined in JSON format with conditions and actions:

```json
{
  "id": "block-env-files",
  "name": "Block .env access",
  "priority": 10,
  "hookTypes": ["PreToolUse"],
  "conditions": [
    { "field": "toolName", "operator": "in", "value": ["Read", "Write"] },
    { "field": "toolInput.file_path", "operator": "matches", "value": "/.env$/" }
  ],
  "action": { "type": "block", "reason": "Cannot access .env files" }
}
```

See [API Reference](api-reference.md#rule-management) for rule operators and actions.

---

### Cost Controls

Track and enforce spending limits:

```toml
[hook_enhancements.cost_controls]
# Enable cost tracking and limits
enabled = false

# Budget per session (null = unlimited)
session_budget_usd = 5.00

# Daily budget (null = unlimited)
daily_budget_usd = 25.00

# Monthly budget (null = unlimited)
monthly_budget_usd = 500.00

# Alert when usage reaches these percentages (0-100)
alert_thresholds = [50, 80, 95]

# Action when budget exceeded: "warn", "block", or "notify"
over_budget_action = "warn"
```

---

### Notification Hub

Configure notification providers and webhooks:

```toml
[hook_enhancements.notification_hub]
# Enable notification hub
enabled = true

# Desktop notifications (macOS)
[hook_enhancements.notification_hub.desktop]
enabled = true

# Webhook endpoints (for Slack, Discord, etc.)
[[hook_enhancements.notification_hub.webhooks]]
id = "slack-alerts"
name = "Slack Alerts"
url = "https://hooks.slack.com/services/..."
enabled = true
hook_types = ["Stop", "PostToolUse"]  # Which hooks trigger this webhook
retry_count = 3
```

---

### LLM Evaluation

Use AI to evaluate AI - intelligent decision making for hooks:

```toml
[hook_enhancements.llm_evaluation]
# Enable LLM-based evaluation
enabled = false

# LLM provider: "anthropic", "openai", or "ollama"
provider = "anthropic"

# Model to use
model = "claude-3-haiku-20240307"

# Environment variable containing API key
api_key_env_var = "ANTHROPIC_API_KEY"

# Max tokens for response
max_tokens = 256

# Timeout in milliseconds
timeout_ms = 5000

# Which hooks can use LLM evaluation
trigger_hooks = ["PreToolUse", "PermissionRequest", "UserPromptSubmit"]
```

---

### Stop Blocking

Block Claude from stopping until quality gates pass:

```toml
[hook_enhancements.stop_blocking]
# Enable stop blocking
enabled = false

# Require tests to pass before stop
require_tests_pass = false

# Require no lint errors
require_no_lint_errors = false

# Require code coverage threshold (null = disabled)
require_coverage_threshold = null

# Max attempts before allowing stop anyway
max_block_attempts = 3
```

---

### Prompt Validation

Validate user prompts before submission:

```toml
[hook_enhancements.prompt_validation]
# Enable prompt validation
enabled = false

# Patterns that block submission
block_patterns = []

# Patterns that trigger warnings
warn_patterns = []

# Minimum prompt length
min_length = 0

# Maximum prompt length (null = unlimited)
max_length = null
```

---

### Environment File Injection

Inject environment variables into Claude sessions:

```toml
[hook_enhancements.env_file_injection]
# Enable environment injection
enabled = false

# Static variables to inject (key = value)
[hook_enhancements.env_file_injection.static_vars]
# MY_VAR = "my_value"
```

---

### PreCompact Intelligence

Control transcript compaction behavior:

```toml
[hook_enhancements.pre_compact]
# Enable PreCompact enhancements
enabled = false

# Patterns to preserve during compaction (regex)
preserve_patterns = []

# Suggest compaction strategy
suggest_strategy = false
```

## Complete Example

```toml
# ~/.config/agentwatch/config.toml

# Repos to monitor
roots = ["/Users/me/Documents/GitHub"]

[repo]
refresh_fast_seconds = 3
refresh_slow_seconds = 45
include_untracked = true

[agents]
refresh_seconds = 1
stalled_seconds = 45

[watcher]
port = 8420

[api]
default_days = 14

[test_gate]
enabled = true
test_command = "npm test"
pass_file_max_age_seconds = 300

[notifications]
enable = true
hook_awaiting_input = true
hook_tool_failure = true
long_running_threshold_seconds = 120
# Enable educational notifications to learn about hooks
hook_session_start = true
hook_pre_tool_use = true
hook_stop = true

# Hook enhancements for power users
[hook_enhancements.context_injection]
inject_git_context = true
inject_project_context = true

[hook_enhancements.token_tracking]
enabled = true
cost_warning_threshold_usd = 10.0

[hook_enhancements.input_modification]
enabled = true
enforce_commit_format = true
commit_message_prefix = "feat: "
```

## Environment Variables

These environment variables can override configuration:

| Variable | Description |
|----------|-------------|
| `AGENTWATCH_CONFIG` | Path to config file |
| `AGENTWATCH_PORT` | Override watcher port |
| `AGENTWATCH_HOST` | Override watcher host |

## File Locations

| File | Purpose |
|------|---------|
| `~/.config/agentwatch/config.toml` | Main configuration (includes UI prefs, sharing settings) |
| `~/.config/agentwatch/watcher.toml` | Watcher-specific config (optional, takes precedence) |
| `~/.config/agentwatch/ignore_repos.txt` | Repos to ignore |
| `~/.agentwatch/events.jsonl` | Master event log |
| `~/.agentwatch/watcher.pid` | Watcher PID file |
| `~/.agentwatch/logs/` | Watcher logs |
| `~/.agentwatch/sessions/` | Managed session data |
| `~/.agentwatch/hooks/` | Hook event data |
| `~/.agentwatch/transcripts/index.json` | Transcript discovery index |
| `~/.agentwatch/test-pass` | Test gate timestamp |

For a complete file reference, see [Data Sources](data-sources.md#complete-file-reference).

## External Resources

- [Claude Code Settings](https://docs.anthropic.com/en/docs/claude-code/settings) - Claude Code configuration reference
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) - How hooks work
- [TOML Specification](https://toml.io/) - Configuration file format

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| Update for watcher/analyzer | 2026-01-06 | Claude | Updated daemon→watcher references |
| AI review vs external docs | 2025-12-31 | Claude | Verified against Claude Code docs; config options current |
| Added ui/sharing sections | 2026-01-02 | Claude | UI prefs moved from localStorage to config.toml |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
