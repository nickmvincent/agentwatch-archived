# Agentwatch 2.0 Checklist

Legend:
- [x] Implemented
- [~] Partial / in progress
- [ ] Missing

## Principles
- [~] Modular components across codebase (packages split, shared modules, but some UI components are still monolithic). (refs: packages/, web/src/components/)
- [~] Interfaces self-documenting with embedded transparency. (refs: web/src/components/ui/SelfDocumentingSection.tsx, web/src/components/ActivityFeedPane.tsx)
- [x] Clearly defined sections/tabs in UI. (refs: web/src/apps/watcher/App.tsx, web/src/apps/analyzer/App.tsx)
- [~] Clearly defined components within sections (no formal registry). (refs: web/src/components/)
- [ ] Tool:Section:Component naming system. (missing)
- [~] Self-documenting expandable element used everywhere. (refs: web/src/components/ui/SelfDocumentingSection.tsx)

## UI
- [~] TUI-in-the-web vibe with keyboard navigation. (refs: web/src/index.css, web/src/apps/watcher/App.tsx, web/src/apps/analyzer/App.tsx)
- [~] Keyboard shortcuts 1-9 for tabs (Watcher/Analyzer stop at 6). (refs: web/src/apps/watcher/App.tsx, web/src/apps/analyzer/App.tsx)
- [~] Toast notifications for async events (Toast exists but limited usage). (refs: web/src/components/Toast.tsx, web/src/components/SettingsPane.tsx)
- [~] WebSocket-driven realtime updates (Watcher uses WS; Analyzer still polls for watcher status + heartbeat). (refs: web/src/hooks/useWebSocket.ts, web/src/apps/analyzer/App.tsx)

## Tools
- [x] Watcher: always-on daemon for real-time monitoring. (refs: packages/watcher/src/api.ts)
- [x] Analyzer: on-demand browser-based analysis with heartbeat. (refs: packages/analyzer/src/api.ts)
- [~] Static Site: standalone web app for viewing/sharing exports (currently contrib-only). (refs: pages/src/pages/index.astro)

## Core Code Organization
- [x] Types (shared TypeScript types). (refs: packages/core/src/types/)
- [~] Transcript parsers (Claude/Codex/Gemini present; Cursor missing). (refs: packages/transcript-parser/src/parsers/)
- [x] Annotator (annotations/enrichments). (refs: packages/core/src/annotator/)
- [x] Pre-Share (redaction/filtering/sanitization). (refs: packages/pre-share/src/)
- [x] Storage abstractions (JSONL/JSON). (refs: packages/core/src/storage/)
- [x] Audit log. (refs: packages/core/src/audit/)
- [~] Shared web components:
  - [~] Projects editor (used in Watcher/Analyzer but not shared component). (refs: web/src/components/ProjectsPane.tsx)
  - [~] Conversation search (implemented in multiple panes but not shared). (refs: web/src/components/ConversationsPane.tsx, web/src/components/ContribPane.tsx)
  - [~] Preview/filter/redact (Contrib flow exists; Static Site viewer missing). (refs: web/src/components/ContribPane.tsx, pages/src/pages/index.astro)
  - [x] Self-documenting expandable element. (refs: web/src/components/ui/SelfDocumentingSection.tsx)
  - [x] Diff viewer. (refs: web/src/components/DiffView.tsx, packages/ui/src/components/DiffView.tsx)
  - [x] Chat viewer. (refs: web/src/components/ChatViewer.tsx, packages/ui/src/components/ChatViewer.tsx)
  - [~] Toast notifications (component exists, limited integration). (refs: web/src/components/Toast.tsx)

## Watcher Tool
### Agents
- [~] Data columns (name, PID, uptime, CPU/mem/threads, last activity, state, location present; transcript path + TTY not shown in table). (refs: web/src/components/AgentPane.tsx)
- [x] Search/sort/filter. (refs: web/src/components/AgentPane.tsx)
- [x] Group by type, project. (refs: web/src/components/AgentPane.tsx)
- [x] Agent control (signal/kill). (refs: packages/watcher/src/routes/agents.ts, web/src/components/AgentDetailModal.tsx)
- [x] Agent metadata naming/notes. (refs: packages/watcher/src/routes/agent-metadata.ts, web/src/components/AgentDetailModal.tsx)
- [~] Conversation metadata naming (API implemented, UI partial). (refs: packages/watcher/src/routes/conversation-metadata.ts, web/src/components/AgentDetailModal.tsx)

### Projects
- [x] Periodic git status scanning. (refs: packages/monitor/src/repo-scanner.ts)
- [x] Repo status (branch/dirty/staged/unstaged/untracked). (refs: packages/monitor/src/git.ts)
- [x] Port scanning + process association. (refs: packages/monitor/src/port-scanner.ts)
- [~] Protocol/service detection (protocol only, service detection missing). (refs: packages/monitor/src/port-scanner.ts)

### Hooks
- [x] Session lifecycle (start/end + source + permission mode). (refs: packages/monitor/src/hook-store.ts, packages/core/src/types/hooks.ts)
- [x] Tool tracking (pre/post, timeline, stats, recent). (refs: packages/monitor/src/hook-store.ts, packages/watcher/src/routes/hooks.ts)
- [x] Events (stop, notification, permission-request, user prompt, pre-compact, subagent-stop). (refs: packages/watcher/src/routes/hooks.ts)
- [x] Metrics (token counting, estimated cost, auto-continue attempts). (refs: packages/monitor/src/hook-store.ts)
- [x] Statistics (daily + per-tool). (refs: packages/monitor/src/hook-store.ts)

### Activity
- [x] Live activity stream (processes, hooks, repo/port changes). (refs: web/src/components/ActivityFeedPane.tsx, web/src/hooks/useWebSocket.ts)

### Command Center
- [~] UI present but missing run endpoints + tmux session management. (refs: web/src/components/CommandCenterPane.tsx, packages/watcher/src/routes/managed-sessions.ts)
- [x] Predictions + calibration endpoints. (refs: packages/watcher/src/routes/predictions.ts)

### Settings
- [~] Display settings + hidden tabs/ports (Analyzer config supports; Watcher UI uses raw config). (refs: packages/analyzer/src/config.ts, web/src/components/WatcherSettingsPane.tsx)
- [~] Scan settings (config exists; UI minimal). (refs: packages/watcher/src/config.ts, web/src/components/WatcherSettingsPane.tsx)
- [~] Cost controls + notifications (config exists; UI partial). (refs: packages/watcher/src/config.ts, web/src/components/HookEnhancementsSection.tsx)
- [~] Claude Code integration (settings endpoints exist; UI in Analyzer settings). (refs: packages/watcher/src/routes/config.ts, web/src/components/SettingsPane.tsx)

## Analyzer Tool
- [x] Heartbeat lifecycle. (refs: packages/analyzer/src/routes/monitoring.ts, web/src/apps/analyzer/App.tsx)
- [x] Transcript discovery + enrichments + analytics + projects. (refs: packages/analyzer/src/routes/transcripts.ts, packages/analyzer/src/routes/enrichments.ts, packages/analyzer/src/routes/analytics.ts, packages/analyzer/src/routes/projects.ts)
- [~] Share/contrib pipeline (most contrib endpoints exist; some share routes still stubbed). (refs: packages/analyzer/src/routes/contrib.ts, packages/analyzer/src/routes/share.ts)
- [~] Conversation metadata persistence (routes present, still rough). (refs: packages/analyzer/src/routes/conversations.ts)

## Static Site
- [~] Contrib flow available, but not a full export viewer. (refs: pages/src/pages/index.astro)
