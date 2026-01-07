# Agent Instructions

General guidance for AI agents working on this codebase.

## Architecture

**Monorepo with Bun workspaces.** Two main servers:

| Server | Port | Purpose |
|--------|------|---------|
| **Watcher** | 8420 | Always-on daemon: agents, repos, ports, hooks, WebSocket |
| **Analyzer** | 8421 | On-demand: transcripts, enrichments, analytics (browser-triggered) |

**Data flow:** Hooks/scanners → EventBus → audit log + WebSocket + memory buffer

See [STATUS.md](./STATUS.md) for package structure, key files, and current feature status.

## Commands

```bash
# Development (hot reload)
bun run dev              # Full stack (:5173 for web)
bun run test             # Run all tests
bun run build            # Build all packages

# Production
aw watcher start         # Start monitoring daemon
aw watcher stop/status   # Control daemon
aw analyze               # Open analyzer in browser
```

## Common Patterns

- **API style:** snake_case in JSON, camelCase in TypeScript
- **Storage:** JSONL for logs, JSON for state, TOML for config
- **Data dirs:** `~/.agentwatch/` (data), `~/.config/agentwatch/` (config)
- **Events:** Use `eventBus.emit({ category, action, entityId, description, details, source })`

## Don'ts

- Don't add features beyond what's requested
- Don't create new markdown files without asking
- Don't modify `~/.claude/settings.json` directly (use API)
- Don't add time estimates to plans

## Design Principles

**Transparency first:** UI should show where data is stored. Make it self-documenting.

**Local-first:** All data stays on user's machine. No external services required.

**Plain text:** Prefer human-readable formats (TOML, JSON, JSONL) over binary.

## Related Docs

- [STATUS.md](./STATUS.md) - Current status, package details, key files, roadmap
- [PRINCIPLES.md](./PRINCIPLES.md) - Design principles
- [VISION.md](./VISION.md) - Long-term vision
