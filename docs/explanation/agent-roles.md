# Understanding Agent Roles

How Elemental organizes work through Directors, Workers, and Stewards.

## The Three-Role Model

Elemental uses a hierarchical role system inspired by human organizational structures:

```
Human Operator
     │
     ▼
┌──────────┐
│ Director │ ← Plans, prioritizes, coordinates
└────┬─────┘
     │ delegates to
     ▼
┌──────────┐     ┌─────────┐
│ Workers  │     │ Stewards │
└──────────┘     └─────────┘
  Execute          Maintain
  tasks            system
```

Each role has distinct responsibilities and authority levels, preventing agents from overstepping while ensuring work flows efficiently.

## Director

The Director is the strategist and coordinator. There's typically one Director per system.

### Responsibilities
- **Planning** - Break down goals into tasks and plans
- **Prioritization** - Decide what matters most
- **Assignment** - Delegate tasks to appropriate Workers
- **Coordination** - Resolve blockers and conflicts
- **Communication** - Interface with human operators

### Authority
- Create plans and tasks
- Assign work to Workers
- Modify priorities
- Close/reopen tasks
- Send messages to any agent

### What Directors Don't Do
- Execute implementation tasks directly
- Manage system health (that's Stewards)
- Bypass human-required approvals

### Example Prompt (Built-in)

```markdown
# Your Role: Director

You are the director agent in the Elemental orchestration system.

## Your Responsibilities
- Break down high-level goals into actionable tasks
- Prioritize work based on urgency and dependencies
- Assign tasks to workers based on capabilities
- Monitor progress and unblock stuck workers
- Report status to humans

## Who You Report To
- Human operator (final authority)

## Who Reports To You
- Worker agents
- Steward agents (status reports)
```

## Worker

Workers are the implementers. Multiple Workers operate in parallel.

### Responsibilities
- **Execution** - Complete assigned tasks
- **Progress Reporting** - Update task status
- **Blocker Escalation** - Alert Director when stuck
- **Quality** - Ensure work meets requirements

### Authority
- Update tasks assigned to them
- Create subtasks under assigned tasks
- Send messages to Director and other Workers
- Request help via inbox

### What Workers Don't Do
- Assign work to other Workers (that's Director)
- Change system-wide priorities
- Modify tasks not assigned to them
- Perform system maintenance

### Example Prompt (Built-in)

```markdown
# Your Role: Worker

You are a worker agent in the Elemental orchestration system.

## Your Responsibilities
- Execute tasks assigned to you
- Report progress and blockers
- Request help when stuck
- Complete work to specification

## Who You Report To
- Director agent

## When to Ask for Help
- Blocked for more than 30 minutes
- Requirements unclear
- Need access or permissions
- Unexpected technical challenges
```

## Steward

Stewards handle maintenance and system health. There are specialized Steward types.

### Responsibilities
- **Monitoring** - Watch for issues
- **Maintenance** - Clean up stale data
- **Automation** - Run scheduled tasks
- **Remediation** - Fix detected problems

### Authority
- Create maintenance tasks
- Update system status
- Perform automated cleanups
- Alert Director of issues

### Steward Focuses

| Focus | Responsibility |
|-------|---------------|
| `merge` | Resolve sync conflicts, handle merge issues |
| `health` | Monitor agent activity, detect stale tasks |
| `ops` | System operations, cleanup, archival |
| `reminder` | Time-based notifications, due date alerts |

### Example Prompt (Merge Steward)

```markdown
# Your Role: Steward (Merge Focus)

You are a merge steward in the Elemental orchestration system.

## Your Responsibilities
- Monitor for sync conflicts
- Resolve merge issues automatically when possible
- Escalate complex conflicts to Director
- Maintain data consistency across replicas

## Decision Making
- Auto-resolve: Identical content, no conflict
- Auto-resolve: Clear LWW winner with no semantic conflict
- Escalate: Conflicting changes to same fields
- Escalate: Potential data loss scenarios
```

## Role Definitions

Roles are configured through `RoleDefinitionService`:

```typescript
import { createRoleDefinitionService } from '@elemental/orchestrator-sdk';

const roleDefService = createRoleDefinitionService(api, storage);

// Create a custom worker role
const roleDef = await roleDefService.createRoleDefinition({
  role: 'worker',
  name: 'Frontend Developer',
  systemPrompt: 'You specialize in React and TypeScript...',
  capabilities: ['frontend', 'testing', 'ui'],
  constraints: ['backend', 'infrastructure'],
  behaviors: {
    onStartup: 'Pull latest from main branch',
    onTaskAssigned: 'Read the full spec before coding',
    onStuck: 'Try for 30 min, then escalate',
    onError: 'Capture full stack trace',
  },
});
```

### Role Definition Fields

| Field | Purpose |
|-------|---------|
| `role` | Base role (director, worker, steward) |
| `name` | Display name |
| `systemPrompt` | Custom system prompt |
| `capabilities` | What this agent can do (tags) |
| `constraints` | What this agent should avoid |
| `behaviors` | Event-driven instructions |

## Prompts System

Each role has built-in prompts that can be customized.

### Built-in Prompts

Located in `packages/orchestrator-sdk/src/prompts/`:

```
prompts/
├── director.md        # Director role
├── worker.md          # Worker role
├── steward-base.md    # Base steward (all focuses)
├── steward-merge.md   # Merge focus addendum
├── steward-health.md  # Health focus addendum
├── steward-ops.md     # Ops focus addendum
└── steward-reminder.md # Reminder focus addendum
```

### Project Overrides

Override prompts by creating files in `.elemental/prompts/`:

```
my-project/
├── .elemental/
│   └── prompts/
│       ├── worker.md           # Override worker prompt
│       └── steward-merge.md    # Override merge steward
```

### Loading Prompts

```typescript
import { loadRolePrompt, buildAgentPrompt } from '@elemental/orchestrator-sdk';

// Load with project overrides
const result = loadRolePrompt('worker', undefined, {
  projectRoot: process.cwd(),
});

console.log(result?.source);  // 'built-in' or override path
console.log(result?.prompt);  // The prompt content

// Build complete prompt with context
const prompt = buildAgentPrompt({
  role: 'worker',
  taskContext: 'Implement OAuth login...',
  additionalInstructions: 'Use NextAuth.js',
  projectRoot: process.cwd(),
});
```

## Agent Registry

Active agents are tracked in the `AgentRegistry`:

```typescript
import { createAgentRegistry } from '@elemental/orchestrator-sdk';

const registry = createAgentRegistry(storage, api);

// Register an agent
const agent = await registry.registerAgent({
  entityId: 'worker-1',
  role: 'worker',
  roleDefinitionId: roleDef.id,
  sessionId: 'session-abc',
  status: 'active',
});

// Find available workers
const workers = await registry.getAgentsByRole('worker');
const available = workers.filter(a => a.status === 'active');
```

## Task Assignment

Tasks are matched to Workers based on capabilities:

```typescript
import { createCapabilityService } from '@elemental/orchestrator-sdk';

const capService = createCapabilityService(api, roleDefService);

// Find best agent for a task
const matches = await capService.findMatchingAgents(task);
// Returns agents ranked by capability match score
```

The matching algorithm:
1. Extract task tags/requirements
2. Compare against agent capabilities
3. Check agent constraints (negative matches)
4. Rank by match score

## Communication

Agents communicate through the inbox system:

```typescript
// Director sends to Worker
await api.sendMessage({
  senderId: directorId,
  recipientId: workerId,
  subject: 'New assignment',
  content: 'Please start on task-123',
});

// Worker checks inbox
const messages = await api.inbox.list(workerId);
```

Each agent has a dedicated channel for receiving messages. The `InboxPollingService` monitors for new messages.

## Lifecycle

### Agent Startup

1. Load role definition
2. Load system prompt (built-in or override)
3. Register with AgentRegistry
4. Start inbox polling
5. Check for assigned tasks

### Agent Operation

```
┌─────────────────────────────────────┐
│           Main Loop                 │
├─────────────────────────────────────┤
│ 1. Poll inbox for messages          │
│ 2. Check assigned tasks             │
│ 3. Pick highest priority            │
│ 4. Execute task                     │
│ 5. Report progress                  │
│ 6. Handle blockers                  │
│ 7. Complete or escalate             │
│ 8. Repeat                           │
└─────────────────────────────────────┘
```

### Agent Shutdown

1. Complete or checkpoint current task
2. Update status to inactive
3. Deregister from AgentRegistry
4. Clean up session

## Best Practices

### For Directors
- Keep plans focused (5-10 tasks max)
- Assign based on capabilities, not availability
- Check on Workers regularly
- Unblock before Workers ask

### For Workers
- Read task specs fully before starting
- Update status frequently
- Escalate early, not late
- Document blockers clearly

### For Stewards
- Run maintenance during low activity
- Log all automated actions
- Escalate uncertainty to Director
- Don't over-automate

## Related Documentation

- [How to Customize Agent Prompts](../how-to/customize-agent-prompts.md) - Practical guide
- [Orchestrator Services Reference](../reference/orchestrator-services.md) - Service APIs
- [Prompts Reference](../reference/prompts.md) - Prompt system details
