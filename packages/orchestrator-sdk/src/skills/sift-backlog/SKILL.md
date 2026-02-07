---
name: sift-backlog
description: Triage and organize backlog tasks into actionable plans. Use when asked to review the backlog, prioritize tasks, create plans from backlog items, or move tasks from backlog to open status. Handles the full workflow of listing backlog tasks, grouping related tasks into plans, setting priorities and dependencies, activating plans, and changing task status from backlog to open.
---

# Sift Backlog

Triage backlog tasks: prioritize, group into plans, set dependencies, and activate.

## Overview

1. List backlog tasks (`el backlog`)
2. Clarify and enrich each task (titles, descriptions)
3. Identify groupings and create draft plans
4. Add tasks to plans and set dependencies
5. Activate plans
6. Set task status to open

## Workflow

### Step 1: List Backlog Tasks

```bash
el backlog
```

### Step 2: Clarify and Enrich Tasks

Backlog tasks often have only a brief title with no description. Before organizing, ensure each task is well-defined.

**For each task, evaluate:**

- Is the title clear and actionable?
- Is there a description? Check with `el task describe <task-id> --show`
- Is the scope unambiguous?

**If the title is unclear**, update it:

```bash
el update <task-id> --title "Clear, actionable title"
```

**Add a description** with context, scope, and acceptance criteria:

```bash
el task describe <task-id> --content "Description with:
- What needs to be done
- Why it matters
- Acceptance criteria
- Any relevant context"
```

**When uncertain or ambiguous**, ask the user for clarity before proceeding. Don't guess at requirements.

**Example clarification questions:**

- "Task X mentions 'improve performance' - which specific areas? What's the target metric?"
- "Task Y says 'fix auth bug' - do you have reproduction steps or error messages?"
- "Task Z is vague - can you describe the expected behavior?"

### Step 3: Create Draft Plans

Group related tasks into plans. Plans start as drafts (tasks won't be dispatched until activated).

```bash
el plan create --title "Plan Name"
```

**Example:**

```bash
el plan create --title "Authentication Improvements"
# Output: Created plan el-abc123
```

### Step 4: Add Tasks to Plans

```bash
el plan add-task <plan-id> <task-id>
```

**Example:**

```bash
el plan add-task el-abc123 el-task1
el plan add-task el-abc123 el-task2
```

### Step 5: Set Dependencies Between Tasks

Use `blocks` dependency when one task must complete before another can start.

```bash
el dep add <blocked-id> <blocker-id> --type blocks
```

**Semantics:** The first ID is blocked BY the second ID. The blocker must complete first.

**Example:** Task 2 can't start until Task 1 completes:

```bash
el dep add el-task2 el-task1 --type blocks
```

### Step 6: Update Priorities

```bash
el update <task-id> --priority <1-5>
```

| Value | Level    |
| ----- | -------- |
| 1     | Critical |
| 2     | High     |
| 3     | Medium   |
| 4     | Low      |
| 5     | Minimal  |

### Step 7: Activate Plans

Once tasks are organized with dependencies set, activate plans to enable dispatch.

```bash
el plan activate <plan-id>
```

### Step 8: Set Task Status to Open

Move tasks from backlog to open so they become ready for work.

```bash
el update <id> --status open
```

## Other Actions

**Close obsolete tasks:**

```bash
el close <id> --reason "Won't do: <reason>"
```

**Defer tasks:**

```bash
el defer <id> --until <date>
```

**View existing plans:**

```bash
el plan list
```

**View tasks in a plan:**

```bash
el plan tasks <plan-id>
```

## Tips

- Ask the user for clarity rather than guessing at ambiguous requirements
- Create plans before setting dependencies to avoid dispatch race conditions
- Always activate plans after dependencies are set
- Focus on oldest backlog items first (sorted by creation date)
- Every task should have a clear title and description before activation
