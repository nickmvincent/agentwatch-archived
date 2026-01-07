# AgentWatch Status & Roadmap

> Single source of truth for project status. Last updated: 2026-01-06

## Architecture

AgentWatch uses a **two-server architecture**:

| Server | Port | Lifecycle | Purpose |
|--------|------|-----------|---------|
| **Watcher** | 8420 | Always-on daemon | Real-time monitoring (agents, repos, ports, hooks) |
| **Analyzer** | 8421 | Browser-triggered | On-demand analysis (transcripts, enrichments, sharing) |

```
Claude Code Hooks → Watcher API → WebSocket → Web UI
Process Scanner  ↗
Repo Scanner    ↗
Port Scanner   ↗
```

**Data contract:**
```
~/.agentwatch/
├── events.jsonl        # Unified audit log (all events)
├── hooks/              # Hook sessions, tool usages, commits
├── processes/          # Process snapshots and events
├── enrichments/        # Quality scores, auto-tags
├── annotations.json    # User feedback
└── sessions/           # Managed sessions (aw run)

~/.config/agentwatch/
└── config.toml         # Projects, settings
```

See [CLAUDE.md](./CLAUDE.md) for full architecture details.

---

## Current Sprint: Unified Event Stream

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
| B4. Activity Feed | Pending | Add filtering UI, use unified event stream |

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
| Activity Feed | ⚠️ Limited | No filtering, no historical query |

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
- [ ] Audit logging everywhere (unified event stream)
- [ ] Command center run endpoints
- [ ] Test gate
- [ ] Rules engine
- [ ] Cost limits
- [ ] Notifications management

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
- Activity Feed is in-memory only (lost on refresh)
- Events scattered across 10+ systems
- Audit log underutilized (only 3 modules log)

### UI
- No filtering in Activity Feed
- No historical event query
- Some monolithic components need splitting

### CLI
- `aw run` wrapping doesn't capture stdin/stdout
- tmux integration incomplete

---

## Files to Know

| File | Purpose |
|------|---------|
| `packages/watcher/src/server.ts` | Watcher lifecycle |
| `packages/watcher/src/api.ts` | Route registration |
| `packages/monitor/src/hook-store.ts` | Hook session tracking |
| `packages/monitor/src/store.ts` | In-memory data store |
| `packages/core/src/audit/audit-log.ts` | Audit logging |
| `web/src/hooks/useWebSocket.ts` | WebSocket + Activity Feed |
| `web/src/components/ActivityFeedPane.tsx` | Activity UI |

---

## Document History

| Date | Change |
|------|--------|
| 2026-01-06 | Created from roadmap-todos + checklist consolidation |
| 2026-01-06 | Added unified event stream plan |
