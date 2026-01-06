# Data Contribution Guide

> **Your coding agent sessions can help improve AI for everyone.**

This guide explains how to share your coding agent transcripts with researchers while protecting your privacy.

## Quick Start

1. Open AgentWatch web UI → **Share** tab
2. Select sessions to share
3. Choose a research profile (Tool Usage recommended)
4. Preview the redacted output
5. Download or upload to HuggingFace

**Time required:** 5-10 minutes for first contribution

---

## Why Contribute?

AI coding agents (Claude Code, Codex, Gemini CLI) are increasingly used by developers. Contributing usage data helps researchers:

| Research Goal | How Your Data Helps |
|---------------|---------------------|
| **Improve reliability** | Identify common failure modes and tool errors |
| **Reduce costs** | Optimize token usage and caching strategies |
| **Better UX** | Understand conversation patterns and task flows |
| **Safer agents** | Study when agents make mistakes or need guardrails |
| **Benchmarking** | Create realistic evaluation datasets |

Your contribution joins a growing community of developers who believe open research benefits everyone.

---

## What You Can Share

AgentWatch can share data from two sources:

### 1. Hook Sessions (Real-time Monitoring)
If you have hooks installed (`aw hooks install`), AgentWatch captures:
- Tool calls (name, timing, success/failure)
- Session duration and token usage
- Permission requests

**Storage:** `~/.agentwatch/hooks/`

### 2. Transcript Files (Read-Only)
AI agents write their own transcript files. AgentWatch can read (never modify) these:
- Full conversation messages
- Model responses and reasoning
- File operations and code changes

| Agent | Transcript Location |
|-------|---------------------|
| Claude Code | `~/.claude/projects/*/*.jsonl` |
| Codex CLI | `~/.codex/sessions/*/*/*.jsonl` |
| Gemini CLI | `~/.gemini/tmp/*/chats/*.json` |

---

## Audit Your Transcripts First

**Important:** Transcripts contain everything Claude saw, including file contents. Before sharing, understand what's in them.

### What's Stored in Transcripts

| Content | Stored? | Example |
|---------|---------|---------|
| Your prompts | Yes | "Fix the login bug" |
| Claude's responses | Yes | Full reasoning and code |
| Files Claude read | **Yes - full contents** | If Claude ran `Read .env`, those secrets are stored |
| Command outputs | Yes | `git diff`, `npm test` results |
| Web fetches | Yes | Full page content |

### Quick Audit Scripts

Run these from your terminal to see what's in your transcripts:

```bash
# List all files Claude has read (Claude Code)
grep -rh '"name":"Read"' ~/.claude/projects/ 2>/dev/null | \
  grep -o '"file_path":"[^"]*"' | sort -u | head -20

# Find potentially sensitive file reads
grep -rE '\.(env|pem|key|secret|credentials|password)' \
  ~/.claude/projects/ --include="*.jsonl" 2>/dev/null

# Count total file operations per project
for dir in ~/.claude/projects/*/; do
  count=$(grep -c '"name":"Read"\|"name":"Write"\|"name":"Edit"' "$dir"/*.jsonl 2>/dev/null | \
    awk -F: '{sum+=$2} END {print sum}')
  echo "$count files - $(basename "$dir")"
done | sort -rn | head -10

# Search for a specific pattern in all transcripts
grep -r "YOUR_PATTERN" ~/.claude/projects/ --include="*.jsonl"

# List unique domains from web fetches
grep -rh '"name":"WebFetch"' ~/.claude/projects/ 2>/dev/null | \
  grep -oE 'https?://[^"]+' | cut -d/ -f3 | sort -u
```

### What to Look For

Before sharing Full Transcript profiles, search for:

- **Your name, email, company** — `grep -ri "yourname\|your@email" ~/.claude/projects/`
- **API keys you use** — `grep -ri "sk-\|ghp_\|api_key" ~/.claude/projects/`
- **Client/project names** — Search for names you wouldn't want public
- **Sensitive file paths** — `.env`, `.ssh`, `credentials`, `secrets`

### Hooks Data is Safer

Hook sessions (from `aw hooks install`) only capture:
- Tool names and timing
- Success/failure status
- Session metadata

They **never** capture file contents, command outputs, or message text. The "Tool Usage Patterns" profile uses only hooks data.

---

## Privacy Protection

### Automatic Redaction

Before sharing, AgentWatch automatically removes or masks:

| Category | Examples | Replacement |
|----------|----------|-------------|
| **API Keys** | `sk-1234...`, `ghp_abc...` | `<API_KEY_1>` |
| **Secrets** | Tokens, passwords, private keys | `<SECRET_1>` |
| **PII** | Emails, phone numbers, names | `<EMAIL_1>`, `<NAME_1>` |
| **Paths** | `/Users/yourname/code` | `/Users/[REDACTED]/code` |
| **High Entropy** | UUIDs, hashes, random strings | `<RANDOM_1>` |

### Field Stripping

Beyond redaction, you can strip entire fields:
- Working directory paths
- File contents
- Full message text
- Tool input/output details

### Preview Before Sharing

The Share tab shows exactly what will be shared:
- **Chat View**: Conversation with redactions highlighted
- **Raw View**: Full JSON output
- Toggle between **Original** and **Redacted** to compare

---

## Research Profiles

Profiles define what data to share based on what research you want to enable.

### Tool Usage Patterns ⭐ Recommended

**Sensitivity:** Lowest | **Best for:** First-time contributors

Shares: Tool names, success rates, durations, session timestamps

Enables research on:
- Which tools do agents use most?
- What's the failure rate for different operations?
- How long do typical operations take?

**Strips:** All code, prompts, responses, file paths

### Workflow & Efficiency

**Sensitivity:** Low

Shares: Above + message ordering, turn counts, model info

Enables research on:
- How do agents structure multi-step tasks?
- What's the typical conversation flow?
- How do agents recover from errors?

**Strips:** Code, prompts, responses, file paths

### Token Economics

**Sensitivity:** Medium

Shares: Above + detailed token counts, cost estimates

Enables research on:
- What do different operations cost?
- What's the input/output token ratio by task?
- How do models compare on efficiency?

**Strips:** Code, prompts, responses, file paths

### Full Transcript ⚠️ Requires Review

**Sensitivity:** High | **Manual review strongly recommended**

Shares: Complete conversation including code and prompts

Enables research on:
- How do agents reason through problems?
- What prompting patterns work best?
- How do agents use file context?

**Strips:** Only secrets, PII (detected automatically)

---

## Step-by-Step Guide

### 1. Select Sessions

1. Go to the **Share** tab
2. Use filters to find sessions:
   - **Has Transcript** / **Has Hooks** / **Matched** (both)
   - Agent type (Claude, Codex, Gemini)
   - Date range
3. Check boxes to select sessions
4. Tip: Sort by "Smallest first" for quick testing

### 2. Configure Privacy

1. Choose a **Research Profile** (Tool Usage recommended)
2. Review the field tree:
   - Green = shared
   - Gray = stripped
3. Toggle additional redaction options if needed

### 3. Preview Output

1. Click through selected sessions (1/N navigation)
2. Toggle **Original** ↔ **Redacted** to see changes
3. Check the stats: redaction count, fields stripped

### 4. Export

**Download Bundle:**
- Creates a JSONL file in your Downloads folder
- Review locally before uploading anywhere

**Upload to HuggingFace:**
1. Click "Connect to HuggingFace"
2. Authenticate (CLI login, OAuth, or paste token)
3. Enter target dataset repository
4. Choose: Direct commit or Pull Request
5. Click Upload

---

## Artifact Linking

Link your sessions to the outcomes they produced:

| Artifact Type | Example |
|---------------|---------|
| GitHub PR | `github.com/owner/repo/pull/123` |
| GitHub Commit | `github.com/owner/repo/commit/abc123` |
| GitHub Repo | `github.com/owner/repo` |
| File | Local or remote file path |

This enables research connecting agent behavior to real-world outcomes.

---

## Licensing & Consent

When you contribute, you choose:

**License:**
- CC-BY-4.0 (Attribution) - Recommended
- CC0 (Public Domain)
- Custom terms

**AI Training Preference:**
- Allow AI training
- Research only
- No preference

These preferences are included in your contribution metadata.

---

## Bundle Format

Contributions are packaged as JSONL bundles:

```jsonl
{
  "schema_version": "donated_coding_agent_transcripts.v0",
  "bundle_id": "20260103_contributor_abc123",
  "source": "claude",
  "source_mtime_utc": "2026-01-03T10:30:00Z",
  "contributor": {
    "contributor_id": "github:username",
    "license": "CC-BY-4.0",
    "ai_use_preference": "train-genai=yes"
  },
  "data": { ... }  // Redacted session data
}
```

Each line is one session, ready for research use.

---

## FAQ

### Is my data sent anywhere automatically?
No. AgentWatch never uploads data without your explicit action. The daemon runs locally, and all processing happens on your machine.

### Can I undo a contribution?
After uploading to HuggingFace, you control your repository. You can delete files or close PRs. For datasets you don't own, contact the maintainer.

### What if the automatic redaction misses something?
Always preview before sharing. If you spot sensitive data, either:
- Use a more restrictive profile
- Manually exclude that session
- Report it as a bug so we can improve detection

### How do I know my contribution was useful?
Check the dataset's statistics and any research using the data. Some researchers acknowledge contributors in their papers.

### Can I contribute without HuggingFace?
Yes. Download bundles locally and share however you prefer (email, cloud storage, etc.).

### What about proprietary code?
Consider these factors:
- **Tool Usage profile**: Shares no code at all
- **Full Transcript profile**: Shares code, but with redacted secrets
- If your code is proprietary, use Tool Usage or Workflow profiles

### How often should I contribute?
That's up to you. Some contributors share weekly, others monthly. More regular contributions create better longitudinal datasets.

---

## Troubleshooting

### "No sessions found"
- Ensure the watcher is running: `aw watcher status`
- Check hooks are installed: `aw hooks status`
- Enable "Scan local transcripts" in settings

### HuggingFace upload fails
- Verify your token has write permissions
- Check the dataset repository exists
- Try direct commit if PR creation fails

### Redaction seems incomplete
- Report as a bug with (redacted) examples
- Use a more restrictive profile as a workaround
- Check for custom patterns you need to add

---

## Security Considerations

For maximum safety:

1. **Run agents in sandboxed environments** - Less sensitive data in logs
2. **Use project-specific directories** - Not home or root
3. **Avoid exporting secrets in shell** - `export API_KEY=...`
4. **Review before sharing Full Transcript** - Always check the preview

See [Security Guide](security.md) for detailed recommendations.

---

## Research Community

Contributed data supports:
- Academic research on AI agents
- Open-source agent development
- Public benchmarking and evaluation
- Safety and alignment research

By contributing, you're helping build the foundation for better, safer AI tools.

---

*Last updated: 2026-01-03*
