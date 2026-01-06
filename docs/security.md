# Security Guide

AI coding agents can execute commands on your computer. This guide explains the risks, how to mitigate them, and how good security practices enable safer data sharing.

> **New to these terms?** See the [Glossary](glossary.md) for definitions.

## What Makes AI Agents Different

Unlike chat-based AI where you copy-paste suggestions, coding agents can:

- **Execute shell commands** directly on your machine
- **Read and write files** anywhere they have access
- **Make network requests** to external services
- **Interact with git** (commit, push, etc.)
- **Install packages** and run arbitrary code

This power makes them useful—but also introduces risks that don't exist with regular chatbots.

## Threat Categories

### 1. Accidental Damage

The AI might misunderstand your intent and:

| Threat | Example | Mitigation |
|--------|---------|------------|
| Delete important files | `rm -rf` with wrong path | Deny rules, sandbox |
| Overwrite config files | Writing to `.env` or `.ssh` | Deny rules for sensitive paths |
| Break your codebase | Bad refactoring | Git commits, Test Gate |
| Install wrong packages | Version conflicts | Review before running |

**This is the most common risk.** The AI is trying to help but makes mistakes.

### 2. Malicious Code Execution

When working with untrusted code (dependencies, cloned repos), the AI might:

| Threat | Example | Mitigation |
|--------|---------|------------|
| Run malicious scripts | `npm install` triggers postinstall | Container isolation |
| Execute obfuscated code | Hidden in minified files | Review before execution |
| Pipe to shell | `curl ... \| sh` | Deny rules |

**This is why isolation matters for untrusted projects.**

### 3. Data Exfiltration

Sensitive data on your machine could be exposed:

| Threat | Example | Mitigation |
|--------|---------|------------|
| API keys in requests | Reading `.env` and using keys | Deny read of sensitive files |
| Credentials in commits | Accidentally committing secrets | Pre-commit hooks |
| Data in tool calls | Sending file contents to APIs | Network restrictions |

### 4. Code Quality Issues

Beyond security, there are workflow risks:

| Threat | Example | Mitigation |
|--------|---------|------------|
| Committing broken code | Tests fail after commit | **Test Gate** |
| Force pushing | Overwrites team's work | Deny `git push --force` |
| Wrong branch operations | Committing to main | Branch protection |

---

## Mitigation Layers

Different mitigations address different threats:

```
┌─────────────────────────────────────────────────────────────────┐
│  ISOLATION (Protects your machine from the agent)               │
│  ├─ Container (Docker) - Strong isolation, some overhead        │
│  ├─ macOS Sandbox - Moderate isolation, built-in                │
│  └─ Remote VPS - Maximum isolation, most overhead               │
├─────────────────────────────────────────────────────────────────┤
│  ACCESS CONTROL (Limits what the agent can do)                  │
│  ├─ Deny rules - Block specific dangerous patterns              │
│  ├─ Allow rules - Auto-approve known-safe patterns              │
│  └─ Prompt mode - Ask for approval on everything else           │
├─────────────────────────────────────────────────────────────────┤
│  WORKFLOW GATES (Code quality, not security)                    │
│  └─ Test Gate - Block commits until tests pass                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Isolation Levels

Choose the right protection level based on your trust level and use case.

### No Isolation (Permission Rules Only)

**Protection:** Access control only
**Best For:** Trusted projects on your own machine

Permission rules in `~/.claude/settings.json` control what Claude can do, but there's no OS-level isolation.

| Pros | Cons |
|------|------|
| Zero setup required | No isolation if rules misconfigured |
| No performance impact | Relies on correct pattern matching |
| Works everywhere | Rules can be complex to get right |

### macOS Sandbox

**Protection:** OS-level filesystem and network restrictions
**Best For:** Daily development work

Claude Code's built-in sandbox mode uses macOS's security sandbox to restrict access.

| Pros | Cons |
|------|------|
| Built into Claude Code | macOS only |
| Good security/usability balance | Some operations need exceptions |
| Network allowlist prevents exfiltration | Less isolation than containers |

**Configuration:**
```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowedDomains": ["registry.npmjs.org", "github.com", "api.anthropic.com"],
      "allowLocalBinding": true
    }
  }
}
```

### Docker Container

**Protection:** Complete process and filesystem isolation
**Best For:** Untrusted code, CI/CD, shared machines

Runs Claude Code inside a Docker container with controlled mounts.

| Pros | Cons |
|------|------|
| Complete isolation | Requires Docker |
| Works on Linux/macOS/Windows | Startup overhead |
| Reproducible environment | Some tools may not work |
| Network fully controllable | File sync can be slower |

See [Docker Sandbox Guide](docker-sandbox.md) for detailed setup.

### Remote VPS

**Protection:** Complete machine isolation
**Best For:** Highly sensitive work, untrusted code review

Run Claude Code on a separate machine entirely.

| Pros | Cons |
|------|------|
| Maximum isolation | Requires cloud account |
| Easy to destroy/recreate | Network latency |
| No risk to local machine | Setup complexity |
| Great for CI/CD | Cost for compute |

### Comparison

| Level | Machine Protection | Setup | Overhead | Best For |
|-------|-------------------|-------|----------|----------|
| **None** | Rules only | None | None | Trusted projects |
| **macOS Sandbox** | Moderate | Low | Low | Daily work |
| **Docker** | Strong | Medium | Medium | Untrusted code |
| **Remote VPS** | Maximum | High | High | Highly sensitive |

---

## Access Control (Claude Code Permissions)

Configure in `~/.claude/settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Bash(rm -rf /*)",
      "Bash(*|sh)",
      "Write(.env*)",
      "Write(~/.ssh/*)"
    ],
    "allow": [
      "Read",
      "Bash(git:*)",
      "Bash(npm test:*)"
    ]
  }
}
```

**Priority order:** deny (highest) → ask → allow (lowest)

**Learn more:** [Claude Code Permissions](https://docs.anthropic.com/en/docs/claude-code/permissions), [Permission Syntax Reference](permission-syntax.md)

---

## Workflow Gates (Test Gate)

**Purpose:** Ensure code quality, not machine security.

**Status:** Legacy daemon-only. Watcher/analyzer do not expose Test Gate yet.

```toml
# ~/.config/agentwatch/config.toml
[test_gate]
enabled = true
test_command = "npm test"
pass_file_max_age_seconds = 300
```

When enabled:
1. Running your test command writes a "pass file"
2. `git commit` is blocked unless tests passed recently
3. This prevents committing broken code

**This doesn't protect your machine**—it protects your codebase.

---

## Security Enables Easier Sharing

There's a powerful coupling between **responsible tool use** and **data sharing**:

```
Good sandboxing → Cleaner logs → Easier sharing
```

When your coding agent operates in a well-isolated environment:
- Less sensitive context leaks into logs
- Sanitization becomes simpler
- You can share more freely with less manual review

### Without Sandboxing

When an agent runs with full access to your filesystem:
- Logs may contain paths to sensitive directories
- File contents from anywhere on your system might appear in tool outputs
- Environment variables, credentials, and config files are exposed
- More aggressive redaction is needed before sharing

### With Sandboxing

When an agent runs in a sandboxed environment:
- Only project-relevant paths appear in logs
- Tool outputs are limited to the working directory
- No access to credentials outside the sandbox
- Less sensitive data means simpler sanitization

### Checklist for Easy Sharing

Before contributing agent logs, verify:

- [ ] Agent ran in a sandboxed environment
- [ ] Working directory was project-specific (not `~` or `/`)
- [ ] No API keys or tokens were exported in the shell
- [ ] No sensitive files were in accessible locations
- [ ] You've reviewed the sanitization preview

---

## Recommended Configurations

### Personal Projects (Trusted)

```json
{
  "permissions": {
    "allow": ["Read", "Bash(git:*)", "Bash(npm:*)", "Bash(bun:*)"],
    "deny": ["Bash(rm -rf /*)"]
  }
}
```

### Work Projects

```json
{
  "permissions": {
    "allow": ["Read", "Glob", "Grep"],
    "deny": [
      "Bash(rm -rf /*)",
      "Bash(*|sh)",
      "Write(.env*)",
      "Bash(git push --force*)"
    ]
  }
}
```

Plus enable Test Gate for code quality.

### Untrusted Code

Use Docker container:
```bash
agentwatch sandbox install
claude-sandboxed
```

Or remote VPS for maximum isolation.

---

## Quick Reference

| I want to... | Use |
|--------------|-----|
| Block dangerous commands | Deny rules in settings.json |
| Auto-approve safe commands | Allow rules in settings.json |
| Prevent broken commits | Test Gate |
| Isolate from my filesystem | macOS Sandbox |
| Full isolation for untrusted code | Docker container |
| Maximum security | Remote VPS |

## See Also

- [Permission Syntax Reference](permission-syntax.md) — Pattern matching details
- [Docker Sandbox Guide](docker-sandbox.md) — Container setup
- [Configuration Reference](configuration.md) — Full config options
- [Claude Code Permissions](https://docs.anthropic.com/en/docs/claude-code/permissions) — Official docs
- [Claude Code Security](https://docs.anthropic.com/en/docs/claude-code/security) — Official security docs

<details>
<summary><strong>Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| Consolidated from security-overview, security-levels, security-and-sharing | 2026-01-02 | Claude | Combined three docs; no information lost |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
