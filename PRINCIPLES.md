# AgentWatch Design Principles

Core principles guiding development decisions.

## Transparency First

The UI should always tell users where data is stored. Every pane that manages persistent data should show the storage location. Users should never wonder "where does this go?" - make it self-documenting.

**In practice:**
- Storage paths shown in UI headers
- SelfDocumentingSection component wraps data panes
- Tooltips explain what each field means
- API endpoints document their data sources

## Local-First

All data stays on the user's machine by default. No external services required for core functionality.

**In practice:**
- All storage under `~/.agentwatch/` and `~/.config/agentwatch/`
- No cloud accounts needed for monitoring or analysis
- Sharing is opt-in with explicit user action
- External uploads require confirmation

## Plain Text Where Possible

Prefer human-readable formats (TOML, JSON, JSONL) over binary formats so users can inspect and edit their data directly.

**In practice:**
- Config in TOML (human-readable)
- Logs in JSONL (append-only, grep-able)
- State in JSON (editable)
- No SQLite or binary blobs

## Event-Driven Architecture

All significant operations emit events to a unified stream. This enables:
- Audit trails for debugging
- Real-time UI updates
- Historical queries
- Activity filtering

**In practice:**
- EventBus as single write path
- All events go to `events.jsonl` + WebSocket + memory
- Activity Feed is a filtered view into the event stream
- No separate event systems per module

## Separation of Concerns

Monitoring and analysis are distinct responsibilities with different lifecycles.

**In practice:**
- **Watcher**: Always-on, lightweight, real-time
- **Analyzer**: On-demand, heavier, batch processing
- Shared data contract via filesystem
- Independent deployment and scaling

## Progressive Disclosure

Simple things should be simple. Advanced features shouldn't clutter the basic experience.

**In practice:**
- Quick settings for common toggles
- Raw config for power users
- Collapsible advanced sections
- Keyboard shortcuts for experts
