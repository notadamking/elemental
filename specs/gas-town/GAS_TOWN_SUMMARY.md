# Multi-Agent Orchestration System: Clean-Room Technical Documentation

## Executive Summary

This document describes a multi-agent orchestration system designed to coordinate 10-30+ concurrent AI coding agents (such as Claude Code, Codex, Gemini CLI, or similar tools) working on software development tasks. The system transforms the developer role from hands-on coder to workflow manager, enabling parallel execution of many tasks through a structured hierarchy of specialized agent roles.

---

## 1. Purpose

The system addresses fundamental challenges when scaling AI-assisted development beyond a handful of concurrent agent instances:

| Challenge                                 | Solution                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| **Context loss on agent restart**         | Work state persists in git-backed storage hooks that survive crashes and restarts |
| **Manual agent coordination**             | Built-in messaging system, agent identities, and handoff protocols                |
| **Chaos at scale (4-10+ agents)**         | Hierarchical role structure enables comfortable scaling to 20-30 agents           |
| **Work state lost in agent memory**       | All work tracked in a git-backed issue ledger                                     |
| **Tedium of managing multiple terminals** | Unified orchestration layer with tmux integration                                 |

---

## 2. Design Goals

1. **Persistent state**: Never lose work when agents restart or crash
2. **Graceful degradation**: Every component works independently; the system operates even with subsystems disabled
3. **Throughput over perfection**: Prioritize volume of completed work over zero-defect output; accept that some work gets lost or duplicated
4. **Human as supervisor**: The user becomes a manager of AI workers rather than a direct code author
5. **Automation of coordination**: Eliminate "yak shaving" around tracking who's doing what
6. **Git-native**: All state stored in git for version control, rollback, and sharing

---

## 3. System Architecture

### 3.1 Structural Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        WORKSPACE                                │
│                     (Top-level directory)                       │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   PROJECT A  │  │   PROJECT B  │  │   PROJECT C  │          │
│  │ (Git repo)   │  │ (Git repo)   │  │ (Git repo)   │          │
│  │              │  │              │  │              │          │
│  │ • Workers    │  │ • Workers    │  │ • Workers    │          │
│  │ • Hooks      │  │ • Hooks      │  │ • Hooks      │          │
│  │ • Crew       │  │ • Crew       │  │ • Crew       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  Workspace-level agents: Manager Agent, Maintenance Controller  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Terminology Mapping

| Original Term | Engineering Term           | Description                                                                             |
| ------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| Town          | **Workspace**              | Top-level directory containing all projects; managed by the orchestration binary        |
| Rig           | **Project**                | A single git repository under workspace management                                      |
| Overseer      | **User**                   | The human operator who receives notifications and provides high-level direction         |
| Mayor         | **Manager Agent**          | Primary AI coordinator the user communicates with; delegates to other agents            |
| Polecat       | **Ephemeral Worker**       | Short-lived agent that spawns, completes a single task, submits work, and terminates    |
| Crew          | **Persistent Worker**      | Long-lived agent with stable identity, reusable across tasks, used for interactive work |
| Refinery      | **Merge Coordinator**      | Agent that manages the merge queue and resolves conflicts from worker submissions       |
| Witness       | **Recovery Monitor**       | Agent that watches workers and intervenes when they become stuck or drift               |
| Deacon        | **Maintenance Controller** | Agent running continuous maintenance loops (cleanup, health checks)                     |
| Dogs          | **Maintenance Workers**    | Agents performing cleanup tasks directed by the Maintenance Controller                  |
| Boot the Dog  | **Controller Monitor**     | Meta-agent that checks on the Maintenance Controller periodically                       |
| Beads         | **Work Items**             | Atomic units of tracked work (like issues/tickets) stored as JSON in git                |
| Hooks         | **State Hooks**            | Git worktree-based persistent storage that survives agent restarts                      |
| Convoy        | **Task Batch**             | A bundle of work items assigned to agents as a coordinated unit                         |

---

## 4. Component Specifications

### 4.1 Agent Roles

The system defines seven distinct agent roles, each with specific responsibilities:

#### 4.1.1 Manager Agent (Workspace-level)

- **Primary interface** for user communication
- Acts as concierge and chief-of-staff
- Kicks off most task batches
- Receives completion notifications
- Delegates work to appropriate workers

#### 4.1.2 Ephemeral Workers (Project-level)

- Spawn for a single task, then terminate
- Managed by the Recovery Monitor
- Submit work via merge requests
- Ideal for well-specified, atomic tasks
- Scale up/down based on workload

#### 4.1.3 Merge Coordinator (Project-level)

- Single point of control for code integration
- Reviews and merges worker submissions
- Resolves conflicts between parallel workers
- Maintains repository integrity

#### 4.1.4 Recovery Monitor (Project-level)

- Watches active workers for problems
- Detects when workers are stuck or drifting
- Intervenes to unstick blocked agents
- Ensures work continues progressing

#### 4.1.5 Maintenance Controller (Workspace-level)

- Runs continuous maintenance loops
- Unlike ephemeral workers, persists indefinitely
- Coordinates cleanup and health operations
- Dispatches maintenance workers for tasks

#### 4.1.6 Maintenance Workers (Workspace-level)

- Perform cleanup tasks on command
- Clear stale work items, orphaned processes
- Handle routine housekeeping

#### 4.1.7 Persistent Workers (Project-level)

- Long-lived agents with stable identities
- User communicates directly (not through Manager)
- Ideal for design work, reviews, planning
- Persist across task boundaries for context continuity

### 4.2 Data Structures

#### 4.2.1 Work Items

The atomic unit of tracked work:

- Stored as JSON (one item per line)
- Tracked in git alongside project code
- Contains: ID, description, status, assignee, dependencies
- Supports hierarchical nesting (parent/child relationships)

#### 4.2.2 Hierarchical Work Items (Epics)

Work items with children:

- Children execute in parallel by default
- Explicit dependencies force sequential execution
- Enables top-down planning decomposition
- Supports "inverted" plans (root = final deliverable, leaves = first tasks)

#### 4.2.3 Workflow Templates (Molecules)

Predefined sequences of work items:

- Template graphs with dependencies (design → plan → implement → review → test)
- Variable substitution on instantiation
- Reusable across projects
- Stored as TOML configuration files

#### 4.2.4 Template Definitions (Formulas)

Higher-level abstractions:

- "Cooked" into workflow templates
- Instantiated into ephemeral or persistent workflows
- Enable standardized processes (releases, code reviews, etc.)

#### 4.2.5 Ephemeral Work Items (Wisps)

Transient work tracking:

- Exist in database with hash IDs
- Not persisted to git
- "Burned" (destroyed) after completion
- Optionally squashed into summary commits
- Used for high-velocity orchestration

### 4.3 State Persistence

#### 4.3.1 State Hooks

Git worktree-based persistent storage:

- Each agent has dedicated hook storage
- Survives crashes and restarts
- Version-controlled with rollback capability
- Enables multi-agent coordination through git

#### 4.3.2 Hook Lifecycle

```
Created → Active → Suspended → Active → Completed → Archived
   ↑        ↓         ↓                      ↓
   └────────┴─────────┴──────────────────────┘
         (Can cycle through states)
```

### 4.4 Communication System

#### 4.4.1 Messaging

- Each agent has an inbox for notifications
- User has workspace-level inbox
- Agents can send/receive messages
- Task batches trigger completion notifications

#### 4.4.2 Session Continuity

- Agents can communicate with predecessors in their role
- Enables context handoff between agent instances
- Works through session resume capabilities

---

## 5. Workflow Patterns

### 5.1 Standard Orchestrated Workflow

1. **User tells Manager Agent** what to build
2. **Manager analyzes** and breaks down into tasks
3. **Task batch created** with work items
4. **Agents spawned** as appropriate
5. **Work distributed** via state hooks
6. **Progress monitored** through batch status
7. **Manager summarizes** results to user

### 5.2 Execution Flow

```
User → Manager Agent → Task Batch → Workers → State Hooks
                                        ↓
                                   Merge Coordinator
                                        ↓
                                   Git Repository
                                        ↓
                                   Manager Agent → User
```

### 5.3 Task Assignment

```bash
# Create task batch with work items
convoy create "Feature X" issue-123 issue-456

# Assign work to project agent
sling issue-123 myproject

# Monitor progress
convoy list
convoy show <batch-id>
```

---

## 6. Advantages

1. **Massive parallelism**: 20-30 concurrent agents vs. hand-managing 3-5
2. **Continuous operation**: System can work unattended for extended periods
3. **Fault tolerance**: Work persists through crashes; agents recover automatically
4. **Separation of concerns**: Specialized roles prevent bottlenecks
5. **Git-native auditing**: Complete history of all work and changes
6. **Flexible degradation**: Works with reduced components when needed
7. **Scalable mental model**: User manages batches, not individual agents
8. **Template reusability**: Standardized workflows across projects

---

## 7. Limitations and Trade-offs

1. **High operational cost**: Running many AI agent instances is expensive ($100-200/hour reported)
2. **Expert users only**: Requires Stage 7+ proficiency with AI coding tools
3. **Architectural complexity**: Multiple layers of monitoring (agents watching agents)
4. **Learning curve**: Novel terminology and workflow patterns to internalize
5. **Imperfect reliability**: System accepts some lost/duplicated work as acceptable
6. **Manual steering required**: Still needs human attention for course correction
7. **Experimental maturity**: Rapidly evolving with frequent breaking changes
8. **Tool coupling**: Primarily designed around Claude Code, though supports others

---

## 8. Genesis and Motivation

### 8.1 Evolution of AI-Assisted Development

The system emerged from observation of developer progression with AI tools:

| Stage | Description                                     |
| ----- | ----------------------------------------------- |
| 1     | Zero/minimal AI: occasional code completion     |
| 2     | Agent in IDE with permission prompts            |
| 3     | Agent in IDE, autonomous mode enabled           |
| 4     | Agent fills screen; code viewed mainly as diffs |
| 5     | CLI agent, autonomous, diffs scroll by          |
| 6     | CLI with 3-5 parallel agents, high velocity     |
| 7     | 10+ agents, hand-management reaching limits     |
| 8     | **Building custom orchestration** (this system) |

### 8.2 Problem Statement

At Stage 7+, developers face:

- Context window exhaustion causing agents to lose state
- Inability to track which agent is working on what
- Lost work when agents terminate
- Difficulty coordinating merge conflicts
- Mental overhead managing parallel streams

### 8.3 Design Inspiration

The system draws from:

- **Kubernetes**: Container orchestration patterns applied to AI agents
- **Issue tracking systems**: Work items as the atomic unit
- **Git workflows**: Branch-based isolation with centralized merging
- **Factory automation**: Hierarchical supervision with specialized roles
- **RTS games**: Parallel attention management across multiple units

---

## 9. Use Cases

### 9.1 Ideal For

- Large feature development with parallelizable subtasks
- Bug backlog processing at scale
- Code migration/refactoring across many files
- Rapid prototyping with iterative refinement
- Template-driven development processes

### 9.2 Not Ideal For

- Tightly sequential work with heavy dependencies
- Budget-constrained development
- Projects requiring zero-defect output
- Users unfamiliar with AI coding tools
- Small, simple tasks (overkill)

---

## 10. Operational Considerations

### 10.1 Best Practices

- Start all work through the Manager Agent
- Use task batches for coordination visibility
- Let state hooks handle persistence
- Create templates for repeated processes
- Monitor the dashboard for real-time status
- Trust the Manager to orchestrate agents

### 10.2 Maintenance

- Run regular workspace cleanups
- Clear stale work items and orphaned processes
- Review and land pending work before upgrades
- Archive completed task batches

### 10.3 Troubleshooting

| Issue                  | Resolution                  |
| ---------------------- | --------------------------- |
| Agents lose connection | Repair state hooks          |
| Task batch stuck       | Force refresh batch         |
| Manager unresponsive   | Detach and reattach session |
| Work items orphaned    | Run cleanup operation       |

---

## 11. Summary

This multi-agent orchestration system represents a paradigm shift from developer-as-coder to developer-as-manager. By introducing hierarchical agent roles, git-backed state persistence, and structured work tracking, it enables scaling AI-assisted development from a handful of manually-managed instances to 20-30+ coordinated agents.

The core innovation is treating AI agents as a managed workforce rather than tools to be individually operated. This requires accepting trade-offs: higher costs, some lost work, and the need for experienced operators. In exchange, it offers unprecedented throughput for parallelizable development work.

The system is designed for power users who have already mastered AI coding tools and are ready to delegate not just individual tasks, but entire development workflows to supervised AI agent teams.
