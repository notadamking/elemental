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

**Status:** BROKEN - See el-5w9d

**Expected behavior:**
```bash
el dep add A B --type blocks                  # A waits for B
el dep add B A --type blocks                  # Should fail: CYCLE_DETECTED
```

**Actual behavior (BUG):** Second command succeeds, creating a cycle. Both tasks become
permanently blocked. Root cause: ElementalApi.addDependency doesn't call checkForCycle.

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

**Status:** TESTED - 2026-01-24 (Partial Pass)

**Checkpoints:**
- [x] `el init` creates `.elemental/` directory
- [ ] Database file `elemental.db` is created
  - **BUG el-v69e:** Database is NOT created by init; created lazily on first command
  - `el stats` fails after `el init` with confusing error message
- [x] Default config file is created (if applicable)
  - Creates `.elemental/config.yaml` with sensible defaults
- [x] `.gitignore` includes `*.db`, `*.db-wal`, `*.db-shm`
  - Also includes `*.db-journal`
- [ ] `el stats --json` returns valid structure with zero counts
  - **Fails** after fresh init until another command creates the database
  - After `el ready` creates db, stats returns correct structure with zero counts
- [x] `el ready --json` returns empty array
  - Creates database lazily and returns `[]`
- [x] `el whoami` shows configured actor
  - Shows "No actor configured" with helpful instructions for setting one

**Success Criteria:** Workspace is ready for use with no errors

**Issues Found:**
- **el-v69e**: `el init` doesn't create database; `el stats` fails until db is created by another command

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

**Status:** TESTED - 2026-01-24 (Partial Pass - Hierarchical IDs not available via CLI)

**Checkpoints:**
- [x] Create plan: `el plan create --title "Test Plan" --json`
  - Returns plan ID
  - Status is `draft` by default
- [x] Activate plan: `el plan activate <plan-id>`
  - Status changes to `active`
- [x] Create child task: ~~`el create task "Step 1" --parent <plan-id> --json`~~
  - **LIMITATION el-3gnj:** `--parent` flag doesn't exist in CLI
  - **Workaround:** Create task separately, then `el plan add-task <plan-id> <task-id>`
  - Tasks get regular IDs (el-xxx), NOT hierarchical (el-planid.1)
  - **Note:** API `createTaskInPlan()` supports hierarchical IDs but no CLI equivalent
- [x] Create second child: via `el plan add-task`
  - Same limitation as above
- [x] View plan progress: `el plan show <plan-id> --json`
  - Progress shows 0% (no tasks closed)
- [x] Close first task: `el close <task-id>`
- [x] View progress again
  - Progress shows 50%
- [x] Close second task
- [x] Plan auto-completion check
  - Plan status remains `active` (auto-completion is optional/not enabled by default)
  - Progress correctly shows 100%

**Success Criteria:** Plan manages child tasks with accurate progress tracking ✓

**Issues Found:**
- **el-3gnj**: CLI lacks `--parent` flag or `plan create-task` subcommand for hierarchical IDs
- **el-2ola**: This scenario documents non-existent `--parent` syntax

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

**Status:** TESTED - 2026-01-24 (Partial Pass - Command syntax differs from docs)

**Checkpoints:**
- [x] Register entities
  ```bash
  el entity register agent-a --type agent
  el entity register agent-b --type agent
  ```
  - **DOC el-6auj:** Original docs used `--name` flag but actual syntax is positional
- [x] Create direct channel and send message
  - **LIMITATION:** No `el send --to` auto-create; requires explicit channel
  - **DOC el-4xe1:** Docs show `el send --to` but actual flow is:
  ```bash
  CHANNEL=$(el channel create --type direct --direct <agent-b-id> --actor <agent-a-id> --json | jq -r '.data.id')
  el msg send --channel $CHANNEL --content "Hello from A" --actor <agent-a-id> --json
  ```
  - **Enhancement el-1p4u:** Add `--to` convenience flag for direct messaging
  - Returns message ID
  - Channel created with both members
- [x] Recipient can see message
  ```bash
  el msg list --channel <channel-id> --actor <agent-b-id> --json
  ```
  - Message appears with hydrated content
- [x] Reply to message (threading)
  ```bash
  el msg send --channel <channel-id> --content "Reply from B" --thread <message-id> --actor <agent-b-id>
  ```
  - Thread relationship created (threadId set)
- [x] View conversation
  ```bash
  el msg thread <root-message-id> --json
  ```
  - Both messages visible with content hydrated

**Success Criteria:** Agents can communicate bidirectionally with threading ✓

**Notes:**
- Core messaging functionality works correctly
- Documentation uses convenience syntax that doesn't exist yet
- Actor flag requires entity IDs, not names

---

### Scenario: Document Versioning Chain

**Purpose:** Validate document history preservation

**Prerequisites:** Initialized workspace

**Status:** BLOCKED - 2026-01-24 (Missing CLI command)

**Blockers:**
1. **ENHANCEMENT el-4pen**: CLI lacks `el doc update` command - cannot update document content
   - The API `updateDocumentContent()` exists and is tested (19+ tests in document-version.integration.test.ts)
   - But no CLI command exposes this functionality
   - `el update --content` does not exist (only handles task fields: title, priority, status, etc.)
   - `el doc update` subcommand does not exist
   - Without the ability to update documents, versioning cannot be tested via CLI

2. **BUG el-1eo2**: `-V` flag collision on `el doc show`
   - `el doc show el-xxx -V 1` shows CLI version `{"version": "0.1.0"}` instead of doc version
   - `el doc show el-xxx --docVersion 1` works correctly
   - The `-V` shortcut collides with global `--version` flag

**Checkpoints:**
- [x] Create initial document
  ```bash
  el doc create --content "Version 1" --type text --json
  ```
  - Returns document ID ✓
  - Version is 1 ✓
  - **Note:** Command is `el doc create`, not `el doc write`
- [ ] Update document
  ```bash
  # BLOCKED: el doc update does not exist
  # el update <doc-id> --content "Version 2"  # Does NOT work
  ```
  - **BLOCKED**: No CLI command to update document content
- [ ] Update again
  - **BLOCKED**: Same as above
- [x] View history: `el doc history <doc-id> --json`
  - Works correctly, shows all versions in array
  - Would show multiple versions if updates were possible
- [x] Read specific version: `el doc show <doc-id> --docVersion 1 --json`
  - **Note:** Use `--docVersion` not `--version` (flag collision with -V)
  - **Note:** Command is `el doc show` not `el doc versions`
  - Returns correct version data when using full `--docVersion` flag

**Success Criteria:** Full version history preserved and accessible

**Issues Found:**
- **el-4pen**: CLI needs `el doc update` command (enhancement)
- **el-1eo2**: `-V` flag collision on `el doc show` (bug)
- **el-4vik**: This scenario documents non-existent syntax (doc)

---

### Scenario: Dependency Chain Resolution

**Purpose:** Validate blocking dependency propagation

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Pass with Critical Bug)

**Checkpoints:**
- [x] Create chain: A → B → C → D (A blocks B blocks C blocks D)
  ```bash
  A=$(el create task --title "Task A" --json | jq -r '.data.id')
  B=$(el create task --title "Task B" --json | jq -r '.data.id')
  C=$(el create task --title "Task C" --json | jq -r '.data.id')
  D=$(el create task --title "Task D" --json | jq -r '.data.id')
  el dep add $B $A --type blocks
  el dep add $C $B --type blocks
  el dep add $D $C --type blocks
  ```
  - **Note:** Use `--title` flag, not positional argument
  - **Note:** JSON output structure is `{success, data: {id, ...}}` not `{id, ...}`
- [x] Check ready: only A is ready
- [x] Check blocked: B, C, D are blocked
- [x] Blocked reasons accurate for each (e.g., "Blocked by el-xxx (blocks dependency)")
- [x] Close A: B becomes ready
- [x] Close B: C becomes ready
- [x] Close C: D becomes ready
- [x] Dependency tree visualization: `el dep tree $D`
  - Shows full chain with proper hierarchy

**Success Criteria:** Dependencies correctly propagate blocking status ✓

**Issues Found:**
- **el-5w9d**: Cycle detection not enforced - `el dep add` allows creating circular dependencies
  - ElementalApi.addDependency has TODO at line 1995 to call checkForCycle but never does
  - DependencyService.checkForCycle exists and is tested (33 tests) but not integrated
  - Both tasks in a cycle become permanently blocked with no way to unblock

---

### Scenario: Cross-Element Orchestration

**Purpose:** Validate the complete agent orchestration pattern

**Prerequisites:**
- Initialized workspace
- Two entities: `lead-agent`, `worker-agent`

**Status:** TESTED - 2026-01-24 (Partial Pass - documented syntax differs from actual)

**Checkpoints:**
- [x] Lead creates specification document
  ```bash
  # Create spec file
  cat > /tmp/spec.md << 'EOF'
  # Feature Spec
  Build the authentication module with OAuth2 support.
  EOF
  SPEC_ID=$(el doc create --file /tmp/spec.md --type markdown --actor <lead-id> --json | jq -r '.data.id')
  ```
  - **Note:** Use `el doc create --file` not `el doc write` with heredoc
- [x] Lead creates task with spec reference
  ```bash
  # --description-ref does not exist; use --notes to reference spec
  TASK_ID=$(el create task --title "Implement auth module" \
    --assignee <worker-id> \
    --priority 2 \
    --notes "See spec $SPEC_ID" \
    --actor <lead-id> --json | jq -r '.data.id')
  ```
  - **ENHANCEMENT el-4jgm:** `--description-ref` flag doesn't exist
  - **Note:** Use `--title` flag, not positional argument
  - **Note:** Use entity IDs, not names for `--assignee` and `--actor`
- [x] Lead sends message to worker
  ```bash
  # el send doesn't exist; create channel first, then use el msg send
  CHANNEL=$(el channel create --type direct --direct <worker-id> --actor <lead-id> --json | jq -r '.data.id')
  el msg send --channel $CHANNEL --content "New task assigned: $TASK_ID" --attachment $SPEC_ID --actor <lead-id>
  ```
  - **DOC el-4xe1:** Original uses `el send --to` which doesn't exist
  - Channel membership correctly includes both entities
  - Attachment reference preserved in message
- [x] Worker finds the task
  ```bash
  el ready --assignee <worker-id> --actor <worker-id> --json
  ```
  - Task appears in ready list with assignee set ✓
- [x] Worker reads the task (no hydration available)
  ```bash
  el show $TASK_ID --actor <worker-id> --json
  ```
  - **ENHANCEMENT el-2606:** `--hydrate` flag doesn't exist
  - Worker must separately read spec: `el doc show $SPEC_ID`
- [x] Worker starts work
  ```bash
  el update $TASK_ID --status in_progress --actor <worker-id>
  ```
  - Status changes correctly ✓
- [x] Worker sends progress update
  ```bash
  el msg send --channel $CHANNEL --content "Auth module 50% complete" --actor <worker-id>
  ```
  - Message sent to existing channel ✓
- [x] Worker completes task
  ```bash
  el close $TASK_ID --reason "Auth module implemented with tests" --actor <worker-id>
  ```
  - Status changes to closed ✓
  - closedAt timestamp set ✓
  - closeReason captured ✓
- [x] Lead verifies completion
  ```bash
  el show $TASK_ID --actor <lead-id> --json
  ```
  - Status is `closed` ✓
  - closeReason present ✓
- [x] Conversation history accessible
  ```bash
  el msg list --channel $CHANNEL --actor <lead-id> --json
  ```
  - Both messages visible with content hydrated ✓

**Success Criteria:** Full orchestration flow completes with proper attribution ✓

**Issues Found:**
- **el-4jgm**: ENHANCEMENT - Add `--description-ref` flag to `el create task`
- **el-2606**: ENHANCEMENT - Add `--hydrate` flag to `el show`
- **el-42sk**: DOC - This scenario uses syntax that doesn't exist

**Notes:**
Core orchestration pattern works but requires workarounds:
1. Reference documents in `--notes` instead of `--description-ref`
2. Create explicit channels instead of using `el send --to`
3. Read documents separately instead of using `--hydrate`
4. Use entity IDs for `--actor` and `--assignee`, not names

---

### Scenario: Error Recovery Patterns

**Purpose:** Validate agents can recover from errors

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - JSON error code missing)

**Checkpoints:**
- [x] NOT_FOUND error handling
  ```bash
  el show el-nonexistent --json 2>&1
  ```
  - Exit code is non-zero (3) ✓
  - JSON error includes code: "NOT_FOUND"
    - **BUG el-5pwg:** JSON output missing `code` field - only has `error`, `exitCode`, `success`
  - Message is actionable ✓ ("Element not found: el-nonexistent")
- [x] VALIDATION_ERROR handling
  ```bash
  el create task --title "" --json 2>&1  # Empty title - use --title flag
  ```
  - Exit code 2 (invalid args) - different from expected but acceptable
  - Error explains what's wrong ✓ ("--title is required for creating a task")
  - **Note:** Original test used positional arg, but actual syntax requires `--title` flag
- [ ] CYCLE_DETECTED handling
  ```bash
  A=$(el create task --title "A" --json | jq -r '.data.id')
  B=$(el create task --title "B" --json | jq -r '.data.id')
  el dep add $B $A --type blocks
  el dep add $A $B --type blocks 2>&1
  ```
  - **BUG el-5w9d:** Cycle detection NOT enforced - second command succeeds, creating cycle
  - Both tasks become permanently blocked with no way to unblock
- [x] DUPLICATE_NAME handling
  ```bash
  el entity register test-entity --type agent  # positional name, not --name
  el entity register test-entity --type agent 2>&1
  ```
  - Error explains name already taken ✓ ("Entity with name \"test-entity\" already exists")
  - Exit code 4 ✓
  - **DOC:** Original test used `--name` flag but actual syntax is positional

**Additional Tests Performed:**
- [x] Invalid priority value: Exit code 4, "Priority must be a number from 1 to 5" ✓
- [x] Invalid status value: Exit code 4, lists valid values ✓
- [x] Dependency to non-existent element: Exit code 3, "Target element not found" ✓

**Success Criteria:** All errors include code, message, and recovery guidance
- **Partial:** Messages are actionable but JSON missing `code` field (el-5pwg)

**Issues Found:**
- **el-5pwg**: JSON error output missing `code` field per api/errors.md spec
- **el-5w9d**: (pre-existing) Cycle detection not enforced

---

### Scenario: Sync Operations (Export/Import/Status)

**Purpose:** Validate data synchronization between workspaces via JSONL files

**Prerequisites:** Initialized workspace with test data

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical blocked cache bug)

**Checkpoints:**
- [x] Check sync status on fresh workspace: `el status --json`
  - Returns valid structure with zero counts ✓
  - `hasPendingChanges: false` ✓
  - `syncDirectoryExists: false` ✓
- [x] Create test data (tasks, dependencies, documents)
  - Status updates to show dirty elements ✓
- [x] Export elements: `el export --json`
  - Creates `.elemental/sync/elements.jsonl` ✓
  - Creates `.elemental/sync/dependencies.jsonl` ✓
  - Dirty flag cleared after export ✓
- [x] Full export: `el export --full --json`
  - Exports all elements regardless of dirty flag ✓
- [x] Export to custom directory: `el export -o /custom/path --json`
  - Creates files in specified directory ✓
- [x] Incremental export only exports dirty elements
  - After modifying one element, only that element exported ✓
- [x] Import to new workspace: `el import --json`
  - Elements imported correctly ✓
  - Dependencies imported ✓
  - **BUG el-1dwc:** Blocked cache NOT rebuilt - `el blocked` shows empty
- [x] Dry run import: `el import --dry-run --json`
  - Shows what would be imported without making changes ✓
- [x] Import from custom directory: `el import -i /custom/path --json`
  - Works correctly ✓
- [x] Force import: `el import --force --json`
  - **BUG el-53d4:** Conflict resolution message incorrect (says local_wins, applies remote)
- [x] Conflict resolution (LWW strategy)
  - Local changes with later timestamps are preserved ✓
  - Conflict details included in response ✓
- [x] Import with missing files
  - **BUG el-6c3k:** `dependenciesSkipped: -1` when dependencies.jsonl missing
- [x] Import from non-existent directory
  - Returns clear error with exit code 3 ✓
- [x] Quiet output modes work
  - `el export --quiet`: "0:1" format ✓
  - `el import --quiet`: "0:0" format ✓
  - `el status --quiet`: "0" format ✓
  - **UX el-389k:** Format undocumented in help

**Success Criteria:** Data can be reliably synced between workspaces
- **Partial:** Export works correctly, import has critical blocked cache bug

**Issues Found:**
| ID | Summary | Priority |
|----|---------|----------|
| el-1dwc | CRITICAL: Import doesn't rebuild blocked cache - imported blocked tasks not in `el blocked` | 2 |
| el-53d4 | Import conflict resolution message incorrect (local_wins but remote applied) | 3 |
| el-6c3k | Import returns dependenciesSkipped: -1 when file missing | 4 |
| el-5nbq | Sync commands (export, import, status) not in main help | 3 |
| el-389k | Quiet output format undocumented | 5 |

**Notes:**
- Export functionality works correctly
- Import has critical bug: blocked cache not rebuilt, causing imported tasks with dependencies to be permanently stuck
- Sync commands are not discoverable from main help (related to el-4a62)
- LWW conflict resolution works but message is misleading

---

## 4. Exploratory Testing Guides

Areas for freeform exploration without strict scripts.

### CLI Help Discoverability

**Goal:** Determine if agents can discover functionality without documentation

**Status:** TESTED - 2026-01-24 (Partial Pass - Major Discoverability Gaps)

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

**Test Results:**

| Question | Result | Notes |
|----------|--------|-------|
| Can you discover how to create a task from `el --help`? | ✓ Yes | `create <type>` is listed, `el create --help` shows task options |
| Can you find all task-related commands? | ✓ Yes | Task Operations section in main help |
| Are subcommands documented with `--help`? | ✓ Yes | `el plan --help`, `el doc --help`, etc. all work |
| Are required flags marked clearly? | ✓ Yes | `--title <title> (required)` format used |
| Do flag descriptions explain valid values? | ✓ Yes | e.g., "Priority level (1-5, 1=critical)" |
| Can you discover document management? | ✗ No | `el doc` not listed in main help |
| Can you discover plan management? | ✗ No | `el plan` not listed in main help |
| Can you discover workflows? | ✗ No | `el workflow` not listed in main help |
| Can you discover messaging? | ✗ No | `el msg` not listed in main help |
| Can you discover aliases? | ✗ No | `el alias` not listed in main help |
| Does `el search` work? | ✗ No | Listed in help but returns "Unknown command" |

**Issues Found:**
- **el-4a62**: Main help missing command groups (plan, doc, workflow, channel, entity, msg, playbook, library, team)
- **el-53ot**: `el alias` command not listed in main help
- **el-4aja**: `el search` listed in help but not implemented
- **el-3ygh**: `el list --help` doesn't enumerate valid element types

**Summary:**
Basic task operations are discoverable, but 9 major command groups are completely hidden from
the main help. An agent would not be able to learn about documents, plans, workflows, messaging,
entities, channels, playbooks, libraries, or teams without external documentation.

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

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical enforcement gaps)

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

**Test Results:**

| Error Code | Tested | Result | Exit Code | Notes |
|------------|--------|--------|-----------|-------|
| INVALID_INPUT (priority) | ✓ | PASS | 4 | Clear message: "Priority must be 1 to 5" |
| INVALID_INPUT (complexity) | ✓ | PASS | 4 | Clear message: "Complexity must be 1 to 5" |
| INVALID_INPUT (entity type) | ✓ | PASS | 4 | Lists valid types |
| INVALID_INPUT (content type) | ✓ | PASS | 4 | Lists valid types |
| **INVALID_ID** | ✓ | **FAIL** | 3 | Returns NOT_FOUND instead of INVALID_ID (el-2er0) |
| **INVALID_STATUS** | ✓ | **FAIL** | - | Transition from closed→blocked ALLOWED (el-4odk) |
| NOT_FOUND | ✓ | PASS | 3 | Clear message with ID |
| **ENTITY_NOT_FOUND** | ✓ | **FAIL** | - | Accepts non-existent assignees (el-jqhh) |
| DOCUMENT_NOT_FOUND | ✓ | PASS | 3 | Clear message for attachments |
| CHANNEL_NOT_FOUND | ✓ | PASS | 3 | Clear message |
| PLAYBOOK_NOT_FOUND | ✓ | PASS | 3 | Clear message |
| DEPENDENCY_NOT_FOUND | ✓ | PASS | 3 | Shows source→target |
| DUPLICATE_NAME | ✓ | PASS | 4 | Clear message with name |
| DUPLICATE_DEPENDENCY | ✓ | PASS | 4 | Shows existing dep |
| **CYCLE_DETECTED** | ✓ | **FAIL** | - | Not enforced (el-5w9d pre-existing) |
| **HAS_DEPENDENTS** | ✓ | **FAIL** | - | Delete succeeds anyway (el-s80d) |
| TYPE_MISMATCH | ✓ | PASS | 4 | "Element is not a task" |
| MEMBER_REQUIRED | ✓ | PASS | 5 | Clear membership error |
| ALREADY_IN_PLAN | ✓ | PASS* | 1* | Wrong exit code (el-66ln) |
| TITLE_TOO_LONG | ✓ | PASS* | 1* | Wrong exit code (el-66ln) |
| INVALID_JSON | ✓ | PASS* | 1* | Wrong exit code (el-66ln) |
| INVALID_TAG | ✓ | PASS* | 1* | Wrong exit code (el-66ln) |

**Error Output Format Tests:**

| Format | Result | Notes |
|--------|--------|-------|
| JSON error structure | PARTIAL | Missing `code` field (el-5pwg pre-existing) |
| **Verbose format** | **FAIL** | Shows exit code not error code (el-3iux) |
| **Verbose details** | **FAIL** | Missing details field (el-3iux) |
| **Quiet format** | **FAIL** | Missing CODE: prefix (el-5v6j) |
| Standard format | PASS | Clear error messages |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-s80d | HAS_DEPENDENTS not enforced - delete succeeds | 2 | bug |
| el-4odk | INVALID_STATUS transition closed→blocked allowed | 2 | bug |
| el-jqhh | ENTITY_NOT_FOUND not enforced for assignee | 3 | bug |
| el-66ln | Exit codes inconsistent - validation returns 1 not 4 | 3 | bug |
| el-3iux | Verbose output shows exit code not error code | 4 | bug |
| el-5v6j | Quiet format missing CODE: prefix | 4 | bug |
| el-2er0 | INVALID_ID returns NOT_FOUND instead | 4 | bug |

**Summary:**
Error message text is generally clear and actionable. However, critical constraint
enforcement is missing - HAS_DEPENDENTS, INVALID_STATUS, ENTITY_NOT_FOUND, and
CYCLE_DETECTED (pre-existing) are not enforced, allowing invalid operations to succeed.
Exit code mapping is inconsistent for validation errors. Error output formats (verbose,
quiet, JSON) don't match the spec in api/errors.md.

### Command Aliases Exploration

**Goal:** Verify aliases work as expected and are intuitive

**Status:** TESTED - 2026-01-24 (Partial Pass)

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

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| All 12 aliases work correctly | PASS | All resolve to target commands |
| Aliases accept same flags | PASS | --json, --priority, etc. work |
| Alias help shows target help | PASS | `el add --help` shows create help |
| `el alias` command works | PASS | Lists all aliases in table format |
| `el alias --json` works | PASS | Returns JSON alias map |
| Aliases discoverable from main help | FAIL | el-53ot (pre-existing) |
| Help mentions alias relationship | FAIL | New issue el-3ct2 |
| Case sensitivity | INFO | Aliases are lowercase only |
| Missing intuitive aliases | ENHANCEMENT | el-4o53 (del, edit, view, finish) |

**Issues Found:**
- **el-53ot**: (pre-existing) `el alias` not listed in main help
- **el-3ct2**: Alias help doesn't indicate it's an alias for another command
- **el-4o53**: Enhancement - add more intuitive aliases (del, edit, view, finish)

**Summary:**
All 12 existing aliases work correctly and accept the same flags as their target commands.
Help text is inherited properly. Main discoverability gap is that `el alias` isn't listed in
main help, and alias help doesn't mention the alias relationship.

### Edge Cases Exploration

**Goal:** Find boundary conditions and unusual inputs

**Status:** TESTED - 2026-01-24 (Partial Pass)

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

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| Title > 500 chars | PASS | Properly rejected with clear error message |
| Title = 500 chars | PASS | Accepted correctly |
| Special chars in title | PASS | Quotes, HTML, ampersand handled safely |
| Entity name validation | PASS | Rejects invalid chars, allows alphanum/hyphen/underscore |
| Unicode in titles | PASS | CJK, emojis, Greek letters all work |
| Empty title | PASS | Rejected with clear error |
| Whitespace-only title | PASS | Rejected with clear error |
| Empty results (list/search) | PASS | Returns empty array `[]` |
| SQL injection attempt | PASS | Safely handled, parameterized queries |
| Priority 0 | PASS | Rejected with "1 to 5" message |
| Priority 6 | PASS | Rejected with "1 to 5" message |
| Priority -1 | PASS | Rejected (parsed as missing value) |
| **Priority 2.5 (float)** | PARTIAL | Silently truncated to 2 - no warning |
| Large priority (9999999999) | PASS | Rejected with "1 to 5" message |
| Limit 0 | PASS | Returns 0 results |
| Limit -1 | PASS | Rejected (parsed as missing value) |
| Tags with spaces | PASS | Rejected with clear error |
| Tags with colons | PASS | Accepted (feature:auth format) |
| **Multiple --tag flags** | FAIL | Only last tag kept (el-59p3) |
| Plan with 10 tasks | PASS | Progress tracking works correctly |
| 25-task dependency chain | PASS | Blocked status propagates correctly |
| `el ready` with long chain | PASS | Only root task shown as ready |
| `el blocked` with long chain | PASS | All 24 blocked tasks listed |
| **`el show` blocked task** | FAIL | Missing blockedBy/blockReason fields (el-pjjg) |
| **`el dep tree --depth 30`** | FAIL | Ignores depth option, hardcoded to 10 (el-5z7k) |
| Control chars in title | PASS | Accepted (escaped in output) |

**Issues Found:**
- **el-pjjg**: `el show` missing blockedBy/blockReason for blocked tasks (blocked list has them)
- **el-5z7k**: `el dep tree --depth` option ignored - hardcoded to 10 in elemental-api.ts:2186
- **el-28w0**: Float priority values silently truncated to integers without warning
- **el-59p3**: (pre-existing) Multiple --tag flags only keeps last value

**Summary:**
Input validation is robust - proper rejection of invalid values with clear error messages.
Unicode, special characters, and SQL injection attempts are handled safely. Long dependency
chains work correctly for blocked status propagation. Three issues found: show command
doesn't include blocked info, dep tree depth option is ignored, and float priorities are
silently truncated.

### Filter/Query Capabilities Exploration

**Goal:** Evaluate the agent's ability to filter and query tasks effectively

**Status:** TESTED - 2026-01-24 (Partial Pass - Missing key capabilities)

**Exploration prompts:**
- Can you filter by all task fields (priority, status, assignee, type, complexity)?
- Can you filter by entity name instead of ID?
- Can you sort results by different fields?
- Can you paginate and know the total count?
- Can you find unassigned tasks?
- Can you search by title/notes content?

**Test Results:**

| Capability | Command | Result | Notes |
|------------|---------|--------|-------|
| Filter by priority | `el list task --priority 1` | PASS | Works correctly |
| Filter by status | `el list task --status open` | PASS | Works correctly |
| Filter by assignee (ID) | `el list task --assignee el-xxx` | PASS | Works correctly |
| **Filter by assignee (name)** | `el list task --assignee agent-alpha` | **FAIL** | Returns empty - no name resolution (el-574h) |
| Filter by tag | `el list task --tag frontend` | PASS | Works correctly |
| **Multiple tags (AND)** | `el list task --tag a --tag b` | **FAIL** | Only last tag used (el-59p3 pre-existing) |
| **Multiple statuses** | `el list task --status open --status in_progress` | **FAIL** | Only last status used (el-59p3 related) |
| **Filter by taskType (list)** | `el list task --type bug` | **FAIL** | --type filters element type, not taskType (el-4jhl) |
| Filter by taskType (ready) | `el ready --type bug` | PASS | Works on `el ready` |
| **Filter by complexity** | `el list task --complexity 3` | **FAIL** | No --complexity flag (el-3908) |
| Limit results | `el list task --limit 10` | PASS | Works correctly |
| Offset results | `el list task --offset 5` | PASS | Works correctly |
| **Sort by field** | `el list task --sort priority` | **FAIL** | No --sort option (el-51fy) |
| **Pagination metadata** | `el list task --limit 2 --json` | **FAIL** | No total count in JSON (el-46xq) |
| **Filter unassigned** | `el list task --assignee ''` | **FAIL** | Returns all tasks (el-34n6) |
| **Text search** | `el search "bug"` | **FAIL** | Command not implemented (el-4aja pre-existing) |
| Combined filters | `el ready --assignee el-xxx --priority 1` | PASS | Multiple filters work together |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-4jhl | `el list --type` filters element type not taskType | 3 | bug |
| el-574h | --assignee doesn't resolve entity names to IDs | 3 | enhancement |
| el-51fy | `el list` lacks --sort option | 4 | enhancement |
| el-46xq | JSON output lacks pagination total count | 4 | enhancement |
| el-34n6 | Cannot filter for unassigned tasks | 4 | enhancement |
| el-3908 | No --complexity filter on list/ready | 5 | enhancement |

**Dependencies:**
- el-4jhl → el-59p3 (relates-to: parser bug affects multiple options)
- el-574h → el-4kis (relates-to: same name resolution issue)
- el-34n6 → el-574h (relates-to: assignee handling improvements)

**Summary:**
Basic filtering by priority, status, single tag, and assignee ID works. However, agents
cannot: filter by entity name (must use IDs), filter by taskType in `el list`, use multiple
tags/statuses, sort results, find unassigned tasks, or perform text search. The parser bug
el-59p3 causes multiple occurrences of the same flag to overwrite instead of accumulate,
affecting --tag, --status, and potentially other flags.

### Team and Entity Management Exploration

**Goal:** Evaluate team and entity management for agent orchestration scenarios

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical validation gaps)

**Exploration prompts:**
- Can you register different entity types?
- Can you look up entities by name?
- Can you create and manage teams?
- Can you add/remove team members?
- Are entity/team validations enforced?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| Register entity (agent type) | PASS | Works correctly |
| Register entity (human type) | PASS | Works correctly |
| Register entity (system type) | PASS | Works correctly |
| Duplicate entity name rejected | PASS | Clear error with exit code 4 |
| Invalid entity type rejected | PASS | Lists valid types |
| Invalid entity name chars rejected | PASS | Clear validation message |
| `el entity list` | PASS | Returns all entities correctly |
| `el entity list --type agent` | PASS | Filters by type correctly |
| **`el entity show <name>`** | **FAIL** | Returns ALL entities, ignores argument (el-4sdh) |
| **`el entity list --name`** | **FAIL** | No --name filter exists (el-36fq) |
| Team creation | PASS | Works correctly |
| Team list | PASS | Works correctly |
| Team add member | PASS | Works correctly |
| Team remove member | PASS | Works correctly |
| Team members list | PASS | Returns member IDs |
| Team delete with members | PASS | Requires --force, good UX |
| Team filter by member | PASS | `el team list --member` works |
| Duplicate member add | PASS | Idempotent, no error |
| **Team add with multiple --member** | **FAIL** | Only last member kept (el-59p3) |
| **Team add non-existent entity** | **FAIL** | Accepts invalid IDs (el-5zl2) |
| **Team add non-entity element** | **FAIL** | Accepts task IDs as members (el-5gjo) |
| Assign task to entity | PASS | Works correctly |
| Assign task to team | PASS | Works per spec (team assignment) |
| **Assign by entity name** | **FAIL** | Treats name as task ID (el-4kis pre-existing) |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-4sdh | `el entity show` ignores argument, returns all entities | 3 | bug |
| el-5zl2 | `el team add` accepts non-existent entity IDs | 3 | bug |
| el-5gjo | `el team add` accepts non-entity elements as members | 3 | bug |
| el-36fq | `el entity list` needs --name filter | 4 | enhancement |

**Dependencies:**
- el-36fq → el-574h (relates-to: entity name resolution)
- el-36fq → el-4kis (relates-to: parser entity name handling)
- el-5zl2 → el-jqhh (relates-to: entity validation)

**Summary:**
Entity registration and team management work correctly for basic operations. Team operations
(add, remove, list, delete) function properly. Key gaps: entity lookup by name requires
client-side filtering, `el entity show` doesn't filter correctly, and team member validation
doesn't check that IDs are valid entities. The el-59p3 parser bug also affects `--member`
flag for team creation.

---

## 5. CLI UX Evaluation Checklist

Agent-focused criteria for CLI usability.

### Output Format Support

**Status:** TESTED - 2026-01-24 (Pass)

- [x] All list commands support `--json` output
- [x] All show commands support `--json` output
- [x] All create commands support `--json` output
- [x] All update commands support `--json` output
- [x] Error output is valid JSON when `--json` is specified
- [x] `--quiet` mode returns minimal output (IDs only for creates)
- [x] Default output is human-readable with alignment

### JSON Output Consistency

**Status:** TESTED - 2026-01-24 (Pass - see Section 6 for detailed audit)

- [x] All IDs use consistent field name (`id`)
- [x] All IDs are in consistent location (top-level for single, within array items for lists)
- [x] Timestamps use ISO 8601 format consistently
- [x] Boolean fields are actual booleans, not strings
- [x] Numeric fields are actual numbers, not strings
- [x] Empty arrays are `[]`, not `null` or omitted
- [x] Optional fields are omitted when null (not `"field": null`)

### Help Text Quality

**Status:** TESTED - 2026-01-24 (Partial Pass)

- [ ] `el --help` lists all top-level commands with descriptions
  - **BUG el-4a62:** Main help missing 9 command groups (plan, doc, workflow, etc.)
- [x] Each command group has `--help` (e.g., `el plan --help`)
- [x] Each subcommand has `--help` (e.g., `el plan create --help`)
- [x] Required flags are marked clearly (e.g., `[required]`)
- [x] Flag descriptions include valid values for enums
- [x] Examples are provided for complex commands
- [ ] No duplicate sections in help output
  - **UX el-1luz:** Grouped command help shows Subcommands section twice

### Command Hierarchy

**Status:** TESTED - 2026-01-24 (Pass)

- [x] Command groups follow noun-verb pattern (`el plan create`)
- [x] Similar operations have similar syntax across types
- [x] Common operations have shortcuts (aliases)
- [x] Positional arguments are used for the most common parameter

### Error Messaging Quality

**Status:** TESTED - 2026-01-24 (Partial Pass - see Error Recovery Patterns scenario)

| Criteria | Status |
|----------|--------|
| Error messages describe what went wrong clearly | [x] |
| Error messages include the error code | [ ] **BUG el-5pwg** |
| Error messages include human-readable explanation | [x] |
| Common mistakes are explained with likely causes | [x] |
| Suggested fixes are provided where applicable | [x] |
| Validation errors specify which field/value was invalid | [x] |
| NOT_FOUND errors include the ID that wasn't found | [x] |
| CYCLE_DETECTED errors explain what cycle would be created | [ ] **BUG el-5w9d** (not enforced) |

### Exit Codes

**Status:** TESTED - 2026-01-24 (Pass)

| Code | Meaning | Commands to Test | Verified |
|------|---------|-----------------|----------|
| 0 | Success | Any successful operation | [x] |
| 1 | General error | Database errors | [x] |
| 2 | Invalid arguments | Missing required flags | [x] |
| 3 | Not found | `el show el-nonexistent` | [x] |
| 4 | Validation error | Invalid priority value | [x] |
| 5 | Permission error | (if applicable) | - |

---

## 6. JSON Output Consistency Audit

Verify each command produces consistent JSON.

**Status:** TESTED - 2026-01-24 (Partial Pass - Inconsistencies Found)

### Create Commands

All create commands return `{success: true, data: {...}}` with the created element.

| Command | ID Location | Includes Type | Includes Timestamps | Notes |
|---------|-------------|---------------|---------------------|-------|
| `el create task` | `.data.id` | [x] | [x] | ✓ Consistent |
| `el doc create` | `.data.id` | [x] | [x] | ✓ Consistent (not `el doc write`) |
| `el plan create` | `.data.id` | [x] | [x] | ✓ Consistent |
| `el workflow pour` | `.data.id` | [x] | [x] | ✓ Consistent |
| `el channel create` | `.data.id` | [x] | [x] | **BUG el-5zan:** Requires `--actor` flag |
| `el library create` | `.data.id` | [x] | [x] | ✓ Consistent |
| `el team create` | `.data.id` | [x] | [x] | ✓ Consistent |
| `el entity register` | `.data.id` | [x] | [x] | ✓ Consistent |
| `el playbook create` | `.data.id` | [x] | [x] | ✓ Consistent |

### List Commands

All list commands return `{success: true, data: [...]}` with array of elements.

| Command | Array Field | Item Has ID | Consistent Item Shape | Notes |
|---------|-------------|-------------|----------------------|-------|
| `el list` | `.data[]` | [x] | [x] | ✓ Consistent |
| `el list --type task` | `.data[]` | [x] | [x] | ✓ Consistent |
| `el ready` | `.data[]` | [x] | **PARTIAL** | **BUG el-50s8:** Extra fields (effectivePriority, priorityInfluenced) |
| `el blocked` | `.data[]` | [x] | **PARTIAL** | Extra fields (blockedBy, blockReason) - expected behavior |
| `el plan list` | `.data[]` | [x] | [x] | ✓ Consistent |
| `el workflow list` | `.data[]` | [x] | [x] | ✓ Consistent |
| `el channel list` | `.data[]` | [x] | [x] | ✓ Consistent |
| `el library list` | `.data[]` | [x] | [x] | ✓ Consistent |
| `el team list` | `.data[]` | [x] | [x] | ✓ Consistent |
| `el entity list` | `.data[]` | [x] | [x] | ✓ Consistent |
| `el playbook list` | `.data[]` | [x] | [x] | ✓ Consistent |

### Show Commands

| Command | ID at `.data.id` | Full Element Data | Consistent with List Item | Notes |
|---------|------------------|-------------------|--------------------------|-------|
| `el show <id>` | [x] | [x] | [x] | ✓ Consistent |
| `el plan show <id>` | **NESTED** | [x] | **NO** | **BUG el-lxt9:** Returns `{plan: {...}, progress: {...}}` |
| `el workflow show <id>` | [x] | [x] | [x] | ✓ Consistent |
| `el playbook show <name>` | [x] | [x] | [x] | ✓ Consistent |
| `el doc show <id>` | [x] | [x] | [x] | ✓ Consistent (not `el doc read`) |

### Field Naming Conventions

All commands use consistent camelCase naming:

| Expected | Alternatives Found | Status |
|----------|-------------------|--------|
| `id` | None | ✓ |
| `createdAt` | None | ✓ |
| `updatedAt` | None | ✓ |
| `createdBy` | None | ✓ |
| `channelId` | N/A (not used) | ✓ |
| `contentType` | None | ✓ |

### Timestamp Format

All timestamps use ISO 8601: `2026-01-24T11:10:47.029Z`

- [x] `createdAt` format correct
- [x] `updatedAt` format correct
- [x] `closedAt` format correct
- [ ] `deletedAt` format correct - not tested (soft delete not exercised)
- [ ] `scheduledFor` format correct - not tested (no CLI flag)
- [ ] `deadline` format correct - **ENHANCEMENT el-e6wc:** No `--deadline` CLI flag

### Error Output

- [x] Errors return valid JSON when `--json` specified
- [x] Error structure: `{success: false, error: "message", exitCode: N}`
- [ ] Error includes `code` field - **BUG el-5pwg:** Missing per api/errors.md spec

### Empty Results

- [x] Empty arrays returned as `[]`, not `null` or omitted

### Issues Found

| ID | Summary | Priority |
|----|---------|----------|
| el-50s8 | `el ready` includes extra fields not in `el list --type task` | 3 |
| el-lxt9 | `el plan show` wraps data in nested `{plan, progress}` structure | 3 |
| el-5zan | `el channel create` requires `--actor` unlike other create commands | 3 |
| el-e6wc | `el create task` missing `--deadline` flag per task spec | 4 |
| el-5pwg | (pre-existing) JSON error output missing `code` field | 3 |

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
el create task --title "Title" --priority 2 --json  # Create task
el ready --json --limit 10                   # List ready work
el blocked --json                            # List blocked tasks
el assign <id> <entity-id>                   # Assign task (use entity ID, not name - el-4kis)
el update <id> --status in_progress          # Change status
el close <id> --reason "Done"                # Complete task
el reopen <id>                               # Reopen closed task
el defer <id>                                # Defer task
```

### Document Operations
```bash
el doc create --file f.md --type markdown    # Create document from file
el doc create --content "text" --type text   # Create document inline
el doc show <id>                             # Read document
# el doc update <id> --content "New"         # NOT YET IMPLEMENTED (el-4pen)
el doc history <id> --json                   # View history
el doc show <id> --docVersion 1              # Read specific version
el doc rollback <id> <version>               # Rollback to version
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
el status --json                             # Check sync status
el export                                    # Incremental export (dirty elements only)
el export --full                             # Full export (all elements)
el export -o /custom/path                    # Export to custom directory
el import                                    # Import from .elemental/sync/
el import -i /custom/path                    # Import from custom directory
el import --dry-run                          # Preview what would be imported
el import --force                            # Force import (remote wins conflicts)
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
