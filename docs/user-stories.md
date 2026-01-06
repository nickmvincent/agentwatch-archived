# I want to...

Quick reference for common tasks. Each links to the relevant documentation.

## Monitoring

| I want to... | How |
|--------------|-----|
| See all running agents | Open **Agents** tab in web UI |
| Control/interrupt an agent | Click agent → use control buttons (or TUI: `i`, `s`, `x`) |
| Get notified when Claude needs input | Enable in [Configuration](configuration.md#notifications) |
| See what tools Claude is using | Open **Claude Code Hooks** tab |
| Track my API costs | **Analytics** tab or **Review/Share** → Cost section |

## Security

| I want to... | How |
|--------------|-----|
| Block dangerous commands | Add deny rules in `~/.claude/settings.json` ([Permission Syntax](permission-syntax.md)) |
| Require tests pass before commits | Enable Test Gate in Settings or `aw security enable` |
| Run Claude in complete isolation | [Docker Sandbox](docker-sandbox.md) |
| Detect when Claude is stuck in a loop | Check **Conversations** tab for loop detection warnings |

## Repository & Environment

| I want to... | How |
|--------------|-----|
| Find repos with uncommitted changes | **Repos** tab in web UI |
| See what ports are being used | **Ports** tab in web UI |
| Track a specific project | Add to `[[projects.projects]]` in config or Settings → Projects |

## Data Contribution

| I want to... | How |
|--------------|-----|
| Share a session safely | **Review/Share** tab → select sessions → choose profile → export |
| Understand what data is collected | [Data Sources](data-sources.md) |
| Rate a session good/bad | **Conversations** tab → click session → feedback buttons |
| Export to HuggingFace | **Review/Share** → Connect to HuggingFace → Upload |

## Quick Commands

```bash
aw watcher start         # Start real-time monitoring
aw analyze               # Open analyzer dashboard
aw hooks install         # Install Claude Code hooks
aw run "prompt"          # Launch tracked agent session
aw sessions              # List recent sessions
aw security enable       # Enable Test Gate
```

See [CLI Reference](cli-reference.md) for all commands.
