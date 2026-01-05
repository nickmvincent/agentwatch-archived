# Agentwatch Roadmap & Status

> Last updated: 2026-01-03

## Quick Status

| Component | Status | Notes |
|-----------|--------|-------|
| Daemon API | ✅ Working | All endpoints implemented, 25 API tests |
| Web UI | ✅ Working | Dashboard, Conversations, Analytics, Settings panes |
| Pages (static) | ✅ Working | Build fixed, 3-step flow |
| Enrichment System | ✅ Working | Auto-tags, quality scores, loop detection |
| Session correlation | ✅ Implemented | `/api/contrib/correlated` with days filtering |
| **Conversation Context** | ✅ Working | Unified state shared across UI components |
| **ConversationDetailModal** | ✅ Working | Reusable modal for full conversation details |
| **Analytics Click-through** | ✅ Working | Click chart elements → filter conversations |
| **Projects** | ✅ Working | TOML config, auto-link by cwd, analytics |
| Process log storage | ✅ Implemented | `SessionLogger` → `~/.agentwatch/logs/` |
| Pre-share sanitization | ✅ Working | 137 tests, field grouping |
| Hugging Face upload | ⚠️ Partial | Code exists, needs testing |
| Local transcript scan | ✅ Working | Claude Code, Codex, OpenCode |
| Process wrapping | ❌ Not impl | Types exist, no CLI command |
| **Session Manager** | ✅ Working | `aw run`, `aw sessions` commands |
| Memory management | ✅ Working | Cleanup every hour, documented |
| Contributor settings | ✅ Working | Persists to `~/.agentwatch/` |
| Session annotations | ✅ Working | Thumbs up/down feedback |
| Heuristic scoring | ✅ Working | Auto-success detection |
| Settings persistence | ✅ Working | TOML config at `~/.config/agentwatch/` |

### Test Coverage (705 tests total)
| Package | Tests | Coverage |
|---------|-------|----------|
| daemon | 225+ | API, rules, enrichments, notifications, costs, correlation, research profiles, artifacts |
| monitor | 980+ | HookStore, DataStore, git utils, scanners |
| pre-share | 137+ | Sanitization, patterns, preparation |
| core | 30+ | Transcript parsing, cost estimation |

---

## Half-Implemented / Needs Attention

### 1. Process Wrapping ❌
**What exists:** Types (`AgentWrapperState`, `WrapperConfig`), DataStore methods, API fields
**What's missing:** `agentwatch run <cmd>` CLI, socket listener, PTY spawning
**History:** Original Python version had full wrapper support, removed during TS migration
**Pitfall:** TUI references `v` key for wrapper output (now removed from docs)
**Decision:** Left for future. Hooks + process scanning cover most cases.

### 3. Correlation UI Integration ✅ (Completed 2026-01-02)
**What exists:** `correlation.ts` with full matching logic, `/api/contrib/correlated` endpoint
**What was done:**
- Created `ConversationContext` provider for shared conversation state
- `AgentPane.tsx` now links to conversations via cwd matching
- `ContribPane.tsx` uses shared context instead of separate fetching
- `AgentDetailModal.tsx` has "Conversation" tab showing linked data
- Process snapshots optional attachment via config toggle
**Status:** Core integration complete. ConversationsPane still uses own detailed state for complex UI interactions.

### 4. Hugging Face Upload Flow ✅
**Status:** Tested with manual integration test (2026-01-03)
**What exists:** `huggingface.ts` with upload logic, CLI auth detection, OAuth support
**Test:** `packages/daemon/test/huggingface-integration.test.ts` (run with `HF_INTEGRATION_TEST=1`)
**Token storage:** Persisted to `~/.agentwatch/contributor.json`

### 5. Format Schemas (Reference Only) ✅
**Status:** Implemented and used by `/api/reference/format-schemas`
**What it does:** Data dictionaries documenting transcript formats (Claude, Codex, etc.)
**UI:** Could be displayed in External Reference tab but currently API-only

### 6. Cost Estimation Accuracy ⚠️
**What exists:** `/api/contrib/cost/:sessionId` endpoint, model pricing
**Status:** Appropriately caveated in code and UI
**Caveats documented:**
- Code comments in `stop.ts`, `local-logs.ts`: "CAVEAT: Cost is a rough ESTIMATE only"
- Hook types: "Cost is an estimate based on hardcoded pricing and may be inaccurate"
- Reference pane: "This is a planning tool for budgeting"
**Pricing source:** `packages/core/src/types/cost.ts` (as of December 2025)
**Note:** Users should compare with actual Anthropic billing for precise figures

### 7. Contribution Flow Documentation ⚠️ TODO
**Status:** Partially implemented, needs comprehensive documentation
**What exists:**
- Privacy risk analysis endpoint (`POST /api/enrichments/privacy-risk`)
- Transcript stats endpoint (`GET /api/transcripts/stats`)
- "My Data" section in Share tab showing aggregate stats
- ConversationDetailModal privacy risk section
- CLI audit scripts in data-contribution-guide.md

**What's needed:** A comprehensive "contribution flow" document specifying:
1. Full data audit experience (before sharing)
2. Session-level risk indicators in selection UI
3. Batch risk assessment for selected sessions
4. Clear workflow: audit → review → sanitize → preview → export
5. Guidance on which profiles are safe for different threat models
6. Integration between individual session review and aggregate stats
7. Ability to exclude sessions based on risk analysis
8. Clear documentation of what file contents are stored and why

**Why this matters:** Users need confidence that sharing is safe. Current implementation has pieces but lacks cohesive UX flow and comprehensive documentation.

---

## Completed Items ✅

### Storage & Data Model
- [x] **SessionLogger stores process logs** - `~/.agentwatch/logs/*.jsonl`
- [x] **Schema defined** - SessionInfo with pid, label, startTime, endTime, exitCode
- [x] **Correlation logic implemented** - `correlation.ts` with 4-phase matching

### Documentation
- [x] **Security → sharing docs** - `docs/security-and-sharing.md`
- [x] **Vision document** - `docs/vision.md`
- [x] **Data sources documented** - `docs/data-sources.md`

### Core Flow
- [x] **End-to-end contribution tested** - `bundle.test.ts` (11 tests)
- [x] **Pages static site works** - 3-step flow, builds successfully
- [x] **Pre-share unified** - Browser + server use same code

---

## Recently Added (2026-01-03)

### Contribution Workflow Enhancements ✨
**What:** Enhanced workflow status tracking and contribution tracking in the Share tab
**Goal:** Help users track their review progress and identify what has been contributed

**Changes:**
| Feature | Description |
|---------|-------------|
| Workflow Filter | Dropdown in ContribPane to filter by workflow status (Pending, Reviewed, Ready, Skipped) |
| Contributed Badge | "Contributed" badge shows on sessions previously uploaded |
| Auto-update Status | After HuggingFace upload, sessions automatically marked "ready_to_contribute" |
| Session ID Tracking | Contribution history now tracks which session IDs were included |

**Files Modified:**
- `packages/daemon/src/contributor-settings.ts` - Added `sessionIds` to ContributionRecord
- `packages/daemon/src/api.ts` - Accept `session_ids` in contribution history
- `web/src/api/client.ts` - Pass `session_ids` to recordContribution
- `web/src/components/ContribPane.tsx` - Workflow filter, enrichments integration, auto-update

**Integration with Workflow Status:**
The workflow filter in ContribPane connects to the workflow status system added to ConversationsPane:
- `pending` - New session, not yet reviewed
- `reviewed` - User has reviewed the session
- `ready_to_contribute` - Ready to share (auto-set after upload)
- `skipped` - Intentionally excluded from contribution

### Research-Oriented Redaction Profiles ✨
**What:** Redesigned redaction profiles framed around research questions instead of abstract tiers
**Goal:** Help contributors understand what research their data enables, improving informed consent

**New Files:**
- `packages/daemon/src/research-profiles.ts` - Single source of truth for profile definitions
- `web/src/components/ResearchProfileSelector.tsx` - UI component for profile selection

**Profiles:**
| Profile | Research Enabled | Sensitivity |
|---------|------------------|-------------|
| **Tool Usage Patterns** | Tool popularity, failure rates, operation durations | Lowest (default) |
| **Workflow & Efficiency** | Task decomposition, conversation flow, error handling | Low |
| **Token Economics** | Cost modeling, token ratios, model comparisons | Medium |
| **Full Transcript** | Agent reasoning, prompt engineering | High (requires review) |

**Features:**
- Each profile lists specific research questions it helps answer
- Human-readable summaries of what's shared vs. stripped
- Composable field groups for easy profile creation
- UI badges ("Recommended", "Requires Review")
- Backwards-compatible with legacy profile format

**API Endpoint:**
```
GET /api/contrib/research-profiles  - Full profile metadata with research questions
```

**Tests:** `packages/daemon/test/research-profiles.test.ts` (40 tests)

### Artifact Linking ✨
**What:** Link sessions to final artifacts (GitHub PRs, repos, commits, etc.)
**Goal:** Enable research connecting agent behavior to outcomes

**Features:**
- Auto-detection of artifact type from URL (e.g., `github.com/.../pull/123` → `github_pr`)
- Persistent storage in `~/.agentwatch/artifacts.json`
- Audit logging for all artifact operations

**Artifact Types:**
- `github_repo`, `github_pr`, `github_commit`, `github_issue`
- `file`, `url`, `other`

**API Endpoints:**
```
GET    /api/contrib/artifacts/:sessionId  - Get session artifacts
POST   /api/contrib/artifacts/:sessionId  - Add artifact link
DELETE /api/contrib/artifacts/:sessionId  - Remove artifact link
```

**Storage:** `~/.agentwatch/artifacts.json`

**Tests:** Included in `research-profiles.test.ts`

---

## Added (2026-01-02)

### Agent Session Manager (`aw run` + `aw sessions`) ✨
**What:** CLI commands to launch agents with tracked prompts and view session history
**Goal:** Solve the "what prompt did I give that tmux pane 2 hours ago?" problem

**New Files:**
- `packages/monitor/src/session-store.ts` - Persistence for managed sessions
- `packages/cli/src/commands/run.ts` - Launch command
- `packages/cli/src/commands/sessions.ts` - List/view command

**Usage:**
```bash
# Launch agents with tracking
aw run "review this repo"              # claude (default), interactive
aw run -a codex "fix the tests"        # specify agent
aw run -a gemini "explain this code"   # gemini
aw run -p "summarize changes"          # non-interactive (--print)

# View sessions
aw sessions                            # list recent
aw sessions --active                   # only running
aw sessions abc123                     # show details
aw sessions --agent claude             # filter by agent
```

**API Endpoints:**
```
GET  /api/managed-sessions         - List sessions
GET  /api/managed-sessions/:id     - Get session details
POST /api/managed-sessions         - Create session
PATCH /api/managed-sessions/:id    - Update session (set PID)
POST /api/managed-sessions/:id/end - End session with exit code
```

**Storage:** `~/.agentwatch/sessions/` (index.json + per-session JSON files)

#### Manual Testing Instructions

**Prerequisites:**
```bash
# Rebuild packages and restart daemon
bun run build
aw daemon stop
aw daemon start
```

**Test 1: Basic interactive session**
```bash
# Start an interactive claude session
aw run "say hello and then exit"

# Expected:
# - "Session <id> created" message
# - Claude starts in your terminal
# - After exiting, "claude completed successfully" message
```

**Test 2: Non-interactive (print) mode**
```bash
# Run in print mode
aw run -p "what is 2+2?"

# Expected:
# - Session created
# - Claude runs silently
# - Output printed when done
# - Session marked complete
```

**Test 3: List sessions**
```bash
# After running some sessions
aw sessions

# Expected output like:
# ID         AGENT    STATUS   DURATION   PROMPT
# abc123     claude   done     45s        say hello and then exit
# def456     claude   done     12s        what is 2+2?
```

**Test 4: View session details**
```bash
aw sessions <id-from-above>

# Expected: Full session info including prompt, cwd, duration
```

**Test 5: Active sessions filter**
```bash
# In one terminal, start a long-running session
aw run "wait for my input, then summarize what I said"

# In another terminal
aw sessions --active

# Expected: Shows only the running session
```

**Test 6: Daemon not running**
```bash
aw daemon stop
aw run "test prompt"

# Expected: Warning about daemon not running, session not tracked
# Agent should still launch (just untracked)

aw sessions
# Expected: Error message suggesting "aw daemon start"
```

**Test 7: API direct access**
```bash
# While daemon is running
curl http://127.0.0.1:8420/api/managed-sessions | jq

# Expected: JSON array of sessions
```

#### Feedback to Provide

Please test and report on:

1. **Usability:**
   - Is the output clear and helpful?
   - Are error messages actionable?
   - Does the session list format make sense?

2. **Agent support:**
   - Does `claude` work correctly?
   - If you have `codex` or `gemini` installed, do they work?
   - Are there other agents you'd want supported?

3. **Edge cases:**
   - What happens if you Ctrl+C during a session?
   - What if the agent crashes?
   - What if you run `aw run` without the daemon?

4. **Missing features:**
   - Would you want to attach to a running session?
   - Would tmux integration be useful?
   - Should sessions show in the TUI?
   - Should there be a web UI for sessions?

5. **Bugs:**
   - Any crashes or unexpected behavior?
   - Session status not updating correctly?
   - Storage issues?

---

### Conversation Unification Refactor ✨
**What:** Unified the Conversation data model across all UI components with shared state
**Goal:** Three data sources (transcripts, hooks, processes) merged into a single Conversation view

**New Files:**
- `web/src/context/ConversationContext.tsx` - Shared state provider
- `web/src/components/ConversationCard.tsx` - Reusable conversation display component

**Changes:**
| Component | Change |
|-----------|--------|
| `App.tsx` | Wrapped with `ConversationProvider` |
| `AgentPane.tsx` | Uses `getLinkedConversation()` to show 💬 indicator |
| `AgentDetailModal.tsx` | Added "Conversation" tab showing linked data |
| `ContribPane.tsx` | Uses shared context instead of local state |
| `correlation.ts` | Added `attachProcessSnapshots()` function |
| `api.ts` | Enhanced `/api/contrib/correlated` with `days` param |
| `SettingsPane.tsx` | Added process snapshots toggle |
| `AnalyticsPane.tsx` | Uses global `transcript_days` from config |

**ConversationContext provides:**
- `conversations` - All correlated conversations
- `conversationStats` - Correlation statistics
- `conversationNames` - Custom names map
- `enrichments` - Session enrichments map
- `loading`, `error`, `transcriptDays` - UI state
- `refreshConversations()` - Reload data
- `updateConversationName()` - Update custom name
- `setAnnotation()` - Set feedback
- `getLinkedConversation(cwd, startTime)` - Find conversation by cwd

**Data Flow:**
```
ConversationContext
        │
  ┌─────┼─────┐
  │     │     │
  ▼     ▼     ▼
Agent  Contrib  (ConversationsPane uses own state)
Pane   Pane
  │
  └─→ AgentDetailModal
        └─→ Conversation Tab
```

**Remaining:** Web package testing (vitest/RTL) not yet set up.

### ConversationDetailModal ✨
**What:** Reusable modal component for viewing full conversation details
**File:** `web/src/components/ConversationDetailModal.tsx`
**Features:**
- Full conversation overview (name, agent, time, cwd, project)
- Data source status (hook session, transcript availability)
- Auto-tags, quality scores, outcome signals
- Loop detection warnings
- Git changes summary
- Manual annotation editing (feedback, tags, notes)
- Keyboard navigation (Escape to close)

### Analytics Click-through Navigation ✨
**What:** Click elements in AnalyticsPane to filter Conversations
**Files:** `web/src/components/AnalyticsPane.tsx`, `web/src/components/ConversationsPane.tsx`
**Features:**
- Click task type bars → filter conversations by that task type
- Click quality buckets → filter by quality score range
- Filter indicators show active filters with clear buttons
- Filter state managed through ConversationContext

#### Manual Testing Instructions (Conversation UI)

**Prerequisites:**
```bash
# Rebuild packages and restart daemon
bun run build
aw daemon stop
aw daemon start

# Or for dev mode with hot reload
bun run dev
```

**Test 1: Analytics click-through (Task Types)**
```
1. Open web UI (http://localhost:8420 or :5173 in dev)
2. Go to Analytics tab (Tab 6)
3. Expand "Cost by Task Type" section
4. Click on any task type bar (e.g., "feature", "bugfix")

Expected:
- Automatically switches to Conversations tab
- Shows blue filter badge: "Task: feature" (or whatever you clicked)
- Only conversations of that task type are shown
- "Clear" button removes the filter
```

**Test 2: Analytics click-through (Quality Scores)**
```
1. Go to Analytics tab
2. Expand "Quality Score Distribution" section
3. Click on any quality bucket (e.g., "60-80")

Expected:
- Switches to Conversations tab
- Shows purple filter badge: "Quality: 60-80"
- Only conversations in that score range are shown
```

**Test 3: ConversationDetailModal**
```
1. Go to Conversations tab
2. Click on any conversation in the list
3. Observe the right panel shows detailed view

Expected (in detail panel):
- Overview section: Name (editable), Agent, Start time, Directory
- "Available Data" section showing:
  - Hook Session status (green = available, gray = not captured)
  - Transcript status (blue = available, gray = not found)
  - Match explanation (how correlation was determined)
- Auto Tags section (if enriched): Task type badge, auto-generated tags
- Quality Score section: Overall score, dimensional breakdown
- Outcome Signals: Exit codes, test results (if detected)
- Loop Detection: Yellow warning box if loops detected
- Git Changes: Lines added/removed, files changed
- Your Annotation section: Feedback buttons, user tags, notes
```

**Test 4: Annotation editing in ConversationDetailModal**
```
1. Select a conversation with a hook session
2. In the detail panel, find "Your Annotation" section
3. Click "Positive" or "Negative" feedback button
4. Click "Edit" next to Tags, add some tags (comma-separated)
5. Click "Edit" next to Notes, add a note
6. Refresh the page

Expected:
- Feedback button stays highlighted after selection
- Tags persist after save
- Notes persist after save
- Changes survive page refresh
```

**Test 5: Agent → Conversation linking**
```
1. Start a Claude session in a project directory
2. While it's running, open web UI → Agents tab
3. Look for your running agent in the list

Expected:
- Running agent shows 💬 indicator if a linked conversation exists
- Click agent to open AgentDetailModal
- "Conversation" tab shows linked conversation data
```

**Test 6: Filter combinations**
```
1. Go to Analytics → click a task type bar
2. In Conversations tab, also select a Match Type filter (e.g., "Full")
3. Also set Feedback filter to "Positive"

Expected:
- All filters work together (AND logic)
- Can clear individual filters independently
- Switching tabs and back preserves task type filter
```

**Test 7: Empty states and edge cases**
```
1. Apply filters that result in 0 conversations
   Expected: "No conversations match the current filters" message

2. Click a quality bucket with count=0
   Expected: Nothing happens (disabled click)

3. Press Escape while in ConversationDetailModal
   Expected: Modal closes (if modal view is open)
```

#### Feedback to Provide

Please test and report on:

1. **Analytics Click-through:**
   - Is the transition to Conversations tab smooth?
   - Are the filter badges clear and noticeable?
   - Would you want more click-through targets (projects, date ranges)?

2. **ConversationDetailModal:**
   - Is the information layout logical?
   - Is anything missing you'd want to see?
   - Is the data source status (hooks/transcript) display clear?
   - Are enrichment sections (quality, loops, git) useful?

3. **Annotation workflow:**
   - Is editing feedback/tags/notes intuitive?
   - Would inline editing (no edit button) be better?
   - Should there be keyboard shortcuts for feedback?

4. **Agent linking:**
   - Does the 💬 indicator help identify linked conversations?
   - Is the Conversation tab in AgentDetailModal useful?
   - Would you want to navigate directly to the full Conversations view?

5. **Filter UX:**
   - Are filter badges prominent enough?
   - Is the clear button easy to find?
   - Should filters persist across browser sessions?

6. **Bugs:**
   - Any click-through navigation failures?
   - Filter not applying correctly?
   - Modal not loading enrichment data?
   - Annotations not saving?

---

### Projects (First-Class Entity) ✨
**What:** Define projects to automatically group conversations by working directory
**Goal:** Organize sessions by project, enable project-level analytics, better contextualize work

**New Files:**
- `packages/daemon/src/project-matcher.ts` - cwd → project resolution
- Config types in `packages/daemon/src/config.ts`

**Changes:**
| File | Change |
|------|--------|
| `config.ts` | `ProjectConfig` type, TOML `[[projects.projects]]` parsing |
| `api.ts` | CRUD endpoints `/api/projects`, `/api/analytics/by-project` |
| `correlation.ts` | Added `project` field to Conversation, `attachProjects()` |
| `types.ts` | `Project`, `ProjectRef`, `AnalyticsByProjectResult` types |
| `client.ts` | `fetchProjects()`, `createProject()`, etc. |
| `SettingsPane.tsx` | Projects management UI section |
| `AnalyticsPane.tsx` | "Sessions by Project" chart section |

**API Endpoints:**
```
GET    /api/projects         - List all projects
GET    /api/projects/:id     - Get single project
POST   /api/projects         - Create project
PATCH  /api/projects/:id     - Update project
DELETE /api/projects/:id     - Delete project
GET    /api/analytics/by-project?days=30 - Analytics breakdown
```

**Storage:** `~/.config/agentwatch/config.toml`
```toml
[[projects.projects]]
id = "agentwatch"
name = "AgentWatch"
paths = ["~/Documents/GitHub/agentwatch"]
description = "Monitoring dashboard"
```

#### Manual Testing Instructions

**Prerequisites:**
```bash
# Rebuild packages and restart daemon
bun run build
aw daemon stop
aw daemon start
```

**Test 1: Create a project via Settings UI**
```
1. Open web UI (http://localhost:8420 or :5173 in dev)
2. Go to Settings tab (Tab 9)
3. Find "Projects" section
4. Click "+ Add Project"
5. Fill in:
   - ID: "test-project" (auto-slugifies)
   - Name: "Test Project"
   - Paths: one of your project directories (e.g., ~/Documents/GitHub/agentwatch)
   - Description: optional
6. Click "Create"

Expected: Project appears in list with name, ID badge, and paths shown
```

**Test 2: Edit and delete project**
```
1. Click "Edit" on an existing project
2. Change the name or add/remove paths
3. Click "Update"

Expected: Changes saved, list updated

4. Click "Delete" on a project
5. Confirm deletion

Expected: Project removed from list
```

**Test 3: Verify auto-linking in Conversations**
```
1. Run some Claude sessions in a directory matching a project path
2. Go to Conversations tab
3. Look for conversations from that directory

Expected: Conversations show project name badge or reference
         (Note: project field is included in API response)
```

**Test 4: View Analytics by Project**
```
1. Go to Analytics tab
2. Scroll to "Sessions by Project" section (collapsed by default)
3. Click to expand

Expected:
- Bar chart showing sessions per project
- Cost column per project
- Success rate indicator
- "Unassigned" row for sessions without matching project
- Message "Define projects in Settings..." if no projects exist
```

**Test 5: API direct access**
```bash
# List projects
curl http://127.0.0.1:8420/api/projects | jq

# Get analytics by project
curl "http://127.0.0.1:8420/api/analytics/by-project?days=30" | jq

# Create project via API
curl -X POST http://127.0.0.1:8420/api/projects \
  -H "Content-Type: application/json" \
  -d '{"id":"cli-test","name":"CLI Test","paths":["~/test"]}'
```

**Test 6: TOML persistence**
```bash
# After creating projects, check config file
cat ~/.config/agentwatch/config.toml

Expected: [[projects.projects]] entries for each project
```

**Test 7: Subdirectory matching**
```
1. Create a project with path "~/Documents/GitHub/agentwatch"
2. Run a Claude session in "~/Documents/GitHub/agentwatch/packages/daemon"
3. Check if the session is linked to the project

Expected: Subdirectories automatically match to parent project
```

#### Feedback to Provide

Please test and report on:

1. **Usability:**
   - Is the Projects section in Settings intuitive?
   - Is the multi-line path input clear (one per line)?
   - Are error messages helpful (e.g., duplicate ID)?

2. **Auto-linking:**
   - Do your sessions correctly link to projects by cwd?
   - Is subdirectory matching working?
   - Would you want manual project assignment for edge cases?

3. **Analytics:**
   - Is the "Sessions by Project" visualization useful?
   - Would you want to click projects to filter conversations (like task types)?
   - What other project-level metrics would be valuable?

4. **Missing features:**
   - Should projects show in Conversations list as a filter option?
   - Would project tags/colors be useful?
   - Should there be a project detail view?
   - Export/import projects between machines?

5. **Bugs:**
   - Any path expansion issues (~ not working)?
   - Project not saving to TOML?
   - Sessions not linking correctly?
   - UI not updating after changes?

---

## Added (2026-01-01)

### Enrichment System ✨
**What:** Auto-computed session enrichments for every hook session
**Files:** `packages/daemon/src/enrichments/`, `packages/daemon/src/enrichment-store.ts`
**Features:**
- **Auto-Tags:** Task type classification (feature, bugfix, refactor, test, docs, config, exploration)
- **Quality Score:** 0-100 rating with dimensional breakdown (completion, code quality, efficiency, safety)
- **Outcome Signals:** Test results, exit codes, lint results, build status
- **Loop Detection:** Identifies retry loops, oscillations, dead ends with iteration counts
- **Diff Snapshots:** Git changes tracking (lines added/removed, files changed, commits created)
- **Manual Annotations:** Thumbs up/down feedback, custom tags, notes
**API:**
- `GET/POST /api/enrichments/:sessionId` - Get/update enrichments
- `POST /api/enrichments/compute` - Trigger auto-enrichment
- `GET /api/analytics/*` - Dashboard, trends, cost breakdown
**Storage:** `~/.agentwatch/enrichments/*.jsonl` (JSONL audit trail)
**Tests:** `packages/daemon/test/enrichments.test.ts` (task inference, quality scores, loop detection)

### Conversations Pane (Web UI)
**What:** Browse all enriched sessions with rich filtering and annotation
**File:** `web/src/components/ConversationsPane.tsx`
**Features:**
- Filter by match type, feedback status, task type
- Sort by time, quality score, or cost
- View all enrichments, auto-tags, quality scores, outcome signals
- Edit annotations (tags, notes, feedback) inline
- Links to correlated sessions across sources

### Analytics Pane (Web UI)
**What:** Dashboards and charts for session analytics
**File:** `web/src/components/AnalyticsPane.tsx`
**Features:**
- Time-range selector (7, 14, 30 days)
- Summary: total sessions, success rate, total cost, average duration
- Success trend chart with stacked visualization
- Cost breakdown by task type bar chart
- Quality score distribution histogram

### Settings Persistence
**What:** Settings now persist to TOML config file
**File:** `packages/daemon/src/config.ts`
**Storage:** `~/.config/agentwatch/config.toml`
**UI:** Settings Manager header with organized sections

### Session Annotations & Heuristic Scoring
**What:** Thumbs up/down buttons + automatic success detection
**Files:** `packages/daemon/src/annotations.ts`
**Heuristics:** noFailures (30pts), hasCommits (25pts), normalEnd (20pts), reasonableToolCount (15pts), healthyPacing (10pts)
**Classifications:** `likely_success` (≥70), `uncertain` (40-69), `likely_failed` (<40)
**Storage:** `~/.agentwatch/annotations.json`

### Token/Cost Tracking
**What:** Hook sessions track token usage and costs from Stop hooks
**Fields:** `totalInputTokens`, `totalOutputTokens`, `estimatedCostUsd`, `autoContinueAttempts`
**UI:** Cost display in HooksPane per-session and hourly totals

### Pre-Share Field Grouping
**What:** Preparation pipeline groups fields by source type with redaction info
**Fields:** `fieldsBySource`, `redactionInfoMap`
**Tests:** `packages/pre-share/test/preparation.test.ts`

### UI Improvements
- Tab overflow with horizontal scroll
- Conversations and Analytics tabs added
- Settings Manager header organization
- Cost display per-session and hourly totals

---

## Recently Fixed (2025-01-01)

### Dev Mode Didn't Start Server
**Problem:** `bun run dev:daemon` watched `src/index.ts` which is just exports, not a server start.
**Fix:** Created `packages/daemon/src/dev.ts` that actually starts the DaemonServer.
**Related:** Added `dev:debug` scripts for request logging (`DEBUG=1`).

### Tool Timeline Empty After Daemon Restart
**Problem:** Hook sessions were loaded from `sessions.jsonl` (including `tool_count`), but individual tool usages weren't loaded from `tool_usages.jsonl`. Result: "Tools (9)" tab showed but timeline was empty.
**Fix:** Added loading of tool usages in `packages/monitor/src/hook-store.ts` during startup.

### Hook Session Preview Showed Raw JSON
**Problem:** Review/Share tab preview showed `session: {...} | tool_usages: [214 items]` instead of formatted content.
**Fix:** Updated `formatChatPreview()` in `packages/pre-share/src/pipeline/utils.ts` to handle hook session format, showing working directory, permission mode, and tool timeline.

---

## TODO: Remaining Work

### High Priority (Usability)

- [x] **Wire correlation into web UI** ✅ (2026-01-02)
  - ~~Update `web/src/components/AgentPane.tsx` to use `/api/contrib/correlated`~~
  - ~~Show match confidence in session list~~
  - ~~Merge hook data + transcript data in display~~
  - Done via ConversationContext integration

- [x] **Complete ConversationsPane context integration** ✅ (2026-01-02)
  - Now uses shared context for conversations and names
  - Supports filter state from context (analytics click-through)
  - Still maintains own detailed enrichments state for complex UI

- [x] **Add ConversationDetailModal component** ✅ (2026-01-02)
  - Reusable modal for full conversation view
  - Shows transcript, hooks, enrichments, annotations
  - Keyboard navigation (Escape to close)

- [x] **Add analytics click-through** ✅ (2026-01-02)
  - Task type bars → filter conversations
  - Quality buckets → filter by score range
  - Clear filter buttons in ConversationsPane

- [x] **Test full Hugging Face flow** ✅ (2026-01-03)
  - Manual integration test: `packages/daemon/test/huggingface-integration.test.ts`
  - Run with: `HF_INTEGRATION_TEST=1 HF_TEST_REPO=you/test bun test huggingface-integration.test.ts`
  - Tests auth detection, token validation, dataset access, direct commit, and PR upload

- [x] **Format schemas integrated** ✅ (resolved 2026-01-03)
  - Serves data dictionaries via `/api/reference/format-schemas`
  - Documents Claude, Codex, Gemini, OpenCode transcript formats
  - No deletion needed - useful as reference API

### Self-Documenting UI Initiative ✅

Goal: Move routine reference info into the UI itself, reducing reliance on external docs.

**Completed (2026-01-05):**
- [x] **Config option tooltips** - Added InfoTooltip component to SettingsPane toggles (Test Gate, Process Snapshots, Transcript Days)
- [x] **Data storage footers** - Added storage paths to ConversationsPane and AnalyticsPane headers
- [x] **Hook type descriptions** - Added hook types grid to HooksPane info banner, HookTypeInfo badges in RulesOverview
- [x] **Enrichment field glossary** - Added EnrichmentTooltip component with 20+ field definitions, applied to ConversationsPane sections

**New components created:**
- `web/src/components/ui/InfoTooltip.tsx` - InfoTooltip, StorageInfo, HookTypeInfo, EnrichmentTooltip components
- `HOOK_DESCRIPTIONS` - 9 hook types with summary, when, and use case
- `ENRICHMENT_GLOSSARY` - 20+ enrichment field definitions

**Medium effort (TODO):**
- [ ] **API browser endpoint** - Create `/api/reference/endpoints` returning endpoint metadata
- [ ] **API browser UI** - Component showing live endpoint docs (descriptions, params, response schemas)
- [ ] **Field schema popovers** - Show type info in ContribPane when selecting fields for export

**Philosophy:**
- UI explains itself → docs become tutorials/architecture only
- "Where is data stored?" answered in-context, not in markdown
- API reference auto-generated from code, not maintained separately

**Docs assessment (2026-01-05):**
- Technical reference docs (API, CLI, Config) stay in docs/ but link from UI
- Vision doc in internal/ is fine for contributors - could move to external blog later
- Tutorials/guides stay in docs/ - essential for onboarding

### Medium Priority (Polish)

- [ ] **Add contribution stats dashboard**
  - Track bundles created/uploaded over time
  - Show sanitization effectiveness
  - Session selection patterns

- [x] **Output format test coverage** ✅ (resolved 2026-01-03)
  - `packages/pre-share/test/output-formats.test.ts` has 50+ tests
  - Covers: JSONL generation, session JSONL, path redaction, markdown header/content/roles/blocks

- [ ] **Add preference signal controls**
  - License selection UI
  - AI training preference signals
  - Per-session vs global defaults

### Low Priority (Future)

- [ ] **Automated contribution flow**
  - Schedule regular preparation
  - Auto-approve option
  - Background upload

- [ ] **Expand agent support**
  - Cursor (new agent)
  - Windsurf (new agent)
  - Better Codex support

### Not Feasible

- **Claude Code Web integration** ❌
  - Investigated 2026-01-03
  - Web version only surfaces final artifacts (PR diffs), not the process
  - No hooks, no local storage, no API to export conversation history
  - PRs contain no tool usage data, just the diff
  - Would require browser extension (fragile, high maintenance)
  - **Conclusion:** CLI is the only option for observability into agent behavior

- [ ] **Collective coordination**
  - Aggregate contributions
  - Shared datasets

---

## Likely Pitfalls

### 1. Daemon State Loss
The daemon keeps state in memory. Restarting it loses:
- ~~Active session tracking~~ ✅ Now loads from `sessions.jsonl` (24h)
- ~~Tool usage timeline~~ ✅ Now loads from `tool_usages.jsonl` (24h)
- HF token cache (persists to `contributor.json`)
- In-progress uploads

**Status:** Mostly mitigated. Sessions and tool usages now persist to JSONL and load on restart (last 24h).

### 2. Path Redaction Inconsistency
Two different redaction formats in codebase:
- `<USER>` (some older code)
- `[REDACTED]` (current standard)

**Mitigation:** Grep for `<USER>` and normalize to `[REDACTED]`.

### 3. Timestamp Handling
Mixed use of:
- Unix timestamps (seconds)
- JavaScript timestamps (milliseconds)
- ISO strings

**Mitigation:** Fixed in `correlation.ts:119`, `api.ts`, and web UI (`RepoPane.tsx`, `PortsPane.tsx`). All `formatAge` functions now correctly handle millisecond timestamps.

### 4. Web UI vs Pages Divergence
Two separate UIs that should behave similarly:
- `web/` - React dashboard, more features
- `pages/` - Static site, simpler

**Mitigation:** Keep contribution flow identical, use same pre-share package.

### 5. Browser Build Compatibility
`@agentwatch/pre-share` has browser build (`dist/browser.js`) but:
- Some imports may pull in Node APIs
- Not tested in all browsers

**Mitigation:** Test in Safari/Firefox, not just Chrome.

---

## Test Commands

```bash
# Run all pre-share tests
cd packages/pre-share && bun test

# Run with coverage
bun test --coverage

# Build pages
cd pages && bun run build

# Start daemon
agentwatch daemon start

# Check daemon status
agentwatch daemon status
```

---

## Files to Know

| File | Purpose |
|------|---------|
| `packages/daemon/src/api.ts` | All REST endpoints (~3500 lines) |
| `packages/daemon/src/api-enrichments.ts` | Enrichment & analytics API endpoints |
| **`packages/daemon/src/research-profiles.ts`** | **Research-oriented redaction profiles (single source of truth)** |
| `packages/daemon/src/contributor-settings.ts` | Contributor settings, artifact linking |
| `packages/daemon/src/enrichments/` | Auto-enrichment modules (quality, loops, tags) |
| `packages/daemon/src/enrichment-store.ts` | Enrichment persistence (JSONL) |
| `packages/daemon/src/annotations.ts` | Session annotations & heuristic scoring |
| `packages/daemon/src/correlation.ts` | Session matching logic + `attachProcessSnapshots()` + `attachProjects()` |
| `packages/daemon/src/config.ts` | Configuration loading & TOML persistence (incl. Projects) |
| **`packages/daemon/src/project-matcher.ts`** | **cwd → project resolution (exact + subdirectory match)** |
| `packages/daemon/src/session-logger.ts` | Process log persistence |
| `packages/daemon/src/local-logs.ts` | Transcript discovery |
| `packages/daemon/src/huggingface.ts` | HuggingFace upload logic |
| `packages/monitor/src/hook-store.ts` | Hook session tracking + cleanup |
| **`packages/monitor/src/session-store.ts`** | **Managed session persistence (`aw run`)** |
| **`packages/cli/src/commands/run.ts`** | **`aw run` command** |
| **`packages/cli/src/commands/sessions.ts`** | **`aw sessions` command** |
| `packages/pre-share/src/` | Sanitization library (137 tests) |
| **`web/src/context/ConversationContext.tsx`** | **Shared conversation state + filter provider** |
| **`web/src/components/ConversationCard.tsx`** | **Reusable conversation display** |
| **`web/src/components/ConversationDetailModal.tsx`** | **Full conversation detail modal** |
| `web/src/components/ConversationsPane.tsx` | Enriched sessions browser |
| `web/src/components/AgentPane.tsx` | Running agents + conversation linking |
| `web/src/components/AgentDetailModal.tsx` | Agent details + Conversation tab |
| `web/src/components/AnalyticsPane.tsx` | Analytics dashboards |
| `web/src/components/ContribPane.tsx` | Contribution UI (uses context) |
| **`web/src/components/ResearchProfileSelector.tsx`** | **Research profile selection UI** |
| `web/src/App.tsx` | Main app, tab navigation, ConversationProvider |

## Key Documentation

| Doc | Purpose |
|-----|---------|
| `docs/data-sources.md` | What data agentwatch collects vs reads |
| `docs/memory-management.md` | Memory cleanup strategy (disk vs memory) |
| `docs/security-and-sharing.md` | How to safely share transcripts |

---

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Internal roadmap; verified file paths |
| Bug fixes documented | 2025-01-01 | Claude | Dev mode, tool timeline, hook preview |
| Enrichment system added | 2026-01-01 | Claude | Conversations, Analytics panes; auto-enrichment |
| Test coverage updated | 2026-01-01 | Claude | 430 tests total; API tests added |
| **Conversation unification** | 2026-01-02 | Claude | ConversationContext, AgentPane linking, ContribPane integration |
| **ConversationDetailModal + click-through** | 2026-01-02 | Claude | Modal component, analytics→conversations filter navigation |
| **Session Manager (`aw run`)** | 2026-01-02 | Claude | `aw run`, `aw sessions` commands + manual test guide |
| **Projects feature** | 2026-01-02 | Claude | CRUD API, auto-linking, analytics, Settings UI |
| **Contribution workflow enhancements** | 2026-01-03 | Claude | Workflow filter in ContribPane, contributed badge, auto-status update, session ID tracking |
| **Research profiles + artifact linking** | 2026-01-03 | Claude | Research-oriented profiles, artifact linking API, 40 new tests |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
