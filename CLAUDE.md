# Agent Instructions

General guidance for AI agents working on this codebase.

## Architecture

**Monorepo with Bun workspaces:**
- `packages/core` - Shared types, sanitization, transcript parsing
- `packages/monitor` - Data stores, process/repo/port scanners, hook store
- `packages/shared-api` - Dict converters, sanitizers for API responses
- `packages/watcher` - Real-time monitoring daemon (agents, repos, hooks)
- `packages/analyzer` - On-demand analysis server (enrichments, share)
- `packages/daemon` - Full HTTP API server (Hono), serves web UI
- `packages/cli` - CLI commands (`aw watcher`, `aw analyze`, etc.)
- `packages/tui` - Terminal UI (Ink/React)
- `packages/pre-share` - Sanitization library (browser + server)
- `packages/transcript-parser` - Transcript discovery and parsing
- `web/` - React dashboard (Vite, serves from daemon)
- `pages/` - Static site (Astro, for standalone use)

**Data flow:** Hooks/scanners → DataStore/HookStore → API → Web UI

**Architecture split (in progress):**
- Watcher: Always-on daemon for real-time monitoring (port 8420)
- Analyzer: Browser-only on-demand analysis (port 8421)
- Daemon: Full combined server (current, to be deprecated)

## Development vs Production

| Mode | Command | Source | Hot Reload | Port |
|------|---------|--------|------------|------|
| Dev | `bun run dev` | `src/*.ts` | Yes | 5173 (web) + 8420 (API) |
| Prod | `aw daemon start` | `dist/*.js` | No | 8420 |

**Dev commands:**
```bash
bun run dev              # Full stack with hot reload (use :5173)
bun run dev:debug        # Same + request logging
bun run dev:daemon       # Daemon only
bun run dev:web          # Web only (needs daemon running)
```

**Prod commands:**
```bash
# New commands (watcher + analyzer split)
aw watcher start         # Start real-time monitoring daemon
aw watcher stop/status   # Control watcher
aw analyze               # Open analyzer in browser (shuts down when browser closes)
aw analyze --headless    # Run analyzer without opening browser

# Legacy commands (full daemon)
aw daemon start          # Background
aw daemon start -f       # Foreground (see logs)
aw daemon stop/status    # Control
bun run daemon:rebuild   # Rebuild packages + restart
```

**Key:** Dev uses `src/`, prod uses `dist/`. After editing daemon code in prod mode, run `daemon:rebuild`.

## Testing

```bash
bun run test                       # Run all package tests
bun run test -- --coverage         # With coverage
bun run test:e2e                   # Run Playwright e2e tests
bun run build                      # Build all packages
cd packages/pre-share && bun test  # Test specific package
```

## Common Patterns

**API style:** Snake_case in JSON responses, camelCase in TypeScript
**File storage:** JSONL for append-only logs, JSON for state
**Data directory:** `~/.agentwatch/` (hooks/, logs/, processes/)

## Package Dependencies

Build order matters:
1. `@agentwatch/core` (no internal deps)
2. `@agentwatch/pre-share` (depends on core)
3. `@agentwatch/transcript-parser` (no internal deps)
4. `@agentwatch/monitor` (depends on core)
5. `@agentwatch/shared-api` (depends on core)
6. `@agentwatch/watcher` (depends on core, monitor, shared-api)
7. `@agentwatch/analyzer` (depends on core, monitor, shared-api, pre-share, transcript-parser)
8. `@agentwatch/daemon` (depends on monitor, core, pre-share)
9. `@agentwatch/cli`, `@agentwatch/tui` (depend on watcher, analyzer, daemon)

## Key Files

| File | Purpose |
|------|---------|
| `packages/watcher/src/server.ts` | Watcher daemon lifecycle |
| `packages/watcher/src/api.ts` | Watcher REST endpoints (agents, repos, hooks) |
| `packages/analyzer/src/server.ts` | Analyzer server (browser-only lifecycle) |
| `packages/analyzer/src/enrichments/` | Quality scoring, auto-tagging |
| `packages/shared-api/src/dict-converters.ts` | camelCase → snake_case for API |
| `packages/daemon/src/api.ts` | All REST endpoints (legacy) |
| `packages/daemon/src/server.ts` | Daemon lifecycle, scanners (legacy) |
| `packages/monitor/src/hook-store.ts` | Hook session/tool tracking |
| `packages/monitor/src/store.ts` | In-memory data store |
| `packages/core/src/sanitizer.ts` | Transcript sanitization |

## Don'ts

- Don't add features beyond what's requested
- Don't create new markdown files without asking
- Don't modify `~/.claude/settings.json` directly (use API)
- Don't add time estimates to plans

## Design Principles

**Transparency first:** The UI should always tell users where data is stored. Every pane that manages persistent data should show the storage location. Users should never wonder "where does this go?" - make it self-documenting.

**Local-first:** All data stays on the user's machine by default. No external services required for core functionality.

**Plain text where possible:** Prefer human-readable formats (TOML, JSON, JSONL) over binary formats so users can inspect and edit their data directly.

## Storage Reference

**~/.config/agentwatch/ structure:**

| Path | Format | Purpose |
|------|--------|---------|
| `config.toml` | TOML | Projects, settings, preferences |

**~/.agentwatch/ structure:**

| Path | Format | Purpose |
|------|--------|---------|
| `events.jsonl` | JSONL | Master audit log |
| `hooks/sessions_*.jsonl` | JSONL | Hook session lifecycle |
| `hooks/tool_usages_*.jsonl` | JSONL | Tool invocations |
| `hooks/commits.jsonl` | JSONL | Git commits from sessions |
| `hooks/stats.json` | JSON | Aggregated statistics |
| `processes/snapshots_*.jsonl` | JSONL | Process state snapshots |
| `processes/events_*.jsonl` | JSONL | Process start/end events |
| `transcripts/index.json` | JSON | Durable transcript index |
| `enrichments/store.json` | JSON | Quality scores, auto-tags |
| `annotations.json` | JSON | User feedback/ratings |
| `artifacts.json` | JSON | Session → artifact links (PRs, repos, commits) |

**Audit event pattern:** All significant operations log to `events.jsonl` via `logAuditEvent(category, action, entityId, description, details)`. Events automatically appear in the Audit tab. See `packages/daemon/src/audit-log.ts`.

**Transcript index:** Full scan every 24h, incremental updates every 5min. Persists at `transcripts/index.json`. See `packages/daemon/src/transcript-index.ts`.

## Status & Roadmap

See `docs/internal/roadmap-todos.md` for current status, TODOs, and known issues.
