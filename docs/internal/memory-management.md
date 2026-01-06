# Memory Management

This document describes how agentwatch manages memory to prevent leaks during long-running daemon operation.

> **Important:** Memory cleanup does NOT delete your data. All events are permanently stored in JSONL files on disk. Cleanup only removes old entries from in-memory caches to keep the daemon responsive.

## Overview

The agentwatch daemon runs continuously and accumulates data from:
- Agent processes (sessions, tool usages)
- Git commits
- Port scans
- Process scans

Without proper cleanup, these data structures would grow unbounded and eventually cause memory issues.

## Data Persistence vs Memory

Agentwatch uses a two-tier storage model:

```
┌─────────────────────────────────────────────────────────────┐
│                     DISK (Permanent)                        │
│  ~/.agentwatch/hooks/                                       │
│  ├── sessions.jsonl      ← All sessions, forever            │
│  ├── tool_usages.jsonl   ← All tool calls, forever          │
│  ├── commits.jsonl       ← All git commits, forever         │
│  └── stats.json          ← Aggregated statistics            │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ append on each event
                              │
┌─────────────────────────────────────────────────────────────┐
│                    MEMORY (Fast Access)                     │
│  In-memory Maps for quick API responses                     │
│  ├── sessions: Map        ← Recent sessions only            │
│  ├── toolUsages: Map      ← Recent + size-limited           │
│  ├── gitCommits: Map      ← Recent commits only             │
│  └── dailyStats: Map      ← Recent days only                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ cleanupOldData() removes old entries
                         (disk files unchanged)
```

**Key points:**
- Every event is immediately appended to disk (JSONL files)
- Memory only holds recent data for fast API queries
- `cleanupOldData()` only clears memory, not disk
- Full history always available in JSONL files for export/analysis

## Cleanup Mechanisms

### 1. HookStore Cleanup

The `HookStore` class manages session data and tool usage tracking. It provides `cleanupOldData()` which is called hourly by the daemon.

**What gets cleaned:**

| Data | Retention | Size Limit |
|------|-----------|------------|
| Sessions | 30 days | None |
| Tool Usages | 30 days | 10,000 entries |
| Git Commits | 30 days | None |
| Daily Stats | 30 days | None |
| Tool Stats | Permanent | ~100 tools |

**Usage:**
```typescript
// Called automatically every hour by DaemonServer
hookStore.cleanupOldData(30, 10000);

// Parameters:
// - maxDays: Remove entries older than this (default: 30)
// - maxToolUsages: Maximum tool usages to keep (default: 10000)
```

### 2. ProcessScanner Cleanup

The `ProcessScanner` maintains caches for:
- `lastActive`: Last activity timestamp per PID
- `cwdCache`: Working directory cache per PID

These are cleaned on every scan via `pruneCache()`:
```typescript
// Automatically called after each process scan
private pruneCache(seenPids: number[]): void {
  // Removes entries for PIDs no longer running
}
```

### 3. PortScanner Cleanup

The `PortScanner` maintains a `firstSeenCache` for tracking when ports were first detected.

Cleaned automatically after each scan:
```typescript
// Prunes entries for ports no longer listening
for (const key of this.firstSeenCache.keys()) {
  if (!seenKeys.has(key)) {
    this.firstSeenCache.delete(key);
  }
}
```

### 4. Dead Session Cleanup

Active sessions are correlated with running processes. When a process dies:

```typescript
// Called when agent list updates
hookStore.cleanupDeadSessions(liveAgents, staleThresholdMs);
```

Sessions are ended automatically if:
- Their associated PID is no longer running
- They've been inactive for >1 hour
- They've been inactive for >5 minutes AND no matching process exists in their cwd

## Daemon Cleanup Schedule

| Cleanup Task | Frequency | Method |
|--------------|-----------|--------|
| Old data (30 days) | Hourly | `HookStore.cleanupOldData()` |
| Tool usage size limit | Hourly | `HookStore.cleanupOldData()` |
| Process cache | Every scan (~2s) | `ProcessScanner.pruneCache()` |
| Port cache | Every scan (~2s) | `PortScanner.scanPorts()` |
| Dead sessions | Every scan (~2s) | `HookStore.cleanupDeadSessions()` |
| Process logs | Hourly | `ProcessLogger.rotateLogs()` |

## Memory Usage Guidelines

Expected memory usage for typical workloads:

| Data Type | Typical Size | Memory |
|-----------|--------------|--------|
| 1000 tool usages | ~500KB | Low |
| 100 sessions | ~50KB | Low |
| 50 git commits | ~10KB | Low |
| Process cache (50 PIDs) | ~5KB | Negligible |
| Port cache (20 ports) | ~2KB | Negligible |

**Total expected:** <10MB for typical developer usage

## Testing Memory Management

Tests for cleanup are in `packages/monitor/test/hook-store.test.ts`:

```bash
bun test test/hook-store.test.ts
```

Tests verify:
- Old sessions are removed after maxDays
- Old git commits are cleaned up
- Tool usage size limits are enforced
- Time-based tool usage cleanup works
- Recent data is preserved

## Troubleshooting

### Symptoms of Memory Issues

1. **Growing memory over time** - Check if cleanup interval is running
2. **Large tool usage count** - May need lower size limit
3. **Stale sessions accumulating** - Check cleanupDeadSessions correlation

### Debugging Commands

```bash
# Check daemon memory usage
ps aux | grep agentwatch

# View current data sizes (via API)
curl http://localhost:8420/api/stats

# Force cleanup manually (restart watcher)
aw watcher restart
```

### Configuration

Currently cleanup parameters are hardcoded. Future versions may allow configuration:

```yaml
# Potential future config
daemon:
  cleanup:
    max_days: 30
    max_tool_usages: 10000
    cleanup_interval_hours: 1
```

## See Also

- [Data Sources](./data-sources.md) - Where agentwatch stores data and privacy details
- [Security Guide](./security.md) - Security overview and how it enables sharing

---

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Internal doc; verified against codebase |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
