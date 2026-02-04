# Orchestrator SDK — Audit Issues

Comprehensive audit of the orchestrator-sdk dispatch daemon and surrounding services.
Generated 2026-02-03 from rounds 1-3 of post-implementation review.

---

## Status Legend

- **OPEN** — Not yet fixed
- **FIXED** — Fix committed
- **WONTFIX** — Accepted risk / deferred

---

## CRITICAL — Security

### C-1. Command injection in `WorktreeManager.execGit`

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/git/worktree-manager.ts:799-805` |
| **Severity** | CRITICAL |
| **Category** | Command Injection |

**Problem:** `execGit` concatenates args into a shell string and passes it to `child_process.exec()`:

```typescript
private async execGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const command = `git ${args.join(' ')}`;
  return execAsync(command, { cwd: this.config.workspaceRoot, encoding: 'utf8' });
}
```

Any argument containing shell metacharacters (`` ` ``, `$(...)`, `;`, `|`, `&&`) is interpreted by the shell. Branch names from `customBranch`, paths from `customPath`, and slugs derived from task titles are all passed through this method. While `createSlugFromTitle` sanitizes to `[a-z0-9\s-]`, custom inputs bypass that.

**Fix:** Replace `exec` with `execFile` (or `child_process.spawn`) which takes an args array and does not invoke a shell:

```typescript
import { execFile } from 'node:child_process';
const execFileAsync = promisify(execFile);

private async execGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd: this.config.workspaceRoot, encoding: 'utf8' });
}
```

---

### C-2. Code injection in `evaluateCondition` via `new Function()`

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/steward-scheduler.ts:370-391` |
| **Severity** | CRITICAL |
| **Category** | Code Injection |

**Problem:** The `condition` string from event trigger configuration is interpolated into `new Function()`:

```typescript
const fn = new Function(
  ...contextKeys,
  `try { return Boolean(${condition}); } catch { return false; }`
);
return fn(...contextValues);
```

Despite the comment claiming "limited scope," `new Function()` executes in global scope with full access to `process`, `require`, `globalThis`, etc. If steward trigger conditions are editable (via API, config files, or agent metadata), this is arbitrary code execution.

**Fix:** Replace `new Function()` with a safe expression evaluator. Options:
1. A whitelist-based predicate parser (e.g., `field === value && field2 > 10`)
2. A sandboxed evaluator like `expr-eval` or `filtrex`
3. Remove dynamic conditions entirely and use structured trigger config

---

### C-3. Shell injection via PTY write in `spawnInteractive`

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/runtime/spawner.ts:1137,1206,1234-1235` |
| **Severity** | CRITICAL |
| **Category** | Command Injection |

**Problem:** `initialPrompt` is pushed as a bare positional arg, joined with spaces, and written directly to the PTY shell:

```typescript
// line 1234-1235
if (options?.initialPrompt) {
  args.push(options.initialPrompt);
}

// line 1137
const claudeCommand = [this.defaultConfig.claudePath!, ...args].join(' ');

// line 1206
ptyProcess.write(claudeCommand + '\r');
```

Shell metacharacters in the prompt (which comes from task descriptions, triage prompts, or forwarded messages) are interpreted by the shell.

**Fix:** Quote the prompt argument before writing to the PTY, or use `--prompt` flag with proper escaping. Alternatively, write the prompt to a temp file and pass `--prompt-file`.

---

## HIGH — Data Integrity / Correctness

### H-1. `messageSession` is unimplemented — persistent agent messages silently dropped

| Field | Value |
|-------|-------|
| **Status** | FIXED |
| **File** | `packages/orchestrator-sdk/src/runtime/session-manager.ts:917-933` |
| **Severity** | HIGH |
| **Category** | Silent Data Loss |

**Problem:** The method body contains a `TODO` comment and `void messageParams`. It returns `{ success: true }` without sending anything:

```typescript
// TODO: Use InboxService to send the message
// const messageId = await this.api.sendMessage(messageParams);
void messageParams; // Acknowledge params until full implementation

return { success: true };
```

The dispatch daemon calls `messageSession` for persistent workers and directors (`dispatch-daemon.ts:970-976`). All forwarded messages to those agents are silently lost while the caller believes delivery succeeded.

**Fix:** Implement the message sending logic, or change the return to `{ success: false, error: 'Not implemented' }` so callers know delivery failed.

---

### H-2. Stale closure reference in `setupSessionEventForwarding`

| Field | Value |
|-------|-------|
| **Status** | FIXED |
| **File** | `packages/orchestrator-sdk/src/runtime/session-manager.ts:1060-1130` |
| **Severity** | HIGH |
| **Category** | State Corruption |

**Problem:** The `event` and `pty-data` handlers capture `session` by closure and spread from it:

```typescript
spawnerEvents.on('event', (event) => {
  session.events.emit('event', event);
  const updated: InternalSessionState = {
    ...session,  // <-- always the ORIGINAL captured session
    lastActivityAt: createTimestamp(),
    persisted: false,
  };
  this.sessions.set(session.id, updated);
});
```

`session` always points to the original state object. Each event handler creates a new object from the original, discarding any updates made by previous events or other handlers. For example, if a `status` change occurs between two `event` emissions, the second emission overwrites the status back to the original value.

The `exit` handler correctly re-fetches via `this.sessions.get(session.id)`, but the `event` and `pty-data` handlers do not.

**Fix:** Re-fetch current state from `this.sessions.get(session.id)` in every handler before spreading:

```typescript
spawnerEvents.on('event', (event) => {
  const current = this.sessions.get(session.id);
  if (!current) return;
  current.events.emit('event', event);
  this.sessions.set(session.id, { ...current, lastActivityAt: createTimestamp(), persisted: false });
});
```

---

### H-3. `dispatch()` assigns task before checking channel — no rollback

| Field | Value |
|-------|-------|
| **Status** | FIXED |
| **File** | `packages/orchestrator-sdk/src/services/dispatch-service.ts:235-244` |
| **Severity** | HIGH |
| **Category** | Inconsistent State |

**Problem:** The `dispatch()` method assigns the task at line 235, then checks for the agent's channel at line 242:

```typescript
await this.taskAssignment.assignToAgent(taskId, agentId, assignmentOptions);  // line 235

const channel = await this.agentRegistry.getAgentChannel(agentId);           // line 242
if (!channel) {
  throw new Error(`Agent channel not found for agent: ${agentId}`);          // line 244
}
```

If the channel lookup fails, the task remains assigned to an agent that was never notified. The assignment is not rolled back.

**Fix:** Check channel existence before assigning, or add rollback logic (`unassignTask`) in the catch path.

---

### H-4. No agent name uniqueness check during registration

| Field | Value |
|-------|-------|
| **Status** | FIXED |
| **File** | `packages/orchestrator-sdk/src/services/agent-registry.ts:260,295,332` |
| **Severity** | HIGH |
| **Category** | Data Integrity |

**Problem:** `registerDirector`, `registerWorker`, and `registerSteward` all create agents without checking if an agent with the same name already exists. `getAgentByName` exists but is never called during registration.

Duplicate agents cause:
- Ambiguous `getAgentByName` lookups (returns first match only)
- Conflicting worktree paths (same `{agentName}-{slug}` pattern)
- Duplicate channel creation

**Fix:** Add a uniqueness check at the start of each registration method:

```typescript
const existing = await this.getAgentByName(input.name);
if (existing) {
  throw new Error(`Agent with name '${input.name}' already exists: ${existing.id}`);
}
```

---

### H-5. No double-assignment guard in `assignToAgent`

| Field | Value |
|-------|-------|
| **Status** | FIXED |
| **File** | `packages/orchestrator-sdk/src/services/task-assignment-service.ts:359-413` |
| **Severity** | HIGH |
| **Category** | Race Condition |

**Problem:** `assignToAgent()` overwrites `task.assignee` with no check for an existing assignee. A task actively being worked by one agent can be silently reassigned to another without conflict detection or notification to the original assignee.

Combined with the dispatch daemon's race window between `getUnassignedTasks()` and `dispatch()`, this enables double-dispatch of the same task to two workers.

**Fix:** Check for existing assignee before assignment:

```typescript
if (task.assignee && task.assignee !== agentId) {
  throw new Error(`Task ${taskId} is already assigned to ${task.assignee}`);
}
```

---

## MEDIUM — Reliability / Performance

### M-1. Sessions map grows unboundedly (memory leak)

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `session-manager.ts` (sessions Map), `spawner.ts:534` (sessions Map) |
| **Severity** | MEDIUM |
| **Category** | Memory Leak |

**Problem:** Terminated sessions are updated in the map but never deleted. Each `InternalSessionState` carries an `EventEmitter`. Over long daemon lifetimes this is a steady memory leak. `listActiveSessions()` and `listSessions()` filter out terminated sessions from results, but the underlying map entries persist forever.

**Fix:** Remove sessions from the map after they are terminated and persisted. Add a cleanup step after `persistSession` in the exit handler, or implement a periodic sweep of terminated sessions older than N minutes.

---

### M-2. `listAgents` and `listAssignments` fetch all entities then filter in-memory

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `agent-registry.ts:391-406`, `task-assignment-service.ts:700-757` |
| **Severity** | MEDIUM |
| **Category** | Performance |

**Problem:** Both methods call `this.api.list({ type: 'entity' })` or equivalent, which fetches every entity/task in the system. Filtering happens in-memory after the full fetch. For workspaces with many non-agent entities (tasks, documents, channels, messages), this degrades linearly.

**Fix:** Add tag-based or metadata-based pre-filtering to the API's `list()` method, or maintain an in-memory agent index that is updated on registration/deregistration.

---

### M-3. `parseCronToIntervalMs` is a naive approximation

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/steward-scheduler.ts:875-915` |
| **Severity** | MEDIUM |
| **Category** | Incorrect Behavior |

**Problem:** Converts cron expressions to fixed intervals. `0 9 * * *` (daily at 9am) becomes a 24-hour interval starting from scheduler boot, not at 9am. Weekday fields are parsed but ignored (`_weekday` is unused at line 884). Unrecognized patterns silently fall back to a 15-minute interval (line 914), which could trigger stewards far more often than intended.

**Fix:** Use a proper cron library (`node-cron`, `cron-parser`) that calculates the next fire time from the current time, rather than converting to a fixed interval.

---

### M-4. `updateConfig` does not restart the setInterval

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/dispatch-daemon.ts:634-636` |
| **Severity** | MEDIUM |
| **Category** | Configuration Bug |

**Problem:** `updateConfig()` normalizes the new config but does not restart the `setInterval`. If `pollIntervalMs` changes, the old interval continues at the old frequency forever. Other config changes (enable/disable flags) take effect immediately because they are checked inside `runPollCycle`, but the interval timing is set once in `start()`.

**Fix:** If the daemon is running and `pollIntervalMs` changed, clear and recreate the interval:

```typescript
updateConfig(config: Partial<DispatchDaemonConfig>): void {
  const oldInterval = this.config.pollIntervalMs;
  this.config = this.normalizeConfig({ ...this.config, ...config });
  if (this.running && this.config.pollIntervalMs !== oldInterval) {
    clearInterval(this.pollIntervalHandle);
    this.pollIntervalHandle = setInterval(() => { ... }, this.config.pollIntervalMs);
  }
}
```

---

### M-5. No timeout on git operations

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/git/worktree-manager.ts:799-805` |
| **Severity** | MEDIUM |
| **Category** | Reliability |

**Problem:** `execAsync` has no timeout configured. A hanging git operation (e.g., waiting for credentials, network timeout during `git remote show origin`) blocks the entire daemon indefinitely. This is called from `initWorkspace`, `createWorktree`, `createReadOnlyWorktree`, `removeWorktree`, `listWorktrees`, and branch operations.

**Fix:** Add a timeout option to `execAsync`:

```typescript
return execAsync(command, { cwd: ..., encoding: 'utf8', timeout: 30_000 });
```

(This fix should be combined with C-1's switch to `execFile`.)

---

### M-6. Non-atomic agent registration (entity + channel + metadata)

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/agent-registry.ts:277-290` |
| **Severity** | MEDIUM |
| **Category** | Inconsistent State |

**Problem:** Each registration method performs three sequential API operations:

1. Create entity (`this.api.create(entity)`) — line 277
2. Create channel (`this.createAgentChannel(...)`) — line 285
3. Update metadata with channel ID (`this.updateAgentMetadata(...)`) — line 288

If step 2 fails, the entity exists without a channel. If step 3 fails, the entity and channel exist but aren't linked. No rollback mechanism exists. The same pattern applies to `registerWorker` (lines 314-329) and `registerSteward` (lines 352-368).

**Fix:** Add rollback logic: if channel creation fails, delete the entity. If metadata update fails, delete the channel and entity. Alternatively, use a transaction if the storage backend supports it.

---

### M-7. In-memory state lost on crash — orphaned processes

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | Cross-cutting: `session-manager.ts`, `spawner.ts`, `worktree-manager.ts`, `steward-scheduler.ts` |
| **Severity** | MEDIUM |
| **Category** | Crash Recovery |

**Problem:** On daemon crash, all in-memory state is lost:
- `SessionManager.sessions` and `agentSessions` maps — running sessions become invisible
- `SpawnerService.sessions` — spawned processes become orphans with no parent tracking them
- `WorktreeManager.worktreeStates` — all states reset to `active` on next init
- `StewardScheduler.cronJobs`, `eventSubscriptions`, `executionHistory` — all lost

Only agent metadata in the database survives. After restart, agents that were `running` still show as `running` in the DB but have no corresponding in-memory session or process.

**Fix:** On startup, reconcile DB state with reality:
1. Check all agents with `sessionStatus: 'running'` — verify PIDs are alive (use `isProcessAlive` from round 3)
2. Reset dead agents to `idle`
3. Run `git worktree prune` (already added in round 3)
4. Rebuild in-memory state from DB where possible

---

### M-8. No graceful shutdown coordination

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/dispatch-daemon.ts:327-338` |
| **Severity** | MEDIUM |
| **Category** | Reliability |

**Problem:** `stop()` only clears the `setInterval`. It does not:
- Wait for in-flight poll cycles to complete (the `polling` flag guards entry but doesn't signal completion)
- Stop running agent sessions
- Clean up worktrees
- Persist final state
- Flush pending writes

**Fix:** Track the current poll cycle promise. In `stop()`, await it. Optionally stop all active sessions gracefully and persist final state before returning.

---

### M-9. `checkInterval` leak in spawner `terminate()`

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/runtime/spawner.ts:626-632` |
| **Severity** | MEDIUM |
| **Category** | Resource Leak |

**Problem:** In the `terminate()` method, a `setInterval` polls session status every 100ms. If the timeout fires first (line 617-622), it calls `resolve()` but does **not** clear `checkInterval`. The interval keeps running indefinitely, polling a terminated session.

**Fix:** Clear `checkInterval` in the timeout callback:

```typescript
const timeout = setTimeout(() => {
  clearInterval(checkInterval);  // <-- add this
  // ... rest of timeout logic
}, gracefulTimeoutMs);
```

---

### M-10. `suspendSession` race with exit handler

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/runtime/session-manager.ts:685-720` |
| **Severity** | MEDIUM |
| **Category** | Race Condition |

**Problem:** `suspendSession` calls `spawner.suspend()` at line 692, which kills the process. If the process exits quickly, the exit handler in `setupSessionEventForwarding` fires and sees `status === 'running'`, transitioning to `terminated`. Then `suspendSession` continues and overwrites status to `suspended`. Result: `addToHistory` is called twice with different statuses (`terminated` then `suspended`), and the final state is `suspended` even though the process is dead.

**Fix:** Set status to `suspended` before calling `spawner.suspend()`, matching the pattern used in `stopSession` (which updates state before calling `spawner.terminate()`). The exit handler's `status !== 'running'` check will then skip the transition.

---

## LOW — Code Quality / Maintenance

### L-1. Duplicate handoff fields: `handoffNote` vs `handoffMessage`

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/types/task-meta.ts:82,107` |

Both fields serve the same purpose. `handoffTask` in `task-assignment-service.ts:571-572` sets both. Consolidate to one field and deprecate the other.

---

### L-2. Triage prompt ignores `projectRoot` override

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/dispatch-daemon.ts:1168` |

`loadTriagePrompt()` is called with no arguments. Project-level prompt overrides in `.elemental/prompts/` are never loaded for triage sessions.

---

### L-3. Excessive `as unknown as EntityId` casts throughout

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | Multiple files across orchestrator-sdk |

`EntityId` and `ElementId` are used interchangeably via double-casts. This suggests a type system inconsistency that should be resolved at the type definition level rather than papered over with casts.

---

### L-4. `completeTask` doc says "done" but uses `TaskStatus.CLOSED`

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/task-assignment-service.ts:229,525` |

The JSDoc says the method "Sets the task status to 'done'" but the code uses `TaskStatus.CLOSED`. No `DONE` status exists in the enum. The doc is misleading.

---

### L-5. `notifyAgent` creates empty string `'' as ElementId`

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/dispatch-service.ts:318` |

```typescript
taskId: '' as ElementId, // No task associated
```

An empty string cast to `ElementId` is a type lie. Downstream lookups using this ID will fail silently or produce confusing errors. Should be `undefined` with the field typed as `ElementId | undefined`.

---

### L-6. Triage processed count is optimistic

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/orchestrator-sdk/src/services/dispatch-daemon.ts:1039-1042` |

`processed += channelItems.length` is incremented before the triage session runs. If the session crashes, the `PollResult.processed` count is inflated. This affects monitoring and observability accuracy.

---

### L-7. `rowToInboxItem` uses `as any` cast on `messageId`

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/sdk/src/services/inbox.ts:536` |

```typescript
messageId: row.message_id as any,
```

Bypasses type safety entirely. Should use the correct branded type or a validated cast.

---

### L-8. No `channel_id` index in inbox schema

| Field | Value |
|-------|-------|
| **Status** | OPEN |
| **File** | `packages/sdk/src/services/inbox.ts:98-111` |

Indexes exist for `(recipient_id, status)`, `(recipient_id, created_at)`, and `(message_id)`, but not `channel_id`. `getInboxByChannel` (line 420) and filter queries with `channelId` require a full table scan. Add:

```sql
CREATE INDEX IF NOT EXISTS idx_inbox_channel ON inbox_items(channel_id);
```

---

## Test Coverage Gaps

| Area | File | Status |
|------|------|--------|
| Dispatch daemon priority sorting | `dispatch-daemon.test.ts` | `.skip` |
| Dispatch daemon error continuation | `dispatch-daemon.test.ts` | `.skip` |
| Dispatch daemon E2E flow | `dispatch-daemon.test.ts` | `.skip` |
| Triage session spawning (`processTriageBatch`, `spawnTriageSession`) | — | No tests |
| `reapStaleSessions` | — | No tests |
| `pollWorkflowTasks` | — | No tests |
| `messageSession` | — | No tests (also unimplemented, see H-1) |
| Concurrency / race conditions | — | No tests for any service |
| PID liveness check (`isProcessAlive` in `getActiveSession`) | — | No tests |
| `markAsReadBatch` | — | No tests |
| Polling concurrency guard (`this.polling` flag) | — | No tests |

---

## Fixed Issues (Rounds 1-3)

These issues were identified and fixed in audit rounds 1-3.

| Commit | Issues Fixed |
|--------|-------------|
| `7f35c30` | Round 1 — event listener leak, triage priority sort, concurrency guards |
| `e32f202` | Round 2 — data loss in forwarding, dead code removal, broken message forwarding |
| `1017194` | Round 3 — `markAsReadBatch`, triage exit handler, poll concurrency guard, `reapStaleSessions` error handling, PID liveness check, `git worktree prune` |
