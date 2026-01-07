# AgentWatch Status & Roadmap

> Single source of truth for project status. Last updated: 2026-01-06

## Package Structure

```
packages/
├── core/           # Shared types, EventBus, audit logging, sanitization
├── monitor/        # DataStore, HookStore, process/repo/port scanners
├── shared-api/     # Dict converters (camelCase ↔ snake_case)
├── watcher/        # Real-time daemon (port 8420)
├── analyzer/       # On-demand analysis (port 8421)
├── cli/            # CLI commands (aw watcher, aw analyze, etc.)
├── tui/            # Terminal UI (Ink/React)
├── pre-share/      # Sanitization library
├── transcript-parser/  # Transcript discovery and parsing
└── daemon/         # [LEGACY] Combined server, deprecated
web/                # React dashboard (Vite)
pages/              # Static site (Astro)
```

**Build order:** core → pre-share, transcript-parser, monitor, shared-api → watcher, analyzer → cli, tui

## Storage Reference

```
~/.agentwatch/
├── events.jsonl           # Unified audit log (all EventBus events)
├── hooks/
│   ├── sessions_*.jsonl   # Hook session lifecycle
│   ├── tool_usages_*.jsonl # Tool invocations
│   ├── commits.jsonl      # Git commits from sessions
│   └── stats.json         # Aggregated statistics
├── processes/
│   ├── snapshots_*.jsonl  # Process state snapshots
│   └── events_*.jsonl     # Process start/end events
├── enrichments/store.json # Quality scores, auto-tags
├── annotations.json       # User feedback/ratings
├── transcripts/index.json # Durable transcript index
└── sessions/              # Managed sessions (aw run)

~/.config/agentwatch/
└── config.toml            # Projects, settings, preferences
```

---

## Recently Completed: Unified Event Stream

### Problem (Solved)
Previously 10+ separate event systems with inconsistent logging. Now unified via EventBus:

| Source | WebSocket? | Persists? | EventBus? |
|--------|------------|-----------|-----------|
| Process Scanner | Yes | Yes | ✅ Yes |
| Repo Scanner | Yes | No | ⏳ Pending (high-frequency) |
| Port Scanner | Yes | Yes | ✅ Yes |
| Hook Sessions | Yes | Yes | ✅ Yes |
| Tool Usage | Yes | Yes | ✅ Yes |
| Managed Sessions | Yes | Yes | ✅ Yes |
| Agent Metadata | No | Yes | Pending |
| Conversation Metadata | No | Yes | Pending |
| Enrichments | No | Yes | Partial |
| Annotations | No | Yes | Pending |

### Solution: EventBus

Single write path that fans out to audit log + WebSocket + memory buffer:

```
┌─────────────────────────────────────────┐
│  EventBus.emit(category, action, ...)   │
└─────────────────────────────────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
events.jsonl  WebSocket  Activity Feed
(persistent)  (realtime) (in-memory)
```

### Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| A1. STATUS.md | ✅ Done | Consolidate docs (this file) |
| A2. PRINCIPLES.md | ✅ Done | Extract design principles |
| A3. API Reference | Pending | Document all 75 endpoints |
| A4. Archive old docs | ✅ Done | Clean up internal/ |
| B1. EventBus | ✅ Done | Core infrastructure in `packages/core/src/events/` |
| B2. Watcher integration | ✅ Done | EventBus in server lifecycle, /api/events/* endpoints |
| B3. Event logging | ✅ Done | Agents, ports, sessions, hooks, tools emit events |
| B4. Activity Feed | ✅ Done | Category/action filtering, unified event stream |

### Decisions Made
- **Event granularity**: Significant changes only (not every CPU tick)
- **WebSocket migration**: Dual broadcast during transition (backwards compatible)
- **Historical retention**: Keep all events, add rotation later

---

## Feature Checklist

### Watcher (port 8420)

| Feature | Status | Notes |
|---------|--------|-------|
| Process scanning | ✅ | Claude, Codex, Cursor, Gemini detection |
| Repo status | ✅ | Branch, dirty, staged, unstaged, untracked |
| Port scanning | ✅ | Protocol detection, agent correlation |
| Hook capture | ✅ | All 8 hook types supported |
| WebSocket updates | ✅ | Real-time broadcasts |
| Agent control | ✅ | Kill, signal; input/output stubbed |
| Claude settings API | ✅ | GET/PUT/PATCH |
| Sandbox presets | ✅ | Status, presets, apply, current |
| Managed sessions | ✅ | `aw run` tracking |
| Predictions | ✅ | Create, list, calibration |
| Agent metadata | ✅ | Naming, notes |
| Conversation metadata | ✅ | Naming |
| Projects config | ✅ | TOML persistence |
| Notifications | ⚠️ Partial | macOS only, config toggle |

### Analyzer (port 8421)

| Feature | Status | Notes |
|---------|--------|-------|
| Transcript discovery | ✅ | Claude, Codex, Gemini, OpenCode |
| Enrichments | ✅ | Quality scores, auto-tags, loops |
| Analytics | ✅ | Overview, daily, quality, by-project |
| Annotations | ✅ | Feedback, tags, notes |
| Projects | ✅ | CRUD, auto-link by cwd |
| Heartbeat lifecycle | ✅ | Browser-triggered |
| Share/export | ⚠️ Stub | Endpoints exist, not wired |
| HuggingFace upload | ⚠️ Stub | Logic in daemon, not in analyzer |
| Rich analytics | ⚠️ Missing | Success trends, cost breakdown, loops |

### Web UI

| Feature | Status | Notes |
|---------|--------|-------|
| Watcher app | ✅ | Agents, Repos, Ports, Activity, Settings |
| Analyzer app | ✅ | Conversations, Analytics, Projects, Share |
| Keyboard nav | ⚠️ Partial | Tabs 1-6, no vim keys |
| Self-documenting | ⚠️ Partial | SelfDocumentingSection component exists |
| Activity Feed | ✅ | Category/action filtering, unified EventBus stream |

### CLI

| Command | Status | Notes |
|---------|--------|-------|
| `aw watcher start/stop/status` | ✅ | |
| `aw analyze` | ✅ | Opens browser |
| `aw analyze --headless` | ✅ | No browser |
| `aw run` | ✅ | Track prompts |
| `aw sessions` | ✅ | List sessions |
| `aw hooks install/status` | ✅ | |
| `aw daemon *` | ⚠️ Legacy | Deprecated |

---

## Implementation Roadmap

### Phase 1: Watcher Gaps (High Priority)
- [ ] Agent I/O for wrapped mode (`/input`, `/output`)
- [ ] Config editing (`PATCH /api/config`)
- [ ] Claude MCP/reference endpoints
- [ ] Sandbox levels/commands

### Phase 2: Analyzer Core (High Priority)
- [ ] `POST /api/enrichments/analyze-transcript`
- [ ] Rich analytics (success trends, cost, retries, loops)
- [ ] Annotation stats/heuristics
- [ ] Persisted conversation metadata

### Phase 3: Sharing Pipeline (Medium Priority)
- [ ] Contrib endpoints
- [ ] Export endpoints
- [ ] HuggingFace/Gist share APIs
- [ ] Privacy flags

### Phase 4: Advanced Features (Low Priority)
- [ ] Remaining EventBus integrations (metadata, annotations)
- [ ] Command center run endpoints
- [ ] Test gate
- [ ] Rules engine
- [ ] Cost limits
- [ ] Cross-platform notifications (Linux, Windows)

---

## Test Coverage

| Package | Tests | Notes |
|---------|-------|-------|
| daemon | 225+ | API, rules, enrichments, correlation |
| monitor | 400+ | HookStore, DataStore, scanners |
| pre-share | 137+ | Sanitization, patterns |
| core | 30+ | Transcript parsing, cost estimation |
| watcher | 42 | API endpoints, hook handlers |
| analyzer | 18 | API endpoints, enrichments |
| transcript-parser | 19 | Discovery, parsing |
| **Total** | **800+** | |

---

## Known Issues

### Data Model
- Repo scanner events not yet in EventBus (too high frequency)
- Agent/conversation metadata changes not yet in EventBus
- Annotation changes not yet in EventBus

### UI
- Some monolithic components need splitting
- Self-documenting registry incomplete

### CLI
- `aw run` wrapping doesn't capture stdin/stdout
- tmux integration incomplete

---

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/events/event-bus.ts` | Unified event stream |
| `packages/core/src/audit/audit-log.ts` | Persistent audit logging |
| `packages/watcher/src/server.ts` | Watcher lifecycle, scanner setup |
| `packages/watcher/src/api.ts` | Route registration |
| `packages/watcher/src/routes/hooks.ts` | Hook event handlers |
| `packages/monitor/src/hook-store.ts` | Hook session/tool tracking |
| `packages/monitor/src/store.ts` | In-memory data store |
| `packages/analyzer/src/enrichments/` | Quality scoring, auto-tagging |
| `web/src/hooks/useWebSocket.ts` | WebSocket + unified events |
| `web/src/components/ActivityFeedPane.tsx` | Activity Feed UI |

---

## Document History

| Date | Change |
|------|--------|
| 2026-01-06 | Created from roadmap-todos + checklist consolidation |
| 2026-01-06 | Added unified event stream plan |
| 2026-01-06 | Completed EventBus implementation + Activity Feed redesign |
