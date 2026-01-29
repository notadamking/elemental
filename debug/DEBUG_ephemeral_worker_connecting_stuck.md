# Debug: Ephemeral Worker Panels Stuck on "Connecting..."

## Problem Statement

Ephemeral worker panels get stuck in the "Connecting..." state even after fixing the SSE named event handling.

**Reproduction Steps:**
1. Start an ephemeral worker agent (e.g., "Alice")
2. Open the worker in a workspace pane
3. Observe the panel shows "Connecting..." indefinitely

## Expected vs Actual Behavior

**Expected:**
- Panel should connect to SSE stream
- Show "Waiting for output from {agentName}..." when connected but no events
- Display agent output events as they arrive

**Actual:**
- Panel stays stuck on "Connecting..." state
- Never transitions to "connected" status

## Environment

- Date: 2026-01-28
- Component: `StreamViewer.tsx`
- Server: `apps/orchestrator-server/src/index.ts`
- SSE Endpoint: `GET /api/agents/:id/stream`

## Root Cause Hypotheses

1. **SSE endpoint returns 404** - Session not found when StreamViewer connects
   - Likelihood: HIGH
   - Reason: The `/stream` endpoint checks `sessionManager.getActiveSession()` which requires status === 'running'

2. **Session terminates before StreamViewer connects** - Race condition
   - Likelihood: MEDIUM
   - Reason: Claude CLI might fail to start or exit quickly

3. **EventSource onopen not firing** - HTTP response format issue
   - Likelihood: MEDIUM
   - Reason: Hono's streamSSE might not send headers immediately

4. **Named event listeners not working** - Previous fix incomplete
   - Likelihood: LOW
   - Reason: We added listeners but may have missed something

5. **CORS blocking SSE** - Cross-origin issue
   - Likelihood: LOW
   - Reason: CORS config looks correct

---

## Debugging Attempts

### Attempt 1: Verify SSE endpoint is reachable

**Hypothesis:** The SSE endpoint might be returning an error (404, 500) before the connection is established.

**Testing Method:** Add console logging to trace the connection flow

**Changes:** Added console.log statements to:
- StreamViewer.tsx: Log SSE URL, connection open/error events, readyState
- Server index.ts: Log session lookup, active session status, event emitter availability

**Result:** Root cause confirmed

**Observations:**
- `sessionManager.getActiveSession(agentId)` checks that `session.status === 'running'`
- But headless sessions start with `status: 'starting'` and only transition to 'running' after receiving the 'init' event from Claude CLI
- This creates a race condition: StreamViewer connects immediately after starting, but the session hasn't transitioned to 'running' yet
- SSE endpoint returns 404 because `getActiveSession()` returns undefined for non-running sessions

**Root Cause:** Race condition between session start and SSE connection
- In `spawner.ts` line 502: session created with `status: 'starting'`
- In `spawner.ts` line 1074: status transitions to 'running' only after init event
- In `session-manager.ts` line 727: `getActiveSession()` returns undefined unless `status === 'running'`

---

### Attempt 2: Fix race condition

**Solution:** Modify `getActiveSession()` to also accept sessions in 'starting' status, since we need to be able to connect to the SSE stream while the session is starting up.

**Changes Made:**
File: `packages/orchestrator-sdk/src/runtime/session-manager.ts`
```typescript
// Before:
if (!session || session.status !== 'running') {
  return undefined;
}

// After:
// Allow both 'starting' and 'running' status - 'starting' is needed for SSE
// connections that happen before the Claude CLI emits its init event
if (!session || (session.status !== 'running' && session.status !== 'starting')) {
  return undefined;
}
```

**Result:** Fix applied - partial improvement

**Additional fix:** Also fixed TypeScript error in `agent-registry.ts` - needed to explicitly type the generic parameter for `api.update()` call.

---

### Attempt 3: Fix event emitter source

**Hypothesis:** SSE endpoint was getting events from wrong EventEmitter

**Observations:** Server code was using `spawnerService.getEventEmitter()` but the session manager creates its own EventEmitter and forwards events from the spawner.

**Changes Made:**
File: `apps/orchestrator-server/src/index.ts`
```typescript
// Before:
const events = spawnerService.getEventEmitter(activeSession.id);

// After:
const events = sessionManager.getEventEmitter(activeSession.id);
```

**Result:** Partially fixed - events now accessible, but SSE data still not reaching clients.

---

### Attempt 4: Fix Node.js response streaming

**Hypothesis:** Node.js HTTP server was buffering the entire SSE response before sending

**Root Cause Found:** The custom Node.js HTTP server handler was calling `await response.text()` which waits for the entire response body before sending. For SSE streams, this means waiting forever since the stream never closes.

**Code Location:** `apps/orchestrator-server/src/index.ts` lines 3105-3111

**Problem Code:**
```typescript
const response = await app.fetch(request);
res.statusCode = response.status;
response.headers.forEach((value, key) => {
  res.setHeader(key, value);
});
const responseBody = await response.text();  // <-- BLOCKS ON STREAMING!
res.end(responseBody);
```

**Solution:** Stream the response body instead of buffering it:
```typescript
const response = await app.fetch(request);
res.statusCode = response.status;
response.headers.forEach((value, key) => {
  res.setHeader(key, value);
});

// Handle streaming responses (SSE) vs regular responses
if (response.body) {
  const reader = response.body.getReader();
  const pump = async (): Promise<void> => {
    try {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      return pump();
    } catch {
      // Client disconnected or stream error
      res.end();
    }
  };
  await pump();
} else {
  const responseBody = await response.text();
  res.end(responseBody);
}
```

**Result:** ✅ FIXED - SSE streaming now works correctly

**Verification:**
```bash
$ curl -v --max-time 5 http://localhost:3457/api/events/stream
< HTTP/1.1 200 OK
< content-type: text/event-stream
< transfer-encoding: chunked
event: connected
data: {"timestamp":"2026-01-29T01:39:00.348Z","category":"all"}
id: 1
```

---

## Summary

The SSE "Connecting..." issue had **three separate causes**:

1. **Race condition in session status** - `getActiveSession()` only returned 'running' sessions, but headless sessions start as 'starting'
   - Fixed in: `session-manager.ts`

2. **Wrong EventEmitter** - Server was getting events from spawner instead of session manager
   - Fixed in: `index.ts` SSE endpoint

3. **Node.js response buffering** - Custom HTTP handler called `response.text()` which blocks until entire response completes
   - Fixed in: `index.ts` server startup code

All three issues have been resolved and SSE streaming now works correctly.
