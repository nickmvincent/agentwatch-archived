# Watcher/Analyzer Split - Refactor Status

Status of the daemon split into Watcher (port 8420) and Analyzer (port 8421).

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            DAEMON (original)                             │
│                     150+ endpoints, port 8420                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
     ┌──────────────────────────────┴──────────────────────────────┐
     ↓                                                              ↓
┌────────────────────────────────┐    ┌────────────────────────────────┐
│         WATCHER                │    │          ANALYZER              │
│   Always-on background daemon  │    │    On-demand browser tool      │
│   Port 8420                    │    │    Port 8421                   │
│                                │    │                                │
│   • Hook event capture         │    │    • Transcript analysis       │
│   • Real-time monitoring       │    │    • Enrichment/quality        │
│   • Agent/repo/port tracking   │    │    • Share/export              │
│   • WebSocket updates          │    │    • Analytics                 │
│   • Claude settings mgmt       │    │    • Heartbeat shutdown        │
└────────────────────────────────┘    └────────────────────────────────┘
```

---

## Original Daemon Endpoints (Complete List)

The original `packages/daemon/src/api.ts` had **150+ endpoints**. Here's the complete categorized list:

### Health & Lifecycle
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Simple health check |
| `/api/status` | GET | Server status with uptime |
| `/api/shutdown` | POST | Trigger graceful shutdown |

### Configuration
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/config` | GET | Get watcher configuration |
| `/api/config` | PATCH | Update configuration |
| `/api/config/raw` | GET | Get raw config file |
| `/api/config/raw` | PUT | Replace config file |
| `/api/claude/settings` | GET | Read Claude settings.json |
| `/api/claude/settings` | PUT | Replace Claude settings |
| `/api/claude/settings` | PATCH | Merge Claude settings |
| `/api/claude/settings/:scope` | GET | Get scope-specific settings |
| `/api/claude/mcp` | GET | List MCP servers |
| `/api/claude/reference/env-vars` | GET | Environment variable reference |
| `/api/claude/reference/permissions` | GET | Permission reference |

### Sandbox & Security
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sandbox/status` | GET | Docker/image status |
| `/api/sandbox/presets` | GET | List permission presets |
| `/api/sandbox/presets/:id` | GET | Get specific preset |
| `/api/sandbox/preset/:id/apply` | POST | Apply preset |
| `/api/sandbox/levels` | GET | Security levels |
| `/api/sandbox/commands` | GET | Command whitelist |
| `/api/sandbox/documentation` | GET | Sandbox docs |
| `/api/security/overview` | GET | Security overview |

### Agents
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agents` | GET | List detected agents |
| `/api/agents/:pid` | GET | Get agent details |
| `/api/agents/:pid/output` | GET | Get agent output buffer |
| `/api/agents/:pid/kill` | POST | Kill agent process |
| `/api/agents/:pid/signal` | POST | Send signal to agent |
| `/api/agents/:pid/input` | POST | Send input to agent stdin |
| `/api/agents/:pid/metadata` | GET | Get agent metadata |
| `/api/agents/:pid/metadata` | POST | Set agent metadata |

### Repositories & Ports
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/repos` | GET | List git repos with status |
| `/api/repos/rescan` | POST | Trigger rescan |
| `/api/ports` | GET | List listening ports |
| `/api/ports/:port` | GET | Get port details |

### Hook Sessions
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sessions` | GET | List sessions (alias) |
| `/api/sessions/:id` | GET | Get session (alias) |
| `/api/hooks/sessions` | GET | List hook sessions |
| `/api/hooks/sessions/:id` | GET | Get session with tools |
| `/api/hooks/sessions/:id/timeline` | GET | Get tool timeline |
| `/api/hooks/sessions/:id/commits` | GET | Get session commits |
| `/api/hooks/sessions/:id/suggestions` | GET | Get session suggestions |
| `/api/hooks/tools/stats` | GET | Tool statistics |
| `/api/hooks/tools/recent` | GET | Recent tool usages |
| `/api/hooks/stats/daily` | GET | Daily stats |
| `/api/hooks/commits` | GET | Recent commits |
| `/api/hooks/suggestions` | GET | All suggestions |

### Hook Event Handlers (called by Claude Code)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/hooks/session-start` | POST | Session started |
| `/api/hooks/session-end` | POST | Session ended |
| `/api/hooks/pre-tool-use` | POST | Before tool execution |
| `/api/hooks/post-tool-use` | POST | After tool execution |
| `/api/hooks/stop` | POST | Agent stop signal |
| `/api/hooks/subagent-stop` | POST | Subagent stop |
| `/api/hooks/notification` | POST | Notification event |
| `/api/hooks/permission-request` | POST | Permission prompt |
| `/api/hooks/user-prompt-submit` | POST | User submitted prompt |
| `/api/hooks/pre-compact` | POST | Before context compact |

### Managed Sessions (Command Center)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/managed-sessions` | GET | List managed sessions |
| `/api/managed-sessions` | POST | Create session |
| `/api/managed-sessions/:id` | GET | Get session |
| `/api/managed-sessions/:id` | PATCH | Update session |
| `/api/managed-sessions/:id/end` | POST | End session |
| `/api/managed-sessions/run` | POST | Run headless agent |
| `/api/managed-sessions/run-interactive` | POST | Run interactive |
| `/api/command-center/agents` | GET | Active command center agents |
| `/api/command-center/tmux-available` | GET | Check tmux |
| `/api/command-center/tmux-sessions` | GET | List tmux sessions |
| `/api/command-center/tmux-sessions/:id` | DELETE | Kill tmux session |

### Annotations
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/annotations` | GET | List annotations |
| `/api/annotations/:sessionId` | GET | Get annotation |
| `/api/annotations/:sessionId` | POST | Create/update |
| `/api/annotations/:sessionId` | DELETE | Delete annotation |
| `/api/annotations/stats` | GET | Annotation statistics |
| `/api/annotations/heuristics` | POST | Apply auto-annotation |

### Predictions & Calibration
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/predictions` | GET | List predictions |
| `/api/predictions` | POST | Create prediction |
| `/api/predictions/session/:sessionId` | GET | Get session prediction |
| `/api/predictions/:id/outcome` | POST | Record outcome |
| `/api/calibration` | GET | Calibration data |
| `/api/calibration/history` | GET | Calibration history |

### Projects
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects` | GET | List projects |
| `/api/projects` | POST | Create project |
| `/api/projects/:id` | GET | Get project |
| `/api/projects/:id` | PATCH | Update project |
| `/api/projects/:id` | DELETE | Delete project |
| `/api/projects/infer` | POST | Infer project from path |

### Agent Metadata
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent-metadata` | GET | List metadata |
| `/api/agent-metadata` | POST | Create metadata |
| `/api/agent-metadata/:agentId` | GET | Get metadata |
| `/api/agent-metadata/:agentId` | PATCH | Update metadata |
| `/api/agent-metadata/:agentId` | DELETE | Delete metadata |
| `/api/agent-metadata/search` | GET | Search metadata |
| `/api/agent-metadata/:agentId/history` | GET | History |

### Conversation Metadata
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/conversation-metadata` | GET | List metadata |
| `/api/conversation-metadata/:id` | GET | Get metadata |
| `/api/conversation-metadata/:id` | PATCH | Update metadata |
| `/api/conversation-metadata/:id` | DELETE | Delete metadata |

### Transcripts & Local Logs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/contrib/transcripts` | GET | List transcripts |
| `/api/contrib/local-logs` | GET | List local logs |
| `/api/contrib/local-logs/:id` | GET | Get transcript |
| `/api/contrib/local-logs/:id/raw` | GET | Get raw JSONL |
| `/api/contrib/local-logs/read` | POST | Batch read |
| `/api/contrib/correlated` | GET | Correlated sessions |

### Enrichments
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/enrichments` | GET | List enrichments |
| `/api/enrichments/:id` | GET | Get enrichment |
| `/api/enrichments/:id/annotation` | POST | Set annotation |
| `/api/enrichments/:id/tags` | POST | Update tags |
| `/api/enrichments/bulk` | POST | Bulk get |
| `/api/enrichments/:id` | DELETE | Delete |
| `/api/enrichments/workflow-stats` | GET | Workflow stats |
| `/api/enrichments/privacy-risk/:id` | GET | Privacy analysis |

### Analytics
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/analytics/overview` | GET | Overview stats |
| `/api/analytics/daily` | GET | Daily breakdown |
| `/api/analytics/quality-distribution` | GET | Quality distribution |
| `/api/analytics/by-project` | GET | Per-project stats |
| `/api/quality-config` | GET | Quality config |

### Share & Export
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/contrib/patterns` | GET | Sanitization patterns |
| `/api/contrib/patterns/all` | GET | All patterns |
| `/api/contrib/patterns/sample` | GET | Pattern samples |
| `/api/contrib/patterns/test` | POST | Test pattern |
| `/api/contrib/patterns/validate` | POST | Validate pattern |
| `/api/contrib/sanitize` | POST | Sanitize content |
| `/api/contrib/check` | POST | Check content |
| `/api/contrib/fields` | GET | Field definitions |
| `/api/contrib/prepare` | POST | Prepare export |
| `/api/contrib/export` | POST | Export data |
| `/api/contrib/export/bundle` | POST | Export bundle |
| `/api/contrib/cost/aggregate` | GET | Cost aggregate |
| `/api/contrib/cost/:sessionId` | GET | Session cost |
| `/api/contrib/process-logs/summary` | GET | Process log summary |
| `/api/contrib/process-logs/files` | GET | Process log files |
| `/api/contrib/process-logs/snapshots/:date` | GET | Daily snapshots |
| `/api/contrib/process-logs/events/:date` | GET | Daily events |
| `/api/contrib/process-logs/prepare` | POST | Prepare logs |

### Contributor Settings & Profiles
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/contrib/settings` | GET | Get settings |
| `/api/contrib/settings` | POST | Save settings |
| `/api/contrib/profiles` | GET | List profiles |
| `/api/contrib/profiles` | POST | Create profile |
| `/api/contrib/profiles/:id` | DELETE | Delete profile |
| `/api/contrib/profiles/active` | PUT | Set active |
| `/api/contrib/research-profiles` | GET | Research profiles |
| `/api/contrib/history` | GET | Contribution history |
| `/api/contrib/history` | POST | Record contribution |
| `/api/contrib/destinations` | GET | Destination config |
| `/api/contrib/artifacts/:sessionId` | GET | Session artifacts |
| `/api/contrib/artifacts/:sessionId` | POST | Link artifact |
| `/api/contrib/artifacts/:sessionId` | DELETE | Unlink artifact |

### HuggingFace Integration
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/share/gist` | POST | Create GitHub gist |
| `/api/share/huggingface/cli-auth` | GET | Check CLI auth |
| `/api/share/huggingface/use-cli-token` | POST | Use CLI token |
| `/api/share/huggingface/oauth/config` | GET | OAuth config |
| `/api/share/huggingface/oauth/start` | POST | Start OAuth |
| `/api/share/huggingface/oauth/callback` | GET | OAuth callback |
| `/api/share/huggingface/validate` | POST | Validate token |
| `/api/share/huggingface/check-repo` | POST | Check repo |
| `/api/share/huggingface` | POST | Upload to HF |

### Privacy Flags
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/privacy-flags` | GET | List flags |
| `/api/privacy-flags` | POST | Create flag |
| `/api/privacy-flags/:flagId` | GET | Get flag |
| `/api/privacy-flags/:flagId` | PATCH | Update flag |
| `/api/privacy-flags/:flagId/resolve` | POST | Resolve flag |
| `/api/privacy-flags/:flagId` | DELETE | Delete flag |

### Miscellaneous
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/docs` | GET | List documentation |
| `/api/docs/:id` | GET | Get doc content |
| `/api/principles` | GET | List principles |
| `/api/export/sessions` | GET | Export sessions |
| `/api/export/activity` | GET | Export activity |
| `/api/test-gate` | GET | Test gate status |
| `/api/test-gate/toggle` | POST | Toggle gate |
| `/api/hooks/test-gate` | POST | Test gate hook |
| `/api/notifications/test` | POST | Test notification |
| `/api/reference/format-schemas` | GET | Format schemas |
| `/api/reference/format-schemas/:agent` | GET | Agent schema |

---

## Watcher Implementation Status

**Port:** 8420
**Package:** `@agentwatch/watcher`

### Implemented (41 endpoints)

#### Health & Status
| Endpoint | Status |
|----------|--------|
| `GET /api/health` | ✅ Implemented |
| `GET /api/status` | ✅ Implemented |
| `POST /api/shutdown` | ✅ Implemented |

#### Configuration
| Endpoint | Status |
|----------|--------|
| `GET /api/config` | ✅ Implemented |
| `GET /api/claude/settings` | ✅ Implemented |
| `PUT /api/claude/settings` | ✅ Implemented |
| `PATCH /api/claude/settings` | ✅ Implemented |

#### Sandbox
| Endpoint | Status |
|----------|--------|
| `GET /api/sandbox/status` | ✅ Implemented |
| `GET /api/sandbox/presets` | ✅ Implemented |
| `GET /api/sandbox/presets/:id` | ✅ Implemented |
| `POST /api/sandbox/presets/:id/apply` | ✅ Implemented |
| `GET /api/sandbox/current` | ✅ Implemented |

#### Agents
| Endpoint | Status |
|----------|--------|
| `GET /api/agents` | ✅ Implemented |
| `GET /api/agents/:pid` | ✅ Implemented |
| `POST /api/agents/:pid/kill` | ✅ Implemented |
| `POST /api/agents/:pid/signal` | ✅ Implemented |
| `POST /api/agents/:pid/input` | ✅ Implemented |

#### Repositories & Ports
| Endpoint | Status |
|----------|--------|
| `GET /api/repos` | ✅ Implemented |
| `POST /api/repos/rescan` | ✅ Implemented |
| `GET /api/ports` | ✅ Implemented |
| `GET /api/ports/:port` | ✅ Implemented |

#### Hook Sessions
| Endpoint | Status |
|----------|--------|
| `GET /api/hooks/sessions` | ✅ Implemented |
| `GET /api/hooks/sessions/:id` | ✅ Implemented |
| `GET /api/hooks/sessions/:id/timeline` | ✅ Implemented |
| `GET /api/hooks/sessions/:id/commits` | ✅ Implemented |
| `GET /api/hooks/tools/stats` | ✅ Implemented |
| `GET /api/hooks/tools/recent` | ✅ Implemented |
| `GET /api/hooks/stats/daily` | ✅ Implemented |
| `GET /api/hooks/commits` | ✅ Implemented |

#### Hook Event Handlers
| Endpoint | Status |
|----------|--------|
| `POST /api/hooks/session-start` | ✅ Implemented |
| `POST /api/hooks/session-end` | ✅ Implemented |
| `POST /api/hooks/pre-tool-use` | ✅ Implemented |
| `POST /api/hooks/post-tool-use` | ✅ Implemented |
| `POST /api/hooks/stop` | ✅ Implemented |
| `POST /api/hooks/subagent-stop` | ✅ Implemented |
| `POST /api/hooks/notification` | ✅ Implemented |
| `POST /api/hooks/permission-request` | ✅ Implemented |
| `POST /api/hooks/user-prompt-submit` | ✅ Implemented |
| `POST /api/hooks/pre-compact` | ✅ Implemented |

#### WebSocket
| Endpoint | Status |
|----------|--------|
| `GET /ws` | ✅ Implemented |

### NOT Implemented in Watcher

These belong in Analyzer or are not needed:
- All `/api/managed-sessions/*` endpoints
- All `/api/command-center/*` endpoints
- All `/api/annotations/*` endpoints
- All `/api/enrichments/*` endpoints
- All `/api/analytics/*` endpoints
- All `/api/contrib/*` endpoints
- All `/api/share/*` endpoints
- All `/api/transcripts/*` endpoints
- All `/api/predictions/*` endpoints
- All `/api/projects/*` endpoints
- `/api/config/raw` (GET/PUT)
- `/api/claude/settings/:scope`
- `/api/claude/mcp`
- `/api/claude/reference/*`
- `/api/sandbox/levels`, `/api/sandbox/commands`, `/api/sandbox/documentation`
- `/api/security/overview`
- `/api/agents/:pid/output`
- `/api/agents/:pid/metadata`
- `/api/docs`
- `/api/principles`
- `/api/export/*`
- `/api/test-gate*`
- `/api/notifications/test`
- `/api/reference/*`
- `/api/hooks/suggestions`
- `/api/hooks/sessions/:id/suggestions`

---

## Analyzer Implementation Status

**Port:** 8421
**Package:** `@agentwatch/analyzer`

### Implemented (37 endpoints)

#### Health & Status
| Endpoint | Status |
|----------|--------|
| `GET /api/health` | ✅ Implemented |
| `GET /api/status` | ✅ Implemented |
| `GET /api/config` | ✅ Implemented (proxies to watcher) |
| `POST /api/heartbeat` | ✅ Implemented (browser lifecycle) |
| `POST /api/shutdown` | ✅ Implemented |

#### Transcripts
| Endpoint | Status |
|----------|--------|
| `GET /api/transcripts` | ✅ Implemented |
| `GET /api/transcripts/stats` | ✅ Implemented |
| `GET /api/transcripts/:id` | ✅ Implemented |
| `POST /api/transcripts/rescan` | ✅ Implemented |

#### Enrichments
| Endpoint | Status |
|----------|--------|
| `GET /api/enrichments` | ✅ Implemented |
| `GET /api/enrichments/workflow-stats` | ✅ Implemented |
| `GET /api/enrichments/:sessionId` | ✅ Implemented |
| `POST /api/enrichments/:sessionId/annotation` | ✅ Implemented |
| `POST /api/enrichments/:sessionId/tags` | ✅ Implemented |
| `POST /api/enrichments/bulk` | ✅ Implemented |
| `DELETE /api/enrichments/:sessionId` | ✅ Implemented |
| `GET /api/enrichments/privacy-risk/:transcriptId` | ✅ Implemented |

#### Annotations
| Endpoint | Status |
|----------|--------|
| `GET /api/annotations` | ✅ Implemented |
| `GET /api/annotations/:sessionId` | ✅ Implemented |
| `POST /api/annotations/:sessionId` | ✅ Implemented |
| `DELETE /api/annotations/:sessionId` | ✅ Implemented |

#### Analytics
| Endpoint | Status |
|----------|--------|
| `GET /api/analytics/overview` | ✅ Implemented |
| `GET /api/analytics/daily` | ✅ Implemented |
| `GET /api/analytics/quality-distribution` | ✅ Implemented |
| `GET /api/analytics/by-project` | ✅ Implemented |

#### Projects
| Endpoint | Status |
|----------|--------|
| `GET /api/projects` | ✅ Implemented |
| `GET /api/projects/:id` | ✅ Implemented |
| `POST /api/projects` | ✅ Implemented |
| `PATCH /api/projects/:id` | ✅ Implemented |
| `DELETE /api/projects/:id` | ✅ Implemented |

#### Share
| Endpoint | Status |
|----------|--------|
| `GET /api/share/status` | ✅ Implemented (basic) |
| `POST /api/share/export` | ✅ Implemented (basic) |

#### Conversations
| Endpoint | Status |
|----------|--------|
| `GET /api/contrib/correlated` | ✅ Implemented |
| `GET /api/conversation-metadata` | ✅ Implemented |
| `GET /api/conversation-metadata/:conversationId` | ✅ Implemented |
| `PATCH /api/conversation-metadata/:conversationId` | ✅ Implemented |
| `DELETE /api/conversation-metadata/:conversationId` | ✅ Implemented |

### NOT Implemented in Analyzer (Missing Features)

#### Contribution/Share (high priority)
| Endpoint | Status | Priority |
|----------|--------|----------|
| `GET /api/contrib/patterns` | ❌ Missing | High |
| `GET /api/contrib/patterns/all` | ❌ Missing | High |
| `GET /api/contrib/patterns/sample` | ❌ Missing | Medium |
| `POST /api/contrib/patterns/test` | ❌ Missing | Medium |
| `POST /api/contrib/patterns/validate` | ❌ Missing | Medium |
| `POST /api/contrib/sanitize` | ❌ Missing | High |
| `POST /api/contrib/check` | ❌ Missing | High |
| `GET /api/contrib/fields` | ❌ Missing | High |
| `POST /api/contrib/prepare` | ❌ Missing | High |
| `POST /api/contrib/export` | ❌ Missing | High |
| `POST /api/contrib/export/bundle` | ❌ Missing | High |
| `GET /api/contrib/settings` | ❌ Missing | High |
| `POST /api/contrib/settings` | ❌ Missing | High |
| `GET /api/contrib/profiles` | ❌ Missing | High |
| `POST /api/contrib/profiles` | ❌ Missing | Medium |
| `DELETE /api/contrib/profiles/:id` | ❌ Missing | Medium |
| `PUT /api/contrib/profiles/active` | ❌ Missing | High |
| `GET /api/contrib/research-profiles` | ❌ Missing | High |
| `GET /api/contrib/history` | ❌ Missing | Medium |
| `POST /api/contrib/history` | ❌ Missing | Medium |
| `GET /api/contrib/destinations` | ❌ Missing | Medium |
| `GET /api/contrib/artifacts/:sessionId` | ❌ Missing | Medium |
| `POST /api/contrib/artifacts/:sessionId` | ❌ Missing | Medium |
| `DELETE /api/contrib/artifacts/:sessionId` | ❌ Missing | Medium |

#### Transcript/Local Logs (medium priority)
| Endpoint | Status | Priority |
|----------|--------|----------|
| `GET /api/contrib/transcripts` | ❌ Missing | Medium |
| `GET /api/contrib/local-logs` | ❌ Missing | Medium |
| `GET /api/contrib/local-logs/:id` | ❌ Missing | Medium |
| `GET /api/contrib/local-logs/:id/raw` | ❌ Missing | Low |
| `POST /api/contrib/local-logs/read` | ❌ Missing | Low |

#### HuggingFace/Gist (medium priority)
| Endpoint | Status | Priority |
|----------|--------|----------|
| `POST /api/share/gist` | ❌ Missing | Medium |
| `GET /api/share/huggingface/cli-auth` | ❌ Missing | Medium |
| `POST /api/share/huggingface/use-cli-token` | ❌ Missing | Medium |
| `GET /api/share/huggingface/oauth/config` | ❌ Missing | Medium |
| `POST /api/share/huggingface/oauth/start` | ❌ Missing | Medium |
| `GET /api/share/huggingface/oauth/callback` | ❌ Missing | Medium |
| `POST /api/share/huggingface/validate` | ❌ Missing | Medium |
| `POST /api/share/huggingface/check-repo` | ❌ Missing | Medium |
| `POST /api/share/huggingface` | ❌ Missing | Medium |

#### Cost Tracking (low priority)
| Endpoint | Status | Priority |
|----------|--------|----------|
| `GET /api/contrib/cost/aggregate` | ❌ Missing | Low |
| `GET /api/contrib/cost/:sessionId` | ❌ Missing | Low |

#### Process Logs (low priority)
| Endpoint | Status | Priority |
|----------|--------|----------|
| `GET /api/contrib/process-logs/summary` | ❌ Missing | Low |
| `GET /api/contrib/process-logs/files` | ❌ Missing | Low |
| `GET /api/contrib/process-logs/snapshots/:date` | ❌ Missing | Low |
| `GET /api/contrib/process-logs/events/:date` | ❌ Missing | Low |
| `POST /api/contrib/process-logs/prepare` | ❌ Missing | Low |

#### Other Missing
| Endpoint | Status | Priority |
|----------|--------|----------|
| `GET /api/annotations/stats` | ❌ Missing | Medium |
| `POST /api/annotations/heuristics` | ❌ Missing | Low |
| `GET /api/quality-config` | ❌ Missing | Low |
| `GET /api/predictions*` | ❌ Missing | Low |
| `GET /api/calibration*` | ❌ Missing | Low |
| `POST /api/projects/infer` | ❌ Missing | Medium |
| `GET /api/privacy-flags*` | ❌ Missing | Low |

---

## Web UI Status

### Build Configuration

```bash
# Watcher UI (port 8420)
BUILD_TARGET=watcher bun run build   # → web/dist/watcher/

# Analyzer UI (port 8421)
BUILD_TARGET=analyzer bun run build  # → web/dist/analyzer/
```

### Watcher UI Tabs
| Tab | Status | Components |
|-----|--------|------------|
| Agents | ✅ Working | AgentPane, activity feed, token tracking |
| Repos | ✅ Working | ReposPane (inline) |
| Ports | ✅ Working | PortsPane |
| Timeline | ✅ Working | TimelinePane (inline) |
| Command | ⚠️ Not implemented | CommandCenterPane (exists but no backend) |

### Analyzer UI Tabs
| Tab | Status | Components |
|-----|--------|------------|
| Sessions | ✅ Working | ConversationsPane |
| Analytics | ⚠️ Partial | AnalyticsPane (needs enrichment data) |
| Projects | ✅ Working | ProjectsPane |
| Share | ⚠️ Partial | ContribPane (backend incomplete) |
| Docs | ✅ Working | DocumentationPane |
| Settings | ✅ Working | SettingsPane |

---

## Tested vs Untested

### Tested

✅ **Watcher**
- `/api/health`, `/api/status` - Verified
- `/api/agents` - WebSocket + REST working
- `/api/repos`, `/api/ports` - REST working
- `/api/hooks/*` event handlers - Integrated with Claude Code hooks
- `/ws` - Real-time updates working

✅ **Analyzer**
- `/api/health`, `/api/status` - Verified
- `/api/transcripts` - List and get working
- `/api/enrichments` - List working (fixed session_ref format)
- `/api/analytics/*` - All 4 endpoints verified
- `/api/projects` - CRUD working
- `/api/contrib/correlated` - Verified working
- `/api/conversation-metadata` - CRUD working

### Not Tested

⚠️ **Watcher**
- `/api/sandbox/*` - Not manually tested
- `/api/claude/settings` PUT/PATCH - Not manually tested
- `/api/agents/:pid/kill`, `/api/agents/:pid/signal` - Not tested

⚠️ **Analyzer**
- `/api/enrichments/:id/annotation` - Not tested
- `/api/enrichments/:id/tags` - Not tested
- `/api/enrichments/bulk` - Not tested
- `/api/enrichments/privacy-risk/:id` - Not tested
- `/api/share/*` - Not tested (incomplete implementation)

---

## CLI Status

| Command | Status | Package |
|---------|--------|---------|
| `aw watcher start` | ✅ Working | @agentwatch/watcher |
| `aw watcher stop` | ✅ Working | @agentwatch/watcher |
| `aw watcher status` | ✅ Working | @agentwatch/watcher |
| `aw analyze` | ✅ Working | @agentwatch/analyzer |
| `aw daemon start` | ⚠️ Deprecated | @agentwatch/daemon (alias to watcher) |

---

## Known Issues

1. **Command Center not working** - Managed sessions endpoints not in watcher, UI shows tab but no backend

2. **Share tab incomplete** - Most `/api/contrib/*` endpoints not implemented in analyzer

3. **Enrichment correlation** - Quality scores need manual enrichment (auto-enrichment on session end not implemented)

4. **Cost tracking** - Not implemented yet

5. **HuggingFace integration** - OAuth flow and upload not implemented

---

## Next Steps

### High Priority
1. Implement core `/api/contrib/*` endpoints in analyzer:
   - `GET/POST /api/contrib/settings`
   - `GET /api/contrib/profiles`, `PUT /api/contrib/profiles/active`
   - `GET /api/contrib/research-profiles`
   - `POST /api/contrib/prepare`, `POST /api/contrib/export`
   - `POST /api/contrib/sanitize`, `POST /api/contrib/check`

2. Move Command Center to watcher:
   - Implement `/api/managed-sessions/*`
   - Implement `/api/command-center/*`
   - Connect UI to watcher endpoints

### Medium Priority
3. Complete transcript endpoints:
   - `GET /api/contrib/local-logs*`
   - `GET /api/contrib/transcripts`

4. Add HuggingFace integration:
   - All `/api/share/huggingface/*` endpoints

### Low Priority
5. Predictions/calibration
6. Privacy flags
7. Cost tracking
8. Process log export

---

## File Locations

### Watcher Package
```
packages/watcher/
├── src/
│   ├── api.ts           # Main app factory
│   ├── server.ts        # Server lifecycle
│   ├── routes/
│   │   ├── agents.ts    # Agent endpoints
│   │   ├── hooks.ts     # Hook session + event endpoints
│   │   ├── monitoring.ts # Health, repos, ports
│   │   ├── config.ts    # Config + Claude settings
│   │   └── sandbox.ts   # Sandbox status/presets
│   └── ...
```

### Analyzer Package
```
packages/analyzer/
├── src/
│   ├── api.ts           # Main app factory
│   ├── server.ts        # Server lifecycle
│   ├── routes/
│   │   ├── transcripts.ts  # Transcript discovery
│   │   ├── enrichments.ts  # Enrichments + annotations
│   │   ├── analytics.ts    # Analytics endpoints
│   │   ├── projects.ts     # Project CRUD
│   │   ├── conversations.ts # Correlated sessions
│   │   ├── share.ts        # Export (incomplete)
│   │   └── monitoring.ts   # Health, heartbeat
│   └── ...
```

### Web Apps
```
web/src/apps/
├── watcher/
│   ├── App.tsx          # Watcher dashboard
│   └── WatcherHeader.tsx
└── analyzer/
    ├── App.tsx          # Analyzer dashboard
    └── AgentStatusWidget.tsx
```
