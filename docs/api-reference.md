# API Reference

Complete reference for Agentwatch REST APIs. Agentwatch runs two servers:

| Server | Port | Purpose |
|--------|------|---------|
| **Watcher** | 8420 | Always-on daemon for real-time monitoring |
| **Analyzer** | 8421 | On-demand tool for session analysis |

> **Content-Type:** All requests and responses use `application/json`

---

## Watcher API (Port 8420)

The Watcher runs continuously in the background, monitoring AI coding agents, repositories, and ports. It also receives hook events from Claude Code.

**Base URL:** `http://localhost:8420`

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/status` | Server status (agent count, uptime) |
| POST | `/api/shutdown` | Shutdown watcher |

### Agents (Process Monitoring)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List detected agent processes |
| GET | `/api/agents/:pid` | Get agent details |
| POST | `/api/agents/:pid/kill` | Kill agent process |
| POST | `/api/agents/:pid/signal` | Send signal to agent |

### Repositories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/repos` | List git repositories with status |
| POST | `/api/repos/rescan` | Trigger immediate rescan |

### Ports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ports` | List listening ports |
| GET | `/api/ports/:port` | Get port details |

### Hook Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hooks/sessions` | List hook sessions |
| GET | `/api/hooks/sessions/:id` | Get session with tools |
| GET | `/api/hooks/sessions/:id/timeline` | Get tool timeline |
| GET | `/api/hooks/sessions/:id/commits` | Get session commits |

### Hook Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hooks/tools/stats` | Aggregated tool statistics |
| GET | `/api/hooks/tools/recent` | Recent tool usages |
| GET | `/api/hooks/stats/daily` | Daily activity statistics |
| GET | `/api/hooks/commits` | Recent git commits |

### Hook Event Handlers

These endpoints are called by Claude Code hooks (see `aw hooks install`).

| Method | Endpoint | Hook Type |
|--------|----------|-----------|
| POST | `/api/hooks/session-start` | SessionStart |
| POST | `/api/hooks/session-end` | SessionEnd |
| POST | `/api/hooks/pre-tool-use` | PreToolUse |
| POST | `/api/hooks/post-tool-use` | PostToolUse |
| POST | `/api/hooks/notification` | Notification |
| POST | `/api/hooks/permission-request` | PermissionRequest |
| POST | `/api/hooks/user-prompt-submit` | UserPromptSubmit |
| POST | `/api/hooks/stop` | Stop |
| POST | `/api/hooks/subagent-stop` | SubagentStop |
| POST | `/api/hooks/pre-compact` | PreCompact |

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get watcher configuration |
| GET | `/api/claude/settings` | Read Claude settings.json |
| PUT | `/api/claude/settings` | Replace entire settings |
| PATCH | `/api/claude/settings` | Merge settings updates |

### Sandbox (Docker)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sandbox/status` | Docker/image/script installation status |
| GET | `/api/sandbox/presets` | List permission presets |
| GET | `/api/sandbox/presets/:id` | Get specific preset |
| POST | `/api/sandbox/presets/:id/apply` | Apply preset to Claude settings |
| GET | `/api/sandbox/current` | Current sandbox configuration |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `/ws` | Real-time updates (agents, repos, ports, sessions) |

**WebSocket Message Types:**

```typescript
// Server → Client
{ type: "init", agents: [], repos: [], ports: [], sessions: [] }
{ type: "agent_update", agents: [] }
{ type: "repo_update", repos: [] }
{ type: "port_update", ports: [] }
{ type: "session_update", sessions: [] }
{ type: "tool_use", tool: { ... } }
{ type: "pong" }

// Client → Server
{ type: "ping" }
```

---

## Analyzer API (Port 8421)

The Analyzer runs on-demand when you use `aw analyze`. It reads transcript files and provides enrichments, analytics, and export features.

**Base URL:** `http://localhost:8421`

### Health & Lifecycle

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/status` | Server status with uptime |
| GET | `/api/config` | Proxy config from watcher |
| POST | `/api/heartbeat` | Browser lifecycle heartbeat |
| POST | `/api/shutdown` | Shutdown analyzer |

The analyzer uses a heartbeat-based lifecycle. When opened via `aw analyze`, it starts a server and opens your browser. The browser sends heartbeats every 10 seconds. If no heartbeat is received for 30 seconds, the server shuts down automatically.

### Transcripts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transcripts` | List local transcripts |
| GET | `/api/transcripts/stats` | Aggregate transcript statistics |
| GET | `/api/transcripts/:id` | Get transcript content |
| POST | `/api/transcripts/rescan` | Trigger index rescan |

### Enrichments

Enrichments provide auto-computed metadata for sessions (quality scores, task types, outcome signals).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/enrichments` | List all enrichments |
| GET | `/api/enrichments/:id` | Get session enrichment |
| GET | `/api/enrichments/workflow-stats` | Review workflow statistics |
| GET | `/api/enrichments/privacy-risk/:id` | Privacy risk analysis |
| POST | `/api/enrichments/:id/annotation` | Set manual annotation |
| POST | `/api/enrichments/:id/tags` | Update user tags |
| POST | `/api/enrichments/bulk` | Bulk get enrichments |
| DELETE | `/api/enrichments/:id` | Delete enrichment |

**Enrichment Response:**
```json
{
  "session_id": "abc123",
  "enrichments": {
    "auto_tags": {
      "tags": [{ "name": "bugfix", "category": "task_type", "confidence": 0.8 }],
      "task_type": "bugfix",
      "computed_at": "2025-01-01T10:00:00Z"
    },
    "quality_score": {
      "score": 0.75,
      "classification": "good",
      "signals": { ... }
    },
    "outcome_signals": {
      "success_count": 5,
      "failure_count": 1,
      "test_results": { "passed": 10, "failed": 0 }
    },
    "manual_annotation": {
      "feedback": "positive",
      "notes": "Worked great!",
      "tags": ["useful"]
    }
  }
}
```

### Annotations

Standalone annotation management (separate from enrichments).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/annotations` | List all annotations |
| GET | `/api/annotations/:id` | Get annotation |
| POST | `/api/annotations/:id` | Create/update annotation |
| DELETE | `/api/annotations/:id` | Delete annotation |

### Analytics

Aggregate statistics across sessions.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/overview` | Overview statistics |
| GET | `/api/analytics/daily` | Daily breakdown |
| GET | `/api/analytics/quality-distribution` | Quality score histogram |
| GET | `/api/analytics/by-project` | Per-project analytics |

**Overview Response:**
```json
{
  "time_range": { "start": "2024-12-25", "end": "2025-01-01", "days": 7 },
  "summary": {
    "total_sessions": 42,
    "success_rate": 0.85,
    "total_cost_usd": 12.50,
    "avg_duration_ms": 180000
  }
}
```

### Projects

Organize sessions into projects.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List projects |
| GET | `/api/projects/:id` | Get project |
| POST | `/api/projects` | Create project |
| PATCH | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |

### Share & Export

Export and contribute session data.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/share/status` | Share configuration status |
| POST | `/api/share/export` | Export selected sessions |

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Description of what went wrong"
}
```

**HTTP Status Codes:**
| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid input) |
| 404 | Resource not found |
| 500 | Server error |

---

## Examples

### Check Watcher Status

```bash
curl http://localhost:8420/api/status | jq
```

### List Active Agents

```bash
curl http://localhost:8420/api/agents | jq
```

### Get Session Timeline

```bash
curl http://localhost:8420/api/hooks/sessions/SESSION_ID/timeline | jq
```

### Check Sandbox Status

```bash
curl http://localhost:8420/api/sandbox/status | jq
```

### Apply Permission Preset

```bash
curl -X POST http://localhost:8420/api/sandbox/presets/balanced/apply
```

### Get Session Enrichments

```bash
curl http://localhost:8421/api/enrichments/SESSION_ID | jq
```

### Get Analytics Overview

```bash
curl http://localhost:8421/api/analytics/overview?days=7 | jq
```

### Export Sessions

```bash
curl -X POST http://localhost:8421/api/share/export \
  -H "Content-Type: application/json" \
  -d '{"session_ids": ["abc123", "def456"], "format": "jsonl"}'
```

---

## See Also

- [CLI Reference](cli-reference.md) — Command-line interface
- [Getting Started](getting-started.md) — Quick setup guide
- [Configuration](configuration.md) — TOML configuration options

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| Restructure for watcher/analyzer | 2026-01-06 | Claude | Split monolithic API into two servers |
| AI review vs codebase | 2025-12-31 | Claude | Created from api-enhancements.ts |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
