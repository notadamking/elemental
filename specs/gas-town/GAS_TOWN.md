# Multi-Agent Orchestration System Documentation

## Clean-Room Technical Reference

_A generalized engineering documentation for distributed AI agent coordination systems_

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Background and Origins](#2-background-and-origins)
3. [Problem Statement](#3-problem-statement)
4. [System Goals](#4-system-goals)
5. [Architecture Overview](#5-architecture-overview)
6. [Core Components](#6-core-components)
7. [Work Tracking System](#7-work-tracking-system)
8. [Agent Roles and Responsibilities](#8-agent-roles-and-responsibilities)
9. [Workflow Patterns](#9-workflow-patterns)
10. [Coordination Mechanisms](#10-coordination-mechanisms)
11. [State Persistence](#11-state-persistence)
12. [Advantages](#12-advantages)
13. [Disadvantages and Limitations](#13-disadvantages-and-limitations)
14. [Design Principles](#14-design-principles)
15. [Use Case Fit](#15-use-case-fit)
16. [Glossary Translation](#16-glossary-translation)

---

## 1. Executive Summary

This document describes a **multi-agent orchestration system** designed to coordinate 20-30 concurrent AI coding agents (such as Claude Code, Codex, or similar CLI-based AI development tools) working in parallel across multiple software projects.

The system addresses the fundamental challenge of managing numerous AI agents that individually suffer from context limitations, session termination, and lack of persistent memory. It provides:

- **Centralized coordination** through a hierarchy of specialized agent roles
- **Persistent state tracking** via Git-backed work item storage
- **Automated workflow execution** through templated task sequences
- **Graceful degradation** allowing components to operate independently

The architecture is analogous to a software development organization with specialized roles (manager, workers, quality assurance, maintenance) but implemented entirely with AI agents orchestrated by a human operator.

---

## 2. Background and Origins

### Historical Context

The system emerged from the evolution of AI-assisted software development, which the author characterizes as progressing through eight stages:

| Stage | Description                  | Characteristics                               |
| ----- | ---------------------------- | --------------------------------------------- |
| 1     | Minimal AI                   | Code completions, occasional chat questions   |
| 2     | Agent in IDE, permissioned   | Sidebar agent requests permission for actions |
| 3     | Agent in IDE, autonomous     | Permissions disabled, higher trust            |
| 4     | Wide agent in IDE            | Agent dominates interface; code becomes diffs |
| 5     | CLI single agent, autonomous | Terminal-based, diffs scroll by               |
| 6     | CLI multi-agent, autonomous  | 3-5 parallel instances; high velocity         |
| 7     | 10+ agents, hand-managed     | Approaching limits of manual coordination     |
| 8     | Custom orchestrator          | Building automation infrastructure            |

This system targets users at **Stage 7 or 8**—developers who have already adopted extensive AI-assisted workflows and are hitting the practical limits of manual coordination.

### Development History

The orchestration system went through four major iterations across different programming languages (TypeScript, Python, Go) before reaching its current form. Key innovations accumulated over approximately 17 days of intensive development:

- Work item tracking system
- Persistent agent identities
- Workflow templating
- Ephemeral vs. persistent work items
- Automated monitoring and recovery

---

## 3. Problem Statement

### Core Challenges

When running multiple AI coding agents simultaneously, developers face several compounding problems:

**Context Window Exhaustion**
AI agents have finite context windows. When filled, the agent stops functioning effectively. Sessions must be restarted, losing accumulated context and work state.

**Session Volatility**
AI agent sessions crash, time out, or terminate unexpectedly. Without external state management, work in progress is lost.

**Coordination Overhead**
Manual tracking of which agent is doing what, across 10-30 simultaneous instances, becomes overwhelming. Work gets duplicated, lost, or conflicts arise.

**State Synchronization**
Multiple agents modifying the same codebase create merge conflicts and inconsistent states. Without coordination, changes can overwrite each other.

**Workflow Complexity**
Complex tasks require sequences of steps with dependencies. Managing these sequences manually across many agents is error-prone.

### The Fundamental Problem

> "The biggest problem with [AI coding agents] is it ends. The context window fills up, and it runs out of steam, and stops."

The system exists to solve the discontinuity problem: how to maintain continuous progress on work when individual agents are ephemeral and context-limited.

---

## 4. System Goals

### Primary Objectives

1. **Scale Agent Parallelism**: Support 20-30 concurrent agents productively
2. **Persist Work State**: Survive agent crashes, restarts, and context exhaustion
3. **Automate Coordination**: Reduce manual overhead of managing multiple agents
4. **Enable Unattended Operation**: Allow work to proceed without constant human supervision
5. **Graceful Degradation**: Function with partial system availability

### Secondary Objectives

- Provide visibility into distributed work progress
- Enable workflow templating and reuse
- Support heterogeneous AI runtimes (different LLM providers)
- Maintain compatibility with standard Git workflows

### Non-Goals

- Replacing human judgment for design decisions
- Full autonomy without any human oversight
- Supporting non-developer use cases (though principles may transfer)

---

## 5. Architecture Overview

### Structural Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                         WORKSPACE                                │
│  (Root directory containing all projects and global agents)      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐     ┌──────────────────────────────────┐  │
│  │ COORDINATOR AGENT│     │     MAINTENANCE SUBSYSTEM        │  │
│  │  (User's primary │     │  ┌─────────────┐                 │  │
│  │   interface)     │     │  │ Maintenance │                 │  │
│  └────────┬─────────┘     │  │  Manager    │                 │  │
│           │               │  └──────┬──────┘                 │  │
│           │               │         │                        │  │
│           │               │  ┌──────┴──────┐                 │  │
│           │               │  │ Maintenance │                 │  │
│           │               │  │  Workers    │                 │  │
│           │               │  └─────────────┘                 │  │
│           │               └──────────────────────────────────┘  │
│           │                                                      │
│  ┌────────┴──────────────────────────────────────────────────┐  │
│  │                      PROJECT A                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  │
│  │  │  Ephemeral  │  │   Monitor   │  │   Merge     │        │  │
│  │  │  Workers    │  │   Agent     │  │   Agent     │        │  │
│  │  │  (n agents) │  │             │  │             │        │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              PERSISTENT WORKERS                      │  │  │
│  │  │  (Named agents for design/review work)               │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      PROJECT B                             │  │
│  │  (Same structure as Project A)                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Classification

| Layer               | Scope                      | Agents                                                      |
| ------------------- | -------------------------- | ----------------------------------------------------------- |
| **Workspace-Level** | Global across all projects | Coordinator, Maintenance Manager, Maintenance Workers       |
| **Project-Level**   | Per-repository             | Ephemeral Workers, Monitor, Merge Agent, Persistent Workers |

---

## 6. Core Components

### 6.1 Workspace

**Definition**: The root directory containing all managed projects and global configuration.

**Functions**:

- Houses the orchestration binary and configuration
- Contains all project repositories as subdirectories
- Stores workspace-level work items and agent identities
- Manages global state and cross-project coordination

**Example Structure**:

```
~/workspace/
├── orchestrator/         # Orchestrator tooling
├── project-alpha/        # First managed project
├── project-beta/         # Second managed project
├── .work-items/          # Global work tracking
└── config.json           # Workspace configuration
```

### 6.2 Project

**Definition**: A container for a single Git repository and its associated agents.

**Functions**:

- Wraps a Git repository with orchestration metadata
- Manages project-specific agents and their states
- Contains project-level work items
- Isolates changes through Git worktrees

**Characteristics**:

- One-to-one mapping with Git repositories
- Independent operation possible
- Shared access to workspace-level resources

### 6.3 Work Item Anchor (Hook)

**Definition**: A Git worktree-based persistent storage location for agent work state.

**Functions**:

- Provides crash-resistant state storage
- Enables session continuity across agent restarts
- Stores pending and in-progress work assignments
- Maintains agent identity across sessions

**Lifecycle**:

```
Created → Active → Suspended → Active → Completed → Archived
            ↑_________↓
          (pause/resume)
```

**Key Properties**:

- Git-backed (survives crashes)
- Per-agent isolation
- Rollback capability via version control

### 6.4 Work Batch

**Definition**: A collection of related work items tracked as a unit.

**Functions**:

- Groups related tasks for coordinated execution
- Provides progress visibility at the feature/epic level
- Enables parallel assignment across multiple agents
- Supports dashboard visualization

**Characteristics**:

- Multiple agents can work on a single batch
- Tracks completion percentage
- Named for human readability (e.g., "Feature X", "Bug Fixes Q4")

---

## 7. Work Tracking System

### 7.1 Work Items (Atomic Units)

**Definition**: The fundamental unit of tracked work, similar to an issue-tracker issue.

**Properties**:

- Unique identifier (prefix + alphanumeric, e.g., `proj-abc12`)
- Title and description
- Status (open, in-progress, completed, etc.)
- Assignee (agent identity)
- Dependencies on other work items
- Stored as JSON, one item per line
- Version-controlled in Git

**Storage**: Work items are persisted as structured JSON in a ledger file within the repository, enabling:

- Atomic commits of state changes
- Full history via Git
- Distributed access across agents

### 7.2 Compound Work Items (Epics)

**Definition**: Work items that contain children, forming a hierarchy.

**Characteristics**:

- Children can be compound or atomic
- Children execute in **parallel by default**
- Explicit dependencies force sequential execution
- Enables top-down planning decomposition

**Dependency Model**:

```
Epic: "Build Authentication System"
├── Task: "Design auth schema" (no deps → runs first)
├── Task: "Implement login API" (depends on design)
├── Task: "Implement logout API" (depends on design)
├── Task: "Write auth tests" (depends on both implementations)
└── Task: "Documentation" (depends on tests)
```

### 7.3 Workflow Templates (Formulas)

**Definition**: Declarative specifications for multi-step workflows, stored as TOML files.

**Purpose**: Define reusable task sequences with dependencies, variables, and acceptance criteria.

**Example**:

```toml
description = "Standard release process"
name = "release"
version = 1

[vars.version]
description = "Semantic version to release"
required = true

[[steps]]
id = "bump-version"
title = "Bump version"
description = "Run ./scripts/bump-version.sh {{version}}"

[[steps]]
id = "run-tests"
title = "Run tests"
description = "Run make test"
needs = ["bump-version"]

[[steps]]
id = "build"
title = "Build artifacts"
description = "Run make build"
needs = ["run-tests"]

[[steps]]
id = "tag-release"
title = "Create release tag"
description = "Git tag v{{version}}"
needs = ["build"]
```

### 7.4 Workflow Instantiation Pipeline

```
Template (TOML) → Frozen Template → Live Workflow → Work Items
   "recipe"       "protomolecule"    "molecule"      "beads"
```

**Process**:

1. **Define**: Author creates workflow template (human-readable TOML)
2. **Freeze**: Template is "cooked" into a frozen template (variable placeholders intact)
3. **Instantiate**: Frozen template is "poured" with variable values, creating executable workflow
4. **Execute**: Workflow steps become work items assigned to agents

### 7.5 Ephemeral vs. Persistent Work Items

| Type           | Persistence                           | Use Case                                |
| -------------- | ------------------------------------- | --------------------------------------- |
| **Persistent** | Committed to Git                      | Features, bugs, planned work            |
| **Ephemeral**  | In-database only, destroyed after use | Monitoring patrols, automated workflows |

Ephemeral items reduce Git history noise for high-frequency internal operations while maintaining trackability during execution.

---

## 8. Agent Roles and Responsibilities

### 8.1 Coordinator Agent (Workspace-Level)

**Original Term**: Mayor

**Scope**: Entire workspace (all projects)

**Responsibilities**:

- Primary interface for user communication
- Receives high-level directives from human operator
- Decomposes work into assignable tasks
- Creates and manages work batches
- Assigns work to project-level agents
- Reports progress summaries to user
- Can operate independently (minimal mode)

**Characteristics**:

- Long-running, persistent identity
- Full context about workspace structure
- Can delegate to any agent in any project

### 8.2 Ephemeral Worker Agents (Project-Level)

**Original Term**: Polecats

**Scope**: Single project

**Responsibilities**:

- Execute specific, well-defined tasks
- Work from assigned work items on their anchor
- Submit merge requests upon completion
- Self-terminate after task completion

**Characteristics**:

- Short-lived (spawn → work → disappear)
- Swarmed in parallel for throughput
- No persistent identity between sessions
- Designed for specification-heavy work

**Lifecycle**:

```
Spawn → Read Hook → Execute Work → Submit MR → Terminate
```

### 8.3 Monitor Agent (Project-Level)

**Original Term**: Witness

**Scope**: Single project

**Responsibilities**:

- Watches over ephemeral worker agents
- Detects stuck or failed workers
- Attempts to unstick blocked agents
- Ensures workers submit their merge requests
- Nudges Merge Agent when work is ready

**Characteristics**:

- Patrol-based operation (periodic checks)
- Passive observation with active intervention
- Critical for system reliability

### 8.4 Merge Agent (Project-Level)

**Original Term**: Refinery

**Scope**: Single project

**Responsibilities**:

- Manages the merge queue
- Coordinates merge requests from workers
- Resolves merge conflicts where possible
- Ensures consistent main branch state
- Gates quality before merge

**Characteristics**:

- Serializes parallel work into coherent commits
- Optional (direct merges possible without it)
- Valuable for high-volume swarming

### 8.5 Persistent Worker Agents (Project-Level)

**Original Term**: Crew

**Scope**: Single project (but named, long-lived)

**Responsibilities**:

- Design work and architecture decisions
- Code review of contributor submissions
- Implementation planning
- Complex tasks requiring accumulated context
- Direct communication with user (not via Coordinator)

**Characteristics**:

- Named identities (e.g., "architect", "reviewer")
- Persist between tasks (reusable)
- User communicates with them directly
- Ideal for thought-intensive work

### 8.6 Maintenance Manager Agent (Workspace-Level)

**Original Term**: Deacon

**Scope**: Entire workspace

**Responsibilities**:

- Runs maintenance workflows in continuous loops
- Receives periodic "do your job" signals from daemon
- Propagates health-check signals to other agents
- Coordinates cleanup operations
- Monitors system-wide health

**Characteristics**:

- Patrol-based (continuous loop)
- Daemon-triggered (not user-initiated)
- Keeps the system running autonomously

### 8.7 Maintenance Worker Agents (Workspace-Level)

**Original Term**: Dogs

**Scope**: Entire workspace

**Responsibilities**:

- Execute cleanup tasks assigned by Maintenance Manager
- Handle garbage collection
- Clear stale state
- Perform routine maintenance operations

**Characteristics**:

- Directed by Maintenance Manager
- Task-specific, ephemeral
- Focus on housekeeping

### 8.8 Maintenance Monitor Agent (Workspace-Level)

**Original Term**: Boot (Maintenance Manager Checker)

**Scope**: Maintenance Manager specifically

**Responsibilities**:

- Periodically checks on Maintenance Manager health
- Triggers restart if Maintenance Manager is stuck
- Meta-level monitoring (watching the watcher)

**Characteristics**:

- Single purpose
- Prevents cascading failures
- Controversial necessity (adds complexity)

---

## 9. Workflow Patterns

### 9.1 Coordinator-Orchestrated Workflow (Primary)

**Use Case**: Complex, multi-task features

**Flow**:

```
User → Coordinator → Work Batch → Ephemeral Workers → Merge Agent → Main Branch
                         ↓
                    Monitor (watching)
```

**Steps**:

1. User describes desired outcome to Coordinator
2. Coordinator creates work batch with component work items
3. Coordinator spawns ephemeral workers for each item
4. Workers execute in parallel, report completion
5. Monitor watches for stuck workers
6. Merge Agent integrates completed work
7. Coordinator summarizes results to user

### 9.2 Formula-Driven Workflow

**Use Case**: Repeatable, defined processes (releases, migrations)

**Flow**:

```
Template → Instantiate → Work Batch → Ephemeral Workers → Completion
```

**Steps**:

1. User selects workflow template
2. User provides variable values
3. System instantiates template into work items
4. Work items assigned to workers
5. Workers execute steps in dependency order
6. Workflow completes when all steps done

### 9.3 Persistent Worker Workflow

**Use Case**: Design work, reviews, complex decisions

**Flow**:

```
User ↔ Persistent Worker (direct, bidirectional)
```

**Steps**:

1. User communicates directly with named persistent worker
2. Worker accumulates context over conversation
3. Worker produces design artifacts, plans, or reviews
4. Output becomes input for ephemeral worker swarming

### 9.4 Minimal (Coordinator-Only) Workflow

**Use Case**: Learning, simple tasks, degraded operation

**Flow**:

```
User ↔ Coordinator (single agent)
```

**Steps**:

1. User works exclusively with Coordinator
2. Coordinator handles tasks directly (no delegation)
3. All benefits of state persistence apply
4. Reduced parallelism, increased simplicity

---

## 10. Coordination Mechanisms

### 10.1 Work Assignment ("Slinging")

**Mechanism**: The `sling` command assigns work items to agent anchors.

**Properties**:

- Work items are placed on agent's anchor (hook)
- Agent may start immediately or defer
- Supports restart-before-execute option
- Asynchronous: assigner doesn't wait for completion

### 10.2 Universal Continuity Principle

**Original Term**: GUPP (Universal Propulsion Principle)

**Core Rule**: "If there is work on your anchor, YOU MUST RUN IT."

**Implementation**:

- Every agent checks their anchor on startup
- Pending work items are automatically executed
- Enables crash recovery: restart agent, work continues
- Enables session handoff: new session continues old work

**Effect**: Provides continuous forward progress despite session volatility.

### 10.3 Session Handoff

**Mechanism**: The `handoff` command transitions work between agent sessions.

**Process**:

1. Current session optionally sends itself work
2. Session terminates cleanly
3. New session spawns in same terminal slot
4. New session reads anchor, continues work

**Use Cases**:

- Context window exhaustion
- Intentional session refresh
- Load balancing

**Trigger Methods**:

- Natural language: "let's hand off"
- Command: `/handoff`
- Shell: `!orchestrator handoff` (no API cost)

### 10.4 Inter-Agent Messaging (Mail)

**Mechanism**: Git-backed mailbox system for agent-to-agent communication.

**Features**:

- Asynchronous message delivery
- Persistent (survives restarts)
- Supports notifications, requests, updates
- Enables loose coupling between agents

### 10.5 Session Continuity ("Séance")

**Original Term**: Seance

**Mechanism**: Allows current agent to communicate with previous session holder of same role.

**Use Case**: Predecessor promised to leave context/work for successor, but successor doesn't see it.

**Process**:

1. Current agent invokes session continuity
2. System identifies previous session
3. Enables resumption of previous session
4. Extracts context from predecessor

**Technical Basis**: Leverages AI runtime's session resume functionality.

---

## 11. State Persistence

### 11.1 Git-Backed Identity

All agent identities are stored as work items in Git:

- **Role Definition**: Template describing role capabilities, prompts, behaviors
- **Agent Identity**: Per-instance record with mailbox, anchor pointer, state
- **Anchor**: Separate work item linked from identity

**Benefit**: Agent identity persists across sessions; state is never lost.

### 11.2 Worktree Isolation

Each agent operates in its own Git worktree:

- **Isolation**: Changes don't affect other agents until merge
- **Crash Safety**: Corrupted state doesn't propagate
- **Parallel Development**: Multiple agents, one repository

### 11.3 State Recovery Model

```
Agent Crash → Restart → Read Identity → Read Anchor → Resume Work
```

Because all state is external (in Git), agents are stateless processes that hydrate from persistent storage on startup.

---

## 12. Advantages

### 12.1 Scalability

- Supports 20-30+ concurrent agents
- Human operator becomes bottleneck, not system
- Parallel execution of independent tasks

### 12.2 Fault Tolerance

- Git-backed state survives crashes
- Automatic recovery via continuity principle
- Monitoring agents detect and fix stuck workers

### 12.3 Graceful Degradation

- Each component operates independently
- Coordinator-only mode always available
- Remove components without total failure

### 12.4 Workflow Reusability

- Template system enables codified processes
- Variable substitution for customization
- Marketplace potential for sharing templates

### 12.5 Visibility

- Dashboard for work batch tracking
- Agent status monitoring
- Progress aggregation across projects

### 12.6 Unattended Operation

- Work batches can run overnight
- Maintenance system keeps things moving
- Human checks results, not process

### 12.7 Runtime Flexibility

- Supports multiple AI providers
- Configuration per-project or per-agent
- Hot-swappable agent implementations

---

## 13. Disadvantages and Limitations

### 13.1 Cost

- Running 20-30 AI agents simultaneously is expensive
- Estimates of $100-200/hour during heavy use
- Requires budget tolerance or business justification

### 13.2 Complexity

- Steep learning curve
- Numerous concepts and terminology
- Requires Stage 7+ experience to use effectively

### 13.3 Stability

- System is young (weeks old at launch)
- Bugs cause cascading problems
- "Murderous rampaging" failure modes reported

### 13.4 Constant Steering Required

- Not truly autonomous
- Human must monitor and intervene
- "Superintelligent chimpanzees" require supervision

### 13.5 Specification Dependency

- Ephemeral workers need well-defined tasks
- Garbage in, garbage out
- Design work still requires human judgment

### 13.6 Infrastructure Gaps

- Lacks mature observability
- Limited governance and compliance tooling
- Safety mechanisms underdeveloped

### 13.7 Work Loss Tolerance

- Philosophy accepts some work will be lost
- Designs may need recreation
- Bugs may be fixed multiple times
- Not suitable for precision-critical work

---

## 14. Design Principles

### 14.1 Zero Framework Cognition

The system minimizes cognitive load on agents by externalizing state. Agents don't need to remember; they read from external storage.

### 14.2 Coordinator-Enhanced Orchestration

**Original Term**: MEOW (Mayor-Enhanced Orchestration Workflow)

The Coordinator serves as the primary orchestration point, receiving user intent and decomposing into trackable, assignable work.

### 14.3 Discovery Over Tracking

Work items exist to be discovered by agents, not tracked by humans. The system enables agents to find and execute work without human dispatching.

### 14.4 Work Items as Universal Data Plane

All state—agent identities, work assignments, configurations—is represented as work items. This enables uniform handling and Git-based persistence.

### 14.5 Throughput Over Precision

The system optimizes for volume and velocity:

- Some work gets lost (acceptable)
- Some bugs get fixed multiple times (acceptable)
- Focus is forward progress, not perfection

### 14.6 Ephemeral Agents, Persistent State

Agents are disposable; state is sacred. This inversion enables reliability despite individual agent volatility.

---

## 15. Use Case Fit

### Good Fit

- Large codebases benefiting from parallelization
- Teams already at Stage 6-7 of AI adoption
- Organizations tolerating experimental tooling
- Projects with well-defined, decomposable tasks
- Scenarios where throughput matters more than precision

### Poor Fit

- Small projects manageable with single agent
- Teams new to AI-assisted development
- Budget-constrained environments
- Mission-critical systems requiring high reliability
- Work requiring nuanced human judgment throughout

### Comparison with Alternative Approaches

| Approach                   | Strength             | Weakness                   |
| -------------------------- | -------------------- | -------------------------- |
| **Single Agent**           | Simple, low cost     | Limited parallelism        |
| **Manual Multi-Agent**     | Full control         | High coordination overhead |
| **This System**            | Scalable, persistent | Complex, expensive         |
| **SDLC-Mimicking Systems** | Familiar structure   | Sequential bottlenecks     |

Systems that mimic human organizational structures (analyst → PM → architect → developer handoffs) create sequential bottlenecks. This system uses **operational roles** (coordination, execution, monitoring, merging) that enable true parallelism.

---

## 16. Glossary Translation

| Original (Domain-Specific) Term | Generic Engineering Term               | Description                                |
| ------------------------------- | -------------------------------------- | ------------------------------------------ |
| Town                            | **Workspace**                          | Root directory containing all projects     |
| Rig                             | **Project**                            | Container for a Git repository + agents    |
| Overseer                        | **User/Operator**                      | Human controlling the system               |
| Mayor                           | **Coordinator Agent**                  | Primary orchestration agent                |
| Polecat                         | **Ephemeral Worker Agent**             | Short-lived task execution agent           |
| Witness                         | **Monitor Agent**                      | Agent health surveillance                  |
| Refinery                        | **Merge Agent**                        | Merge queue management                     |
| Deacon                          | **Maintenance Manager Agent**          | System maintenance coordinator             |
| Dogs                            | **Maintenance Worker Agents**          | Cleanup task executors                     |
| Boot the Dog                    | **Maintenance Monitor Agent**          | Watches the Maintenance Manager            |
| Crew                            | **Persistent Worker Agents**           | Named, reusable agents                     |
| Hook                            | **Work Item Anchor**                   | Persistent storage for agent work          |
| Bead                            | **Work Item**                          | Atomic unit of tracked work                |
| Epic                            | **Compound Work Item**                 | Work item with children                    |
| Molecule                        | **Live Workflow Instance**             | Instantiated workflow ready for execution  |
| Protomolecule                   | **Frozen Workflow Template**           | Compiled template awaiting instantiation   |
| Formula                         | **Workflow Template**                  | Declarative workflow definition (TOML)     |
| Wisp                            | **Ephemeral Work Item**                | Non-persisted temporary work item          |
| Convoy                          | **Work Batch**                         | Collection of related work items           |
| Guzzoline                       | **Pending Work Pool**                  | All available work in molecularized form   |
| GUPP                            | **Universal Continuity Principle**     | "If work is on your anchor, run it"        |
| MEOW                            | **Coordinator-Enhanced Orchestration** | Coordinator-centric workflow pattern       |
| Sling                           | **Assign Work**                        | Place work item on agent's anchor          |
| Handoff                         | **Session Transition**                 | Cleanly transfer work between sessions     |
| Seance                          | **Session Continuity**                 | Communication with previous session holder |
| War Rig                         | **Cross-Project Work Batch**           | Work batch spanning multiple projects      |

---

## Appendix A: System Requirements

### Prerequisites

- Go 1.23+
- Git 2.25+ (worktree support)
- Work tracking system (v0.44.0+)
- tmux 3.0+ (recommended for full experience)
- AI coding CLI (Claude Code, Codex, etc.)

### Hardware Considerations

- Network bandwidth for parallel API calls
- Storage for multiple Git worktrees
- Terminal multiplexer capacity for agent sessions

### Cost Factors

- AI API usage (primary cost driver)
- Scales linearly with agent count and activity
- Peak usage during swarming operations

---

## Appendix B: Related Concepts

### Kubernetes Comparison

The system has been compared to "Kubernetes for agents"—orchestrating disposable worker processes with persistent state, automated recovery, and declarative configuration.

### Temporal/Workflow Engines

Shares concepts with workflow engines: durable execution, state persistence, retry logic. Differs in being AI-agent-specific and code-generation-focused.

### Traditional CI/CD

Work batches parallel deployment pipelines; workflow templates parallel pipeline definitions. The system extends these concepts to the development phase, not just deployment.

---

_Document Version: 1.0_
_Generated: January 2026_
_Scope: Clean-room technical documentation based on public sources_
