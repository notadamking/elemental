# Orchestration Architecture

> Authoritative documentation for the Elemental agent orchestration system. This document defines agent roles, automation flows, dispatch behavior, and coordination mechanisms.

## Table of Contents

- [Agent Roles and Responsibilities](#agent-roles-and-responsibilities)
- [End-to-End Automation Flow](#end-to-end-automation-flow)
- [Dispatch Daemon Behavior](#dispatch-daemon-behavior)
- [Message Triage](#message-triage)
- [Worktree and Branch Management](#worktree-and-branch-management)
- [Message Formats](#message-formats)
- [Handoff Mechanism](#handoff-mechanism)
- [Git Workflow](#git-workflow)

---

## Agent Roles and Responsibilities

### Director

The Director is the strategic coordinator that translates human goals into actionable tasks.

| Attribute | Value |
|-----------|-------|
| **Reports to** | Human |
| **Session type** | Persistent (interactive) |

**Responsibilities:**
- Receives goals and requests from Human
- Creates tasks (individual or attached to plans)
- Sets priorities and dependencies between tasks
- Reports status to Human ONLY when requested

**NOT Responsible For:**
- Monitoring workers
- Dispatching tasks (handled by Dispatch Daemon)
- Unblocking stuck agents (handled by Stewards)

### Ephemeral Worker

Ephemeral Workers execute discrete tasks in isolation and shut down upon completion.

| Attribute | Value |
|-----------|-------|
| **Reports to** | Director (via messages) |
| **Session type** | Ephemeral (task-scoped) |
| **Worktree** | `agent/{worker-name}/{task-id}-{slug}` |

**Responsibilities:**
- Executes assigned task in isolated worktree
- Commits and pushes work often
- Closes task when complete OR hands off if unable to complete
- Shuts down after task completion

**Lifecycle:**
1. Spawned by Dispatch Daemon when task is dispatched
2. Works on task until completion or handoff
3. Process terminates automatically after task resolution

### Persistent Worker

Persistent Workers operate interactively with direct human oversight.

| Attribute | Value |
|-----------|-------|
| **Reports to** | Human (interactive) |
| **Session type** | Persistent (session-scoped) |
| **Worktree** | `agent/{worker-name}/session-{timestamp}` |

**Responsibilities:**
- Works on tasks directly with human
- Responds to human instructions in real-time
- Commits and pushes work according to best practices

**Note:** No dispatch system involvement. Human drives all work directly.

### Steward

Stewards handle automated maintenance, monitoring, and intervention workflows.

| Attribute | Value |
|-----------|-------|
| **Reports to** | System (automated triggers) |
| **Session type** | Ephemeral (workflow-scoped) |

**Responsibilities:**
- Executes maintenance workflows (merge, health checks, cleanup)
- Monitors worker health and intervenes when stuck
- Runs scheduled/triggered operations
- Reviews and processes merge requests

**Trigger Sources:**
- Scheduled intervals (health checks, cleanup)
- Event-based triggers (merge request created, worker stuck)
- Workflow task assignment

---

## End-to-End Automation Flow

```
                                    ┌─────────────────────────────────────┐
                                    │              HUMAN                   │
                                    │   (goals, requests, supervision)     │
                                    └─────────────────┬───────────────────┘
                                                      │
                                           sends message/goal
                                                      │
                                                      ▼
                                    ┌─────────────────────────────────────┐
                                    │            DIRECTOR                  │
                                    │  - Creates plans                     │
                                    │  - Creates tasks with priorities     │
                                    │  - Sets dependencies                 │
                                    └─────────────────┬───────────────────┘
                                                      │
                                            creates tasks
                                                      │
                                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              DISPATCH DAEMON (continuous polling)                     │
│                                                                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Worker          │  │ Inbox           │  │ Steward         │  │ Workflow        │  │
│  │ Availability    │  │ Polling         │  │ Trigger         │  │ Task            │  │
│  │ Polling         │  │                 │  │ Polling         │  │ Polling         │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼────────────────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │                    │
            ▼                    ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ EPHEMERAL       │  │ Route msgs by   │  │ Create workflow │  │ Dispatch to     │
│ WORKERS         │  │ agent role;     │  │ from triggered  │  │ available       │
│                 │  │ spawn triage    │  │ playbook        │  │ steward         │
│ - Task exec     │  │ for idle agents │  │                 │  │                 │
│ - Commit/push   │  │ with non-task   │  │                 │  │                 │
│ - Close/handoff │  │ messages        │  │                 │  │                 │
└────────┬────────┘  └─────────────────┘  └────────┬────────┘  └────────┬────────┘
         │                                         │                    │
         │                                         └────────┬───────────┘
         │                                                  │
         │ creates PR on completion                         ▼
         │                                   ┌─────────────────────────────┐
         └──────────────────────────────────▶│          STEWARDS           │
                                             │                             │
                                             │  - Merge review             │
                                             │  - Health monitoring        │
                                             │  - Worker intervention      │
                                             │  - Cleanup operations       │
                                             └──────────────┬──────────────┘
                                                            │
                                              merge or handoff with notes
                                                            │
                                                            ▼
                                             ┌─────────────────────────────┐
                                             │      MAIN BRANCH            │
                                             │   (merged, clean code)      │
                                             └─────────────────────────────┘
```

### Flow Summary

1. **Human** sends goal/request to Director
2. **Director** creates plan and/or tasks with priorities and dependencies
3. **Dispatch Daemon** continuously polls for:
   - Available ephemeral workers (no active session)
   - Unread inbox messages
   - Triggered steward playbooks
   - Incomplete workflows needing steward assignment
4. **Ephemeral Workers** execute tasks, commit work, and either close tasks or hand off
5. **Stewards** handle maintenance workflows including merge review
6. **Completed work** is merged into main branch

---

## Dispatch Daemon Behavior

The Dispatch Daemon is a continuously running process that coordinates task assignment and message delivery across all agents.

### Worker Availability Polling

**Purpose:** Assign unassigned tasks to available ephemeral workers.

**Process:**
1. Find all ephemeral workers without an active session
2. For each available worker:
   - Query for highest priority unassigned task
   - Assign task to worker
   - Send dispatch message to worker's inbox

**Dispatch Message Content:**
- Task ID
- Task title
- Task description
- Attached document references

### Message Routing

**Purpose:** Route messages and trigger agent sessions when needed.

**Process for Ephemeral Workers and Stewards:**
1. Poll for unread messages in inbox
2. For each unread message:
   - **Path 1 — Dispatch message:** Mark as read (task dispatch and session spawn are handled by Worker Availability Polling, not inbox polling)
   - **Path 2 — Non-dispatch message:**
     - **If agent has active session:** Leave unread (the active session will handle it; do NOT forward)
     - **If agent is idle (no active session):** Leave unread to accumulate for triage batch (see [Message Triage](#message-triage))

**Process for Persistent Workers and Directors:**
1. Poll for unread messages in inbox
2. For each unread message:
   - Check if agent has active session
   - **If active session:** Forward message to session as user input
   - **If no active session:** Message waits until session starts
3. Mark forwarded messages as read

### Steward Trigger Polling

**Purpose:** Activate steward workflows based on system triggers.

**Process:**
1. Check for triggered conditions (events, schedules)
2. For each triggered condition:
   - Create new workflow from associated playbook
   - Workflow will be picked up by Workflow Task Polling

### Workflow Task Polling

**Purpose:** Assign workflow tasks to available stewards.

**Process:**
1. Find incomplete workflows without an assigned steward
2. Find available stewards (no active session)
3. For each available steward:
   - Assign highest priority workflow task
   - Send dispatch message to steward's inbox

---

## Message Triage

When an idle agent (no active session) has accumulated unread non-dispatch messages, the Dispatch Daemon spawns a **triage session** to process them.

### Triage Spawn Lifecycle

1. **Detection:** During inbox polling, non-dispatch messages for idle agents are left unread. When at least one such message exists, the agent becomes a triage candidate.
2. **Triage takes priority:** Idle agents process accumulated non-dispatch messages before picking up new tasks. Inbox polling runs before worker availability polling, and workers with unread items are excluded from task assignment.
3. **Grouping by channel:** Deferred messages are grouped by originating channel. Each triage session handles one channel batch.
4. **Single-session constraint:** Only one triage session is spawned per agent per poll cycle. If the agent has deferred messages across multiple channels, the remaining channels are processed in subsequent poll cycles.
5. **Session spawn:** A triage session is started for the agent with the selected channel batch.
6. **Active session semantics:** The triage session counts as an active session for the agent. This prevents double-spawn (no additional triage or task sessions will be started while the triage session is running).

### Worktree for Triage Sessions

Triage sessions operate in a **temporary detached worktree** checked out on the repository's default branch. The worktree is cleaned up automatically when the triage session exits.

### Interaction with Other Polling Loops

- **Inbox Polling** runs first in each cycle. It marks dispatch messages as read and spawns triage sessions for idle agents with non-dispatch messages.
- **Worker Availability Polling** runs after inbox polling. It skips workers with active sessions (including triage) and workers with remaining unread items.
- **Subsequent cycles:** After a triage session completes and the agent becomes idle again, remaining channel batches are eligible for the next triage spawn.

---

## Worktree and Branch Management

### Ephemeral Worker Worktrees

| Component | Pattern |
|-----------|---------|
| **Worktree path** | `agent/{worker-name}/{task-id}-{slug}` |
| **Branch name** | Task-specific (e.g., `task/{task-id}-{slug}`) |
| **Lifecycle** | Created on dispatch, preserved through handoffs |

**Example:**
```
agent/worker-1/abc123-implement-login/
  └── (task branch: task/abc123-implement-login)
```

### Persistent Worker Worktrees

| Component | Pattern |
|-----------|---------|
| **Worktree path** | `agent/{worker-name}/session-{timestamp}` |
| **Branch name** | Session-specific (e.g., `session/{worker-name}-{timestamp}`) |
| **Lifecycle** | Created on session start, cleaned up after merge |

**Example:**
```
agent/worker-2/session-20240115-143022/
  └── (session branch: session/worker-2-20240115-143022)
```

### Key Principles

1. **Workers spawn inside worktree:** The agent process starts with its working directory set to the worktree
2. **Isolation:** Each task/session has its own isolated git worktree
3. **Branch persistence:** On handoff, the branch and worktree reference are saved in task metadata
4. **Continuation:** Next agent continues from existing worktree/branch state

---

## Message Formats

### Dispatch Message

Sent by Dispatch Daemon to assign a task to an agent.

```typescript
interface DispatchMessage {
  metadata: {
    type: 'task-dispatch';
    taskId: string;
  };
  content: string; // Includes task title, description, document refs
}
```

**Content Format:**
```
## Task Assignment

**Task ID:** {taskId}
**Title:** {title}

### Description
{description}

### Attached Documents
- {documentRef1}
- {documentRef2}
```

### Forwarded Message

Messages from other entities forwarded to an active session.

**Format:**
```
[MESSAGE RECEIVED FROM {entityId}]: {messageContent}
```

**Example:**
```
[MESSAGE RECEIVED FROM director-1]: Please prioritize the authentication fix over the UI updates.
```

### Handoff Note

Added to task description when an agent hands off work.

**Format:**
```
[HANDOFF NOTE FROM AGENT SESSION {sessionId}]: {handoffMessage}
```

**Example:**
```
[HANDOFF NOTE FROM AGENT SESSION sess-abc123]: Completed API integration. Unable to resolve CORS issue - requires infrastructure access. Branch contains working local implementation.
```

---

## Handoff Mechanism

Handoffs allow agents to transfer work to another agent (or another instance of themselves) when they cannot complete a task.

### Handoff Process

1. **Unassign current agent:** Remove agent assignment from task
2. **Save branch/worktree reference:** Store in task metadata for continuation
   ```typescript
   {
     metadata: {
       handoff: {
         branch: 'task/abc123-implement-login',
         worktree: 'agent/worker-1/abc123-implement-login',
         previousSession: 'sess-xyz789'
       }
     }
   }
   ```
3. **Append handoff note:** Add context to task description
4. **Task returns to pool:** Dispatch Daemon will reassign to next available worker

### Handoff Triggers

- Agent unable to complete task (missing access, blocked dependency)
- Context window exhaustion
- Task requires different expertise
- Agent explicitly invokes handoff

### Continuation Behavior

When a new agent is assigned a handed-off task:
1. Agent spawns in the existing worktree (if preserved)
2. Agent sees previous branch state
3. Handoff notes provide context from previous agent
4. Work continues from existing code state

---

## Git Workflow

### Commit Practices

Workers commit whenever work reaches a "completion" state:
- Feature implementation complete
- Bug fix verified
- Refactor finished
- Meaningful checkpoint reached

**Commit Message Guidelines:**
- Clear, descriptive commit messages
- Reference task ID when relevant
- Explain the "why" not just the "what"

### Push Frequency

- Push commits to remote regularly
- Push before any potential handoff
- Push before task completion
- Push before session end

### Pull Request Creation

When a task is completed:
1. Worker creates pull request from task branch to main/master
2. PR description references task ID and summarizes changes
3. Merge Steward is triggered to review

### Merge Review Flow

1. **Merge Steward activated:** Triggered by PR creation
2. **Review process:**
   - Check code quality
   - Verify task requirements met
   - Run automated checks
3. **Resolution:**
   - **Approve:** Merge branch, delete worktree/branch
   - **Request changes:** Create handoff with review comments, referencing original worktree

---

## Related Documentation

- [Agent Roles Explanation](explanation/agent-roles.md) - Conceptual overview of agent types
- [Orchestrator Services Reference](reference/orchestrator-services.md) - Service implementations
- [Orchestrator Runtime Reference](reference/orchestrator-runtime.md) - Runtime components
- [Prompts Reference](reference/prompts.md) - Agent role prompt definitions
