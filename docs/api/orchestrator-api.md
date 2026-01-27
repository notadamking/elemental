# Orchestrator API

The `@elemental/orchestrator-sdk` package extends the core Elemental SDK with AI agent orchestration capabilities.

## Overview

The OrchestratorAPI extends ElementalAPI with:
- Agent registration and management (Director, Worker, Steward roles)
- Session tracking with Claude Code integration
- Orchestrator-specific task metadata (branch, worktree, sessionId)
- Capability-based task routing

## Installation

```typescript
import { createOrchestratorAPI, type OrchestratorAPI } from '@elemental/orchestrator-sdk';
import { createStorage, initializeSchema } from '@elemental/storage';

const storage = createStorage('./my-project/.elemental/db.sqlite');
initializeSchema(storage);

const api = createOrchestratorAPI(storage);
```

## Agent Registration

### Register a Director
```typescript
const director = await api.registerDirector({
  name: 'MainDirector',
  createdBy: humanEntityId,
  capabilities: {
    skills: ['planning', 'coordination'],
    maxConcurrentTasks: 1,
  },
});
```

### Register a Worker
```typescript
const worker = await api.registerWorker({
  name: 'FrontendWorker',
  workerMode: 'ephemeral', // or 'persistent'
  createdBy: directorEntityId,
  reportsTo: directorEntityId,
  capabilities: {
    skills: ['frontend', 'testing'],
    languages: ['typescript', 'javascript'],
    maxConcurrentTasks: 2,
  },
});
```

### Register a Steward
```typescript
const steward = await api.registerSteward({
  name: 'MergeSteward',
  stewardFocus: 'merge', // or 'health', 'reminder', 'ops'
  triggers: [
    { type: 'event', event: 'task_completed' },
  ],
  createdBy: directorEntityId,
});
```

## Agent Channels

Each agent automatically gets a dedicated messaging channel when registered. This enables inter-agent communication and notifications.

### Channel Creation

Channels are created atomically during registration:
- Channel name format: `agent-{agentId}`
- Members: agent entity + creator entity
- Visibility: private
- Join policy: invite-only

### Accessing Agent Channels

Using the AgentRegistry service:

```typescript
import { createAgentRegistry } from '@elemental/orchestrator-sdk';

const registry = createAgentRegistry(api);

// Get the full channel object
const channel = await registry.getAgentChannel(agentId);
if (channel) {
  console.log(`Channel: ${channel.name}, Members: ${channel.members.length}`);
}

// Get just the channel ID (faster)
const channelId = await registry.getAgentChannelId(agentId);
```

### Channel Name Utilities

```typescript
import {
  generateAgentChannelName,
  parseAgentChannelName,
} from '@elemental/orchestrator-sdk';

// Generate channel name for an agent
const channelName = generateAgentChannelName(agentId);
// Returns: 'agent-el-abc123'

// Parse agent ID from channel name
const parsedAgentId = parseAgentChannelName('agent-el-abc123');
// Returns: 'el-abc123' (or null if not an agent channel)
```

### Sending Messages to Agents

```typescript
// Send a message to an agent's channel
const channelId = await registry.getAgentChannelId(agentId);
if (channelId) {
  await api.create({
    type: 'message',
    channelId,
    sender: senderEntityId,
    contentRef: messageDocumentId,
    metadata: {
      type: 'task-assignment', // or 'status-update', 'help-request', etc.
    },
  });
}
```

## Agent Capabilities

Capabilities enable intelligent task routing based on agent skills and languages.

### AgentCapabilities
```typescript
interface AgentCapabilities {
  skills: readonly string[];      // e.g., ['frontend', 'testing', 'database']
  languages: readonly string[];   // e.g., ['typescript', 'python']
  maxConcurrentTasks: number;     // default: 1
}
```

### TaskCapabilityRequirements
```typescript
interface TaskCapabilityRequirements {
  requiredSkills?: readonly string[];     // Agent MUST have ALL
  preferredSkills?: readonly string[];    // Used for ranking
  requiredLanguages?: readonly string[];  // Agent MUST have ALL
  preferredLanguages?: readonly string[]; // Used for ranking
}
```

### Capability Matching

```typescript
import {
  matchAgentToTask,
  findAgentsForTask,
  getBestAgentForTask,
  setTaskCapabilityRequirements,
} from '@elemental/orchestrator-sdk';

// Set requirements on a task
const taskMeta = setTaskCapabilityRequirements(task.metadata, {
  requiredSkills: ['frontend'],
  preferredSkills: ['testing'],
  requiredLanguages: ['typescript'],
});
const task = await api.update(taskId, { metadata: taskMeta });

// Match a single agent
const result = matchAgentToTask(worker, task);
console.log(result.isEligible);  // true if meets all requirements
console.log(result.score);       // 0-100, higher is better match

// Find all eligible agents
const workers = await api.getAvailableWorkers();
const matches = findAgentsForTask(workers, task);
// Returns: [{ agent, matchResult }] sorted by score descending

// Get the best agent
const best = getBestAgentForTask(workers, task);
if (best) {
  console.log(`Best match: ${best.agent.name} (score: ${best.matchResult.score})`);
}
```

### Scoring Algorithm

- **Base (50 points)**: Meeting all required skills and languages
- **Preferred skills (25 points)**: Proportional to matched preferred skills
- **Preferred languages (25 points)**: Proportional to matched preferred languages

If any required skill or language is missing, the agent is not eligible (score = 0).

### Capability Utilities

```typescript
import {
  getAgentCapabilities,
  agentHasSkill,
  agentHasLanguage,
  agentHasAllSkills,
  agentHasCapacity,
  validateAgentCapabilities,
} from '@elemental/orchestrator-sdk';

// Get agent's capabilities (with defaults if not set)
const caps = getAgentCapabilities(worker);

// Check individual capabilities
agentHasSkill(worker, 'frontend');         // true/false
agentHasLanguage(worker, 'typescript');    // true/false
agentHasAllSkills(worker, ['frontend', 'testing']); // true if has both
agentHasCapacity(worker, currentTaskCount); // true if under maxConcurrentTasks

// Validate capability configuration
const { valid, errors } = validateAgentCapabilities(worker);
```

## Agent Queries

```typescript
// Get specific agent
const agent = await api.getAgent(entityId);
const agentByName = await api.getAgentByName('FrontendWorker');

// List and filter
const allAgents = await api.listAgents();
const workers = await api.listAgents({ role: 'worker' });
const ephemeralWorkers = await api.listAgents({
  role: 'worker',
  workerMode: 'ephemeral'
});

// Role-specific queries
const director = await api.getDirector();
const stewards = await api.getStewards();
const availableWorkers = await api.getAvailableWorkers();
```

## Task Assignment

```typescript
// Assign task to agent (auto-generates branch and worktree names)
const task = await api.assignTaskToAgent(taskId, workerId);

// With explicit options
const task = await api.assignTaskToAgent(taskId, workerId, {
  branch: 'agent/worker-1/task-feat-auth',
  worktree: '.worktrees/worker-1-feat-auth',
  sessionId: 'claude-session-123',
});

// Get/update orchestrator metadata
const meta = await api.getTaskOrchestratorMeta(taskId);
await api.updateTaskOrchestratorMeta(taskId, {
  mergeStatus: 'pending'
});
```

## Session Management

```typescript
// Update agent session
await api.updateAgentSession(agentId, 'session-123', 'running');

// Session states: 'idle' | 'running' | 'suspended' | 'terminated'
```

## Type Definitions

Key files:
- `packages/orchestrator-sdk/src/types/agent.ts` - Agent and capability types
- `packages/orchestrator-sdk/src/types/task-meta.ts` - Task orchestrator metadata
- `packages/orchestrator-sdk/src/services/capability-service.ts` - Capability matching
- `packages/orchestrator-sdk/src/services/agent-registry.ts` - Agent registration and channel management

## See Also

- [ElementalAPI](elemental-api.md) - Base API documentation
- [Storage](../core/storage.md) - Storage layer
- [STAGE_2_PLAN.md](../../specs/STAGE_2_PLAN.md) - Implementation roadmap
