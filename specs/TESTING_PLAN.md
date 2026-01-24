# Elemental Manual Testing Plan

A comprehensive manual testing plan for Elemental, focusing on AI agents as primary users.

**Version:** 1.0.0
**Last Updated:** 2026-01-23

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Agent User Stories](#2-agent-user-stories)
3. [Structured Test Scenarios](#3-structured-test-scenarios)
4. [Exploratory Testing Guides](#4-exploratory-testing-guides)
5. [CLI UX Evaluation Checklist](#5-cli-ux-evaluation-checklist)
6. [JSON Output Consistency Audit](#6-json-output-consistency-audit)
7. [Gap Analysis](#7-gap-analysis)
8. [Issue Tracking Protocol](#8-issue-tracking-protocol)

---

## 1. Testing Philosophy

### Core Premise

Elemental is a complete agent orchestration system where tasks, messages, documents, and entities continuously interact to get work done. Testing must validate these interactions, not just isolated features.

### Primary Users: AI Agents

Unlike traditional applications with human users, Elemental's primary users are AI agents that:
- Parse CLI output programmatically (JSON mode)
- Chain commands together in scripts
- Make decisions based on structured responses
- Need deterministic, predictable behavior
- Rely on clear error messages for recovery

### Example Orchestration Pattern

```
Agent A sends a message to Agent B containing a task to complete,
with a specification document attached.

Agent B claims the task, reads the spec, updates progress via messages,
and closes the task when done.
```

This pattern involves:
- Entity creation and lookup
- Channel establishment (direct message)
- Document creation (spec)
- Message with attachment
- Task creation with document reference
- Assignment and status transitions
- Progress tracking via messages
- Task completion

### Why Manual Testing?

Manual testing complements our automated test suite (87+ test files, 1700+ tests) by:

| Automated Tests Cover | Manual Tests Validate |
|----------------------|----------------------|
| Unit-level correctness | Real-world multi-element workflows |
| API contract conformance | CLI discoverability and UX |
| Individual feature behavior | Integration gaps between subsystems |
| Edge cases in isolation | Error message quality and agent recovery |
| Performance benchmarks | Cross-element orchestration patterns |

### Dogfooding Principle

Issues discovered during manual testing should be tracked using Elemental itself. This validates the system's ability to manage its own development workflow.

---

## 2. Agent User Stories

Organized by domain to cover all major interaction patterns.

### Task Management Domain

#### US-T01: The Agent Work Loop
**As an** agent starting a work session
**I want to** find ready work, claim it, make progress, and complete it
**So that** I can autonomously advance the project

**Key commands:**
```bash
el ready --json --limit 10                    # Find available work
el assign <task-id> --to <my-entity>          # Claim task
el update <task-id> --status in_progress      # Start work
el close <task-id> --reason "Completed X"     # Finish work
```

#### US-T02: Multi-Agent Task Handoff
**As an** agent completing one phase of work
**I want to** create a follow-up task for another agent
**So that** work flows through the team appropriately

**Pattern:**
1. Create task with assignee
2. Add blocking relationship if dependent
3. Close original task referencing new task

#### US-T03: Blocked/Unblocked Transitions
**As an** agent
**I want to** understand why tasks are blocked and be notified when unblocked
**So that** I can prioritize work effectively

**Key commands:**
```bash
el blocked --json                             # See blocked tasks with reasons
el dep list <task-id> --direction in          # See what blocks this task
el show <blocking-task-id>                    # Check blocker status
```

#### US-T04: Priority-Based Work Selection
**As an** agent with multiple available tasks
**I want to** select work based on priority and complexity
**So that** I focus on the most important achievable work

**Key commands:**
```bash
el ready --json --priority 1                  # Critical tasks only
el ready --json --assignee <me>               # My assigned tasks
```

### Collaboration Domain

#### US-C01: Direct Agent Communication
**As an** agent needing to coordinate with another agent
**I want to** send a direct message
**So that** we can communicate without team noise

**Key commands:**
```bash
el send --to <entity-name> --content "..."    # Direct message
el messages <channel-id> --json               # Read conversation
```

#### US-C02: Group Channel Coordination
**As a** team of agents
**We want to** share updates in a common channel
**So that** everyone stays informed

**Key commands:**
```bash
el channel create --name "project-updates" --type group
el channel join <channel-id>
el send <channel-id> --content "Status update..."
```

#### US-C03: Threaded Conversations
**As an** agent responding to a specific message
**I want to** reply in a thread
**So that** conversations stay organized

**Key commands:**
```bash
el thread <message-id> --content "Response..."
el messages <channel-id> --json               # Shows threads
```

#### US-C04: Channel Membership Lifecycle
**As a** channel administrator
**I want to** manage who can participate
**So that** conversations include the right participants

**Key commands:**
```bash
el channel add <channel-id> <entity>
el channel remove <channel-id> <entity>
el channel members <channel-id> --json
```

### Knowledge Management Domain

#### US-K01: Document Creation and Updates
**As an** agent producing documentation
**I want to** create and version documents
**So that** knowledge is preserved with history

**Key commands:**
```bash
el doc write --content-type markdown < spec.md
el doc read <doc-id>
el update <doc-id> --content "Updated..."
el doc history <doc-id> --json
```

#### US-K02: Library Organization
**As a** knowledge manager
**I want to** organize documents into libraries
**So that** related content is discoverable

**Key commands:**
```bash
el library create --name "api-specs"
el library add <lib-id> <doc-id>
el library docs <lib-id> --json
```

#### US-K03: Documents in Tasks
**As an** agent working on a task
**I want to** access the description and design documents
**So that** I understand what to build

**Pattern:**
```bash
# Create with document reference
el create task "Implement feature" --description-ref <doc-id>

# Read task with hydration
el show <task-id> --json --hydrate           # Includes document content
```

#### US-K04: Documents in Messages
**As an** agent sending a specification
**I want to** attach documents to messages
**So that** recipients have full context

**Pattern:**
```bash
# Create spec document
SPEC_ID=$(el doc write --content-type markdown < spec.md --json | jq -r '.id')

# Send message with attachment
el send <channel> --content "Please review spec" --attachment $SPEC_ID
```

### Planning & Orchestration Domain

#### US-P01: Plan Lifecycle
**As a** project lead
**I want to** create and manage plans
**So that** work is organized into coherent initiatives

**Key commands:**
```bash
el plan create --title "Q1 Roadmap" --status draft
el plan activate <plan-id>
el plan show <plan-id> --json                 # Shows progress
el plan complete <plan-id>
```

#### US-P02: Hierarchical Task Management
**As a** plan owner
**I want to** add tasks to plans with hierarchical IDs
**So that** task ancestry is clear

**Pattern:**
```bash
PLAN_ID=$(el plan create --title "Feature X" --json | jq -r '.id')
TASK_ID=$(el create task "Step 1" --parent $PLAN_ID --json | jq -r '.id')
# Task ID will be like: el-abc.1 (parent.child format)
```

#### US-P03: Workflow from Playbook
**As an** agent following a defined process
**I want to** instantiate a workflow from a playbook
**So that** I get pre-configured tasks with dependencies

**Key commands:**
```bash
el playbook list --json                       # Available templates
el playbook show <name> --json                # Review before pour
el workflow pour <playbook> --var env=prod    # Instantiate
el workflow tasks <workflow-id> --json        # See generated tasks
```

#### US-P04: Ephemeral vs Durable Workflows
**As an** agent running experiments
**I want to** create ephemeral workflows
**So that** temporary work doesn't pollute the permanent record

**Key commands:**
```bash
el workflow pour <playbook> --ephemeral       # Not synced to JSONL
el workflow burn <workflow-id>                # Delete ephemeral
el workflow squash <workflow-id>              # Promote to durable
el workflow gc --age 24h                      # Clean up old ephemeral
```

### Dependency & Coordination Domain

#### US-D01: Blocking Relationships
**As an** agent managing work order
**I want to** define blocking relationships
**So that** tasks execute in correct sequence

**Key commands:**
```bash
el dep add <dependent> <blocker> --type blocks
el dep tree <task-id>                         # Visualize dependencies
```

#### US-D02: Gate Satisfaction
**As an** agent waiting for approval
**I want to** track gate status
**So that** I know when to proceed

**Awaits patterns:**
- Timer gates: wait until specific time
- Approval gates: require sign-off
- External gates: wait for CI, PR merge, etc.

#### US-D03: Cycle Detection
**As an** agent creating dependencies
**I want to** be prevented from creating cycles
**So that** the dependency graph remains valid

**Expected behavior:**
```bash
el dep add A B --type blocks                  # A waits for B
el dep add B A --type blocks                  # Should fail: CYCLE_DETECTED
```

#### US-D04: Ready Work Computation
**As an** agent querying available work
**I want** accurate ready work lists
**So that** I don't pick up blocked tasks

**Criteria for "ready":**
- Status is `open` or `in_progress`
- No unsatisfied blocking dependencies
- `scheduledFor` is null or in the past
- Not ephemeral (unless specifically querying)

---

## 3. Structured Test Scenarios

Step-by-step checklists for validating critical paths.

### Scenario: Fresh Workspace Initialization

**Purpose:** Validate initial setup works correctly for new projects

**Prerequisites:** Empty directory

**Checkpoints:**
- [ ] `el init` creates `.elemental/` directory
- [ ] Database file `elemental.db` is created
- [ ] Default config file is created (if applicable)
- [ ] `.gitignore` includes `*.db`, `*.db-wal`, `*.db-shm`
- [ ] `el stats --json` returns valid structure with zero counts
- [ ] `el ready --json` returns empty array
- [ ] `el whoami` shows configured actor

**Success Criteria:** Workspace is ready for use with no errors

---

### Scenario: Complete Task Lifecycle

**Purpose:** Validate end-to-end task management

**Prerequisites:** Initialized workspace with registered entity

**Status:** TESTED - 2026-01-24 (Partial Pass)

**Checkpoints:**
- [x] Create task: `el create task --title "Test Task" --priority 2 --json`
  - Returns valid ID in `el-xxx` format
  - JSON includes all expected fields
  - **Note:** Requires `--title` flag, not positional argument
- [x] Task appears in ready list: `el ready --json`
- [x] Assign task: `el assign <id> <entity-id>` (use entity ID, not name)
  - Task still appears in ready (assignment doesn't block)
  - **BUG el-4kis:** Using entity name fails due to isSubcommand() parser bug
  - **DOC el-1m9b:** Docs show `--to` flag but actual syntax is positional
- [x] Start work: `el update <id> --status in_progress`
  - Status reflects change
- [x] Complete task: `el close <id> --reason "Done"`
  - Task no longer in ready list
  - `closedAt` timestamp is set
  - `closeReason` is captured
- [x] Reopen if needed: `el reopen <id>`
  - Status returns to `open`
  - Task reappears in ready list
  - **UX el-2deb:** `closeReason` persists after reopen (minor)

**Success Criteria:** Task transitions through all states correctly

**Issues Found:**
- **el-4kis**: Parser isSubcommand() treats entity names as subcommands
- **el-1m9b**: TESTING_PLAN.md uses incorrect `--to` syntax for assign
- **el-2deb**: closeReason persists after task is reopened

---

### Scenario: Plan with Hierarchical Tasks

**Purpose:** Validate plan-task relationships and hierarchical IDs

**Prerequisites:** Initialized workspace

**Checkpoints:**
- [ ] Create plan: `el plan create --title "Test Plan" --json`
  - Returns plan ID
  - Status is `draft` by default
- [ ] Activate plan: `el plan activate <plan-id>`
  - Status changes to `active`
- [ ] Create child task: `el create task "Step 1" --parent <plan-id> --json`
  - Task ID has hierarchical format: `<plan-id>.1`
- [ ] Create second child: `el create task "Step 2" --parent <plan-id> --json`
  - Task ID is `<plan-id>.2`
- [ ] View plan progress: `el plan show <plan-id> --json`
  - Progress shows 0% (no tasks closed)
- [ ] Close first task: `el close <plan-id>.1`
- [ ] View progress again
  - Progress shows 50%
- [ ] Close second task
- [ ] Plan auto-completion check (if enabled)

**Success Criteria:** Plan manages child tasks with accurate progress tracking

---

### Scenario: Workflow Pour from Playbook

**Purpose:** Validate playbook instantiation creates correct task structure

**Status:** BLOCKED - Critical bugs found (2026-01-24)

**Blockers:**
1. **BUG el-59p3**: CLI parser overwrites repeated options instead of accumulating to array
   - Cannot create playbooks with multiple steps via CLI (`--step a:A --step b:B` only creates step b)
2. **BUG el-18ug**: CLI `workflow pour` handler does not use `pourWorkflow()` function
   - The CLI handler has a TODO comment and just creates an empty workflow
   - The `pourWorkflow()` function EXISTS in src/types/workflow-pour.ts and is well-tested (59 tests)
   - CLI handler just needs to call the existing function and store results in database

**Prerequisites:**
- Initialized workspace
- Playbook created via `el playbook create` (NOT from YAML file - playbooks are stored in database)

**Note:** The original prerequisites mentioned YAML files at `.elemental/playbooks/`, but playbooks are
actually stored in the database and created via CLI, not discovered from YAML files.

**Sample playbook creation (when parser bug is fixed):**
```bash
el playbook create --name test-workflow --title "Test Workflow" \
  --step "step1:Setup environment" \
  --step "step2:Deploy:step1" \
  --step "step3:Verify:step2" \
  --variable "env:string"
```

**Checkpoints:**
- [x] Playbook discovered: `el playbook list --json` includes `test-workflow`
  - **BLOCKED**: Cannot create multi-step playbooks due to parser bug
- [ ] Validation works: `el playbook validate test-workflow --var env=staging`
  - No errors reported
- [ ] Pour workflow: `el workflow pour test-workflow --var env=staging --json`
  - **BLOCKED**: workflow pour not implemented (creates empty workflow)
  - Returns workflow ID
  - Status is `pending` or `running`
- [ ] Inspect tasks: `el workflow tasks <workflow-id> --json`
  - **BLOCKED**: No tasks created because pour not implemented
  - 3 tasks created
  - Titles have variable substituted
  - Dependencies wired (step2 blocked by step1, step3 blocked by step2)
- [ ] First task ready: only step1 appears in `el ready --json`
- [ ] Close step1: step2 becomes ready
- [ ] Close step2: step3 becomes ready
- [ ] Close step3: workflow status changes to `completed`

**Success Criteria:** Playbook produces working task sequence with proper dependencies

---

### Scenario: Multi-Agent Messaging Flow

**Purpose:** Validate agent-to-agent communication

**Prerequisites:**
- Initialized workspace
- Two entities: `agent-a`, `agent-b`

**Checkpoints:**
- [ ] Register entities
  ```bash
  el entity register --name agent-a --type agent
  el entity register --name agent-b --type agent
  ```
- [ ] Send direct message (creates channel automatically)
  ```bash
  el send --to agent-b --content "Hello from A" --actor agent-a --json
  ```
  - Returns message ID
  - Creates direct channel
- [ ] Recipient can see message
  ```bash
  el messages --to agent-a --actor agent-b --json
  ```
  - Message appears in list
- [ ] Reply to message
  ```bash
  el thread <message-id> --content "Reply from B" --actor agent-b
  ```
  - Thread relationship created
- [ ] View conversation: both messages visible

**Success Criteria:** Agents can communicate bidirectionally with threading

---

### Scenario: Document Versioning Chain

**Purpose:** Validate document history preservation

**Prerequisites:** Initialized workspace

**Checkpoints:**
- [ ] Create initial document
  ```bash
  el doc write --content "Version 1" --content-type text --json
  ```
  - Returns document ID
  - Version is 1
- [ ] Update document
  ```bash
  el update <doc-id> --content "Version 2"
  ```
  - Version increments to 2
- [ ] Update again
  ```bash
  el update <doc-id> --content "Version 3"
  ```
  - Version increments to 3
- [ ] View history: `el doc history <doc-id> --json`
  - Shows all 3 versions
  - Each has correct content
  - previousVersionId chain is intact
- [ ] Read specific version: `el doc versions <doc-id> --version 1`
  - Returns "Version 1" content

**Success Criteria:** Full version history preserved and accessible

---

### Scenario: Dependency Chain Resolution

**Purpose:** Validate blocking dependency propagation

**Prerequisites:** Initialized workspace

**Checkpoints:**
- [ ] Create chain: A → B → C → D (A blocks B blocks C blocks D)
  ```bash
  A=$(el create task "Task A" --json | jq -r '.id')
  B=$(el create task "Task B" --json | jq -r '.id')
  C=$(el create task "Task C" --json | jq -r '.id')
  D=$(el create task "Task D" --json | jq -r '.id')
  el dep add $B $A --type blocks
  el dep add $C $B --type blocks
  el dep add $D $C --type blocks
  ```
- [ ] Check ready: only A is ready
- [ ] Check blocked: B, C, D are blocked
- [ ] Blocked reasons accurate for each
- [ ] Close A: B becomes ready
- [ ] Close B: C becomes ready
- [ ] Close C: D becomes ready
- [ ] Dependency tree visualization: `el dep tree $D`
  - Shows full chain

**Success Criteria:** Dependencies correctly propagate blocking status

---

### Scenario: Cross-Element Orchestration

**Purpose:** Validate the complete agent orchestration pattern

**Prerequisites:**
- Initialized workspace
- Two entities: `lead-agent`, `worker-agent`

**Checkpoints:**
- [ ] Lead creates specification document
  ```bash
  SPEC=$(el doc write --content-type markdown --actor lead-agent --json << 'EOF'
  # Feature Spec
  Build the authentication module with OAuth2 support.
  EOF
  )
  SPEC_ID=$(echo $SPEC | jq -r '.id')
  ```
- [ ] Lead creates task with spec reference
  ```bash
  TASK=$(el create task "Implement auth module" \
    --description-ref $SPEC_ID \
    --assignee worker-agent \
    --priority 2 \
    --actor lead-agent --json)
  TASK_ID=$(echo $TASK | jq -r '.id')
  ```
- [ ] Lead sends message to worker
  ```bash
  el send --to worker-agent --content "New task assigned: $TASK_ID" \
    --attachment $SPEC_ID --actor lead-agent
  ```
- [ ] Worker finds the task
  ```bash
  el ready --assignee worker-agent --actor worker-agent --json
  ```
- [ ] Worker reads the hydrated task
  ```bash
  el show $TASK_ID --hydrate --actor worker-agent --json
  ```
  - Description content is included
- [ ] Worker starts work
  ```bash
  el update $TASK_ID --status in_progress --actor worker-agent
  ```
- [ ] Worker sends progress update
  ```bash
  el send --to lead-agent --content "Auth module 50% complete" --actor worker-agent
  ```
- [ ] Worker completes task
  ```bash
  el close $TASK_ID --reason "Auth module implemented with tests" --actor worker-agent
  ```
- [ ] Lead verifies completion
  ```bash
  el show $TASK_ID --actor lead-agent --json
  ```
  - Status is `closed`
  - closeReason present

**Success Criteria:** Full orchestration flow completes with proper attribution

---

### Scenario: Error Recovery Patterns

**Purpose:** Validate agents can recover from errors

**Prerequisites:** Initialized workspace

**Checkpoints:**
- [ ] NOT_FOUND error handling
  ```bash
  el show el-nonexistent --json 2>&1
  ```
  - Exit code is non-zero (3)
  - JSON error includes code: "NOT_FOUND"
  - Message is actionable
- [ ] VALIDATION_ERROR handling
  ```bash
  el create task "" --json 2>&1  # Empty title
  ```
  - Exit code 4
  - Error explains what's wrong
- [ ] CYCLE_DETECTED handling
  ```bash
  A=$(el create task "A" --json | jq -r '.id')
  B=$(el create task "B" --json | jq -r '.id')
  el dep add $B $A --type blocks
  el dep add $A $B --type blocks 2>&1
  ```
  - Error explains cycle would be created
- [ ] DUPLICATE_NAME handling
  ```bash
  el entity register --name "test-entity" --type agent
  el entity register --name "test-entity" --type agent 2>&1
  ```
  - Error explains name already taken

**Success Criteria:** All errors include code, message, and recovery guidance

---

## 4. Exploratory Testing Guides

Areas for freeform exploration without strict scripts.

### CLI Help Discoverability

**Goal:** Determine if agents can discover functionality without documentation

**Exploration prompts:**
- Starting from `el --help`, can you discover how to create a task?
- Can you find all task-related commands?
- Are subcommands documented when you run the parent command with `--help`?
- Are required vs optional flags clearly indicated?
- Do flag descriptions explain valid values (e.g., "priority 1-5")?

**Things to note:**
- Confusing or missing help text
- Commands that behave differently than help suggests
- Undocumented but useful flags
- Aliases that aren't mentioned

### JSON Output Exploration

**Goal:** Verify JSON output is consistent and parseable

**Exploration prompts:**
- Pick 5 different `list` commands. Are field names consistent?
- Do all create commands return the same structure?
- When an error occurs with `--json`, is it still valid JSON?
- Are empty results `[]` or `null` or something else?
- Do IDs appear in consistent locations across element types?

**Things to note:**
- Inconsistent field naming (camelCase vs snake_case)
- Missing fields that should be present
- Extra fields that aren't documented
- Null vs undefined vs missing field behavior

### Error Message Exploration

**Goal:** Assess error quality for agent recovery

**Exploration prompts:**
- Trigger each error code at least once
- For each error, can you understand what went wrong?
- Do errors suggest how to fix the problem?
- Are error codes consistent with exit codes?
- Do validation errors specify which field failed?

**Error codes to cover:**
- INVALID_INPUT, INVALID_ID, INVALID_STATUS
- NOT_FOUND, ENTITY_NOT_FOUND, DOCUMENT_NOT_FOUND
- ALREADY_EXISTS, DUPLICATE_NAME, CYCLE_DETECTED
- IMMUTABLE, HAS_DEPENDENTS, INVALID_PARENT
- DATABASE_ERROR, SYNC_CONFLICT

### Command Aliases Exploration

**Goal:** Verify aliases work as expected and are intuitive

**Exploration prompts:**
- Run `el alias` to see all aliases
- Try each alias and verify it works
- Are aliases discoverable without reading docs?
- Do aliases accept the same flags as full commands?

**Known aliases to test:**
- `add`, `new` → `create`
- `rm`, `remove` → `delete`
- `ls` → `list`
- `s`, `get` → `show`
- `todo`, `tasks` → `ready`
- `done`, `complete` → `close`
- `st` → `status`

### Edge Cases Exploration

**Goal:** Find boundary conditions and unusual inputs

**Exploration prompts:**
- What happens with very long titles (500+ chars)?
- What happens with special characters in names?
- What happens with empty results?
- What happens when you search with no matches?
- What happens with Unicode content?
- What happens with deeply nested hierarchies?
- What happens with many (100+) dependencies?

**Things to note:**
- Crashes or hangs
- Unexpected behavior
- Missing validation
- Performance degradation

---

## 5. CLI UX Evaluation Checklist

Agent-focused criteria for CLI usability.

### Output Format Support

- [ ] All list commands support `--json` output
- [ ] All show commands support `--json` output
- [ ] All create commands support `--json` output
- [ ] All update commands support `--json` output
- [ ] Error output is valid JSON when `--json` is specified
- [ ] `--quiet` mode returns minimal output (IDs only for creates)
- [ ] Default output is human-readable with alignment

### JSON Output Consistency

- [ ] All IDs use consistent field name (`id`)
- [ ] All IDs are in consistent location (top-level for single, within array items for lists)
- [ ] Timestamps use ISO 8601 format consistently
- [ ] Boolean fields are actual booleans, not strings
- [ ] Numeric fields are actual numbers, not strings
- [ ] Empty arrays are `[]`, not `null` or omitted
- [ ] Optional fields are omitted when null (not `"field": null`)

### Help Text Quality

- [ ] `el --help` lists all top-level commands with descriptions
- [ ] Each command group has `--help` (e.g., `el plan --help`)
- [ ] Each subcommand has `--help` (e.g., `el plan create --help`)
- [ ] Required flags are marked clearly (e.g., `[required]`)
- [ ] Flag descriptions include valid values for enums
- [ ] Examples are provided for complex commands

### Command Hierarchy

- [ ] Command groups follow noun-verb pattern (`el plan create`)
- [ ] Similar operations have similar syntax across types
- [ ] Common operations have shortcuts (aliases)
- [ ] Positional arguments are used for the most common parameter

### Error Messaging Quality

| Criteria | Status |
|----------|--------|
| Error messages describe what went wrong clearly | [ ] |
| Error messages include the error code | [ ] |
| Error messages include human-readable explanation | [ ] |
| Common mistakes are explained with likely causes | [ ] |
| Suggested fixes are provided where applicable | [ ] |
| Validation errors specify which field/value was invalid | [ ] |
| NOT_FOUND errors include the ID that wasn't found | [ ] |
| CYCLE_DETECTED errors explain what cycle would be created | [ ] |

### Exit Codes

| Code | Meaning | Commands to Test |
|------|---------|-----------------|
| 0 | Success | Any successful operation |
| 1 | General error | Database errors |
| 2 | Invalid arguments | Missing required flags |
| 3 | Not found | `el show el-nonexistent` |
| 4 | Validation error | Invalid priority value |
| 5 | Permission error | (if applicable) |

---

## 6. JSON Output Consistency Audit

Verify each command produces consistent JSON.

### Create Commands

| Command | ID Location | Includes Type | Includes Timestamps |
|---------|-------------|---------------|---------------------|
| `el create task` | `.id` | [ ] | [ ] |
| `el create document` (via `el doc write`) | `.id` | [ ] | [ ] |
| `el plan create` | `.id` | [ ] | [ ] |
| `el workflow pour` | `.id` | [ ] | [ ] |
| `el channel create` | `.id` | [ ] | [ ] |
| `el library create` | `.id` | [ ] | [ ] |
| `el team create` | `.id` | [ ] | [ ] |
| `el entity register` | `.id` | [ ] | [ ] |

### List Commands

| Command | Array Field | Item Has ID | Consistent Item Shape |
|---------|-------------|-------------|----------------------|
| `el list` | top-level array | [ ] | [ ] |
| `el list --type task` | top-level array | [ ] | [ ] |
| `el ready` | top-level array | [ ] | [ ] |
| `el blocked` | top-level array | [ ] | [ ] |
| `el plan list` | top-level array | [ ] | [ ] |
| `el workflow list` | top-level array | [ ] | [ ] |
| `el channel list` | top-level array | [ ] | [ ] |
| `el library list` | top-level array | [ ] | [ ] |
| `el team list` | top-level array | [ ] | [ ] |
| `el entity list` | top-level array | [ ] | [ ] |
| `el playbook list` | top-level array | [ ] | [ ] |

### Show Commands

| Command | ID at `.id` | Full Element Data | Consistent with List Item |
|---------|-------------|-------------------|--------------------------|
| `el show <id>` | [ ] | [ ] | [ ] |
| `el plan show <id>` | [ ] | [ ] | [ ] |
| `el workflow show <id>` | [ ] | [ ] | [ ] |
| `el playbook show <name>` | [ ] | [ ] | [ ] |
| `el doc read <id>` | [ ] | [ ] | [ ] |

### Field Naming Conventions

Check all commands use consistent naming:

| Expected | Alternatives to Check For |
|----------|--------------------------|
| `id` | `_id`, `ID`, `elementId` |
| `createdAt` | `created_at`, `createTime`, `created` |
| `updatedAt` | `updated_at`, `updateTime`, `updated` |
| `createdBy` | `created_by`, `creator`, `author` |
| `channelId` | `channel_id`, `channel` |
| `contentType` | `content_type`, `type` |

### Timestamp Format

All timestamps should be ISO 8601: `2025-01-22T10:00:00.000Z`

- [ ] `createdAt` format correct
- [ ] `updatedAt` format correct
- [ ] `closedAt` format correct
- [ ] `deletedAt` format correct
- [ ] `scheduledFor` format correct
- [ ] `deadline` format correct

---

## 7. Gap Analysis

Comparison of automated test coverage vs manual testing needs.

### Well-Covered by Automated Tests

| Area | Test File(s) | Coverage Notes |
|------|--------------|----------------|
| Task CRUD | `crud.test.ts`, `task.test.ts` | 100+ tests |
| Task status transitions | `task.test.ts` | All states covered |
| Plan operations | `plan.test.ts` | 57+ tests |
| Workflow pouring | `workflow-pour.test.ts` | 59+ tests |
| Dependency system | `dependency.test.ts`, `dependency.perf.test.ts` | 200+ tests |
| Blocked cache | `blocked-cache.test.ts` | 60+ tests |
| Message creation | `message.test.ts` | Threading, attachments |
| Document versioning | `document-version.integration.test.ts` | 19+ tests |
| JSON output format | `formatter.test.ts` | Format validation |
| Error codes | `errors.test.ts`, `codes.test.ts` | All codes covered |

### Gaps Requiring Manual Testing

| Area | Why Manual Testing Needed |
|------|---------------------------|
| **Cross-element orchestration** | Integration of 5+ element types in one flow |
| **Multi-agent scenarios** | Actor switching, permission boundaries |
| **CLI discoverability** | Subjective UX assessment |
| **Error message clarity** | Judgment on "is this helpful?" |
| **Real-world workflow patterns** | Complex sequences not easily automated |
| **Performance at scale** | Long-running operations with real data |
| **Recovery patterns** | Agent decision-making on errors |

### Recommended New Automated Tests

Based on manual testing findings, consider adding:

1. **End-to-end orchestration test**: Single test that creates entity, document, task with reference, message with attachment, and validates the full flow

2. **Actor attribution audit**: Verify all operations correctly attribute to the specified actor

3. **JSON schema validation**: Automated check that all JSON output matches documented schemas

4. **Error message snapshot tests**: Capture and verify error message text doesn't regress

5. **Cross-command consistency tests**: Verify same element looks same across `create`, `show`, `list`

---

## 8. Issue Tracking Protocol

When issues are found during manual testing, track them using Elemental.

### Step 1: Search for Existing Issues

```bash
# Search for related tasks
el search "[relevant keywords]" --json

# Check open bugs
el list --type task --status open --tag bug --json
```

### Step 2: Create the Issue Task

```bash
# For bugs
el create task "BUG: [brief description]" \
  --type bug \
  --priority [1-5] \
  --tag testing \
  --tag [affected-area] \
  --description "[detailed description with reproduction steps]"

# For UX issues
el create task "UX: [brief description]" \
  --type task \
  --priority [2-4] \
  --tag testing \
  --tag ux \
  --description "[what's confusing and suggested improvement]"

# For documentation issues
el create task "DOC: [brief description]" \
  --type task \
  --priority [3-5] \
  --tag testing \
  --tag documentation
```

### Step 3: Wire Up Dependencies

```bash
# If this issue blocks another task
el dep add [new-task-id] [blocked-task-id] --type blocks

# If this issue is blocked by another task
el dep add [blocking-task-id] [new-task-id] --type blocks

# If related to another task (non-blocking)
el dep add [new-task-id] [related-task-id] --type relates-to
```

### Issue Categories

| Category | Task Type | Typical Priority | Tags |
|----------|-----------|------------------|------|
| Bug - crashes | `bug` | 1-2 | `testing`, `critical` |
| Bug - incorrect behavior | `bug` | 2-3 | `testing` |
| Bug - edge case | `bug` | 3-4 | `testing`, `edge-case` |
| UX - confusing | `task` | 3-4 | `testing`, `ux` |
| UX - inefficient | `task` | 4-5 | `testing`, `ux` |
| Documentation - missing | `task` | 4-5 | `testing`, `documentation` |
| Enhancement - improvement | `task` | 4-5 | `testing`, `enhancement` |

### Issue Template

```markdown
## Summary
[One sentence description]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [etc.]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- Elemental version: [version]
- Platform: [macOS/Linux/Windows]
- Shell: [bash/zsh/fish]

## Additional Context
[Screenshots, logs, related issues]
```

### Dependency Guidance

Before creating issues:
1. **Search first** to avoid duplicates
2. **Link to related** issues when found
3. **Use `blocks`** for hard dependencies
4. **Use `relates-to`** for soft references
5. **Create prerequisite** tasks first, then wire them up

---

## Appendix A: Quick Reference Commands

### Workspace Setup
```bash
el init                                      # Initialize workspace
el whoami                                    # Check current actor
el stats --json                              # Workspace statistics
el doctor                                    # Health check
```

### Task Operations
```bash
el create task "Title" --priority 2 --json   # Create task
el ready --json --limit 10                   # List ready work
el blocked --json                            # List blocked tasks
el assign <id> --to <entity>                 # Assign task
el update <id> --status in_progress          # Change status
el close <id> --reason "Done"                # Complete task
el reopen <id>                               # Reopen closed task
el defer <id>                                # Defer task
```

### Document Operations
```bash
el doc write --content-type markdown < f.md  # Create document
el doc read <id>                             # Read document
el update <id> --content "New content"       # Update document
el doc history <id> --json                   # View history
```

### Dependency Operations
```bash
el dep add <src> <tgt> --type blocks         # Add dependency
el dep remove <src> <tgt> --type blocks      # Remove dependency
el dep list <id> --json                      # List dependencies
el dep tree <id>                             # Visualize tree
```

### Plan Operations
```bash
el plan create --title "Plan" --json         # Create plan
el plan activate <id>                        # Activate plan
el plan tasks <id> --json                    # List plan tasks
el plan show <id> --json                     # Show with progress
```

### Workflow Operations
```bash
el playbook list --json                      # List playbooks
el workflow pour <playbook> --var k=v        # Instantiate
el workflow tasks <id> --json                # List workflow tasks
el workflow burn <id>                        # Delete ephemeral
```

### Messaging Operations
```bash
el send --to <entity> --content "..."        # Direct message
el send <channel> --content "..."            # Channel message
el thread <msg-id> --content "..."           # Reply to message
el messages <channel> --json                 # List messages
```

### Sync Operations
```bash
el export                                    # Export to JSONL
el import                                    # Import from JSONL
el status                                    # Sync status
```

---

## Appendix B: Test Session Log Template

Use this template to record manual testing sessions.

```markdown
# Test Session Log

**Date:** YYYY-MM-DD
**Tester:** [name/agent]
**Focus Area:** [domain/scenario]
**Duration:** [time]

## Environment
- Elemental version:
- Platform:
- Shell:

## Scenarios Executed

### [Scenario Name]
- **Status:** [Pass/Fail/Partial]
- **Checkpoints:** X/Y passed
- **Issues Found:** [count]
- **Notes:**

## Issues Created
| Task ID | Summary | Priority | Category |
|---------|---------|----------|----------|
| el-xxx | ... | 2 | bug |

## Observations
[General notes, patterns noticed, suggestions]

## Next Steps
[What to test next, follow-up items]
```

---

## Appendix C: Playbook Template for Testing

Sample playbook for testing workflow features:

```yaml
# .elemental/playbooks/testing-workflow.playbook.yaml
name: testing-workflow
title: "Testing Workflow: {{feature}}"
version: 1

variables:
  - name: feature
    description: Feature being tested
    type: string
    required: true
  - name: tester
    description: Entity running tests
    type: string
    required: true
  - name: priority
    description: Test priority
    type: number
    default: 3

steps:
  - id: setup
    title: "Setup test environment for {{feature}}"
    priority: "{{priority}}"

  - id: test-happy-path
    title: "Test {{feature}} happy path"
    dependsOn: [setup]

  - id: test-edge-cases
    title: "Test {{feature}} edge cases"
    dependsOn: [setup]

  - id: test-errors
    title: "Test {{feature}} error handling"
    dependsOn: [setup]

  - id: document-results
    title: "Document {{feature}} test results"
    dependsOn: [test-happy-path, test-edge-cases, test-errors]

  - id: cleanup
    title: "Cleanup {{feature}} test artifacts"
    dependsOn: [document-results]
```

Usage:
```bash
el workflow pour testing-workflow \
  --var feature="task-lifecycle" \
  --var tester="qa-agent"
```
