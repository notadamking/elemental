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

### Scenario: Plan Lifecycle Management

**Purpose:** Validate plan status transitions and lifecycle constraints

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Missing lifecycle constraints)

**Checkpoints:**
- [x] Create plan in draft status: `el plan create --title "Test Plan" --json`
  - Returns plan ID
  - Status is `draft` by default
- [x] Create plan directly as active: `el plan create --title "Plan" --status active --json`
  - Status is `active` immediately
- [x] Reject invalid initial status: `el plan create --title "Plan" --status completed --json`
  - Error: "Invalid initial status: completed. Must be one of: draft, active"
  - Exit code 4
- [x] Add tasks to plan: `el plan add-task <plan-id> <task-id>`
  - Tasks can be added to draft or active plans
- [x] Activate draft plan: `el plan activate <plan-id>`
  - Status changes to `active`
- [x] Activating already active plan is idempotent (succeeds, no change)
- [x] Close partial tasks and check progress
  - Progress percentage updates correctly
- [ ] **FAIL**: Complete plan with incomplete tasks: `el plan complete <plan-id>`
  - **BUG el-g5qk:** Should warn or require --force when tasks remain open
  - Plan is marked "completed" even with 33% progress
- [ ] **FAIL**: Add tasks to completed plan: `el plan add-task <completed-plan-id> <task-id>`
  - **BUG el-4uvk:** Should be rejected, but succeeds
- [x] Cannot activate completed plan
  - Error: "Cannot activate plan: current status is 'completed'. Only draft plans can be activated."
- [x] Cancel draft plan: `el plan cancel <plan-id>`
  - Status changes to `cancelled`
  - cancelledAt timestamp set
- [x] Cannot complete cancelled plan
  - Error: "Cannot complete plan: current status is 'cancelled'. Only active plans can be completed."
- [x] Cannot activate cancelled plan
  - Error: "Cannot activate plan: current status is 'cancelled'. Only draft plans can be activated."
- [ ] **MISSING**: No `el plan reopen` command (see el-6c3v)
- [x] Plan list filtering by status: `el plan list --status active --json`
  - Returns only plans with matching status
- [x] Plan show includes progress: `el plan show <plan-id> --json`
  - Returns `{plan: {...}, progress: {...}}`
- [x] Generic show on plan: `el show <plan-id> --json`
  - Returns `{element: {...}, progress: {...}}`
  - **UX el-58d9:** Inconsistent key naming (`element` vs `plan`)
- [x] Task can only be in one plan at a time
  - Error: "Task is already in plan: el-xxx"
- [x] Remove task from plan: `el plan remove-task <plan-id> <task-id>`
  - Task removed, progress recalculated
- [x] Plan tags (affected by el-59p3 parser bug)
  - Multiple `--tag` flags only keeps last value

**Success Criteria:** Plan lifecycle transitions are properly constrained

**Issues Found:**
- **el-g5qk**: BUG - `el plan complete` allows completing plans with incomplete tasks
- **el-4uvk**: BUG - `el plan add-task` allows adding tasks to completed plans
- **el-6c3v**: ENHANCEMENT - Add `el plan reopen` command for reactivating completed/cancelled plans
- **el-58d9**: UX - Inconsistent JSON structure between `el show` and `el plan show` for plans

---

### Scenario: Workflow Pour from Playbook

**Purpose:** Validate playbook instantiation creates correct task structure

**Status:** BLOCKED - Critical bugs found (2026-01-24)

**Blockers:**
1. **BUG el-59p3**: CLI parser overwrites repeated options instead of accumulating to array
   - Cannot create playbooks with multiple steps via CLI (`--step a:A --step b:B` only creates step b)
   - Also affects `--variable` and `--extends` (see el-2674 for full list of affected flags)
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

### Scenario: Playbook Management

**Purpose:** Validate playbook creation, listing, validation, and management independent of workflow pouring

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Validation gaps)

**Checkpoints:**

**Playbook Creation:**
- [x] Create simple playbook: `el playbook create --name test --title "Test" --step "s:Step" --json`
  - Returns valid JSON with playbook ID
  - Steps array contains the step
- [ ] **FAIL**: Create playbook with multiple steps
  - **BUG el-59p3:** Only last step kept (parser bug)
- [ ] **FAIL**: Create playbook with multiple variables
  - **BUG el-59p3:** Only last variable kept (parser bug)
- [ ] **FAIL**: Create playbook with multiple extends
  - **BUG el-59p3:** Only last extends kept (parser bug)
- [x] Playbook name validation: rejects invalid characters
- [x] Playbook name validation: rejects empty/whitespace
- [x] Playbook title validation: rejects empty title
- [x] Playbook can have zero steps
- [ ] **FAIL**: Create playbook with duplicate name
  - **BUG el-32y1:** Creates second playbook instead of DUPLICATE_NAME error
- [ ] **FAIL**: Create playbook with non-existent extends reference
  - **BUG el-7jdh:** Accepts invalid extends reference without validation

**Playbook Listing:**
- [x] List all playbooks: `el playbook list --json`
  - Returns consistent `{success, data: [...]}` structure
- [ ] **FAIL**: Filter by name: `el playbook list --name foo`
  - **ENHANCEMENT el-3scb:** No --name filter exists
- [ ] **FAIL**: Filter by tag: `el playbook list --tag foo`
  - **ENHANCEMENT el-3scb:** No --tag filter exists
- [x] Generic delete works: `el delete <playbook-id>`

**Playbook Show:**
- [x] Show by name: `el playbook show <name> --json`
  - Returns full playbook data
- [x] Show by ID: `el playbook show <id> --json`
  - Returns full playbook data
- [x] Show non-existent: returns NOT_FOUND with exit code 3
- [x] When duplicate names exist, returns newer playbook (undefined behavior)

**Playbook Validation:**
- [x] Validate existing playbook: `el playbook validate <name> --json`
  - Returns `{valid: true, issues: []}`
- [x] Validate with variables: `el playbook validate <name> --var key=value`
  - Returns pourValidation with resolvedVariables
- [x] Validate non-existent playbook: returns NOT_FOUND
- [ ] **FAIL**: Validate playbook with non-existent extends
  - **BUG el-7jdh:** Reports valid:true despite broken reference

**Playbook Inheritance:**
- [x] Create playbook with extends: `el playbook create --name child --extends base ...`
  - Extends array populated correctly (for single value)
- [x] Validate child playbook works

**Success Criteria:** Playbooks can be created, listed, and validated correctly
- **Partial:** Core creation and validation work, but uniqueness/reference validation missing

**Issues Found:**
| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-32y1 | el playbook create allows duplicate playbook names | 3 | bug |
| el-7jdh | el playbook create accepts --extends for non-existent playbooks | 3 | bug |
| el-3scb | el playbook list needs --name and --tag filters | 4 | enhancement |

**Dependencies:**
- el-3scb → el-59p3 (blocks: parser bug prevents --tag from working)
- el-3scb → el-1gg5 (relates-to: similar filter enhancement for library list)

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

### Scenario: Channel and Messaging Operations

**Purpose:** Validate channel lifecycle and messaging operations with focus on validation and edge cases

**Prerequisites:** Initialized workspace with three registered entities

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical validation gaps)

**Checkpoints:**

**Channel Lifecycle:**
- [x] Create group channel with members: `el channel create --name "test" --type group --member el-a --member el-b --actor el-a`
  - Works correctly with at least 2 members
  - Error message clear when fewer than 2 members: "Group channel requires at least 2 members"
- [x] Create direct channel: `el channel create --type direct --direct el-b --actor el-a`
  - Works correctly, creates channel with both members
  - Self-direct correctly rejected: "Direct channel requires two different entities"
- [ ] **FAIL**: Create duplicate direct channel between same entities
  - **BUG el-53sv:** Creates second direct channel instead of returning existing or erroring
- [x] Channel list with filters: `el channel list --type group --member el-a`
  - Both --type and --member filters work correctly
- [x] Delete channel: `el delete <channel-id>`
  - Works correctly for empty channels
- [ ] **FAIL**: Delete channel with messages orphans them
  - **BUG el-wjo9:** Messages left with invalid channelId reference, no warning or --force required

**Channel Membership:**
- [x] Add member with proper permissions: `el channel add <channel-id> <entity-id> --actor <modifier>`
  - Works correctly when actor is in modifyMembers
- [x] Permission enforcement: non-modifier rejected
  - Clear error: "Entity does not have permission to modify channel membership"
- [ ] **FAIL**: Add non-existent entity as member
  - **BUG el-36li:** Accepts invalid entity IDs without validation
- [ ] **FAIL**: Add non-entity element (task) as member
  - **BUG el-4gu7:** Accepts task/document IDs as members (same as el-5gjo for teams)
- [x] Add duplicate member: idempotent (succeeds, no duplicate added)
- [x] Remove member: works correctly
- [x] Remove non-member: correctly rejected with exit code 4
- [ ] **FAIL**: Remove last modifier
  - **BUG el-63cy:** Allows removing last modifier, leaving unmanageable channel
- [x] Cannot modify direct channel membership: correctly rejected

**Message Operations:**
- [x] Send message to channel: `el msg send --channel <id> --content "Hello" --actor <entity>`
  - Works correctly, content stored in separate document (contentRef)
- [x] List messages: `el msg list --channel <id> --actor <entity>`
  - Returns messages with content hydrated
- [x] Message threading: `el msg send --channel <id> --content "Reply" --thread <msg-id> --actor <entity>`
  - Thread relationship correctly created
- [x] View thread: `el msg thread <msg-id>`
  - Returns all messages in thread with hydrated content
- [x] Send with attachment: `el msg send --channel <id> --content "Doc" --attachment <doc-id> --actor <entity>`
  - Works correctly with single attachment
- [ ] **FAIL**: Multiple attachments: `--attachment doc1 --attachment doc2`
  - **BUG el-2674:** Only last attachment kept (parser bug el-59p3 affects --attachment)
- [x] Attachment validation: non-existent attachment rejected
- [x] Attachment type validation: non-document attachment rejected with clear error

**Message Validation:**
- [x] Non-existent channel: "Channel not found: el-xxx" with exit code 3
- [x] Non-member sender: "You are not a member of channel el-xxx" with exit code 5
- [x] Empty message: "Either --content or --file is required" with exit code 2
- [x] Thread to non-existent message: "Thread parent message not found" with exit code 3
- [x] Thread to message in different channel: "Thread parent message is in a different channel" with exit code 4

**Success Criteria:** Channel and message operations work with proper validation
- **Partial:** Core operations work, but validation gaps allow invalid data (member validation, orphaned messages)

**Issues Found:**
| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-53sv | Duplicate direct channels can be created between same entities | 3 | bug |
| el-wjo9 | Delete channel leaves orphaned messages with invalid channelId | 2 | bug |
| el-36li | el channel add accepts non-existent entity IDs | 3 | bug |
| el-4gu7 | el channel add accepts non-entity elements as members | 3 | bug |
| el-63cy | el channel remove allows removing last modifier | 3 | bug |
| el-2674 | Parser bug el-59p3 affects --member and --attachment flags | 2 | bug |

**Dependencies:**
- el-36li → el-5gjo (relates-to: same entity validation pattern)
- el-4gu7 → el-5gjo (relates-to: same non-entity member pattern)
- el-2674 → el-59p3 (relates-to: same parser bug root cause)

---

### Scenario: Message Immutability and Access Control

**Purpose:** Validate message immutability guarantees and channel membership access control for read/write operations

**Prerequisites:** Initialized workspace with three entities

**Status:** TESTED - 2026-01-24 (Partial Pass - CRITICAL security bug found)

**Checkpoints:**

**Message Immutability:**
- [x] Message update rejected: `el update <msg-id> --title "New"` fails
  - Returns "Messages are immutable and cannot be updated" with exit code 1
- [x] Message deletion rejected: `el delete <msg-id>` fails
  - Returns "Messages cannot be deleted (immutable)" with exit code 4
- [x] Message content preserved: original content always accessible

**Channel Membership - Write Operations:**
- [x] Member can send message: `el msg send --channel <id> --content "Hi" --actor <member>` succeeds
- [x] Non-member send rejected: `el msg send --channel <id> --content "Hi" --actor <non-member>` fails
  - Returns "You are not a member of channel el-xxx" with exit code 5

**Channel Membership - Read Operations:**
- [ ] **FAIL - SECURITY BUG el-1rbd**: Non-member can list messages: `el msg list --channel <id> --actor <non-member>`
  - **CRITICAL**: Returns messages successfully instead of denying access
- [ ] **FAIL - SECURITY BUG el-1rbd**: Non-member can view threads: `el msg thread <msg-id> --actor <non-member>`
  - **CRITICAL**: Returns thread messages instead of denying access
- [ ] **FAIL - SECURITY BUG el-1rbd**: Non-member can show message: `el show <msg-id> --actor <non-member>`
  - **CRITICAL**: Returns message data instead of denying access

**Threading Validation:**
- [x] Valid thread reply: `el msg send --channel <id> --content "Reply" --thread <msg-id>` succeeds
- [x] Cross-channel thread rejected: threading to message in different channel fails
  - Returns "Thread parent message is in a different channel" with exit code 4
- [x] Thread to non-existent message rejected: returns "Thread parent message not found" with exit code 3
- [x] Thread to non-message element rejected: returns "Element el-xxx is not a message" with exit code 4
- [x] Nested threading allowed: replies to replies succeed (creates message with threadId)
- [ ] **UX el-54d6**: Nested replies not visible from root thread view
  - `el msg thread <root>` only shows direct children, not nested descendants

**Content Validation:**
- [x] Empty content rejected: returns "Either --content or --file is required" with exit code 2
- [ ] **UX el-5ha0**: Whitespace-only content accepted (should be rejected)
  - `el msg send --content "   "` succeeds but creates empty-looking message

**Attachment Handling:**
- [x] Valid document attachment: `el msg send --attachment <doc-id>` works correctly
- [x] Non-document attachment rejected: returns "Attachment el-xxx is not a document" with exit code 4
- [x] Non-existent attachment rejected: returns NOT_FOUND with exit code 3

**Success Criteria:** Messages are immutable and channel membership enforced for all operations
- **CRITICAL FAILURE**: Read operations do not enforce channel membership

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-1rbd | SECURITY: Non-members can read channel messages via msg list, msg thread, show | 1 | bug |
| el-5ha0 | UX: el msg send accepts whitespace-only content | 5 | ux |
| el-54d6 | UX: Nested thread replies don't appear in root thread view | 4 | ux |

**Dependencies:**
- el-1rbd → el-4gu7 (relates-to: channel member validation pattern)
- el-1rbd → el-36li (relates-to: channel access validation pattern)
- el-5ha0 → el-2aqg (relates-to: whitespace content validation pattern)

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

### Scenario: Workflow Management Operations

**Purpose:** Evaluate workflow lifecycle management commands (list, show, tasks, progress, burn, squash, gc)

**Prerequisites:** Initialized workspace with at least one playbook

**Status:** TESTED - 2026-01-24 (Partial Pass - Validation gaps, exit code inconsistencies)

**Note:** This scenario tests workflow management AFTER creation, not the pour process itself (which is blocked by el-18ug).

**Checkpoints:**

**Workflow Creation (via pour):**
- [x] Pour creates workflow with correct title: `el workflow pour <playbook> --json`
  - Returns valid workflow ID
  - Title is "Workflow from <playbook-name>"
  - Status is `pending`
- [x] Pour with --ephemeral flag: `el workflow pour <playbook> --ephemeral --json`
  - ephemeral field is `true`
- [x] Pour with --var substitution
  - Variables stored in workflow data
- [ ] **FAIL**: Pour validates playbook exists
  - **BUG el-5rrv:** Accepts non-existent playbook names, creates empty workflow
- [ ] **FAIL**: Pour validates playbook type
  - **BUG el-5ldi:** Accepts task/document IDs instead of playbook names

**Workflow Listing:**
- [x] List all workflows: `el workflow list --json`
  - Returns consistent `{success, data: [...]}` structure
- [x] Filter by status: `el workflow list --status pending --json`
  - Returns only matching workflows
- [x] Filter ephemeral: `el workflow list --ephemeral --json`
  - Returns only ephemeral workflows
- [x] Filter durable: `el workflow list --durable --json`
  - Returns only durable workflows
- [x] Invalid status rejected: `el workflow list --status invalid`
  - Returns clear error with valid status list

**Workflow Show:**
- [x] Show by ID: `el workflow show <id> --json`
  - Returns full workflow data
- [x] Show non-existent: `el workflow show el-nonexistent --json`
  - Returns NOT_FOUND with exit code 3

**Workflow Tasks:**
- [x] List tasks: `el workflow tasks <id> --json`
  - Returns `{success, data: []}` (empty since pour doesn't create tasks - el-18ug)
- [x] Filter by ready: `el workflow tasks <id> --ready --json`
  - Works correctly
- [x] Filter by status: `el workflow tasks <id> --status open --json`
  - Works correctly
- [ ] **FAIL**: Non-existent workflow returns exit code 3
  - **BUG el-uwzm:** Returns exit code 1 instead of 3

**Workflow Progress:**
- [x] Get progress: `el workflow progress <id> --json`
  - Returns structure with totalTasks, statusCounts, completionPercentage, readyTasks, blockedTasks
  - Works correctly (shows 0 tasks since pour doesn't create them)
- [ ] **FAIL**: Non-existent workflow returns exit code 3
  - **BUG el-uwzm:** Returns exit code 1 instead of 3

**Workflow Burn:**
- [x] Burn ephemeral: `el workflow burn <ephemeral-id> --json`
  - Workflow and tasks deleted
  - Returns tasksDeleted and dependenciesDeleted counts
- [x] Burn durable rejected without --force
  - Clear error: "Workflow is durable. Use --force to burn anyway, or 'el delete' for soft delete."
  - Exit code 4
- [x] Burn non-existent: exit code 3

**Workflow Squash:**
- [x] Squash ephemeral: `el workflow squash <ephemeral-id> --json`
  - ephemeral changes to false
- [x] Squash already durable: idempotent (succeeds)
- [x] Squash non-existent: exit code 3

**Workflow GC:**
- [x] Dry run: `el workflow gc --dry-run --json`
  - Returns count without deleting
- [x] GC with --age: `el workflow gc --age 7 --json`
  - Works correctly (no eligible workflows in test)

**Workflow Task Management:**
- [ ] **MISSING**: No `el workflow add-task` command
  - **ENHANCEMENT el-2gdi:** Cannot manually add tasks to workflow
- [ ] **MISSING**: No `el workflow remove-task` command
  - **ENHANCEMENT el-2gdi:** Cannot manually remove tasks from workflow

**Success Criteria:** Workflow management operations work with proper validation
- **Partial:** Core list/show/burn/squash/gc work correctly. Validation gaps in pour (accepts invalid playbook references). Exit code inconsistencies in tasks/progress commands. No manual task management.

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-5rrv | `el workflow pour` accepts non-existent playbook names | 3 | bug |
| el-5ldi | `el workflow pour` accepts non-playbook element IDs | 3 | bug |
| el-uwzm | `el workflow tasks/progress` return exit code 1 for NOT_FOUND | 4 | bug |
| el-2gdi | No `el workflow add-task/remove-task` commands | 4 | enhancement |

**Dependencies:**
- el-5rrv → el-18ug (relates-to: pour implementation)
- el-5ldi → el-18ug (relates-to: pour implementation)
- el-5ldi → el-5rrv (relates-to: both validation gaps)
- el-uwzm → el-66ln (relates-to: exit code inconsistency pattern)
- el-2gdi → el-18ug (blocks: workaround needed while pour is broken)

---

### Scenario: Workflow Status Transitions and Lifecycle

**Purpose:** Evaluate workflow status management - ability to transition workflows through their defined lifecycle states

**Prerequisites:** Initialized workspace with at least one playbook

**Status:** TESTED - 2026-01-24 (Partial Pass - No CLI commands for status transitions)

**Checkpoints:**

**Status Values:**
- [x] Workflow statuses defined: pending, running, completed, failed, cancelled
- [x] Workflow created via pour starts in `pending` status
- [x] List filter by status works: `el workflow list --status pending`
- [x] Invalid status rejected with clear error listing valid values

**Status Transition Commands:**
- [ ] **FAIL**: No `el workflow start` command (pending → running)
  - **ENHANCEMENT el-rja0:** Missing command for manual status transition
- [ ] **FAIL**: No `el workflow complete` command (running → completed)
  - **ENHANCEMENT el-rja0:** Missing command for manual status transition
- [ ] **FAIL**: No `el workflow fail` command (running → failed)
  - **ENHANCEMENT el-rja0:** Missing command for manual status transition
- [ ] **FAIL**: No `el workflow cancel` command (pending/running → cancelled)
  - **ENHANCEMENT el-rja0:** Missing command for manual status transition
- [ ] **FAIL**: `el update <workflow> --status running` rejected
  - Returns "Status can only be set on tasks"
  - No alternative way to change workflow status via CLI

**Automatic Transitions:**
- [ ] **BLOCKED**: Cannot test automatic transitions (el-18ug prevents task creation)
  - Per spec, workflow should auto-transition:
    - pending → running: when first task starts
    - running → completed: when all tasks close
    - running → failed: when required task fails

**Workflow Burn:**
- [x] Burn ephemeral workflow: works correctly, deletes workflow and tasks
- [x] Burn durable workflow requires --force: proper error message
- [x] Burn durable with --force: works correctly

**Workflow Squash:**
- [x] Squash ephemeral → durable: sets ephemeral=false correctly
- [x] Squash already durable: idempotent (succeeds, no change)

**Workflow GC:**
- [x] GC only collects terminal status workflows
- [x] GC with --dry-run: shows count without deleting
- [x] GC with --age: filters by workflow age
- [x] Pending status workflows not collected (correct behavior)
  - **Note:** Without status transition commands, workflows can never reach terminal status for GC

**Success Criteria:** Workflows can transition through their lifecycle
- **PARTIAL FAILURE:** No way to change workflow status via CLI

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-rja0 | No CLI commands for workflow status transitions | 3 | enhancement |

**Dependencies:**
- el-rja0 → el-18ug (relates-to: both affect workflow lifecycle)
- el-rja0 → el-2gdi (relates-to: workaround for el-18ug)
- el-rja0 → el-5rrv (relates-to: pour validation)

**Notes:**
The workflow type has a well-defined status lifecycle (pending → running → completed/failed/cancelled)
but the CLI provides no way to transition between states. The spec indicates transitions should be
automatic based on task status, but:
1. el-18ug prevents pour from creating tasks
2. Even with tasks, there are no manual override commands
3. Result: All workflows are stuck in "pending" forever
4. GC cannot collect any workflows (requires terminal status)

---

### Scenario: Task Deferral and Scheduling

**Purpose:** Validate task deferral, scheduling, and ready list filtering based on scheduledFor

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Date validation gaps discovered)

**Checkpoints:**

**Defer Command:**
- [x] Create task: `el create task --title "Test" --json`
- [x] Defer without date: `el defer <id> --json`
  - Status changes to `deferred`
  - `scheduledFor` remains null
  - Task no longer in ready list
- [x] Defer with future date: `el defer <id> --until 2026-02-01 --json`
  - Status changes to `deferred`
  - `scheduledFor` set to specified date (ISO 8601)
  - Task no longer in ready list
- [x] Invalid date rejected: `el defer <id> --until invalid`
  - Returns clear error "Invalid date format"
  - Exit code 4
- [ ] **MISSING**: Relative date support: `el defer <id> --until tomorrow`
  - **ENHANCEMENT el-66en:** No relative date parsing (tomorrow, +1d, +1w, etc.)
- [x] Full ISO format accepted: `el defer <id> --until "2026-03-15T10:30:00Z"`
  - Parses correctly with time component
- [x] Defer non-existent task: exit code 3
- [x] Defer closed task: rejected with clear error
- [x] Defer non-task element: rejected with "Element is not a task"
- [x] Defer already-deferred task: silently succeeds (idempotent)
  - **UX el-4naz:** Should warn or require explicit --update flag when changing schedule
- [ ] **FAIL**: Invalid dates silently roll over: `el defer <id> --until 2026-02-30`
  - **UX el-2p2p:** Feb 30 becomes March 2 instead of validation error
  - Feb 29 in non-leap year (2026) becomes March 1
  - This can cause confusion for agents expecting exact scheduling
- [ ] **FAIL**: Past dates accepted without warning: `el defer <id> --until 2025-01-01`
  - **UX el-3ap6:** Succeeds silently instead of warning about past date
  - Agents might accidentally defer to past date due to typo
- [x] Timezone offset conversion: `el defer <id> --until "2026-03-15T15:30:00+05:00"`
  - Correctly converts to UTC (2026-03-15T10:30:00.000Z)
- [x] Non-standard date formats: `2026/01/30` or `01/30/2026`
  - Accepted and parsed (though adds 10:00:00 time component)
  - EU format `30/01/2026` rejected (good)

**Undefer Command:**
- [x] Undefer deferred task: `el undefer <id> --json`
  - Status changes to `open`
  - `scheduledFor` cleared to null
  - Task appears in ready list (if no other blocks)
- [x] Undefer non-deferred task: rejected with clear error
  - "Task is not deferred (status: open)"
  - Exit code 4
- [x] Undefer non-existent task: exit code 3

**Ready List Filtering:**
- [x] Open task with no schedule: appears in ready
- [x] Deferred task: not in ready (regardless of scheduledFor)
- [x] Open task with future scheduledFor: not in ready
  - Correctly excluded even though status is open
- [x] Open task with past scheduledFor: appears in ready
  - Tasks become "ready" when schedule date passes

**Listing Deferred Tasks:**
- [x] Filter by status: `el list task --status deferred --json`
  - Returns all deferred tasks with scheduledFor info
- [ ] **MISSING**: Dedicated command: `el deferred --json`
  - **ENHANCEMENT el-4sdm:** No command to list upcoming scheduled tasks

**Create with Schedule:**
- [ ] **MISSING**: `el create task --scheduled-for 2026-02-01`
  - **ENHANCEMENT el-wtu9:** No flag to set scheduledFor during creation
  - Workaround: Create then immediately defer with --until

**Success Criteria:** Task deferral and scheduling work correctly with proper ready list filtering

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-2p2p | UX: el defer --until silently rolls over invalid dates (Feb 30 → Mar 2) | 4 | ux |
| el-3ap6 | UX: el defer --until accepts past dates without warning | 4 | ux |
| el-66en | ENHANCEMENT: Add relative date support (tomorrow, +1d, +1w) | 4 | enhancement |
| el-wtu9 | ENHANCEMENT: Add --scheduled-for flag to el create task | 4 | enhancement |
| el-4sdm | ENHANCEMENT: Add el deferred command to list scheduled tasks | 4 | enhancement |
| el-4naz | UX: el defer on already-deferred task silently succeeds | 5 | ux |

**Dependencies:**
- el-2p2p → el-66en (relates-to: date validation improvement)
- el-3ap6 → el-66en (relates-to: date validation improvement)
- el-3ap6 → el-2p2p (relates-to: both date validation issues)
- el-wtu9 → el-66en (relates-to: both date handling improvements)
- el-4sdm → el-66en (relates-to: both scheduling improvements)
- el-4naz → el-66en (relates-to: defer command behavior)
- el-wtu9 → el-e6wc (relates-to: both create task date flags)

---

### Scenario: Stats and Doctor Commands

**Purpose:** Validate workspace health monitoring and statistics commands for agent observability

**Prerequisites:** Initialized workspace (with and without database)

**Status:** TESTED - 2026-01-24 (Partial Pass - Doctor path bug, undocumented quiet behavior)

**Checkpoints:**

**Stats After Init:**
- [x] Fresh workspace without database: `el stats --json` fails with error (el-v69e pre-existing)
  - Error: "No database found. Run \"el init\""
  - Exit code 1
- [x] After database creation (e.g., `el ready`): stats works correctly
  - Returns totalElements, elementsByType, totalDependencies, etc.

**Stats Output:**
- [x] Human-readable format: displays organized statistics
- [x] JSON format: `{success, data: {...}}` structure
- [x] Stats update correctly after creating elements
- [x] Stats update correctly after creating dependencies
- [x] Stats update correctly after closing tasks (readyTasks/blockedTasks)
- [ ] **MISSING**: Stats doesn't show task breakdown by status
  - **ENHANCEMENT el-5wgj:** Would be useful to see counts by open/closed/in_progress/deferred
- [x] Quiet mode: `el stats --quiet` outputs nothing (exit code 0)
  - **UX el-6bqx:** Undocumented behavior - should output key number or be documented

**Doctor Command:**
- [x] Fresh workspace without database: shows diagnostic with database error
  - `healthy: false` with clear message
  - Exit code 1
- [x] After database creation: all diagnostics pass
  - workspace, database, connection, schema_version, schema_tables, integrity, foreign_keys, blocked_cache, storage
  - Exit code 0
- [x] Corrupted database: correctly reports connection error
  - "file is not a database" message
- [x] Outside workspace: reports "No .elemental directory found"
- [x] Verbose mode: includes detailed diagnostic info
- [ ] **FAIL**: Custom database path: `el doctor --db <path>`
  - **BUG el-690o:** Says "Using custom database path: <path>" but then checks default workspace path

**Doctor Output:**
- [x] Human-readable format: [OK]/[ERROR] prefix for each check
- [x] JSON format: `{success, data: {healthy, diagnostics: [], summary: {}}}`
- [x] Exit code 0 when healthy, 1 when unhealthy
- [x] Quiet mode: no output

**Discoverability:**
- [x] `el stats` listed in main help
- [x] `el doctor` listed in main help
- [x] Help text includes examples

**Success Criteria:** Agents can monitor workspace health and get statistics

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-690o | BUG: `el doctor --db <path>` ignores custom path for database check | 3 | bug |
| el-5wgj | ENHANCEMENT: Stats should show task breakdown by status | 5 | enhancement |
| el-6bqx | UX: `el stats --quiet` outputs nothing - undocumented | 5 | ux |

**Dependencies:**
- el-690o → el-5guf (relates-to: CLI flag handling issues)
- el-6bqx → el-389k (relates-to: quiet output format documentation)
- el-5wgj → el-46xq (relates-to: enhanced information outputs)

---

### Scenario: Team-Based Work Assignment and Pool Selection

**Purpose:** Evaluate team-based task assignment for multi-agent orchestration - validating that agents can work from team pools and claim work appropriately

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Validation gaps found)

**Checkpoints:**

**Team Creation and Management:**
- [x] Create team: `el team create --name "dev-team" --json` works correctly
- [x] Add members: `el team add <team-id> <entity-id>` works correctly
- [x] List members: `el team members <team-id>` returns member IDs
- [ ] **FAIL**: Create duplicate team name allowed
  - **BUG el-4lug:** `el team create --name "dev-team"` succeeds even if name exists
- [ ] **FAIL**: Remove non-member succeeds silently
  - **BUG el-11d5:** `el team remove <team> <non-member>` returns success instead of error

**Task Assignment to Teams:**
- [x] Assign task to team by ID: `el create task --title "Team task" --assignee <team-id>` works
- [x] Assign task to team by name: `--assignee "dev-team"` resolves to team ID correctly
- [x] Reassign from team to individual: `el assign <task> <entity>` removes from team pool
- [x] Reassign from individual to team: `el assign <task> <team>` adds to team pool

**Team Member Work Discovery:**
- [x] Team members see team-assigned tasks: `el ready --assignee <member-id>` includes team tasks
- [x] Multiple team membership: entity in multiple teams sees all team tasks
- [x] Priority filter works: `el ready --assignee <member> --priority 1` filters correctly
- [ ] **FAIL**: Filter by team name doesn't work
  - `el ready --assignee "dev-team"` returns empty (no name resolution for filters)
  - Related to el-574h (name resolution for assignee filter)

**Work Claiming Patterns:**
- [x] Claim task from pool: reassign from team to individual works
- [x] Claimed task invisible to other team members
- [x] Work-in-progress visible only to assignee: `el ready --assignee <owner>`
- [x] Complete task removes from ready list

**Team Deletion:**
- [ ] **FAIL**: Delete team without --force succeeds when team has members
  - **BUG el-8cz4:** Should require --force or reject deletion
- [x] Tasks assigned to deleted team retain orphaned assignee (related to el-27ay)

**Team List Filtering:**
- [x] Filter by member: `el team list --member <entity-id>` works
- [ ] **FAIL**: No --name filter: `el team list --name "dev-team"` returns "Unknown option"
  - **ENHANCEMENT el-5ske:** Add --name filter for team lookup

**Success Criteria:** Teams enable multi-agent work distribution with proper pool mechanics
- **Partial:** Core assignment and discovery work, but validation gaps exist

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-4lug | `el team create` allows duplicate team names | 3 | bug |
| el-11d5 | `el team remove` succeeds silently for non-members | 4 | bug |
| el-8cz4 | `el delete team` succeeds without --force when team has members | 3 | bug |
| el-5ske | `el team list` needs --name filter | 4 | enhancement |

**Dependencies:**
- el-4lug → el-32y1 (relates-to: same duplicate name validation pattern)
- el-8cz4 → el-5hnx (relates-to: same delete validation pattern)
- el-5ske → el-36fq (relates-to: same name filter pattern)
- el-5ske → el-3scb (relates-to: same name filter pattern)

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

**Status:** TESTED - 2026-01-24 (Pass with Minor Inconsistencies)

**Exploration prompts:**
- Pick 5 different `list` commands. Are field names consistent?
- Do all create commands return the same structure?
- When an error occurs with `--json`, is it still valid JSON?
- Are empty results `[]` or `null` or something else?
- Do IDs appear in consistent locations across element types?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| 7 list commands field names | PASS | All use consistent camelCase |
| All list commands use `{success, data: [...]}` | PASS | Consistent structure |
| All create commands return `{success, data: {...}}` | PASS | ID at `.data.id` |
| Error JSON validity | PASS | All errors return valid JSON |
| Empty results format | PASS | Empty arrays `[]`, not null |
| ID location consistency | PASS | Always `.data.id` for single, `.data[].id` for lists |
| Timestamps ISO 8601 | PASS | All use `2026-01-24T11:51:50.965Z` format |
| Boolean/numeric types | PASS | Correct types, not strings |
| Common fields present | PASS | id, type, createdAt, updatedAt, createdBy, tags, metadata |
| `el msg send` vs `el msg list` content | INFO | Send returns contentRef, list hydrates content - expected |

**Minor Inconsistencies Found:**

| Command | Structure | Issue |
|---------|-----------|-------|
| `el team members` | `{members: [], count: 0}` | Returns object instead of array (el-1rp0) |
| `el dep list` | `{dependencies: [], dependents: []}` | Returns object for bidirectional info (el-18nr) |
| `el ready` | Extra fields | Includes effectivePriority, priorityInfluenced (el-50s8) |
| `el plan show` | Nested `{plan, progress}` | Wraps data in nested structure (el-lxt9) |
| `el show` blocked task | Missing fields | No blockedBy/blockReason fields (el-pjjg) |

**Things to note:**
- Inconsistent field naming (camelCase vs snake_case)
- Missing fields that should be present
- Extra fields that aren't documented
- Null vs undefined vs missing field behavior

**Summary:**
Core JSON output is highly consistent. All list/create/show commands follow the `{success, data}` pattern.
Field naming is consistently camelCase. All timestamps are ISO 8601. Minor inconsistencies exist in
specialized commands (`team members`, `dep list`) that return object structures instead of arrays, and
some commands include extra computed fields (`ready`) or nested structures (`plan show`). These are
low priority as the patterns are predictable and documented.

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

### Alias Pipeline Compatibility and Scripting

**Goal:** Validate that aliases work correctly in scripting scenarios, pipelines, and complex command chains - critical for agent orchestration

**Status:** TESTED - 2026-01-24 (Pass)

**Exploration prompts:**
- Do aliases work with xargs pipelines?
- Do exit codes match between aliases and target commands?
- Do aliases work in shell scripts?
- Do aliases work with parallel execution (xargs -P)?
- Do complex flag combinations work with aliases?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| `el add task` alias creates tasks | PASS | All create aliases (add, new) work correctly |
| `el ls` alias lists elements | PASS | Returns correct JSON structure |
| `el todo` alias for ready list | PASS | Returns ready tasks correctly |
| `el tasks` alias for ready list | PASS | Both aliases work identically |
| `el s` alias shows element | PASS | Returns full element data |
| `el get` alias shows element | PASS | Returns full element data |
| `el done` alias closes task | PASS | Correctly sets status to closed |
| `el complete` alias closes task | PASS | Correctly sets status to closed |
| `el rm` alias deletes element | PASS | Returns deleted: true |
| `el remove` alias deletes element | PASS | Returns deleted: true |
| `el st` alias for status | PASS | Returns sync status data |
| Aliases with --quiet for pipelines | PASS | Outputs IDs only as expected |
| Aliases with xargs | PASS | `el todo --quiet \| xargs -I{} el done {} --reason "..."` |
| Aliases in shell scripts | PASS | Scripts with aliases execute correctly |
| Aliases with parallel xargs (-P) | PASS | Concurrent execution works |
| Alias exit codes match target | PASS | `el s el-nonexistent` returns exit code 3 like `el show` |
| Complex flag combinations | PASS | --title, --priority, --tag, --notes work together |
| Alias with --verbose | PASS | Verbose output works correctly |
| Alias help shows target help | PASS | `el add --help` shows create help |
| Case sensitivity | INFO | Aliases are lowercase only (ADD fails) |
| Alias with subcommand arg | PASS | `el ls task` works correctly |
| jq pipeline chaining | PASS | `el add ... --json \| jq ... \| xargs el s ...` |

**Summary:**
Aliases are fully compatible with scripting and pipeline scenarios. All 12 aliases correctly
resolve to their target commands, accept the same flags, and produce identical exit codes.
This makes aliases safe for use in agent orchestration scripts and complex pipelines.
Confirmed existing issues: el-53ot (alias not in help), el-3ct2 (help doesn't mention alias),
el-4o53 (missing intuitive aliases). No new issues found.

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
| **Team remove non-member** | **FAIL** | Succeeds silently instead of error (el-11d5) |
| **Team duplicate name** | **FAIL** | Allows creating teams with same name (el-4lug) |
| Team members list | PASS | Returns member IDs |
| **Team delete with members** | **FAIL** | Succeeds without --force (el-8cz4) |
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
| el-4lug | `el team create` allows duplicate team names | 3 | bug |
| el-11d5 | `el team remove` succeeds silently for non-members | 4 | bug |
| el-8cz4 | `el delete team` succeeds without --force when has members | 3 | bug |
| el-5ske | `el team list` needs --name filter | 4 | enhancement |

**Dependencies:**
- el-36fq → el-574h (relates-to: entity name resolution)
- el-36fq → el-4kis (relates-to: parser entity name handling)
- el-5zl2 → el-jqhh (relates-to: entity validation)
- el-4lug → el-32y1 (relates-to: same duplicate name validation pattern)
- el-8cz4 → el-5hnx (relates-to: same delete validation pattern)
- el-5ske → el-36fq (relates-to: same name filter pattern)

**Summary:**
Entity registration and team management work correctly for basic operations. Team operations
(add, remove, list, delete) function properly. Key gaps: entity lookup by name requires
client-side filtering, `el entity show` doesn't filter correctly, and team member validation
doesn't check that IDs are valid entities. The el-59p3 parser bug also affects `--member`
flag for team creation.

### Library and Document Organization Exploration

**Goal:** Evaluate library management for knowledge organization scenarios

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical cycle bug, missing features)

**Exploration prompts:**
- Can you create and manage libraries?
- Can you add documents to libraries?
- Can you nest libraries hierarchically?
- Are library validations enforced (cycles, type checks)?
- Can you filter and search libraries?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| Library creation | PASS | `el library create --name "Name"` works correctly |
| Library list | PASS | Returns all libraries with correct structure |
| Library roots | PASS | Returns only non-nested libraries |
| Library stats | PASS | Shows documentCount and subLibraryCount |
| Add document to library | PASS | `el library add <lib-id> <doc-id>` works |
| Remove document from library | PASS | `el library remove <lib-id> <doc-id>` works |
| Document in multiple libraries | PASS | Same doc can be in multiple libraries |
| Library nesting | PASS | `el library nest <child> <parent>` works |
| **Library nesting cycles** | **FAIL** | Allows cycles - all libraries become non-roots (el-u6qd) |
| Library delete with contents | PASS | Requires --force - good UX |
| Add non-document to library | PASS | Rejected with clear error |
| Add non-existent document | PASS | Rejected with NOT_FOUND error |
| Duplicate document add | PASS | Rejected with "already exists" error |
| **Library list --name filter** | **FAIL** | No --name filter exists (el-1gg5) |
| **Library list --tag filter** | **FAIL** | No --tag filter exists (el-1gg5) |
| **`el library show`** | **FAIL** | Subcommand doesn't exist (el-oyfc) |
| **`el update --name` for library** | **FAIL** | --name option not supported (el-dkya) |
| **`el library unnest`** | **FAIL** | No command to remove nesting (el-5m3u) |
| **`el library children`** | **FAIL** | No command to list nested libraries (el-5ps3) |
| Update library tags | PASS | `el update <lib-id> --add-tag <tag>` works |
| `el show <library-id>` | PASS | Works via generic show command |
| **Multiple --tag flags** | **FAIL** | Only last tag kept (el-59p3 pre-existing) |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-u6qd | CRITICAL: Library nesting allows cycles (same root cause as el-5w9d) | 2 | bug |
| el-1gg5 | Library list lacks --name and --tag filters | 4 | enhancement |
| el-oyfc | `el library show` doesn't exist (inconsistent with plan/doc/workflow) | 4 | ux |
| el-dkya | `el update` doesn't support --name for libraries | 4 | enhancement |
| el-5m3u | No `el library unnest` command to remove nesting | 3 | enhancement |
| el-5ps3 | No `el library children` command to list nested libraries | 5 | enhancement |

**Dependencies:**
- el-u6qd → el-5w9d (relates-to: same cycle detection root cause)
- el-1gg5 → el-59p3 (blocks: parser bug affects --tag filtering)
- el-1gg5 → el-36fq (relates-to: similar --name filter enhancement)
- el-5m3u → el-u6qd (relates-to: unnest needed to fix cycle-corrupted state)
- el-oyfc → el-4a62 (relates-to: library command discoverability)

**Summary:**
Core library operations (create, add docs, remove docs, nest, delete) work correctly.
Type validation is enforced - only documents can be added. Duplicate protection works.
Critical bug: cycle detection not enforced on nesting, causing all libraries to become
non-roots with no recovery path. Missing convenience features: filtering, unnesting,
show subcommand, and listing nested children. The el-59p3 parser bug also affects
multiple --tag flags during library creation.

### Task Assignment and Work Distribution Exploration

**Goal:** Evaluate multi-agent work distribution patterns

**Status:** TESTED - 2026-01-24 (Partial Pass - Validation gaps)

**Exploration prompts:**
- Can agents find assigned work using entity name or ID?
- Can agents find unassigned work to claim?
- Does team assignment propagate to team members?
- Can tasks be reassigned between agents?
- Is assignee validation enforced?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| Register multiple entities | PASS | agent, human, system types work correctly |
| Create tasks with assignee (ID) | PASS | Works correctly |
| Filter ready by assignee (ID) | PASS | Returns correct subset |
| **Filter ready by assignee (name)** | **FAIL** | Returns empty (el-574h pre-existing) |
| **Filter for unassigned tasks** | **FAIL** | --assignee "" returns all (el-34n6 pre-existing) |
| Combined priority + assignee filter | PASS | Multiple filters work together |
| **Filter by taskType on list** | **FAIL** | --type filters element type not taskType (el-4jhl pre-existing) |
| Filter by taskType on ready | PASS | --type bug works on `el ready` |
| Team creation and membership | PASS | Works correctly |
| Task assigned to team | PASS | Team members see team-assigned tasks |
| Task reassignment | PASS | `el assign <task> <new-entity>` works |
| Task unassignment | PASS | `el update <task> --assignee ""` clears assignee |
| **Assign to non-existent entity** | **FAIL** | Accepts invalid IDs (el-jqhh pre-existing) |
| **Assign to non-entity (task)** | **FAIL** | Accepts task IDs as assignee (el-1fnm new) |
| Work claiming pattern | PASS | Requires jq filtering for unassigned + priority sort |
| Work handoff pattern | PASS | Close task, create follow-up with dependency works |
| Blocking dependency | PASS | Blocked tasks correctly excluded from ready |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-1fnm | NEW: `el assign` accepts non-entity IDs (tasks, docs) as assignee | 3 | bug |

**Dependencies:**
- el-1fnm → el-5gjo (relates-to: same type validation root cause)
- el-1fnm → el-jqhh (relates-to: same assignee validation theme)

**Summary:**
Core work distribution patterns (assign, reassign, unassign, team assignment) function correctly.
Team-assigned tasks are visible to team members. Work handoff with dependencies works as expected.
Key gaps: no native unassigned filter, no entity name resolution, no complexity filter. Critical
validation bug: assignee field accepts any element ID without type checking, matching the team
membership validation gap (el-5gjo).

### Configuration System Exploration

**Goal:** Evaluate configuration management CLI commands and precedence behavior

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical actor config bug)

**Exploration prompts:**
- Can you set and get configuration values?
- Does precedence work (CLI > env > file > default)?
- Are invalid values rejected during set?
- Can you manage identity settings?
- Does the configured actor apply to operations?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| `el init` creates config.yaml | PASS | Created with sensible defaults |
| `el config show` displays all config | PASS | Shows all sections correctly |
| `el config show <path>` shows specific value | PASS | Works for valid paths |
| `el config set actor <name>` | PASS | Updates config file correctly |
| `el config unset <path>` | PASS | Removes value from config file |
| `el whoami` shows configured actor | PASS | Correct actor and source displayed |
| Environment variable precedence | PASS | ELEMENTAL_ACTOR overrides file |
| **CLI flag --actor used for operations** | **PASS** | Creates element with specified actor |
| **Config file actor used for operations** | **FAIL** | Ignores config, uses "cli-user" default (el-5guf) |
| **`el config show` CLI flag source** | **FAIL** | Doesn't show "(from cli)" for --actor (el-4fud) |
| `el config set identity.mode <mode>` | PASS | Sets identity mode correctly |
| Invalid identity mode rejected | PASS | Error with exit code 4 |
| **`el config set tombstone.ttl 500`** | **FAIL** | Succeeds but corrupts config (el-1t4x) |
| **`el config show nonexistent.path`** | **FAIL** | Internal error instead of graceful message (el-3weu) |
| **`el config set sync.auto_export true`** | **FAIL** | Says "Set" but doesn't write (snake_case) (el-5p5f) |
| `el config set sync.autoExport true` | PASS | camelCase path works correctly |
| `el identity keygen` | PASS | Generates valid Ed25519 keypair |
| `el identity sign` | PASS | Signs data correctly |
| `el identity verify` | PASS | Verifies signatures correctly |
| `el identity mode` | PASS | Shows and sets identity mode |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-5guf | CRITICAL: CLI operations ignore actor from config file | 2 | bug |
| el-1t4x | `el config set` accepts invalid values without validation | 3 | bug |
| el-3weu | `el config show <invalid-path>` throws internal error | 4 | bug |
| el-4fud | `el config show` doesn't include CLI flag values in source | 4 | bug |
| el-5p5f | `el config set` with snake_case path appears to succeed but doesn't write | 4 | ux |

**Dependencies:**
- el-5guf → el-5zan (relates-to: both involve actor default behavior)
- el-1t4x → el-3weu (relates-to: both config validation issues)
- el-5p5f → el-1t4x (relates-to: config set validation)
- el-4fud → el-5guf (relates-to: actor config display)

**Summary:**
Configuration file creation, reading, and identity commands work correctly. Identity keygen/sign/verify
commands function properly. Critical bug: the configured actor in config.yaml is ignored by CLI
operations - they fall back to "cli-user" default instead. This makes the actor configuration
feature non-functional for its primary use case. Additionally, `el config set` doesn't validate
values before writing, allowing invalid values that corrupt the config. The snake_case vs camelCase
path handling is inconsistent - snake_case paths silently fail to write.

### Workspace Initialization and Recovery Exploration

**Goal:** Evaluate workspace initialization, reinitialisation, and recovery from corrupted state

**Status:** TESTED - 2026-01-24 (Partial Pass - Missing reinit/repair, config not validated)

**Exploration prompts:**
- Does `el init` work correctly in fresh directories?
- What happens when reinitializing an existing workspace?
- How does the system handle corrupted config files?
- Is there a way to repair a partially corrupted workspace?
- Does the `--name` and `--actor` flags work as expected?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| Fresh init creates .elemental/ | PASS | Creates config.yaml, .gitignore, playbooks/ |
| Fresh init with --json | PASS | Returns `{success: true, data: {path: ...}}` |
| Reinit on existing workspace | PASS | Correctly rejects with exit code 4 |
| `el init --force` for reinit | **FAIL** | Option doesn't exist (el-5ohn) |
| `el init --name "Project"` | **FAIL** | Flag accepted but has no effect (el-5kd7) |
| `el init --actor "agent"` | PASS | Actor correctly written to config.yaml |
| Actor from config used in operations | **FAIL** | Ignores config, uses cli-user (el-5guf) |
| Init in subdirectory of workspace | PASS | Creates isolated nested workspace |
| Corrupted config.yaml silently ignored | INFO | Commands work with defaults |
| Empty config.yaml silently ignored | INFO | Commands work with defaults |
| `el doctor` with corrupted config | **FAIL** | Reports healthy:true (el-frj5) |
| `el doctor` with missing config | **FAIL** | Reports healthy:true (el-frj5) |
| Empty .elemental/ directory | PASS | Commands lazily create database |
| Init in empty .elemental/ dir | PASS | Correctly rejects (dir exists) |
| `el ready` creates db lazily | PASS | Database created on first command |
| `el doctor` creates db lazily | PASS | For connection check |
| Corrupted database detected | PASS | Doctor reports connection error |
| WAL corruption detected | PASS | "file is not a database" error |
| `--db` flag with init | PASS | Works, creates db at custom path |
| Custom db isolation | PASS | Data stored only in custom db |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-5kd7 | `el init --name` flag has no visible effect | 4 | ux |
| el-5ohn | No `--force` flag for workspace reinit/repair | 4 | enhancement |
| el-frj5 | `el doctor` doesn't validate config.yaml | 4 | enhancement |

**Dependencies:**
- el-5kd7 → el-5ohn (relates-to: both init improvements)
- el-frj5 → el-5ohn (relates-to: both recovery-related)
- el-frj5 → el-1t4x (relates-to: config validation)
- el-frj5 → el-3weu (relates-to: config error handling)
- el-5ohn → el-v69e (relates-to: init database creation)

**Summary:**
Basic workspace initialization works correctly. The database is lazily created on first command
that needs it (not by `el init` itself - see el-v69e). Nested workspaces are properly isolated.
Corrupted databases are detected by doctor. Key gaps:
1. No way to reinitialize or repair a corrupted workspace (`--force` flag missing)
2. The `--name` flag on init has no effect (workspace name not stored)
3. Config.yaml is completely ignored by doctor - corrupted configs pass health check
4. Actor from config file is ignored in operations (el-5guf)

---

### Element Update Command Evaluation

**Goal:** Systematically test the `el update` command across element types and validate field updates

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical validation gaps)

**Exploration prompts:**
- Does update work for all element types (task, document, plan, entity)?
- Are task-only fields properly restricted (priority, status, complexity, assignee)?
- Does tag manipulation work (--add-tag, --remove-tag, --tag)?
- Are invalid values properly rejected?
- Is validation consistent between create and update?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| Update task title | PASS | Works correctly |
| Update task priority | PASS | Works correctly |
| Update task complexity | PASS | Works correctly |
| Update task status | PASS | Works correctly, valid statuses enforced |
| Invalid status rejected | PASS | Clear error with valid values listed |
| Add single tag (--add-tag) | PASS | Works correctly |
| **Multiple --add-tag flags** | **FAIL** | Only last tag kept (el-59p3 pre-existing) |
| **Multiple --tag flags** | **FAIL** | Only last tag kept (el-59p3 pre-existing) |
| Remove tag (--remove-tag) | PASS | Works correctly |
| Replace tags (--tag) | PASS | Works correctly for single tag |
| Update document title | PASS | Works correctly, creates new version |
| Update plan title | PASS | Works correctly |
| Update entity title | PASS | Works - sets title field, not name |
| Priority on non-task | PASS | Properly rejected with clear error |
| Status on plan | PASS | Rejected - directs to plan activate/complete |
| Assign via update | PASS | Works correctly |
| Unassign (--assignee "") | PASS | Works correctly |
| Update non-existent element | PASS | Returns NOT_FOUND with exit code 3 |
| Update with no changes | PASS | Rejected with helpful error |
| **Update with empty title** | **FAIL** | Accepts empty title (el-2aqg) |
| **Update with whitespace title** | **FAIL** | Accepts whitespace-only title (el-2aqg) |
| **Assign non-existent entity** | **FAIL** | Accepts invalid ID (el-jqhh pre-existing) |
| **Assign non-entity element** | **FAIL** | Accepts plan/doc ID as assignee (el-1fnm pre-existing) |
| **--notes flag** | **FAIL** | Flag doesn't exist (el-5qjd) |
| **--name flag** | **FAIL** | Flag doesn't exist (el-dkya pre-existing) |
| Update closed task | INFO | Allowed - may be intentional |
| --status open on closed | INFO | Doesn't clear closedAt (el-4e6g) |
| --status blocked manually | INFO | Allowed but confusing (el-27ip) |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-2aqg | NEW: `el update` accepts empty/whitespace title | 3 | bug |
| el-5qjd | NEW: `el update` missing --notes flag | 4 | enhancement |
| el-4e6g | NEW: `el update --status open` doesn't clear closedAt | 4 | ux |
| el-27ip | NEW: Manual blocked status allowed without blockers | 5 | ux |

**Dependencies:**
- el-2aqg → el-1t4x (relates-to: validation consistency theme)
- el-5qjd → el-dkya (relates-to: update flag coverage)
- el-4e6g → el-2deb (relates-to: status field cleanup on reopen)

**Summary:**
Core update operations work correctly for titles, priorities, and tag manipulation. Type
restrictions are properly enforced (priority/status/assignee only on tasks). Critical gap:
empty and whitespace-only titles are accepted by update, unlike create which rejects them.
Several missing flags: --notes for updating task notes, --name for updating entity/library
names. Status transitions via `el update --status` behave differently from dedicated
commands like `el reopen`, which may confuse users.

### Generic CRUD Operations and Metadata Exploration

**Goal:** Evaluate generic create/show/list/delete commands and metadata handling across all element types

**Status:** TESTED - 2026-01-24 (Partial Pass - Generic create limited, metadata unsupported)

**Exploration prompts:**
- Does `el create` support all element types?
- Is metadata settable via CLI?
- Does `el list` support comprehensive filtering?
- Can tombstoned elements be viewed?
- Does `el delete` properly clean up dependencies?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| `el create task` | PASS | Works correctly with title, priority, tags, etc. |
| **`el create plan`** | **FAIL** | "Unsupported element type: plan. Currently supported: task" |
| **`el create document`** | **FAIL** | Same - must use `el doc create` |
| **`el create entity`** | **FAIL** | Same - must use `el entity register` |
| `el show <any-id>` | PASS | Works for all element types |
| `el show <plan-id>` | INFO | Returns nested `{element, progress}` structure |
| `el list` all elements | PASS | Returns all element types correctly |
| `el list --type <type>` | PASS | Filters correctly |
| `el list --tag <tag>` | PASS | Filters correctly |
| **`el list --createdBy`** | **FAIL** | Option doesn't exist (el-5g7m) |
| **`el list --deleted`** | **FAIL** | Cannot view tombstoned elements (el-2awx) |
| `el delete <id>` | PASS | Soft deletes correctly |
| `el delete <message>` | PASS | Properly rejects with "immutable" error |
| Delete reason captured | PASS | `--reason` flag works |
| **`el create --metadata`** | **FAIL** | Option doesn't exist (el-ud5u) |
| **`el update --metadata`** | **FAIL** | Option doesn't exist (el-ud5u) |
| **Multiple `--tag` on create** | **FAIL** | Only last tag kept (el-59p3 pre-existing) |
| **Multiple `--add-tag` on update** | **FAIL** | Only last tag kept (el-59p3 pre-existing) |
| Delete with dependents | INFO | Succeeds (el-s80d bug), leaves orphaned dependency records |
| Priority validation on update | PASS | Rejects 0 and 6 with clear error |
| Type restrictions on update | PASS | Priority/status only on tasks enforced |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-ud5u | ENHANCEMENT: Add --metadata flag to el create and el update | 4 | enhancement |
| el-1so7 | ENHANCEMENT: el create should support all element types | 4 | enhancement |
| el-2awx | ENHANCEMENT: Add --include-deleted flag to el list for tombstones | 5 | enhancement |
| el-5g7m | ENHANCEMENT: Add --createdBy filter to el list | 5 | enhancement |

**Dependencies:**
- el-ud5u → el-59p3 (relates-to: multiple --metadata flags would need parser fix)
- el-1so7 → el-4a62 (relates-to: help discoverability)
- el-5g7m → el-46xq (relates-to: list pagination improvements)
- el-5g7m → el-51fy (relates-to: list sorting improvements)

**Summary:**
Generic show and delete commands work correctly across all element types. Generic `el list`
provides basic filtering by type and tag. Critical gap: `el create` only supports `task` type -
all other element types require specialized subcommands (`el doc create`, `el plan create`, etc.).
The metadata field exists on all elements but cannot be set via CLI. No way to list tombstoned
elements. Parser bug el-59p3 continues to affect multiple `--tag` flags on both create and update.
Deleting elements with dependents leaves orphaned dependency records (consequence of el-s80d bug).

### Entity Name Resolution and Cross-Command Consistency Exploration

**Goal:** Comprehensive validation of entity name handling across all commands - confirming known issues and verifying patterns

**Status:** TESTED - 2026-01-24 (Confirms known bugs - entity names not resolved anywhere)

**Exploration prompts:**
- Can entity names be used instead of IDs in commands?
- Are entity names resolved consistently across all commands?
- What happens when entity names are used as assignees, members, or filters?
- Is assignee validation enforced consistently?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| `el assign <task> <entity-name>` | **FAIL** | Error: "Task not found: alpha-agent" (el-4kis confirmed) |
| `el assign <task> <entity-id>` | PASS | Works correctly |
| `el ready --assignee <entity-name>` | **FAIL** | Returns empty (el-574h confirmed) |
| `el ready --assignee <entity-id>` | PASS | Returns correct tasks |
| `el entity show <entity-name>` | **FAIL** | Returns ALL entities (el-4sdh confirmed) |
| `el entity show <entity-id>` | PASS | Works correctly |
| `el entity list --name <name>` | **FAIL** | "Unknown option: --name" (el-36fq confirmed) |
| `el team add <team> <entity-name>` | **FAIL** | Error: "Team not found: alpha-agent" |
| `el team add <team> <entity-id>` | PASS | Works correctly |
| `el channel add <ch> <entity-name>` | **FAIL** | Error: "Channel not found: gamma-human" |
| `el channel add <ch> <entity-id>` | PASS | Works correctly |
| `el create task --assignee <name>` | **FAIL-SILENT** | Stores name literally, no validation (el-jqhh) |
| `el create task --assignee <task-id>` | **FAIL-SILENT** | Accepts task ID as assignee (el-1fnm) |
| `el create task --assignee <nonexistent>` | **FAIL-SILENT** | Accepts non-existent ID (el-jqhh) |

**Additional Validation Tests:**

| Test | Result | Notes |
|------|--------|-------|
| Entity name stored literally as assignee | **FAIL** | Creates task with `assignee: "alpha-agent"` string |
| Task ID stored as assignee | **FAIL** | Creates task with task ID as assignee |
| Non-existent ID stored as assignee | **FAIL** | Creates task with `assignee: "el-zzzz"` |
| Filter tasks by invalid assignee | INFO | Works (returns matching tasks with invalid assignees) |

**Test Execution Details:**

```bash
# Test setup (in /tmp/elemental-entity-test)
el init
el entity register alpha-agent --type agent  # Returns el-1vfa
el entity register beta-agent --type agent   # Returns el-fb09
el entity register gamma-human --type human  # Returns el-4b31

# Confirm el-4kis: assign treats entity name as task ID
el assign el-2hnu alpha-agent
# Error: Task not found: alpha-agent

# Confirm el-574h: --assignee doesn't resolve names
el ready --assignee alpha-agent --json | jq '.data|length'
# Returns: 0

# Confirm el-4sdh: entity show ignores argument
el entity show alpha-agent --json | jq '.data|type'
# Returns: "array" (all 3 entities)

# Confirm el-jqhh: assignee accepts invalid values
el create task --title "Test" --assignee alpha-agent --json
# Succeeds! assignee: "alpha-agent" (literal string, not ID)

# Confirm el-1fnm: assignee accepts non-entity elements
TASK1=$(el list task --json | jq -r '.data[0].id')
el create task --title "Invalid" --assignee $TASK1 --json
# Succeeds! assignee is a task ID, not entity ID
```

**Issues Confirmed:**

| ID | Summary | Status | Notes |
|----|---------|--------|-------|
| el-4kis | Parser treats entity names as subcommands | Existing | Confirmed |
| el-574h | --assignee doesn't resolve entity names | Existing | Confirmed |
| el-36fq | el entity list needs --name filter | Existing | Confirmed |
| el-4sdh | el entity show ignores argument | Existing | Confirmed |
| el-jqhh | Assignee accepts invalid values | Existing | Confirmed |
| el-1fnm | Assignee accepts non-entity elements | Existing | Confirmed |
| el-5gjo | Team add accepts non-entity elements | Existing | Related pattern |

**Root Cause Analysis:**

The entity name resolution issue has three distinct patterns:

1. **Parser Confusion (el-4kis)**: The CLI parser's `isSubcommand()` function treats alphanumeric names as potential subcommands, causing positional arguments to be misinterpreted.

2. **No Name-to-ID Resolution (el-574h, el-36fq)**: Commands that accept entity references don't attempt to resolve names to IDs. They only work with IDs in `el-xxxx` format.

3. **No Type Validation (el-jqhh, el-1fnm, el-5gjo)**: Commands that store entity references don't validate that:
   - The ID exists
   - The element is the correct type (entity vs task vs document)

**Recommended Fix Priority:**

1. **High**: Fix validation (el-jqhh, el-1fnm) - prevents invalid data
2. **Medium**: Add name-to-ID resolution utility and use across all commands
3. **Medium**: Fix parser (el-4kis) - improves UX for positional args
4. **Low**: Add --name filter (el-36fq) - convenience enhancement

**Summary:**
Entity names are not usable anywhere in the CLI. All entity-referencing commands require IDs.
The `el entity show` command is broken (returns all entities regardless of argument).
Assignee validation is completely missing - any string or ID is accepted without type or existence checking.
These issues create a pattern where agents must always look up entity IDs first, breaking
the agent-friendly design principle where names should be the primary way to reference entities.

### Bulk Operations and Batch Processing Exploration

**Goal:** Evaluate CLI support for bulk operations on multiple elements - critical for agent orchestration

**Status:** TESTED - 2026-01-24 (Partial Pass - No native support, workarounds exist)

**Exploration prompts:**
- Can commands accept multiple IDs?
- Is there stdin/pipe support for bulk input?
- Does quiet mode work for scripting pipelines?
- Can xargs be used effectively with elemental?
- Are there batch commands or --from-file options?

**Test Results:**

| Test | Result | Notes |
|------|--------|-------|
| `el close id1 id2` (multiple IDs) | **FAIL** | Only first ID closed, second silently ignored |
| `el delete id1 id2` (multiple IDs) | **FAIL** | Only first ID deleted, second silently ignored |
| `el update id1 id2 --priority 1` | **FAIL** | Only first ID updated, second silently ignored |
| `el show id1 id2` (multiple IDs) | **FAIL** | Only first ID shown, second silently ignored |
| `el dep add B A1 A2 --type blocks` | **FAIL** | Only first target added as dependency |
| `el team add team m1 m2` | **FAIL** | Only first member added |
| `el library add lib d1 d2` | **FAIL** | Only first document added |
| `el plan add-task plan t1 t2` | **FAIL** | Only first task added |
| Stdin support (`echo id \| el close`) | **FAIL** | "Usage: el close <id>" error |
| `--from-file` option | **FAIL** | Option doesn't exist |
| `--stdin` option | **FAIL** | Option doesn't exist |
| `el batch` subcommand | **FAIL** | Command doesn't exist |
| `--quiet` output for piping | PASS | Outputs IDs only, one per line |
| xargs compatibility | PASS | `el ready --quiet \| xargs -I{} el close {}` works |
| Parallel xargs (`-P4`) | PASS | Works correctly for concurrent operations |
| Error handling in xargs | PASS | Invalid IDs produce errors, valid ones succeed |
| Filter + bulk pipeline | PASS | `el list --status open --quiet \| xargs ...` works |

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-vocx | UX BUG: CLI commands silently ignore extra positional arguments | 3 | ux |
| el-2jdj | ENHANCEMENT: Add native bulk operation support (--ids flag or stdin) | 4 | enhancement |
| el-13w7 | DOC: Document bulk operation workarounds using xargs and quiet mode | 5 | documentation |

**Dependencies:**
- el-vocx → el-59p3 (relates-to: CLI parser concerns)
- el-2jdj → el-vocx (relates-to: both bulk operation improvements)
- el-13w7 → el-2jdj (relates-to: workaround docs for enhancement)

**Summary:**
No native bulk operation support exists. Commands silently ignore extra positional arguments,
which is confusing for users expecting Unix-style bulk operations. However, effective workarounds
exist using `--quiet` mode output piped to xargs:

```bash
# Bulk close all ready tasks
el ready --quiet | xargs -I{} el close {} --reason "Bulk"

# Parallel bulk operations
el list task --quiet | xargs -P4 -I{} el show {} --json | jq -s '.'

# Filter then bulk process
el ready --priority 1 --quiet | xargs -I{} el close {}
```

These patterns work correctly and should be documented. Future enhancement could add native
`--ids` or `--stdin` flags for more ergonomic bulk operations.

---

### Task Field CLI Exposure Exploration

**Goal:** Evaluate which task properties from specs/types/task.md are exposed via CLI

**Status:** TESTED - 2026-01-24 (Partial Pass - Multiple fields missing)

**Exploration prompts:**
- Are all task fields from the spec settable via CLI create/update?
- Can deadline be set and filtered?
- Can owner (distinct from assignee) be set?
- Can external references be tracked?

**Test Results:**

| Task Property | Spec Status | CLI Create | CLI Update | CLI Filter | Notes |
|---------------|-------------|------------|------------|------------|-------|
| `title` | Defined | ✓ `--title` | ✓ `--title` | N/A | Works |
| `priority` | Defined | ✓ `--priority` | ✓ `--priority` | ✓ `--priority` | Works |
| `complexity` | Defined | ✓ `--complexity` | ✓ `--complexity` | **FAIL** | No filter (el-3908) |
| `taskType` | Defined | ✓ `--type` | N/A | ✓ `--type` on ready | Works |
| `status` | Defined | N/A | ✓ `--status` | ✓ `--status` | Works |
| `assignee` | Defined | ✓ `--assignee` | ✓ `--assignee` | ✓ `--assignee` | Works |
| `notes` | Defined | ✓ `--notes` | **FAIL** | N/A | No update flag (el-5qjd) |
| `tags` | Defined | ✓ `--tag` | ✓ `--add-tag/--remove-tag` | ✓ `--tag` | Works |
| **deadline** | Defined | **FAIL** | **FAIL** | **FAIL** | No CLI support (el-e6wc) |
| **owner** | Defined | **FAIL** | **FAIL** | N/A | No CLI support (el-356g) |
| **externalRef** | Defined | **FAIL** | **FAIL** | N/A | No CLI support (el-64pb) |
| **acceptanceCriteria** | Defined | **FAIL** | **FAIL** | N/A | No CLI support (el-3xok) |
| **descriptionRef** | Defined | **FAIL** | **FAIL** | N/A | No CLI support (el-4jgm) |
| **designRef** | Defined | **FAIL** | **FAIL** | N/A | No CLI support (el-5wp0) |
| `scheduledFor` | Defined | **FAIL** | ✓ `el defer --until` | N/A | Create only (el-wtu9) |

**API vs CLI Gap Analysis:**

The underlying API (src/types/task.ts) fully supports all task fields including:
- `isTaskPastDeadline()` - checks if task is overdue
- `sortTasksByDeadline()` - sorts tasks by deadline date
- `createTaskInput` - accepts all fields including deadline, owner, externalRef, etc.

But the CLI (src/cli/commands/crud.ts) only exposes a subset of these fields.

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-uxgg | Main task: Add missing task field flags to CLI | 3 | enhancement |
| el-356g | Add --owner flag to el create task / el update | 4 | enhancement |
| el-64pb | Add --external-ref flag to el create task / el update | 4 | enhancement |
| el-3xok | Add --acceptance-criteria flag to el create task / el update | 4 | enhancement |
| el-5wp0 | Add --design-ref flag to el create task / el update | 5 | enhancement |
| el-4zrw | Add deadline-based filtering to el ready and el list | 4 | enhancement |

**Dependencies:**
- el-356g → el-uxgg (relates-to: parent enhancement)
- el-64pb → el-uxgg (relates-to: parent enhancement)
- el-3xok → el-uxgg (relates-to: parent enhancement)
- el-5wp0 → el-uxgg (relates-to: parent enhancement)
- el-5wp0 → el-4jgm (relates-to: similar document ref flag)
- el-4zrw → el-e6wc (blocks: requires deadline flag first)
- el-e6wc → el-uxgg (relates-to: parent enhancement)
- el-wtu9 → el-uxgg (relates-to: similar date flag enhancement)

**Summary:**
The task type specification defines 16+ properties, but the CLI only exposes about half of them.
Key missing fields are deadline, owner, externalRef, acceptanceCriteria, descriptionRef, and
designRef. All these fields are fully supported by the API, so the fix is purely CLI-side.
This creates a gap between what agents can do via CLI vs API, limiting the usefulness of
deadline-based workflows and external system integration.

---

### Scenario: Delete Operations and Cascading Effects

**Purpose:** Evaluate delete operation behavior and cascading cleanup across all element types and relationships

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Multiple cleanup gaps)

**Checkpoints:**

**Basic Delete:**
- [x] Delete task: `el delete <id> --reason "Testing"` works correctly
- [x] Delete returns `{success, data: {id, deleted: true, type}}`
- [x] Message delete rejected: "Messages cannot be deleted (immutable)"

**Delete with Dependencies:**
- [x] Delete blocker task: blocked cache correctly updated (dependent becomes ready)
- [ ] **FAIL**: Dependency records NOT cleaned up (el-4q7w)
  - Orphaned dependency still points to deleted element
  - `el dep list` shows stale relationship
- [x] Delete with relates-to dependency: same behavior (orphaned record)

**Delete Task in Plan:**
- [x] Delete task in plan: plan tasks count correctly decremented
- [x] Plan progress correctly recalculated

**Delete Document in Library:**
- [ ] **FAIL**: Library docs includes tombstoned document (el-2h6o)
  - Shows document with `status: "tombstone"` and `deletedAt`
- [ ] **FAIL**: Library stats counts tombstoned document (el-2h6o)
  - `documentCount: 1` when document is deleted

**Delete Library:**
- [ ] **FAIL**: Delete library with documents succeeds without --force (el-5hnx)
  - Should require confirmation like team deletion
- [x] Delete nested library: child correctly becomes root

**Delete Entity:**
- [ ] **FAIL**: Team members still shows deleted entity (el-600h)
- [ ] **FAIL**: Channel members still shows deleted entity (el-600h)
- [ ] **FAIL**: Task assignee retains deleted entity reference (el-27ay)
  - `el ready --assignee <deleted>` still returns tasks

**Delete Document with References:**
- [ ] **FAIL**: Message attachments retain deleted document reference (el-1d9e)
  - Viewing attachment returns NOT_FOUND
- [x] Delete document succeeds (no reference blocking)

**Delete Plan/Workflow:**
- [x] Delete plan: child tasks survive (expected)
- [x] Delete workflow: correctly tombstoned

**Success Criteria:** Delete operations should clean up or reject based on relationships
- **Partial:** Basic delete works; cascading cleanup has multiple gaps

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-4q7w | Delete leaves orphaned dependency records | 3 | bug |
| el-2h6o | Library docs/stats include tombstoned documents | 3 | bug |
| el-5hnx | Library delete succeeds without --force when has documents | 3 | bug |
| el-600h | Team/channel members include deleted entities | 3 | bug |
| el-27ay | Task assignee retains deleted entity reference | 3 | bug |
| el-1d9e | Message attachments retain deleted document reference | 3 | bug |

**Dependencies:**
- el-4q7w → el-s80d (relates-to: HAS_DEPENDENTS validation)
- el-2h6o → el-2awx (relates-to: tombstone visibility enhancement)
- el-5hnx → el-s80d (relates-to: delete validation pattern)
- el-600h → el-5gjo (relates-to: entity validation pattern)
- el-27ay → el-1fnm (relates-to: assignee validation)
- el-27ay → el-jqhh (relates-to: entity existence validation)
- el-1d9e → el-wjo9 (relates-to: orphaned message references)

---

### Scenario: Priority Inheritance and Ready List Behavior

**Purpose:** Validate that priority inheritance through dependency chains works correctly and ready list respects effective priority

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Filter uses base priority, show missing fields)

**Checkpoints:**

**Basic Priority Ordering:**
- [x] Tasks created with different priorities (1-5)
- [x] Ready list sorted by priority (lowest number first)
- [x] Ready list includes `effectivePriority` and `priorityInfluenced` fields

**Priority Inheritance through Blocks:**
- [x] When task A blocks critical task B, A inherits B's priority
  - Example: P5 task blocking P1 task gets effectivePriority=1
  - `priorityInfluenced: true` when effective differs from base
- [x] Priority inheritance propagates through chains (A→B→C→D)
  - Root task inherits highest priority from entire chain
- [x] Multiple dependents: blocker inherits highest (lowest number) priority
  - Task blocking P1 and P3 gets effectivePriority=1
- [x] `relates-to` dependencies do NOT affect priority (only `blocks`)
- [x] Priority recalculates correctly when blocker is closed
  - Next task in chain inherits correct effective priority

**Ready List Behavior:**
- [x] Ready list is sorted by effectivePriority (not base priority)
- [x] Tasks with same effectivePriority sorted by createdAt
- [ ] **FAIL**: `--priority` filter uses base priority, not effectivePriority
  - **ENHANCEMENT el-4d1e:** Cannot filter ready list by effective priority
  - P5 task with effectivePriority=1 not returned by `--priority 1`

**Field Consistency:**
- [x] `el ready --json` includes effectivePriority and priorityInfluenced
- [ ] **FAIL**: `el list task --json` does NOT include effectivePriority
  - **BUG el-50s8:** (pre-existing) Inconsistency between ready and list
- [ ] **FAIL**: `el show <task-id> --json` does NOT include effectivePriority
  - **ENHANCEMENT el-2a9n:** Show should include computed priority fields

**Success Criteria:** Priority inheritance works correctly; ready list respects effective priority
- **Partial:** Inheritance works correctly, but filtering and show command don't expose computed fields

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-4d1e | `el ready --priority` should filter by effectivePriority | 4 | enhancement |
| el-2a9n | `el show` should include effectivePriority/priorityInfluenced | 4 | enhancement |
| el-50s8 | (pre-existing) `el ready` vs `el list` field inconsistency | 3 | bug |

**Dependencies:**
- el-2a9n → el-50s8 (relates-to: same inconsistency pattern)
- el-4d1e → el-50s8 (relates-to: priority field exposure)

---

### Scenario: Dependency Command Behavior Evaluation

**Purpose:** Validate dependency management commands (el dep add/remove/list/tree) for correctness and edge case handling

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Self-referential dependency bug found)

**Checkpoints:**

**Basic Dependency Operations:**
- [x] Add blocking dependency: `el dep add B A --type blocks` works correctly
- [x] Dependency reflected in list: `el dep list B --json` shows the relationship
- [x] Blocked status updates: dependent task moves to blocked list
- [x] Duplicate dependency rejected: exit code 4, clear error message
- [x] Invalid type rejected: exit code 4, lists valid types
- [x] Type is required: `el dep add A B` fails with "Required option --type is missing"
- [x] Metadata support: `el dep add A B --type relates-to --metadata '{"key":"val"}'` works
- [x] Invalid JSON metadata rejected: exit code 4, clear error

**Element Validation:**
- [x] Non-existent source rejected: "Source element not found" with exit code 3
- [x] Non-existent target rejected: "Target element not found" with exit code 3
- [x] Invalid ID format rejected: returns NOT_FOUND (treated as non-existent)
- [ ] **FAIL**: Self-referential dependency allowed: `el dep add X X --type blocks` succeeds
  - **BUG el-4pyu:** Creates cycle of length 1, task blocks itself permanently

**Cross-Element Dependencies:**
- [x] Document-to-task dependency allowed (expected per spec - dependencies are element-agnostic)
- [x] Multiple dependency types between same elements allowed

**Dependency Removal:**
- [x] Remove existing dependency: works correctly
- [x] Remove non-existent dependency: exit code 3, clear error
- [x] Type is required for remove: prevents ambiguity when multiple types exist

**Dependency Queries:**
- [x] `el dep list <id>` returns both directions (dependencies and dependents)
- [x] `el dep list <id> --direction in` filters to dependents only
- [x] `el dep list <id> --type blocks` filters by type
- [x] `el dep list <non-existent>` returns exit code 3
- [x] `el dep tree <id>` shows visual tree representation
- [x] `el dep tree <id> --json` returns hierarchical JSON
- [x] `el dep tree <non-existent>` returns exit code 3

**Cycle Detection:**
- [ ] **FAIL**: Circular dependencies allowed: A→B→A succeeds
  - **BUG el-5w9d:** (pre-existing) Cycle detection not enforced
- [ ] **FAIL**: Self-referential dependency allowed: A→A succeeds
  - **BUG el-4pyu:** Special case of cycle (length 1)

**Blocking Resolution:**
- [x] Closing blocker unblocks dependent: correctly updates blocked cache
- [x] Reopening blocker re-blocks dependent: correctly updates blocked cache

**Success Criteria:** Dependency commands handle edge cases and validate inputs correctly
- **Partial:** Core operations work, but self-referential and cyclic dependencies are allowed

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-4pyu | `el dep add` allows self-referential dependencies (A blocks A) | 3 | bug |

**Dependencies:**
- el-4pyu → el-5w9d (relates-to: self-referential is cycle of length 1)

---

### Scenario: Task Lifecycle State Transitions and Field Persistence

**Purpose:** Comprehensive validation of task state transitions and field persistence across status changes - testing el update vs dedicated commands (reopen, close, defer, undefer)

**Prerequisites:** Initialized workspace with registered entity

**Status:** TESTED - 2026-01-24 (Pass - Confirmed existing issues)

**Checkpoints:**

**Basic State Transitions via el update:**
- [x] open → in_progress: works correctly
- [x] in_progress → open: works correctly
- [x] open → blocked (manual): works (questionable UX)
- [x] blocked → open: works correctly
- [x] open → deferred (via el update): works but prefer `el defer`
- [x] deferred → open: works but prefer `el undefer`
- [x] open → closed: works but prefer `el close`
- [x] closed → open: works but does NOT clear closedAt (el-4e6g)
- [x] closed → in_progress: works but does NOT clear closedAt (el-4e6g)
- [ ] **FAIL**: closed → blocked: allowed, creates inconsistent state (el-4odk)

**Dedicated Commands vs el update:**
- [x] `el close` correctly sets closedAt and closeReason
- [x] `el reopen` correctly clears closedAt but NOT closeReason (el-2deb)
- [x] `el defer` correctly sets status to deferred
- [x] `el defer --until <date>` correctly sets scheduledFor
- [x] `el undefer` correctly clears scheduledFor and sets status to open
- [ ] **FAIL**: `el update --status open` from closed does NOT clear closedAt (el-4e6g)
  - Creates inconsistent state where task is "open" but has closedAt timestamp
  - Different behavior from `el reopen` which clears closedAt

**Reopen Command Restrictions:**
- [x] `el reopen` on closed task: works correctly
- [x] `el reopen` on deferred task: correctly rejected ("Task is not closed")
- [x] `el reopen` on blocked task: correctly rejected
- [x] `el reopen` on in_progress task: correctly rejected
- [x] `el reopen` on open task: correctly rejected
- [x] `el reopen` on tombstoned task: correctly rejected ("Task is not closed")

**Close/Defer Restrictions:**
- [x] `el close` on deferred task: correctly rejected ("Cannot close task with status 'deferred'")
- [x] `el defer` on closed task: correctly rejected
- [x] `el undefer` on non-deferred task: correctly rejected

**Blocked Status with Dependencies:**
- [x] Adding dependency auto-sets blocked status
- [x] Manual status change to "open" on blocked task succeeds but doesn't affect ready list
- [x] Closing a task that is blocked by dependencies is allowed (questionable)
- [x] Closing blocker correctly unblocks dependent and updates ready list

**Field Persistence Issues:**
- [x] `closeReason` persists after `el reopen` (el-2deb confirmed)
- [x] `closedAt` NOT cleared when using `el update --status open` (el-4e6g confirmed)
- [x] `scheduledFor` correctly cleared by `el undefer`

**Success Criteria:** State transitions behave consistently between dedicated commands and el update
- **CONFIRMED:** Known issues el-4odk, el-4e6g, el-2deb affect state consistency

**Issues Confirmed:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-4odk | Closed → blocked transition allowed (creates inconsistent state) | 2 | bug |
| el-4e6g | `el update --status open` doesn't clear closedAt unlike `el reopen` | 4 | ux |
| el-2deb | closeReason persists after task is reopened | 5 | ux |

**Dependencies:**
- el-4e6g → el-4odk (relates-to: both involve status transition field handling)
- el-4e6g → el-2deb (relates-to: field cleanup on status change)

**Notes:**
This scenario provides a comprehensive state transition matrix and confirms that the existing issues
(el-4odk, el-4e6g, el-2deb) affect task lifecycle consistency. Key finding: agents should use
dedicated commands (`el close`, `el reopen`, `el defer`, `el undefer`) rather than `el update --status`
to ensure proper field handling.

---

### Scenario: Ready Work Computation with Complex Filter Combinations

**Purpose:** Comprehensive validation of the ready work computation mechanism - critical for agent orchestration as agents need to accurately find available work

**Prerequisites:** Initialized workspace with registered entities and teams

**Status:** TESTED - 2026-01-24 (Partial Pass - Missing --tag filter, taskType validation gap)

**Checkpoints:**

**Basic Ready List Behavior:**
- [x] All unblocked, open/in_progress tasks appear in ready list
- [x] Ready list sorted by effectivePriority (lowest number first)
- [x] Ready list includes effectivePriority and priorityInfluenced fields
- [x] Closed tasks excluded from ready list
- [x] Deferred tasks excluded from ready list
- [x] Blocked tasks excluded from ready list
- [x] Tasks with future scheduledFor excluded (even if status is open)
- [x] Tasks with past scheduledFor included in ready list
- [x] in_progress tasks correctly appear in ready list

**Filter Combinations:**
- [x] Filter by priority: `el ready --priority 1` returns only P1 tasks
- [x] Filter by assignee (ID): `el ready --assignee <entity-id>` works correctly
- [x] Team-assigned tasks visible to team members: `el ready --assignee <member-id>` includes team tasks
- [x] Combined filters: `el ready --assignee <id> --priority 1` works correctly
- [x] Filter by taskType: `el ready --type bug` works when tasks have taskType set
- [x] Limit results: `el ready --limit 3` returns correct number
- [ ] **FAIL**: Filter by tag: `el ready --tag bug`
  - **ENHANCEMENT el-8idf:** Option doesn't exist ("Unknown option: --tag")
- [ ] **FAIL**: Filter by assignee name: `el ready --assignee alpha-agent`
  - **BUG el-574h:** Returns empty (pre-existing - no name resolution)
- [ ] **FAIL**: Filter for unassigned tasks: `el ready --assignee ""`
  - **BUG el-34n6:** Returns all tasks instead of unassigned (pre-existing)

**Validation Behavior:**
- [x] Invalid priority rejected: `--priority 6` returns error with exit code 4
- [x] Limit 0 rejected: returns "Limit must be a positive number" with exit code 4
- [x] Negative limit rejected: parsed as missing value
- [x] Non-existent assignee: returns empty results (no error)
- [ ] **FAIL**: Invalid taskType accepted silently: `--type invalid`
  - **BUG el-1jvk:** Returns empty array with success:true instead of validation error

**Priority Inheritance:**
- [x] P5 task blocking P1 task gets effectivePriority=1
- [x] priorityInfluenced=true when effective differs from base
- [x] Ready list sorting respects effectivePriority
- [x] Closing blocker recalculates dependent's effectivePriority

**Output Formats:**
- [x] JSON output: `{success: true, data: [...]}`
- [x] Quiet mode: outputs IDs only, one per line
- [x] Human-readable: formatted table with alignment

**Success Criteria:** Ready work computation is accurate and filters work correctly
- **Partial:** Core behavior is correct, but missing --tag filter and taskType validation gap

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-8idf | ENHANCEMENT: `el ready` needs --tag filter | 4 | enhancement |
| el-1jvk | BUG: `el ready --type` accepts invalid taskType silently | 4 | bug |

**Dependencies:**
- el-8idf → el-59p3 (blocks: parser bug affects multiple --tag flags)
- el-8idf → el-3scb (relates-to: same --tag filter pattern)
- el-8idf → el-1gg5 (relates-to: same --tag filter pattern)
- el-1jvk → el-jqhh (relates-to: validation pattern)
- el-1jvk → el-1t4x (relates-to: config validation pattern)

**Notes:**
The ready work computation mechanism is fundamentally sound. Priority inheritance works correctly
through dependency chains. Team assignment correctly propagates to team member queries. Key gaps:
1. No --tag filter (agents must use jq to filter by tag)
2. Invalid taskType values silently return empty results (potential source of confusion)
3. Pre-existing issues with assignee name resolution and unassigned filtering apply here too

---

### Scenario: Document Operations with References and Versioning

**Purpose:** Validate document creation, content management, references in messages/tasks, library organization, and tombstone behavior

**Prerequisites:** Initialized workspace with registered entity

**Status:** TESTED - 2026-01-24 (Partial Pass - Tombstone inconsistency found)

**Checkpoints:**

**Document Creation:**
- [x] Create document with inline content: `el doc create --content "..." --type markdown` works correctly
- [x] Create document from file: `el doc create --file <path> --type markdown` works correctly
- [x] Content types validated: text, markdown, json accepted; invalid rejected
- [x] JSON output includes id, type, contentType, version fields
- [ ] **FAIL**: Whitespace-only content accepted (el-5c2v)
  - `el doc create --content "   " --type text` succeeds
  - Empty content correctly rejected
- [x] Special characters and Unicode preserved correctly
  - HTML, quotes, CJK, emojis all stored and retrieved properly

**Document Content Update:**
- [ ] **BLOCKED**: `el doc update` command doesn't exist (el-4pen)
  - `el update --content` returns "Unknown option"
  - API exists (updateDocumentContent) but no CLI command
- [x] Document versioning works when update available via API

**Document References:**
- [x] Task notes can reference document ID: `--notes "See spec: el-xxx"`
- [x] Message attachment works: `--attachment <doc-id>` correctly adds reference
- [x] Non-document attachment rejected: "Attachment el-xxx is not a document"
- [x] Non-existent attachment rejected: NOT_FOUND error
- [x] Message list hydrates content from contentRef

**Library Organization:**
- [x] Add document to library: `el library add <lib> <doc>` works
- [x] Library docs shows added document
- [x] Library stats shows documentCount correctly
- [ ] **FAIL**: Library includes tombstoned document (el-2h6o confirmed)
  - After `el delete <doc>`, library docs still shows it with deletedAt
  - Library stats still counts it (documentCount: 1 instead of 0)

**Document Deletion and Tombstone Behavior:**
- [x] Delete document succeeds with references: `el delete <doc> --reason "..."`
- [ ] **FAIL**: Inconsistent tombstone visibility (el-2yva NEW)
  - `el doc show <deleted-doc>` returns document with deletedAt field
  - `el show <deleted-doc>` returns NOT_FOUND error (exit code 3)
  - Inconsistent behavior between type-specific and generic show
- [x] Message attachment retains reference to deleted document
- [x] `el list --type document` correctly excludes tombstoned documents

**Version Flag Collision:**
- [ ] **FAIL**: `-V` flag collision on el doc show (el-1eo2 confirmed)
  - `el doc show el-xxx -V 1` shows CLI version {"version": "0.1.0"}
  - `el doc show el-xxx --docVersion 1` works correctly

**Success Criteria:** Documents can be created, referenced, organized, and deleted with consistent behavior
- **Partial:** Core operations work, but tombstone visibility inconsistent between show commands

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-2yva | NEW: el doc show returns deleted documents but el show returns NOT_FOUND | 3 | bug |
| el-5c2v | NEW: el doc create accepts whitespace-only content | 5 | ux |
| el-2h6o | (confirmed) Library docs/stats include tombstoned documents | 3 | bug |
| el-1eo2 | (confirmed) -V flag collision on el doc show | 4 | bug |
| el-4pen | (confirmed) No el doc update command | 3 | enhancement |

**Dependencies:**
- el-2yva → el-2h6o (relates-to: same tombstone visibility theme)
- el-2yva → el-2awx (relates-to: --include-deleted enhancement)
- el-5c2v → el-5ha0 (relates-to: same whitespace validation pattern)
- el-5c2v → el-2aqg (relates-to: same whitespace validation pattern)

---

### Scenario: Output Truncation and Large Content Handling

**Purpose:** Validate CLI behavior with large content, including JSON output limits and special character handling

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical 64KB truncation bug found)

**Checkpoints:**

**JSON Output Size Limits:**
- [x] Small content (under 64KB): JSON output is valid and complete
- [ ] **FAIL**: Large content (over 64KB): JSON output truncated mid-stream
  - **BUG el-1us7:** When total JSON output exceeds ~65536 bytes, output is cut off
  - `el doc create --content "$(python3 -c "print('X' * 65280)")" --type text --json`
  - Produces invalid JSON: `jq: parse error: Unfinished string at EOF`
  - Affects `el doc create`, `el doc show`, `el list`, `el msg list` with large content
  - Main elemental repo itself triggers this bug

**Content Length Limits:**
- [x] Task title at 500 chars: accepted correctly
- [x] Task title over 500 chars: rejected with clear error
- [x] Task notes: no apparent limit (10k+ chars works)
- [x] Document content 50k chars: works correctly
- [x] Document content 65k chars: content stored but JSON output truncated

**Special Character Handling:**
- [x] Unicode characters (CJK, emoji, Greek, Arabic, Hebrew): preserved correctly
- [x] Tab characters: preserved correctly
- [x] Newline characters: preserved correctly
- [x] Backslash characters: escaped correctly
- [x] Quote characters: escaped correctly
- [x] Control characters (bell, escape): escaped as Unicode escapes
- [ ] **FAIL**: Null character (\\x00): silently truncates string
  - **BUG el-5zw4:** `'BeforeNull\x00AfterNull'` becomes `'BeforeNull'`
  - No error or warning - data after null character is lost

**Tag Character Validation:**
- [x] Alphanumeric tags: accepted
- [x] Hyphens in tags: accepted
- [x] Colons in tags (feature:auth): accepted
- [x] Dots in tags (v1.2.3): rejected with clear error
- [x] Slashes in tags: rejected with clear error

**Success Criteria:** Large content handled gracefully; special characters validated or properly escaped
- **CRITICAL FAILURE:** JSON output truncation makes CLI unreliable for large documents

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-1us7 | JSON output truncated at 64KB producing invalid JSON | 2 | bug |
| el-5zw4 | Null character in input silently truncates strings | 3 | bug |

**Dependencies:**
- el-1us7 → el-5pwg (relates-to: JSON output issues)
- el-5zw4 → el-2aqg (relates-to: input validation pattern)

---

### Scenario: Actor Attribution and Multi-Entity Operations

**Purpose:** Validate that actor attribution (createdBy field) works correctly across all operations and that --actor flag properly validates entity references

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Multiple attribution and validation bugs found)

**Checkpoints:**

**Actor Attribution on Create:**
- [x] Create task with --actor: correctly sets createdBy to specified entity ID
- [x] Create task without --actor: defaults to cli-user
- [ ] **FAIL**: Create task with --actor after config set actor: ignores config (el-5guf confirmed)
  - `el whoami` shows actor from config, but task created with `createdBy: cli-user`
- [x] Create document with --actor: correctly sets createdBy
- [x] Create plan with --actor: correctly sets createdBy
- [x] Create channel with --actor: correctly sets createdBy
- [x] Create team with --actor: correctly sets createdBy
- [x] Create library with --actor: correctly sets createdBy
- [x] Create playbook with --actor: correctly sets createdBy
- [x] Pour workflow with --actor: correctly sets createdBy
- [x] Send message with --actor: correctly sets createdBy and sender

**Actor Validation:**
- [ ] **FAIL**: --actor accepts non-existent entity IDs (el-2lmf NEW)
  - `el create task --title "Test" --actor el-nonexistent` succeeds
  - createdBy stores invalid ID without validation
- [ ] **FAIL**: --actor accepts non-entity element IDs (el-37v7 NEW)
  - `el create task --title "Test" --actor <task-id>` succeeds
  - createdBy stores task ID instead of entity ID

**Dependency Operations:**
- [ ] **FAIL**: `el dep add --actor` flag completely ignored (el-19vr NEW)
  - Specified `--actor el-5zi6` but createdBy shows `cli-user`
  - Dependencies don't respect actor flag for attribution

**Update Attribution:**
- [x] `el update --actor` works for element updates
- [ ] **INFO**: No updatedBy field to track who made updates
  - createdBy never changes after element creation

**Close/Reopen Attribution:**
- [x] `el close --actor` works correctly
- [x] `el reopen --actor` works correctly
- [ ] **INFO**: No closedBy field to track who closed tasks

**Success Criteria:** Actor attribution works consistently and validates entity references
- **Partial:** Most create operations respect --actor, but validation missing and dep add broken

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-19vr | `el dep add` ignores --actor flag | 3 | bug |
| el-2lmf | --actor accepts non-existent entity IDs | 3 | bug |
| el-37v7 | --actor accepts non-entity element IDs | 3 | bug |

**Dependencies:**
- el-19vr → el-5guf (relates-to: actor attribution theme)
- el-2lmf → el-jqhh (relates-to: entity validation pattern)
- el-37v7 → el-1fnm (relates-to: entity type validation pattern)
- el-37v7 → el-5gjo (relates-to: entity type validation pattern)

**Notes:**
Actor attribution is critical for multi-agent orchestration - agents need to know who created/modified
elements. Current issues:
1. Config file actor setting is completely non-functional (el-5guf)
2. --actor flag works for most commands but NOT for dep add (el-19vr)
3. No validation of actor value - any string/ID accepted (el-2lmf, el-37v7)
4. No tracking of who updates/closes elements (no updatedBy, closedBy fields)

---

### Scenario: Plan-Workflow Integration and Task Coordination

**Purpose:** Comprehensive validation of plan-workflow interactions, task lifecycle within plans, dependency chain behavior, and playbook/workflow validation - testing critical multi-agent orchestration patterns

**Prerequisites:** Initialized workspace with registered entities

**Status:** TESTED - 2026-01-24 (Validation Confirms Known Bugs)

**Checkpoints:**

**Plan and Task Coordination:**
- [x] Create plan with active status: `el plan create --title "Feature" --status active --actor <entity>`
- [x] Create tasks with different priorities and assignees
- [x] Add tasks to plan via `el plan add-task`
- [x] Progress tracking works correctly (totalTasks, completedTasks, completionPercentage)
- [x] Closing tasks updates plan progress correctly
- [x] Priority inheritance through dependency chains works correctly
  - P5 task blocking P1 task correctly inherits effectivePriority=1
  - priorityInfluenced=true when effective differs from base

**Dependency Chain Behavior:**
- [x] Create multi-task dependency chain (Design → Implement → Test → Review)
- [x] Only unblocked tasks appear in ready list
- [x] Blocked tasks correctly show blockedBy and blockReason
- [x] Closing blocker correctly unblocks dependent (blocked cache updates)
- [x] Priority inheritance propagates through entire chain

**Plan Lifecycle Validation Gaps (Confirms el-g5qk):**
- [ ] **FAIL**: `el plan complete` allows completing plans with open tasks
  - **BUG el-g5qk:** Confirmed - plan with 33% progress marked "completed"
  - Plan with 1 closed, 1 in_progress, 1 deferred task can be completed
  - No warning or --force required
- [ ] **FAIL**: Tasks can be added to completed plans
  - **BUG el-4uvk:** Confirmed - `el plan add-task` succeeds after plan completion
  - Progress drops from 25% to 20% when 5th task added to "completed" plan

**Plan Status Transitions:**
- [x] Cancel active plan: `el plan cancel` works correctly
- [x] Re-activate cancelled plan: correctly rejected
- [x] Complete cancelled plan: correctly rejected

**Playbook Validation Gaps:**
- [ ] **FAIL**: Multiple `--step` flags only keeps last step
  - **BUG el-59p3:** Confirmed - `--step a:A --step b:B --step c:C` creates only step c
- [ ] **FAIL**: Duplicate playbook names allowed
  - **BUG el-32y1:** Confirmed - second "deploy-workflow" created successfully

**Workflow Pour Validation Gaps:**
- [ ] **FAIL**: `el workflow pour` accepts non-existent playbook names
  - **BUG el-5rrv:** Confirmed - creates empty workflow with invalid playbook reference
- [ ] **FAIL**: `el workflow pour` accepts non-playbook element IDs
  - **BUG el-5ldi:** Confirmed - task ID accepted as playbook name
- [ ] **FAIL**: `el workflow pour` doesn't create tasks from playbook
  - **BUG el-18ug:** Confirmed - workflow tasks list empty
- [ ] **FAIL**: No workflow status transition commands
  - **ENHANCEMENT el-rja0:** Confirmed - no start/complete/fail/cancel commands

**Dependency Edge Cases:**
- [x] Self-referential dependency allowed (task blocks itself)
  - **BUG el-4pyu:** Confirmed - task permanently blocks itself
- [x] Cross-element dependencies allowed (by design - element-agnostic)
  - Document-to-task blocks dependency works
  - Entity can be dependency target

**Success Criteria:** Plan-workflow coordination validates orchestration patterns
- **Confirms Known Bugs:** el-g5qk, el-4uvk, el-59p3, el-32y1, el-5rrv, el-5ldi, el-18ug, el-rja0, el-4pyu

**Notes:**
This evaluation provides comprehensive validation that existing tracked bugs are real and reproducible.
Key findings:
1. Plan completion lacks validation - any plan can be "completed" regardless of task status
2. Playbook/workflow subsystem has multiple critical validation gaps
3. Dependency system allows self-referential and cyclic dependencies
4. Priority inheritance through dependency chains works correctly (positive finding)
5. Basic plan progress tracking works correctly (positive finding)

---

### Scenario: Assignment Validation and Cross-Reference Integrity

**Purpose:** Evaluate task assignment validation, including self-assignment edge cases and type validation for assignee field, plus cross-reference cleanup when elements are deleted

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Confirms existing validation gaps)

**Checkpoints:**

**Assignment Validation:**
- [ ] **FAIL**: Task can be assigned to itself: `el assign <task-id> <task-id>`
  - Succeeds silently, setting `assignee` to the task's own ID
  - Related to el-1fnm (no type validation on assignee field)
- [ ] **FAIL**: Task can be assigned to a plan: `el assign <task-id> <plan-id>`
  - **BUG el-1fnm confirmed:** Accepts plan ID as assignee
- [ ] **FAIL**: Task can be assigned to a document: `el assign <task-id> <doc-id>`
  - **BUG el-1fnm confirmed:** Accepts document ID as assignee
- [ ] **FAIL**: Task can be assigned to non-existent ID: `el assign <task-id> el-nonexistent`
  - **BUG el-jqhh confirmed:** Accepts invalid/non-existent IDs

**Cross-Reference Cleanup (Plan-Task):**
- [x] Delete task in plan: plan task count correctly decremented
  - Plan progress recalculates correctly (3 tasks → 2 tasks after delete)
- [x] Delete plan with tasks: tasks survive (expected behavior)
  - Tasks remain accessible with normal IDs
  - planId field not visible in task output (internal field)

**Library Nesting Cycles:**
- [ ] **FAIL**: Library nesting allows cycles: A→B→C→A
  - **BUG el-u6qd confirmed:** No cycle detection on `el library nest`
  - After cycle, all 3 libraries become non-roots (0 roots)
  - No way to recover from corrupted state without `el library unnest` (el-5m3u)

**Playbook Parser Bug:**
- [ ] **FAIL**: Multiple `--step` flags only keeps last step
  - **BUG el-59p3 confirmed:** `--step a:A --step b:B` creates only step b
  - Error message "depends on unknown step" reveals only last step was parsed

**Workflow Pour Validation:**
- [ ] **FAIL**: Pour with non-existent playbook: `el workflow pour nonexistent`
  - **BUG el-5rrv confirmed:** Creates empty workflow with invalid reference
- [ ] **FAIL**: Pour with task ID: `el workflow pour <task-id>`
  - **BUG el-5ldi confirmed:** Accepts task ID as playbook name
- [ ] **FAIL**: Pour doesn't create tasks from playbook steps
  - **BUG el-18ug confirmed:** Workflow tasks list is empty

**Plan Completion Validation:**
- [ ] **FAIL**: Complete plan with incomplete tasks
  - **BUG el-g5qk confirmed:** Plan with 0% progress marked "completed"
- [ ] **FAIL**: Add tasks to completed plan
  - **BUG el-4uvk confirmed:** `el plan add-task` succeeds after plan completion

**Concurrent Access:**
- [x] SQLite correctly handles concurrent access attempts
  - Second concurrent command fails with "database is locked"
  - Error message could be more user-friendly
- [x] Already-closed task rejection: `el close` on closed task properly rejected
  - Clear error: "Task is already closed: el-xxx"

**Success Criteria:** Assignment and reference operations validate types and clean up correctly
- **Partial:** Cross-reference cleanup works for plan-task, but assignment validation missing

**Issues Confirmed:**
| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-1fnm | el assign accepts non-entity elements (task, doc, plan) as assignee | 3 | bug |
| el-jqhh | el assign accepts non-existent entity IDs | 3 | bug |
| el-u6qd | Library nesting allows cycles | 2 | bug |
| el-59p3 | Parser bug - multiple --step/--tag/--member flags only keep last | 2 | bug |
| el-5rrv | workflow pour accepts non-existent playbook names | 3 | bug |
| el-5ldi | workflow pour accepts non-playbook element IDs | 3 | bug |
| el-18ug | workflow pour doesn't create tasks from playbook | 2 | bug |
| el-g5qk | plan complete allows completion with incomplete tasks | 3 | bug |
| el-4uvk | plan add-task allows adding tasks to completed plans | 3 | bug |

**Notes:**
This scenario confirms multiple existing bugs are reproducible. Key finding: the assignee field
has no type validation at all - it accepts any element ID (including the task itself) or even
non-existent IDs. This is part of a larger pattern where entity references are not validated
(also affects team members, channel members, and --actor flags).

Self-assignment of a task (assignee = task's own ID) is a novel edge case discovered during
this testing. While likely harmless, it demonstrates the complete lack of validation.

---

### Scenario: Cryptographic Identity CLI Operations

**Purpose:** Evaluate cryptographic identity features including key generation, signing, verification, entity registration with keys, and key lifecycle management

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Partial Pass - Critical public key storage bug, missing CLI commands)

**Checkpoints:**

**Key Generation:**
- [x] `el identity keygen --json` generates valid Ed25519 keypair
  - Returns publicKey (44 chars base64) and privateKey (PKCS8 format)
- [x] Generated keys are unique per invocation
- [x] Output format is consistent `{success, data: {publicKey, privateKey}}`

**Identity Mode Management:**
- [x] `el identity mode --json` shows current mode and source
- [x] `el identity mode soft` sets mode correctly
- [x] `el identity mode cryptographic` sets mode correctly
- [x] `el identity mode hybrid` sets mode correctly
- [x] Invalid mode rejected with clear error (exit code 4)
- [ ] **FAIL**: Mode set shows incorrect "previous" value
  - **BUG el-3ftq:** After setting mode, `previous` shows new mode value instead of actual previous

**Signing Operations:**
- [x] `el identity sign --data "text" --sign-key <key> --actor <name>` works correctly
  - Returns signature, signedAt, actor, requestHash, keySource
- [x] Sign with file: `--file <path>` works
- [x] Sign with hash: `--hash <sha256>` works
- [x] Sign uses configured actor when available
- [x] Missing data rejected: "No data to sign" with exit code 4

**Verification Operations:**
- [x] `el identity verify` validates signatures correctly
  - Requires: --signature, --public-key, --data, --actor, --signed-at
- [x] Returns `{valid: true}` for valid signatures
- [x] Returns `{valid: false}` for tampered data
- [x] Returns `{valid: false}` for wrong actor
- [x] Invalid signature format rejected with clear error

**Hash Operations:**
- [x] `el identity hash --data "text"` returns SHA256 hash
- [x] Returns hash and length fields

**Entity Registration with Public Key:**
- [ ] **FAIL**: `el entity register <name> --type agent --public-key <key>`
  - **BUG el-533q (CRITICAL):** Flag is accepted but publicKey NOT stored in database
  - Entity created successfully but publicKey field is null
  - Breaks entire cryptographic identity feature
  - Verified via raw database query: publicKey column is empty

**Key Rotation/Revocation:**
- [ ] **MISSING**: No `el entity rotate-key` CLI command
  - **ENHANCEMENT el-5ec8:** API exists (rotateEntityKey) but no CLI
- [ ] **MISSING**: No `el entity revoke-key` CLI command
  - **ENHANCEMENT el-5ec8:** API exists (revokeEntityKey) but no CLI

**Actor Configuration:**
- [x] `el whoami` shows actor from CLI flag when provided
- [x] `el whoami` shows actor from environment variable (ELEMENTAL_ACTOR)
- [x] `el whoami` shows actor from config file when set
- [x] `el whoami` shows identityMode correctly
- [ ] **FAIL**: Config file actor not used in operations
  - **BUG el-5guf (CONFIRMED):** createdBy shows "cli-user" instead of configured actor
- [x] CLI `--actor` flag correctly overrides config

**Success Criteria:** Cryptographic identity operations work correctly for agent verification
- **CRITICAL FAILURE:** Public key storage broken (el-533q)
- **Partial:** Core operations (keygen, sign, verify, hash) work correctly

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-533q | CRITICAL: el entity register --public-key does not store key in database | 2 | bug |
| el-3ftq | el identity mode set shows incorrect 'previous' value | 4 | bug |
| el-5ec8 | Add el entity rotate-key and revoke-key CLI commands | 4 | enhancement |

**Dependencies:**
- el-5ec8 → el-533q (blocks: key rotation requires working key storage)
- el-3ftq → el-1t4x (relates-to: config value handling)
- el-533q → el-jqhh (relates-to: entity field validation)

**Notes:**
The cryptographic identity system has well-tested API code (106+ unit tests for signatures, 20+ for rotation, 35+ for revocation) but critical CLI integration is broken. The most severe issue is that --public-key on entity registration silently fails to store the key, making cryptographic verification impossible via CLI. This needs to be fixed before cryptographic identity mode can be used in production.

---

### Scenario: Concurrent Agent Access and Data Integrity

**Purpose:** Evaluate data integrity under concurrent multi-agent access - critical for agent orchestration scenarios where multiple agents may attempt to modify the same elements simultaneously

**Prerequisites:** Initialized workspace with multiple registered entities

**Status:** TESTED - 2026-01-24 (Critical Bug Found - Race Condition)

**Checkpoints:**

**Concurrent Read Operations:**
- [x] Multiple concurrent reads succeed: `xargs -P4` with multiple `el show` commands
  - All reads complete successfully
  - No database locking errors for read-only operations
- [x] Concurrent `el ready` queries: all return consistent results

**Concurrent Write Operations:**
- [x] Concurrent task creation: `xargs -P10` with 10 simultaneous `el create task`
  - All creates succeed
  - Each gets unique ID
  - No duplicate entries
- [x] Concurrent updates to different tasks: all succeed independently
- [x] Concurrent exports while writing data: both operations succeed
- [x] Rapid sequential operations: 10 creates in quick succession all succeed

**Concurrent Updates to Same Element:**
- [x] Concurrent priority updates: last-write-wins behavior observed
  - Both operations report success:true
  - Final value is from whichever completed last
- [x] Concurrent assignment by multiple agents: last-write-wins
  - All agents receive success:true
  - Only one agent's assignment persists

**Race Condition Between Update and Close:**
- [ ] **CRITICAL BUG el-4kve:** Concurrent update and close create inconsistent state
  - Both operations report success:true
  - Final state can be inconsistent:
    - status: `in_progress` but `closedAt`: `<timestamp>` (should be null)
    - status: `closed` but `closedAt`: `null` (should have timestamp)
  - Reproducible ~80% of the time with parallel execution
  - Data integrity violation affecting multi-agent scenarios

**Concurrent Dependency Operations:**
- [x] Concurrent dependency creation: both succeed (no transaction isolation)
- [ ] **CONFIRMS el-5w9d:** Concurrent A→B and B→A creates cycle
  - Both operations succeed
  - Both tasks become permanently blocked
  - No way to recover without manual database intervention

**Concurrent Task Claiming:**
- [x] Multiple agents claiming same task: last-write-wins
  - All agents receive success:true response
  - Only one agent's assignment persists
  - **UX el-17hj:** Agents cannot tell if they "won" the claim

**Concurrent Close Attempts:**
- [x] Multiple agents closing same task: both report success
  - Final closeReason is from last writer
  - Multiple closedAt timestamps written (last one persists)

**Database Locking Behavior:**
- [x] Sequential rapid operations: no locking issues
- [x] Parallel rapid operations: SQLite handles concurrent writes correctly
- [x] No data corruption observed in element content
- [ ] **UX:** Error message for "database is locked" could be more helpful

**Success Criteria:** Data integrity maintained under concurrent access
- **CRITICAL FAILURE:** Race condition between update and close creates inconsistent state

**Issues Found:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-4kve | Concurrent update and close cause inconsistent task state (status vs closedAt) | 2 | bug |
| el-2w0m | Add optimistic locking or conflict detection for concurrent updates | 3 | enhancement |
| el-17hj | Concurrent operation success responses should indicate if superseded | 4 | ux |

**Dependencies:**
- el-4kve → el-2w0m (relates-to: enhancement addresses the bug)
- el-17hj → el-4kve (relates-to: UX for understanding race outcomes)
- el-17hj → el-2w0m (relates-to: conflict detection enables proper feedback)

**Notes:**
Multi-agent orchestration is a core use case for Elemental. While SQLite handles concurrent writes at the database level, the application layer doesn't ensure atomic field updates. The close operation should atomically set both `status` and `closedAt`, but the race condition shows these can end up inconsistent.

The current LWW (Last-Write-Wins) strategy works for simple cases but doesn't prevent logical inconsistencies. Consider:
1. Version-based optimistic locking for critical operations
2. Field-level atomicity for related fields (status + closedAt, status + scheduledFor)
3. Response metadata indicating whether the operation's effect persisted

This is particularly important for agent orchestration where:
- Multiple agents may try to claim the same task
- Agents make decisions based on operation success responses
- Inconsistent state can lead to duplicate work or missed work

---

### Scenario: Date and Time Input Validation

**Purpose:** Comprehensive validation of date/time input handling for task scheduling - critical for agent workflows that depend on accurate scheduling

**Prerequisites:** Initialized workspace

**Status:** TESTED - 2026-01-24 (Confirms Existing Issues)

**Checkpoints:**

**Date Format Support:**
- [x] ISO 8601 date only (YYYY-MM-DD): correctly parsed, time set to 00:00:00Z
- [x] Full ISO 8601 with time: correctly parsed with time component
- [x] ISO 8601 with timezone offset: correctly converted to UTC
  - Example: `2026-03-15T12:00:00+05:00` → `2026-03-15T07:00:00.000Z`
- [x] US date format (MM/DD/YYYY): accepted and parsed (adds 10:00:00 time)
- [x] EU date format (DD/MM/YYYY): rejected with clear error

**Date Validation Edge Cases:**
- [ ] **FAIL**: Feb 29 in non-leap year (2027): silently rolls to March 1
  - **BUG el-2p2p (CONFIRMED):** No validation error, date becomes 2027-03-01
- [ ] **FAIL**: Feb 30 in any year: silently rolls to March 2
  - **BUG el-2p2p (CONFIRMED):** No validation error, date becomes March 2
- [ ] **FAIL**: Feb 31: silently rolls to March 3
  - **BUG el-2p2p (CONFIRMED):** No validation error
- [x] Month 13 correctly rejected with "Invalid date format" error
- [x] Day 32 silently rolls to next month (same pattern as Feb 30)
- [ ] **FAIL**: Past dates accepted without warning
  - **BUG el-3ap6 (CONFIRMED):** `--until 2020-01-01` succeeds silently

**Time Validation:**
- [x] Valid time components (00:00:00 to 23:59:59): accepted correctly
- [x] Invalid hour (25:00:00): rejected with "Invalid date format" error
- [x] Invalid minute (12:60:00): silently becomes 13:00:00 (rollover issue)
- [x] Milliseconds: preserved correctly up to 3 digits
- [x] Nanoseconds (9 digits): truncated to milliseconds

**Timezone Handling:**
- [x] UTC (Z suffix): preserved as-is
- [x] Positive offset (+05:00): correctly converted to UTC
- [x] Negative offset (-05:00): correctly converted to UTC
- [x] Half-hour offset (+05:30): correctly handled
- [x] Invalid offset (+25:00): rejected with "Invalid date format" error

**Year Boundary Cases:**
- [x] Year 2000 (Y2K edge): correctly handled
- [x] Year 9999 (far future): correctly handled
- [x] Year 10000: accepted with unusual format (+010000-...)
- [x] Negative year: treated as missing value (not parsed)

**Special Input Cases:**
- [x] Empty string: defers task but scheduledFor becomes/remains null
- [x] Whitespace only: rejected with "Invalid date format" error
- [ ] **FAIL**: Keyword 'today': rejected (no relative date support)
  - **ENHANCEMENT el-66en (CONFIRMED)**
- [ ] **FAIL**: Keyword 'tomorrow': rejected (no relative date support)
  - **ENHANCEMENT el-66en (CONFIRMED)**
- [x] Unix timestamp (seconds): rejected with "Invalid date format" error
- [x] Unix timestamp (milliseconds): rejected with "Invalid date format" error

**Flag Availability:**
- [ ] **FAIL**: `--deadline` flag on `el create task`: doesn't exist
  - **ENHANCEMENT el-e6wc (CONFIRMED)**
- [ ] **FAIL**: `--deadline` flag on `el update`: doesn't exist
  - **ENHANCEMENT el-e6wc (CONFIRMED)**

**Security:**
- [x] SQL injection attempt in date field: properly rejected

**Success Criteria:** Date/time inputs are validated and converted correctly
- **PARTIAL:** Most inputs handled correctly, but invalid dates silently roll over

**Issues Confirmed:**

| ID | Summary | Priority | Category |
|----|---------|----------|----------|
| el-2p2p | Invalid dates (Feb 30, Feb 29 in non-leap) silently roll over | 4 | ux |
| el-3ap6 | Past dates accepted without warning | 4 | ux |
| el-66en | No relative date support (today, tomorrow, +1d) | 4 | enhancement |
| el-e6wc | --deadline flag missing from create/update | 4 | enhancement |

**Notes:**
Date/time handling is generally robust for valid inputs. Timezone conversion to UTC works correctly.
The silent rollover for impossible dates (Feb 30, Feb 31, Feb 29 in non-leap years) is the most
significant issue as it can cause agents to schedule work on unexpected dates without any warning.
This is a UX issue rather than a bug since JavaScript's Date behavior matches this pattern.

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
| el-1us7 | **CRITICAL**: JSON output truncated at 64KB producing invalid JSON | 2 |
| el-5zw4 | Null character in input silently truncates strings | 3 |

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

4. **Large content stress test**: Verify JSON output remains valid for documents/tasks with 100KB+ content (el-1us7)

5. **Input sanitization test**: Verify null characters and other control characters are rejected or properly handled (el-5zw4)

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
